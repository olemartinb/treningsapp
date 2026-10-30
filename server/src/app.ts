// HTTP API (Cloudflare Worker). All external calls happen here; the browser only talks to /api.
import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { AccessError, accessToken, verifyAccessJwt } from './access.js';
import { addDays, diffDays, isIsoDate, todayOslo, type IsoDate } from './dates.js';
import type { Env } from './env.js';
import { GoogleCalendar, GoogleNotConnectedError } from './calendar/google.js';
import { CalendarService, type CalendarSource, type EventCache } from './calendar/service.js';
import { getLog, lastWeight, listLogs, upsertLog, type DailyLogPatch } from './log/repo.js';
import { IntervalsError, type IntervalsSource } from './intervals/client.js';
import { latestWellness, listActivities } from './intervals/repo.js';
import { intervalsFromEnv, lastSyncAt, syncRecent } from './intervals/sync.js';
import { kneeFlag } from './training/knee.js';
import { periodVolume, type PeriodVolume } from './training/volume.js';

export interface AppOptions {
  /** Overrides Google (tests). */
  calendarSource?: CalendarSource;
  /** Overrides intervals.icu (tests). */
  intervalsSource?: IntervalsSource;
  now?: () => Date;
}

type AppEnv = { Bindings: Env; Variables: { google: GoogleCalendar; calendar: CalendarService } };

const MAX_RANGE_DAYS = 400;
const bad = (message: string) => new HTTPException(400, { message });

function range(c: Context<AppEnv>): { from: IsoDate; to: IsoDate } {
  const from = c.req.query('from') ?? '';
  const to = c.req.query('to') ?? '';
  if (!isIsoDate(from) || !isIsoDate(to) || to < from || diffDays(from, to) > MAX_RANGE_DAYS) throw bad('Invalid date range');
  return { from, to };
}

function parsePatch(body: unknown): DailyLogPatch {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw bad('Body must be an object');
  const patch: DailyLogPatch = {};
  for (const [key, value] of Object.entries(body)) {
    if (key === 'kneeOk' && (value === null || typeof value === 'boolean')) patch.kneeOk = value;
    else if (key === 'kneeNote' && (value === null || (typeof value === 'string' && value.length <= 500))) patch.kneeNote = value;
    else if (key === 'weightKg' && (value === null || (typeof value === 'number' && value >= 40 && value <= 150))) patch.weightKg = value;
    else throw bad(`Invalid field: ${key}`);
  }
  return patch;
}

export function createApp(options: AppOptions = {}) {
  const now = options.now ?? (() => new Date());
  const eventCache: EventCache = new Map();
  const app = new Hono<AppEnv>().basePath('/api');

  app.onError((err, c) => {
    if (err instanceof GoogleNotConnectedError) return c.json({ error: 'google_not_connected' }, 409);
    if (err instanceof IntervalsError) {
      console.error(err.message);
      return c.json({ error: err.status === 401 || err.status === 403 ? 'intervals_auth_failed' : 'intervals_unavailable' }, 502);
    }
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    console.error(err);
    return c.json({ error: 'Internal error' }, 500);
  });
  app.notFound((c) => c.json({ error: 'Not found' }, 404));

  // --- Cloudflare Access ----------------------------------------------------
  app.use(async (c, next) => {
    if (c.env.ALLOW_UNAUTHENTICATED === 'true') return next();
    if (!c.env.ACCESS_TEAM_DOMAIN || !c.env.ACCESS_AUD) return c.json({ error: 'access_not_configured' }, 503);
    const token = accessToken(c.req.raw.headers);
    if (!token) return c.json({ error: 'unauthenticated' }, 401);
    try {
      await verifyAccessJwt(token, { teamDomain: c.env.ACCESS_TEAM_DOMAIN, aud: c.env.ACCESS_AUD });
    } catch (err) {
      if (err instanceof AccessError) return c.json({ error: 'unauthenticated' }, 401);
      throw err;
    }
    return next();
  });

  app.use(async (c, next) => {
    const google = new GoogleCalendar(c.env.DB, c.env, new URL(c.req.url).origin);
    c.set('google', google);
    c.set(
      'calendar',
      new CalendarService(options.calendarSource ?? google, { kids: c.env.CAL_KIDS_NAME, races: c.env.CAL_RACES_NAME }, eventCache),
    );
    return next();
  });

  const calendarConnected = async (c: Context<AppEnv>) => Boolean(options.calendarSource) || (await c.var.google.connected());
  const intervalsSource = (c: Context<AppEnv>) => options.intervalsSource ?? intervalsFromEnv(c.env);

  app.get('/health', (c) => c.json({ ok: true, today: todayOslo(now()) }));

  // --- Google OAuth -------------------------------------------------------
  app.get('/auth/google/status', async (c) =>
    c.json({ configured: c.var.google.configured, connected: await calendarConnected(c) }),
  );

  app.get('/auth/google/start', async (c) => {
    if (!c.var.google.configured) throw bad('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set');
    return c.redirect(await c.var.google.authUrl());
  });

  app.get('/auth/google/callback', async (c) => {
    const { code, state, error } = c.req.query();
    if (error || !code || !state) throw bad(error ?? 'Missing code/state');
    await c.var.google.handleCallback(code, state);
    eventCache.clear();
    return c.redirect('/?google=connected');
  });

  app.post('/auth/google/disconnect', async (c) => {
    await c.var.google.disconnect();
    eventCache.clear();
    return c.json({ connected: false });
  });

  // --- Calendar -----------------------------------------------------------
  app.get('/calendar/days', async (c) => {
    const { from, to } = range(c);
    if (c.req.query('refresh') === 'true') eventCache.clear();
    return c.json(await c.var.calendar.days(from, to));
  });

  app.get('/calendar/races', async (c) => {
    const { from, to } = range(c);
    return c.json({ races: await c.var.calendar.races(from, to) });
  });

  // --- Daily log (knee test + weight) ------------------------------------
  app.get('/log', async (c) => {
    const { from, to } = range(c);
    return c.json({ logs: await listLogs(c.env.DB, from, to) });
  });

  app.get('/log/:date', async (c) => {
    const date = c.req.param('date');
    if (!isIsoDate(date)) throw bad('Invalid date');
    return c.json(await getLog(c.env.DB, date));
  });

  app.put('/log/:date', async (c) => {
    const date = c.req.param('date');
    if (!isIsoDate(date)) throw bad('Invalid date');
    if (date > todayOslo(now())) throw bad('Cannot log a future date');
    const patch = parsePatch(await c.req.json().catch(() => null));
    return c.json(await upsertLog(c.env.DB, date, patch, now()));
  });

  // --- intervals.icu ------------------------------------------------------
  app.post('/sync', async (c) => {
    const source = intervalsSource(c);
    if (!source) return c.json({ error: 'intervals_not_configured' }, 409);
    return c.json(await syncRecent(c.env.DB, source, now()));
  });

  app.get('/activities', async (c) => {
    const { from, to } = range(c);
    return c.json({ activities: await listActivities(c.env.DB, from, to) });
  });

  // --- Today (aggregate for the morning view) -----------------------------
  app.get('/today', async (c) => {
    const db = c.env.DB;
    const today = todayOslo(now());
    const [log, week, last, activities, syncedAt, fitness] = await Promise.all([
      getLog(db, today),
      listLogs(db, addDays(today, -6), today),
      lastWeight(db, today),
      listActivities(db, today, today),
      lastSyncAt(db),
      latestWellness(db, today),
    ]);
    const weights = week.flatMap((l) => (l.weightKg === null ? [] : [l.weightKg]));
    const weight = {
      last,
      avg7: weights.length ? Math.round((weights.reduce((a, b) => a + b, 0) / weights.length) * 10) / 10 : null,
      count7: weights.length,
    };
    const training = {
      configured: Boolean(intervalsSource(c)),
      lastSyncAt: syncedAt,
      activities: activities.map((a) => ({ ...a, kneeFlag: kneeFlag(a, log) })),
      fitness,
      volume: null as PeriodVolume | null,
    };
    const withoutCalendar = { date: today, log, weight, training, calendar: null, nextRace: null };
    if (!(await calendarConnected(c))) return c.json(withoutCalendar);

    try {
      const [{ days, periods }, races] = await Promise.all([
        c.var.calendar.days(today, today),
        c.var.calendar.races(today, addDays(today, 180)),
      ]);
      // Whole current period, for the day strip.
      const period = periods[0] ?? null;
      const periodDays = period ? (await c.var.calendar.days(period.start, addDays(period.end, -1))).days : [];
      if (period) training.volume = periodVolume(await listActivities(db, period.start, addDays(period.end, -1)), period, period.target);
      const nextRace = races[0] ? { ...races[0], inDays: diffDays(today, races[0].date) } : null;
      return c.json({ ...withoutCalendar, calendar: { day: days[0], period, periodDays }, nextRace });
    } catch (err) {
      // Token revoked since the check above: the view still works for knee/weight.
      if (err instanceof GoogleNotConnectedError) return c.json(withoutCalendar);
      throw err;
    }
  });

  return app;
}
