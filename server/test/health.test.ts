import { describe, expect, it } from 'vitest';
import { addDays } from '../src/dates.js';
import { buildHealth } from '../src/health/build.js';
import { emptyWellness, type Wellness } from '../src/intervals/types.js';

const TODAY = '2026-11-01';
/** n days ending today, oldest first, with the given fields per day. */
function series(n: number, f: (i: number) => Partial<Wellness>): Wellness[] {
  return Array.from({ length: n }, (_, i) => ({ ...emptyWellness(addDays(TODAY, i - n + 1)), ...f(i) }));
}

describe('buildHealth', () => {
  it('reports last night and a normal day against the 7-day baseline', () => {
    const w = series(10, (i) => ({ sleepSecs: (7 + (i % 2) * 0.5) * 3600, sleepScore: 80, restingHr: 45, hrv: 60 }));
    const h = buildHealth({ today: TODAY, days: 7, wellness: w });
    expect(h.days).toHaveLength(7);
    expect(h.lastNight).toEqual({ date: TODAY, sleepH: 7.5, sleepScore: 80, sleepHr: null });
    expect(h.latest).toMatchObject({ date: TODAY, restingHr: 45, restingHrBaseline: 45, hrv: 60, hrvBaseline: 60 });
    expect(h.form).toBe('normal');
    expect(h.reasons).toEqual([]);
    expect(h.days.at(-1)).toMatchObject({ sleepH: 7.5, sleepH7: 7.3, restingHr7: 45 });
  });

  it('flags elevated resting HR and suppressed HRV', () => {
    const w = series(10, (i) => (i === 9 ? { restingHr: 52, hrv: 45 } : { restingHr: 45, hrv: 60 }));
    const h = buildHealth({ today: TODAY, days: 14, wellness: w });
    expect(h.form).toBe('lav');
    expect(h.reasons).toEqual(['Hvilepulsen er 7 slag over snittet', 'HRV er 25 % under snittet']);
  });

  it('uses the latest day with data when today is not synced yet', () => {
    const w = series(9, (i) => ({ restingHr: 46, hrv: 58, sleepSecs: 25_200 })).slice(0, 8); // nothing for today
    const h = buildHealth({ today: TODAY, days: 7, wellness: w });
    expect(h.lastNight?.date).toBe('2026-10-31');
    expect(h.latest?.date).toBe('2026-10-31');
  });

  it('is unknown without data', () => {
    const h = buildHealth({ today: TODAY, days: 7, wellness: [] });
    expect([h.lastNight, h.latest, h.form]).toEqual([null, null, 'ukjent']);
  });
});
