// HTTP API (Cloudflare Worker). All external calls happen here; the browser only talks to /api.
import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { AccessError, accessToken, verifyAccessJwt } from './access.js';
import { addDays, diffDays, isIsoDate, mondayOf, todayOslo } from './dates.js';
import type { AppEnv } from './context.js';
import { GoogleCalendar, GoogleNotConnectedError } from './calendar/google.js';
import { CalendarService, type CalendarSource, type EventCache, type Race } from './calendar/service.js';
import { getLog, lastWeight, listLogs, upsertLog, type DailyLogPatch } from './log/repo.js';
import { IntervalsError, type IntervalsSource } from './intervals/client.js';
import { countActivities, latestWellness, listActivities, listWellness } from './intervals/repo.js';
import { hiddenActivities, intervalsFromEnv, lastSyncAt, syncRecent } from './intervals/sync.js';
import { kneeFlag } from './training/knee.js';
import { periodVolume, type PeriodVolume } from './training/volume.js';
import { buildWeek } from './training/week.js';
import { bad, dateQuery, range } from './http.js';
import { listSessions } from './plan/repo.js';
import { planRoutes } from './routes/plan.js';
import { buildProgress } from './progress/build.js';
import { buildHealth } from './health/build.js';

export interface AppOptions {
  /** Overrides Google (tests). */
  calendarSource?: CalendarSource;
  /** Overrides intervals.icu (tests). */
  intervalsSource?: IntervalsSource;
  now?: () => Date;
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

  // --- Plan (needs the calendar) -----------------------------------------
  app.use('/plan/*', async (c, next) => {
    if (!(await calendarConnected(c))) return c.json({ error: 'google_not_connected' }, 409);
    return next();
  });
  app.route('/plan', planRoutes(now));

  // --- Progress ---------------------------------------------------------------
  app.get('/progress', async (c) => {
    const db = c.env.DB;
    const today = todayOslo(now());
    const weeks = Math.min(52, Math.max(4, Number(c.req.query('weeks') ?? 26) || 26));
    const kneeDays = 56;
    const from = addDays(mondayOf(today), -7 * (weeks - 1));
    const earliest = from < addDays(today, -(kneeDays - 1)) ? from : addDays(today, -(kneeDays - 1));
    const [activities, logs, wellness, sessions] = await Promise.all([
      listActivities(db, from, today),
      listLogs(db, addDays(earliest, -7), today),
      listWellness(db, from, today),
      listSessions(db, from, today),
    ]);
    let calendarDays = null;
    if (await calendarConnected(c)) {
      try {
        calendarDays = (await c.var.calendar.days(from, addDays(mondayOf(today), 6))).days;
      } catch (err) {
        if (!(err instanceof GoogleNotConnectedError)) throw err;
      }
    }
    return c.json(buildProgress({ today, weeks, calendarDays, activities, logs, wellness, sessions, kneeDays }));
  });

  // --- Helse (sleep and recovery from intervals.icu) ----------------------------
  app.get('/wellness', async (c) => {
    const today = todayOslo(now());
    const days = Math.min(180, Math.max(14, Number(c.req.query('days') ?? 60) || 60));
    // Seven extra days so the first day already has a 7-day baseline.
    const wellness = await listWellness(c.env.DB, addDays(today, -(days + 7)), today);
    return c.json({ ...buildHealth({ today, days, wellness }), configured: Boolean(intervalsSource(c)) });
  });

  // --- Week (Mon–Sun) -----------------------------------------------------
  app.get('/week', async (c) => {
    const db = c.env.DB;
    const start = mondayOf(dateQuery(c, 'start', todayOslo(now())));
    const end = addDays(start, 6);
    const [logs, activities, sessions] = await Promise.all([
      listLogs(db, start, end),
      listActivities(db, start, end),
      listSessions(db, start, end),
    ]);
    let calendarDays = null;
    let races: Race[] = [];
    if (await calendarConnected(c)) {
      try {
        [{ days: calendarDays }, races] = await Promise.all([c.var.calendar.days(start, end), c.var.calendar.races(start, end)]);
      } catch (err) {
        if (!(err instanceof GoogleNotConnectedError)) throw err;
      }
    }
    return c.json(buildWeek({ anyDate: start, calendarDays, races, logs, activities, sessions }));
  });

  // --- Today (aggregate for the morning view) -----------------------------
  app.get('/today', async (c) => {
    const db = c.env.DB;
    const today = todayOslo(now());
    const [log, week, last, activities, syncedAt, fitness, cached, hidden, planned] = await Promise.all([
      getLog(db, today),
      listLogs(db, addDays(today, -6), today),
      lastWeight(db, today),
      listActivities(db, today, today),
      lastSyncAt(db),
      latestWellness(db, today),
      countActivities(db),
      hiddenActivities(db),
      listSessions(db, today, today),
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
      /** All cached activities, and how many intervals.icu kept back in the last sync. */
      cachedActivities: cached,
      hiddenActivities: hidden,
      activities: activities.map((a) => ({ ...a, kneeFlag: kneeFlag(a, log) })),
      fitness,
      volume: null as PeriodVolume | null,
    };
    const withoutCalendar = { date: today, log, weight, training, planned, calendar: null, nextRace: null };
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
