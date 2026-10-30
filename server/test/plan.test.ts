import { describe, expect, it } from 'vitest';
import calendar from './fixtures/samvaer-2026h2.json' with { type: 'json' };
import icu from './fixtures/intervals-activities.json' with { type: 'json' };
import { resolveDays, resolvePeriods, type CalEvent } from '../src/calendar/kidWeeks.js';
import { toActivity, type IcuActivity } from '../src/intervals/client.js';
import type { Activity } from '../src/intervals/types.js';
import { buildPlan } from '../src/plan/overview.js';
import type { PlannedSession } from '../src/plan/types.js';
import { periodTarget } from '../src/training/targets.js';

const events = calendar.items as CalEvent[];
const activities = (icu.items as IcuActivity[]).map(toActivity).filter((a): a is Activity => a !== null);
const session = (date: string, kind: PlannedSession['kind'], km: number | null, id = 1): PlannedSession => ({
  id,
  date,
  kind,
  km,
  title: kind,
  details: null,
  done: false,
  source: 'manual',
});

describe('buildPlan', () => {
  const periods = resolvePeriods(events)
    .filter((p) => p.start === '2026-10-26')
    .map((p) => ({ ...p, target: periodTarget(p) }));
  const days = resolveDays(events, '2026-10-26', '2026-11-01');

  it('projects the period: km run before today plus km planned from today', () => {
    const [p] = buildPlan({
      today: '2026-10-30',
      periods,
      days,
      races: [],
      sessions: [session('2026-10-31', 'long', 16), session('2026-11-01', 'strength', null, 2), session('2026-10-27', 'easy', 9, 3)],
      activities,
    });
    // 7,4 (26th) + 6,1 (28th) run; the 9 km planned on the 27th is in the past and doesn't count.
    expect(p).toMatchObject({ doneKm: 13.5, plannedKm: 16, projectedKm: 29.5, plannedStatus: 'in-range', canFill: true });
    expect(p!.dates.find((d) => d.date === '2026-10-28')!.doneKm).toBe(6.1);
  });

  it('flags a plan that would end over the target', () => {
    const [p] = buildPlan({ today: '2026-10-30', periods, days, races: [], sessions: [session('2026-10-31', 'long', 22)], activities });
    expect(p).toMatchObject({ projectedKm: 35.5, plannedStatus: 'over' });
  });
});
