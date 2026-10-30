// HTTP API. All external calls happen here; the browser only talks to /api.
import fs from 'node:fs';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { config } from './config.js';
import type { DB } from './db.js';
import { addDays, diffDays, isIsoDate, todayOslo, type IsoDate } from './dates.js';
import { GoogleCalendar, GoogleNotConnectedError } from './calendar/google.js';
import { CalendarService, type CalendarSource } from './calendar/service.js';
import { getLog, listLogs, upsertLog, type DailyLogPatch } from './log/repo.js';

export interface AppDeps {
  db: DB;
  /** Overrides Google (tests). */
  calendarSource?: CalendarSource;
  now?: () => Date;
  logger?: boolean;
}

const MAX_RANGE_DAYS = 400;

const dateParam = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } as const;
const rangeQuery = {
  type: 'object',
  required: ['from', 'to'],
  properties: { from: dateParam, to: dateParam, refresh: { type: 'boolean' } },
} as const;

function checkRange(from: IsoDate, to: IsoDate) {
  if (!isIsoDate(from) || !isIsoDate(to) || to < from || diffDays(from, to) > MAX_RANGE_DAYS) {
    throw Object.assign(new Error('Invalid date range'), { statusCode: 400 });
  }
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { db } = deps;
  const now = deps.now ?? (() => new Date());
  const app = Fastify({
    logger: deps.logger ?? false,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: 'array' } },
  });
  const google = new GoogleCalendar(db);
  const calendar = new CalendarService(deps.calendarSource ?? google);
  const calendarConnected = () => Boolean(deps.calendarSource) || google.connected;

  app.setErrorHandler((err: Error & { statusCode?: number }, req, reply) => {
    if (err instanceof GoogleNotConnectedError) return reply.code(409).send({ error: 'google_not_connected' });
    const status = err.statusCode ?? 500;
    if (status >= 500) req.log.error(err);
    return reply.code(status).send({ error: err.message });
  });

  app.get('/api/health', async () => ({ ok: true, today: todayOslo(now()) }));

  // --- Google OAuth -------------------------------------------------------
  app.get('/api/auth/google/status', async () => ({
    configured: google.configured,
    connected: calendarConnected(),
  }));

  app.get('/api/auth/google/start', async (_req, reply) => {
    if (!google.configured) return reply.code(400).send({ error: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing in .env' });
    return reply.redirect(google.authUrl());
  });

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>('/api/auth/google/callback', async (req, reply) => {
    const { code, state, error } = req.query;
    if (error || !code || !state) return reply.code(400).send({ error: error ?? 'Missing code/state' });
    await google.handleCallback(code, state);
    calendar.invalidate();
    return reply.redirect('/?google=connected');
  });

  app.post('/api/auth/google/disconnect', async () => {
    google.disconnect();
    calendar.invalidate();
    return { connected: false };
  });

  // --- Calendar -----------------------------------------------------------
  app.get<{ Querystring: { from: IsoDate; to: IsoDate; refresh?: boolean } }>(
    '/api/calendar/days',
    { schema: { querystring: rangeQuery } },
    async (req) => {
      const { from, to, refresh } = req.query;
      checkRange(from, to);
      if (refresh) calendar.invalidate();
      return calendar.days(from, to);
    },
  );

  app.get<{ Querystring: { from: IsoDate; to: IsoDate } }>(
    '/api/calendar/races',
    { schema: { querystring: rangeQuery } },
    async (req) => {
      checkRange(req.query.from, req.query.to);
      return { races: await calendar.races(req.query.from, req.query.to) };
    },
  );

  // --- Daily log (knee test + weight) ------------------------------------
  app.get<{ Querystring: { from: IsoDate; to: IsoDate } }>('/api/log', { schema: { querystring: rangeQuery } }, async (req) => {
    checkRange(req.query.from, req.query.to);
    return { logs: listLogs(db, req.query.from, req.query.to) };
  });

  app.get<{ Params: { date: IsoDate } }>(
    '/api/log/:date',
    { schema: { params: { type: 'object', properties: { date: dateParam } } } },
    async (req) => getLog(db, req.params.date),
  );

  app.put<{ Params: { date: IsoDate }; Body: DailyLogPatch }>(
    '/api/log/:date',
    {
      schema: {
        params: { type: 'object', properties: { date: dateParam } },
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            kneeOk: { type: ['boolean', 'null'] },
            kneeNote: { type: ['string', 'null'], maxLength: 500 },
            weightKg: { type: ['number', 'null'], minimum: 40, maximum: 150 },
          },
        },
      },
    },
    async (req, reply) => {
      if (!isIsoDate(req.params.date)) return reply.code(400).send({ error: 'Invalid date' });
      if (req.params.date > todayOslo(now())) return reply.code(400).send({ error: 'Cannot log a future date' });
      return upsertLog(db, req.params.date, req.body, now());
    },
  );

  // --- Today (aggregate for the morning view) -----------------------------
  app.get('/api/today', async () => {
    const today = todayOslo(now());
    const log = getLog(db, today);
    const withoutCalendar = { date: today, log, calendar: null, nextRace: null };
    if (!calendarConnected()) return withoutCalendar;

    try {
      const [{ days, periods }, races] = await Promise.all([
        calendar.days(today, today),
        calendar.races(today, addDays(today, 180)),
      ]);
      const nextRace = races[0] ? { ...races[0], inDays: diffDays(today, races[0].date) } : null;
      return { date: today, log, calendar: { day: days[0], period: periods[0] ?? null }, nextRace };
    } catch (err) {
      // Token revoked since the check above: the view still works for knee/weight.
      if (err instanceof GoogleNotConnectedError) return withoutCalendar;
      throw err;
    }
  });

  // --- Built web app (production) -----------------------------------------
  if (fs.existsSync(config.webDist)) {
    await app.register(fastifyStatic, { root: config.webDist });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith('/api/') ? reply.code(404).send({ error: 'Not found' }) : reply.sendFile('index.html'),
    );
  }

  return app;
}
