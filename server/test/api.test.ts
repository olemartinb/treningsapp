import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import fixture from './fixtures/samvaer-2026h2.json' with { type: 'json' };
import { buildApp } from '../src/app.js';
import { openDb } from '../src/db.js';
import type { CalEvent } from '../src/calendar/kidWeeks.js';

const races: CalEvent[] = [
  { summary: 'Rotevatnet rundt', start: { date: '2026-10-25' }, end: { date: '2026-10-26' } },
  { summary: 'Rotevatnet rundt', start: { date: '2026-11-29' }, end: { date: '2026-11-30' } },
];

// 30 Oct 2026, 06:15 in Oslo.
const NOW = new Date('2026-10-30T05:15:00Z');

let app: FastifyInstance;
beforeEach(async () => {
  app = await buildApp({
    db: openDb(':memory:'),
    now: () => NOW,
    calendarSource: {
      listEvents: async (name) => (name === 'Samvær' ? (fixture.items as CalEvent[]) : races),
    },
  });
});
afterEach(() => app.close());

describe('API', () => {
  it('today combines kid week, flags, target, log and next race', async () => {
    const res = await app.inject('/api/today');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.date).toBe('2026-10-30');
    expect(body.calendar.day).toMatchObject({ type: 'barneuke', kidsHomeAllDay: true });
    expect(body.calendar.period).toMatchObject({ start: '2026-10-26', end: '2026-11-02', target: { min: 25, max: 35 } });
    expect(body.nextRace).toEqual({ date: '2026-11-29', title: 'Rotevatnet rundt', inDays: 30 });
    expect(body.log).toMatchObject({ kneeOk: null, weightKg: null });
  });

  it('logs knee test and weight independently', async () => {
    let res = await app.inject({ method: 'PUT', url: '/api/log/2026-10-30', payload: { kneeOk: true } });
    expect(res.json()).toMatchObject({ kneeOk: true, weightKg: null, kneeTestedAt: NOW.toISOString() });
    res = await app.inject({ method: 'PUT', url: '/api/log/2026-10-30', payload: { weightKg: 71.84 } });
    expect(res.json()).toMatchObject({ kneeOk: true, weightKg: 71.8 });
    res = await app.inject('/api/log?from=2026-10-01&to=2026-10-31');
    expect(res.json().logs).toHaveLength(1);
  });

  it('rejects bad log input and future dates', async () => {
    expect((await app.inject({ method: 'PUT', url: '/api/log/2026-10-30', payload: { weightKg: 7 } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PUT', url: '/api/log/2026-10-30', payload: { foo: 1 } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PUT', url: '/api/log/2026-10-31', payload: { kneeOk: true } })).statusCode).toBe(400);
  });

  it('calendar days returns periods with scaled targets', async () => {
    const res = await app.inject('/api/calendar/days?from=2026-11-02&to=2026-11-08');
    const { periods, days } = res.json();
    expect(days).toHaveLength(7);
    expect(periods.map((p: { type: string; days: number }) => [p.type, p.days])).toEqual([
      ['eneuke', 4],
      ['barneuke', 7],
    ]);
    expect(periods[0].target).toMatchObject({ scaled: true, min: 34.3 });
  });

  it('rejects an invalid range', async () => {
    expect((await app.inject('/api/calendar/days?from=2026-11-08&to=2026-11-02')).statusCode).toBe(400);
  });
});
