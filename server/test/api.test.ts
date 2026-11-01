import { beforeEach, describe, expect, it } from 'vitest';
import fixture from './fixtures/samvaer-2026h2.json' with { type: 'json' };
import { createApp } from '../src/app.js';
import type { CalEvent } from '../src/calendar/kidWeeks.js';
import type { Env } from '../src/env.js';
import { testD1 } from './d1.js';
import intervalsFixture from './fixtures/intervals-activities.json' with { type: 'json' };
import { IntervalsError, toActivity, type IcuActivity } from '../src/intervals/client.js';
import { emptyWellness, type Activity } from '../src/intervals/types.js';

const icuActivities = (intervalsFixture.items as IcuActivity[]).map(toActivity).filter((a): a is Activity => a !== null);

const races: CalEvent[] = [
  { summary: 'Rotevatnet rundt', start: { date: '2026-10-25' }, end: { date: '2026-10-26' } },
  { summary: 'Rotevatnet rundt', start: { date: '2026-11-29' }, end: { date: '2026-11-30' } },
];

// 30 Oct 2026, 06:15 in Oslo.
const NOW = new Date('2026-10-30T05:15:00Z');

const app = createApp({
  now: () => NOW,
  calendarSource: { listEvents: async (name) => (name === 'Samvær' ? (fixture.items as CalEvent[]) : races) },
  intervalsSource: {
    activities: async (from, to) => ({ activities: icuActivities.filter((a) => a.date >= from && a.date <= to), hidden: 1 }),
    wellness: async () => [{ ...emptyWellness('2026-10-30'), ctl: 48.2, atl: 55.9, restingHr: 45, sleepSecs: 7 * 3600, hrv: 58 }],
  },
});

let env: Env;
beforeEach(() => {
  env = {
    DB: testD1(),
    CAL_KIDS_NAME: 'Samvær',
    CAL_RACES_NAME: 'Løp / trening',
    ACCESS_TEAM_DOMAIN: '',
    ACCESS_AUD: '',
    ALLOW_UNAUTHENTICATED: 'true',
  };
});

const get = (path: string) => app.request(path, {}, env);
const put = (path: string, body: unknown) =>
  app.request(path, { method: 'PUT', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }, env);

describe('API', () => {
  it('today combines kid week, flags, period strip, target, log and next race', async () => {
    const res = await get('/api/today');
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.date).toBe('2026-10-30');
    expect(body.calendar.day).toMatchObject({ type: 'barneuke', kidsHomeAllDay: true });
    expect(body.calendar.period).toMatchObject({ start: '2026-10-26', end: '2026-11-02', target: { min: 25, max: 35 } });
    expect(body.calendar.periodDays.map((d: { date: string }) => d.date)).toEqual([
      '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01',
    ]);
    expect(body.calendar.periodDays[0].handover).toMatchObject({ from: 'eneuke', to: 'barneuke' });
    expect(body.nextRace).toEqual({ date: '2026-11-29', title: 'Rotevatnet rundt', inDays: 30 });
    expect(body.log).toMatchObject({ kneeOk: null, weightKg: null });
    expect(body.weight).toEqual({ last: null, avg7: null, count7: 0 });
  });

  it('logs knee test and weight independently', async () => {
    let res = await put('/api/log/2026-10-30', { kneeOk: true });
    expect(await res.json()).toMatchObject({ kneeOk: true, weightKg: null, kneeTestedAt: NOW.toISOString() });
    res = await put('/api/log/2026-10-30', { weightKg: 71.84 });
    expect(await res.json()).toMatchObject({ kneeOk: true, weightKg: 71.8 });
    res = await get('/api/log?from=2026-10-01&to=2026-10-31');
    expect(((await res.json()) as any).logs).toHaveLength(1);
  });

  it('today reports last weight and the 7-day average', async () => {
    await put('/api/log/2026-10-20', { weightKg: 73 }); // outside the 7-day window
    await put('/api/log/2026-10-27', { weightKg: 72.4 });
    await put('/api/log/2026-10-29', { weightKg: 71.6 });
    const body = (await (await get('/api/today')).json()) as any;
    expect(body.weight).toEqual({ last: { date: '2026-10-29', weightKg: 71.6 }, avg7: 72, count7: 2 });
  });

  it('rejects bad log input and future dates', async () => {
    expect((await put('/api/log/2026-10-30', { weightKg: 7 })).status).toBe(400);
    expect((await put('/api/log/2026-10-30', { foo: 1 })).status).toBe(400);
    expect((await put('/api/log/2026-10-30', [])).status).toBe(400);
    expect((await put('/api/log/2026-10-31', { kneeOk: true })).status).toBe(400);
  });

  it('calendar days returns periods with scaled targets', async () => {
    const { periods, days } = (await (await get('/api/calendar/days?from=2026-11-02&to=2026-11-08')).json()) as any;
    expect(days).toHaveLength(7);
    expect(periods.map((p: { type: string; days: number }) => [p.type, p.days])).toEqual([
      ['eneuke', 4],
      ['barneuke', 7],
    ]);
    expect(periods[0].target).toMatchObject({ scaled: true, min: 34.3 });
  });

  it('rejects an invalid range', async () => {
    expect((await get('/api/calendar/days?from=2026-11-08&to=2026-11-02')).status).toBe(400);
  });

  it('sync pulls activities, and today shows them with knee flags and period volume', async () => {
    let body = (await (await get('/api/today')).json()) as any;
    expect(body.training).toMatchObject({
      configured: true,
      lastSyncAt: null,
      cachedActivities: 0,
      hiddenActivities: 0,
      activities: [],
      volume: { km: 0, status: 'under' },
    });

    const sync = await app.request('/api/sync', { method: 'POST' }, env);
    expect(sync.status).toBe(200);
    expect(await sync.json()).toMatchObject({ activities: 5, hidden: 1, wellness: 1 });

    body = (await (await get('/api/today')).json()) as any;
    expect(body.training).toMatchObject({ lastSyncAt: NOW.toISOString(), cachedActivities: 5, hiddenActivities: 1 });
    expect(body.training.activities.map((a: any) => [a.type, a.kneeFlag])).toEqual([
      ['Run', 'missing'],
      ['WeightTraining', null],
    ]);
    expect(body.training.volume).toEqual({
      km: 21.5,
      status: 'under',
      kmByDate: { '2026-10-26': 7.4, '2026-10-28': 6.1, '2026-10-30': 8 },
    });
    expect(body.training.fitness).toMatchObject({ ctl: 48.2, atl: 55.9 });

    await put('/api/log/2026-10-30', { kneeOk: true });
    body = (await (await get('/api/today')).json()) as any;
    expect(body.training.activities[0].kneeFlag).toBeNull();
  });

  it('sync reports when intervals.icu is not configured or fails', async () => {
    const plain = createApp({ now: () => NOW });
    expect((await plain.request('/api/sync', { method: 'POST' }, env)).status).toBe(409);

    const failing = createApp({
      now: () => NOW,
      intervalsSource: {
        activities: async () => {
          throw new IntervalsError(401, 'Unauthorized');
        },
        wellness: async () => [],
      },
    });
    const res = await failing.request('/api/sync', { method: 'POST' }, env);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'intervals_auth_failed' });
  });

  it('week endpoint returns Monday–Sunday with calendar and activities', async () => {
    await app.request('/api/sync', { method: 'POST' }, env);
    const res = await get('/api/week?start=2026-10-29');
    expect(res.status).toBe(200);
    const w = (await res.json()) as any;
    expect([w.start, w.end, w.weekNo, w.runKm]).toEqual(['2026-10-26', '2026-11-01', 44, 21.5]);
    expect(w.days[4]).toMatchObject({ date: '2026-10-30', type: 'barneuke', kidsHomeAllDay: true });
    expect((await get('/api/week?start=nope')).status).toBe(400);
  });

  it('plan: fill a period from the template, then edit, tick and delete sessions', async () => {
    const send = (method: string, path: string, body?: unknown) =>
      app.request(path, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }, env);

    let plan = (await (await get('/api/plan?weeks=4')).json()) as any;
    expect(plan.today).toBe('2026-10-30');
    expect(plan.periods[0]).toMatchObject({ type: 'barneuke', start: '2026-10-26', plannedKm: 0, doneKm: 0, canFill: true });
    const short = plan.periods.find((p: any) => p.start === '2026-11-02');
    expect(short).toMatchObject({ type: 'eneuke', days: 4, target: { scaled: true } });
    expect(short.dates).toHaveLength(4);

    const fill = await send('POST', '/api/plan/fill', { periodStart: '2026-11-02' });
    const { created } = (await fill.json()) as any;
    expect(created.length).toBeGreaterThan(1);
    expect(created.every((s: any) => s.source === 'template' && s.date >= '2026-11-02' && s.date <= '2026-11-05')).toBe(true);

    plan = (await (await get('/api/plan?weeks=4')).json()) as any;
    const filled = plan.periods.find((p: any) => p.start === '2026-11-02');
    expect(filled.plannedKm).toBeGreaterThanOrEqual(34.3);
    expect(filled.plannedStatus).toBe('in-range');

    // Filling again adds nothing: every day is taken.
    expect(((await (await send('POST', '/api/plan/fill', { periodStart: '2026-11-02' })).json()) as any).created).toEqual([]);

    const strength = await send('POST', '/api/plan/sessions', { date: '2026-10-30', kind: 'strength' });
    expect(strength.status).toBe(201);
    const s1 = (await strength.json()) as any;
    expect(s1).toMatchObject({ title: 'Styrke', km: null, done: false, source: 'manual' });

    const ticked = (await (await send('PATCH', `/api/plan/sessions/${s1.id}`, { done: true, details: 'Skråbrett 3×12' })).json()) as any;
    expect(ticked).toMatchObject({ done: true, details: 'Skråbrett 3×12', kind: 'strength' });

    const today = (await (await get('/api/today')).json()) as any;
    expect(today.planned).toEqual([expect.objectContaining({ id: s1.id, done: true })]);
    const week = (await (await get('/api/week?start=2026-10-26')).json()) as any;
    expect(week.days[4].planned).toHaveLength(1);

    expect((await send('DELETE', `/api/plan/sessions/${s1.id}`)).status).toBe(204);
    expect((await send('DELETE', `/api/plan/sessions/${s1.id}`)).status).toBe(404);
  });

  it('plan rejects bad input', async () => {
    const send = (method: string, path: string, body: unknown) =>
      app.request(path, { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }, env);
    expect((await send('POST', '/api/plan/sessions', { date: '2026-10-30', kind: 'nap' })).status).toBe(400);
    expect((await send('POST', '/api/plan/sessions', { kind: 'easy' })).status).toBe(400);
    expect((await send('POST', '/api/plan/sessions', { date: '2026-10-30', kind: 'easy', km: -1 })).status).toBe(400);
    expect((await send('PATCH', '/api/plan/sessions/abc', { done: true })).status).toBe(400);
    expect((await send('POST', '/api/plan/fill', {})).status).toBe(400);
  });

  it('plan needs the calendar', async () => {
    const noCalendar = createApp({ now: () => NOW });
    expect((await noCalendar.request('/api/plan', {}, env)).status).toBe(409);
  });

  it('wellness endpoint returns sleep and recovery after a sync', async () => {
    await app.request('/api/sync', { method: 'POST' }, env);
    const body = (await (await get('/api/wellness?days=14')).json()) as any;
    expect(body.configured).toBe(true);
    expect(body.days).toHaveLength(14);
    expect(body.lastNight).toMatchObject({ date: '2026-10-30', sleepH: 7 });
    expect(body.latest).toMatchObject({ date: '2026-10-30', restingHr: 45, hrv: 58, restingHrBaseline: null });
    expect(body.form).toBe('ukjent'); // no baseline yet
  });

  it('fails closed when Access is not configured', async () => {
    env.ALLOW_UNAUTHENTICATED = undefined;
    const res = await get('/api/today');
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'access_not_configured' });
  });

  it('requires an Access token when Access is configured', async () => {
    env.ALLOW_UNAUTHENTICATED = undefined;
    env.ACCESS_TEAM_DOMAIN = 'team.cloudflareaccess.com';
    env.ACCESS_AUD = 'aud';
    expect((await get('/api/today')).status).toBe(401);
  });
});
