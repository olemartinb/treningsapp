// /api/plan – upcoming periods with planned sessions, session CRUD and template fill.
import { Hono } from 'hono';
import { addDays, isIsoDate, todayOslo, type IsoDate } from '../dates.js';
import type { AppEnv } from '../context.js';
import { bad } from '../http.js';
import { listActivities } from '../intervals/repo.js';
import { isRun } from '../intervals/types.js';
import { buildPlan } from '../plan/overview.js';
import { createSessions, deleteSession, listSessions, updateSession } from '../plan/repo.js';
import { templateForPeriod } from '../plan/template.js';
import { SESSION_KINDS, isSessionKind, plannedRunKm, type SessionDraft, type SessionPatch } from '../plan/types.js';

const DEFAULT_WEEKS = 8;
const MAX_WEEKS = 16;

function parsePatch(body: unknown, requireAll: boolean): SessionPatch {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw bad('Body must be an object');
  const patch: SessionPatch = {};
  for (const [key, value] of Object.entries(body)) {
    if (key === 'date' && isIsoDate(value)) patch.date = value;
    else if (key === 'kind' && isSessionKind(value)) patch.kind = value;
    else if (key === 'title' && typeof value === 'string' && value.trim().length <= 120) patch.title = value.trim();
    else if (key === 'km' && (value === null || (typeof value === 'number' && value >= 0 && value <= 200))) {
      patch.km = value === null ? null : Math.round(value * 10) / 10;
    } else if (key === 'details' && (value === null || (typeof value === 'string' && value.length <= 1000))) {
      patch.details = value?.trim() || null;
    } else if (key === 'done' && typeof value === 'boolean') patch.done = value;
    else throw bad(`Invalid field: ${key}`);
  }
  if (requireAll && (!patch.date || !patch.kind)) throw bad('date and kind are required');
  return patch;
}

const sessionId = (raw: string) => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw bad('Invalid id');
  return id;
};

export function planRoutes(now: () => Date) {
  const plan = new Hono<AppEnv>();

  plan.get('/', async (c) => {
    const weeks = Math.min(MAX_WEEKS, Math.max(1, Number(c.req.query('weeks') ?? DEFAULT_WEEKS) || DEFAULT_WEEKS));
    const today = todayOslo(now());
    const horizon = addDays(today, weeks * 7 - 1);
    const { periods: all } = await c.var.calendar.days(today, horizon);
    if (!all.length) return c.json({ today, periods: [] });
    const from = all[0]!.start;
    const to = addDays(all.at(-1)!.end, -1);
    const [{ days }, races, sessions, activities] = await Promise.all([
      c.var.calendar.days(from, to),
      c.var.calendar.races(from, to),
      listSessions(c.env.DB, from, to),
      listActivities(c.env.DB, from, today),
    ]);
    return c.json({ today, periods: buildPlan({ today, periods: all, days, races, sessions, activities }) });
  });

  plan.post('/sessions', async (c) => {
    const patch = parsePatch(await c.req.json().catch(() => null), true);
    const kind = patch.kind!;
    const draft: SessionDraft = {
      date: patch.date!,
      kind,
      title: patch.title || SESSION_KINDS[kind].label,
      km: patch.km ?? null,
      details: patch.details ?? null,
    };
    const [created] = await createSessions(c.env.DB, [draft], 'manual', now());
    return c.json(created, 201);
  });

  plan.patch('/sessions/:id', async (c) => {
    const patch = parsePatch(await c.req.json().catch(() => null), false);
    if (patch.title === '') throw bad('Title cannot be empty');
    const updated = await updateSession(c.env.DB, sessionId(c.req.param('id')), patch, now());
    return updated ? c.json(updated) : c.json({ error: 'Not found' }, 404);
  });

  plan.delete('/sessions/:id', async (c) => {
    const deleted = await deleteSession(c.env.DB, sessionId(c.req.param('id')));
    return deleted ? c.body(null, 204) : c.json({ error: 'Not found' }, 404);
  });

  // Fill the period containing `periodStart` from the week-type template.
  plan.post('/fill', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { periodStart?: unknown };
    if (!isIsoDate(body.periodStart)) throw bad('periodStart is required');
    const periodStart: IsoDate = body.periodStart;
    const today = todayOslo(now());
    const period = (await c.var.calendar.days(periodStart, periodStart)).periods[0];
    if (!period) throw bad('No kid-week period on that date');
    const last = addDays(period.end, -1);
    const [races, existing, activities] = await Promise.all([
      // Through period.end: a race on the next handover day keeps our last day easy.
      c.var.calendar.races(period.start, period.end),
      listSessions(c.env.DB, period.start, last),
      listActivities(c.env.DB, period.start, addDays(today, -1)),
    ]);
    const doneKm = activities.reduce((sum, a) => sum + (isRun(a) && a.distanceM ? a.distanceM / 1000 : 0), 0);
    const drafts = templateForPeriod({
      period,
      races,
      takenDates: existing.map((s) => s.date),
      usedKm: plannedRunKm(existing.filter((s) => s.date >= today)) + doneKm,
      today,
    });
    return c.json({ created: await createSessions(c.env.DB, drafts, 'template', now()) });
  });

  return plan;
}
