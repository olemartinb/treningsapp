import { describe, expect, it } from 'vitest';
import calendar from './fixtures/samvaer-2026h2.json' with { type: 'json' };
import icu from './fixtures/intervals-activities.json' with { type: 'json' };
import { isoWeek } from '../src/dates.js';
import { resolveDays, type CalEvent } from '../src/calendar/kidWeeks.js';
import { toActivity, type IcuActivity } from '../src/intervals/client.js';
import type { Activity } from '../src/intervals/types.js';
import { buildWeek } from '../src/training/week.js';

const events = calendar.items as CalEvent[];
const activities = (icu.items as IcuActivity[]).map(toActivity).filter((a): a is Activity => a !== null);

describe('isoWeek', () => {
  it.each([
    ['2026-10-30', 44],
    ['2026-01-01', 1], // Thursday
    ['2026-12-31', 53], // 2026 has 53 ISO weeks
    ['2027-01-03', 53],
    ['2027-01-04', 1],
  ])('%s is week %i', (d, w) => expect(isoWeek(d)).toBe(w));
});

describe('buildWeek', () => {
  it('normalises to Monday and blends the target across a handover', () => {
    const w = buildWeek({
      anyDate: '2026-10-08',
      calendarDays: resolveDays(events, '2026-10-05', '2026-10-11'),
      races: [],
      logs: [],
      activities: [],
    });
    expect([w.start, w.end, w.weekNo]).toEqual(['2026-10-05', '2026-10-11', 41]);
    expect(w.days.map((d) => d.type)).toEqual(['eneuke', 'eneuke', 'eneuke', 'eneuke', 'barneuke', 'barneuke', 'barneuke']);
    expect(w.days[4]!.handover).toMatchObject({ from: 'eneuke', to: 'barneuke' });
    expect(w.target).toEqual({ min: 45, max: 53.9, unknownDays: 0 });
    expect(w.mix).toEqual({ barneuke: 3, eneuke: 4 });
  });

  it('puts activities, logs, races and knee flags on the right day', () => {
    const w = buildWeek({
      anyDate: '2026-10-26',
      calendarDays: resolveDays(events, '2026-10-26', '2026-11-01'),
      races: [{ date: '2026-10-31', title: 'Testløp' }],
      logs: [{ date: '2026-10-26', kneeOk: true, kneeNote: null, kneeTestedAt: null, weightKg: 72.1 }],
      activities,
    });
    const byDate = Object.fromEntries(w.days.map((d) => [d.date, d]));
    expect(byDate['2026-10-26']).toMatchObject({ runKm: 7.4, activities: [{ kneeFlag: null }] });
    expect(byDate['2026-10-28']).toMatchObject({ runKm: 6.1, activities: [{ type: 'VirtualRun', kneeFlag: 'missing' }] });
    expect(byDate['2026-10-29']).toMatchObject({ runKm: 0, activities: [{ type: 'VirtualRide', kneeFlag: null }] });
    expect(byDate['2026-10-30']!.kidsHomeAllDay).toBe(true);
    expect(byDate['2026-10-31']!.races).toEqual([{ date: '2026-10-31', title: 'Testløp' }]);
    expect(w.runKm).toBe(21.5);
    expect(w.target).toEqual({ min: 25, max: 35, unknownDays: 0 });
    expect(w.status).toBe('under');
  });

  it('has no target or status without the calendar', () => {
    const w = buildWeek({ anyDate: '2026-10-26', calendarDays: null, races: [], logs: [], activities });
    expect(w.target).toBeNull();
    expect(w.status).toBeNull();
    expect(w.runKm).toBe(21.5);
  });
});
