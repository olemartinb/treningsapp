import { describe, expect, it } from 'vitest';
import calendar from './fixtures/samvaer-2026h2.json' with { type: 'json' };
import { resolveDays, type CalEvent } from '../src/calendar/kidWeeks.js';
import type { Activity } from '../src/intervals/types.js';
import type { DailyLog } from '../src/log/types.js';
import { buildProgress, isThresholdRun, kneeStreak, paceAtHr, rollingMean } from '../src/progress/build.js';

const events = calendar.items as CalEvent[];
const run = (date: string, km: number, minutes: number, avgHr: number | null, name: string | null = null, type = 'Run'): Activity => ({
  id: `${date}-${km}`,
  date,
  startLocal: `${date}T07:00:00`,
  type,
  name,
  distanceM: km * 1000,
  movingS: minutes * 60,
  avgHr,
  maxHr: null,
  load: null,
});
const log = (date: string, kneeOk: boolean | null, weightKg: number | null = null): DailyLog => ({
  date,
  kneeOk,
  kneeNote: null,
  kneeTestedAt: null,
  weightKg,
});

describe('helpers', () => {
  it('rolling mean skips gaps', () => {
    expect(rollingMean([70, null, 72, 74], 3)).toEqual([70, 70, 71, 73]);
    expect(rollingMean([null, null], 7)).toEqual([null, null]);
  });

  it('normalises pace to 140 bpm', () => {
    // 10 km in 50 min = 5:00/km at 154 bpm → 5:30/km equivalent at 140 bpm
    expect(paceAtHr(run('2026-10-01', 10, 50, 154))).toBe(330);
    expect(paceAtHr(run('2026-10-01', 10, 50, null))).toBeNull();
  });

  it('recognises threshold runs by plan or name', () => {
    const planned = new Map([['2026-10-06', new Set(['threshold'])]]);
    expect(isThresholdRun(run('2026-10-06', 12, 50, 165), planned)).toBe(true);
    expect(isThresholdRun(run('2026-10-07', 12, 50, 165, 'Terskel 3x4 km'), new Map())).toBe(true);
    expect(isThresholdRun(run('2026-10-07', 12, 50, 165, '4 × 3 km'), new Map())).toBe(true);
    expect(isThresholdRun(run('2026-10-07', 12, 60, 140, 'Rolig'), new Map())).toBe(false);
    expect(isThresholdRun(run('2026-10-06', 30, 60, 140, null, 'Ride'), planned)).toBe(false);
  });

  it('knee streak counts back from today, or from yesterday when today is untested', () => {
    const logs = (entries: DailyLog[]) => new Map(entries.map((l) => [l.date, l]));
    const passes = [log('2026-10-27', true), log('2026-10-28', true), log('2026-10-29', true)];
    expect(kneeStreak(logs(passes), '2026-10-30')).toBe(3);
    expect(kneeStreak(logs([...passes, log('2026-10-30', true)]), '2026-10-30')).toBe(4);
    expect(kneeStreak(logs([...passes, log('2026-10-30', false)]), '2026-10-30')).toBe(0);
    expect(kneeStreak(logs([log('2026-10-26', true), log('2026-10-27', null), log('2026-10-28', true)]), '2026-10-29')).toBe(1);
  });
});

describe('buildProgress', () => {
  const activities = [
    run('2026-10-05', 12, 50, 168, 'Terskel 3x4 km'),
    run('2026-10-07', 10, 55, 142, 'Rolig'),
    run('2026-10-08', 8, 44, 146, 'Rolig'),
    run('2026-10-09', 3, 18, 130, 'Kort'), // too short for the efficiency trend
    run('2026-10-10', 40, 100, 120, 'Sykkel', 'Ride'),
  ];
  const p = buildProgress({
    today: '2026-10-14',
    weeks: 4,
    calendarDays: resolveDays(events, '2026-09-21', '2026-10-18'),
    activities,
    logs: [log('2026-10-12', true, 72.4), log('2026-10-13', true, 72.0), log('2026-10-14', null, 71.6)],
    wellness: [{ date: '2026-10-13', ctl: 41.26, atl: 52.04, weightKg: 75, restingHr: 44 }],
    sessions: [],
    kneeDays: 14,
  });

  it('sums run km per week with blended targets and dominant type', () => {
    expect(p.from).toBe('2026-09-21');
    expect(p.weekly.map((w) => [w.start, w.weekNo, w.km])).toEqual([
      ['2026-09-21', 39, 0],
      ['2026-09-28', 40, 0],
      ['2026-10-05', 41, 33],
      ['2026-10-12', 42, 0],
    ]);
    expect(p.weekly[2]).toMatchObject({ target: { min: 45, max: 53.9 }, type: 'eneuke' });
  });

  it('collects threshold and easy runs separately', () => {
    expect(p.threshold).toEqual([{ date: '2026-10-05', name: 'Terskel 3x4 km', km: 12, paceSec: 250 }]);
    expect(p.efficiency.map((e) => [e.date, e.paceSec, e.paceAtRefHr])).toEqual([
      ['2026-10-07', 330, 335],
      ['2026-10-08', 330, 344],
    ]);
    expect(p.efficiency[1]!.trend).toBe(339);
  });

  it('weight uses own log over intervals.icu and a 7-day rolling average', () => {
    expect(p.weight.at(-3)).toEqual({ date: '2026-10-12', kg: 72.4, avg7: 72.4 });
    expect(p.weight.at(-2)).toEqual({ date: '2026-10-13', kg: 72, avg7: 72.2 });
    expect(p.weight.at(-1)).toEqual({ date: '2026-10-14', kg: 71.6, avg7: 72 });
  });

  it('fitness has form (TSB = CTL − ATL); knee history covers the window', () => {
    expect(p.fitness).toEqual([{ date: '2026-10-13', ctl: 41.3, atl: 52, tsb: -10.8 }]);
    expect(p.knee).toHaveLength(14);
    expect(p.kneeStreak).toBe(2);
  });
});
