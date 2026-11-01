import { describe, expect, it } from 'vitest';
import calendar from './fixtures/samvaer-2026h2.json' with { type: 'json' };
import { periodAt, resolvePeriods, type CalEvent } from '../src/calendar/kidWeeks.js';
import { templateForPeriod } from '../src/plan/template.js';
import { SESSION_KINDS, plannedRunKm, type SessionDraft } from '../src/plan/types.js';
import { periodTarget } from '../src/training/targets.js';
import { addDays } from '../src/dates.js';

const periods = resolvePeriods(calendar.items as CalEvent[]);
const period = (d: string) => periodAt(periods, d)!;
const brief = (drafts: SessionDraft[]) => drafts.map((d) => [d.date, d.kind, d.km]);
const base = { races: [], takenDates: [], usedKm: 0, today: '2026-09-01' };

describe('templateForPeriod', () => {
  it('eneuke, 7 days from Friday handover: long Sat, threshold Tue, fart Thu, 60 km', () => {
    const p = period('2026-10-05'); // Fri 2 Oct – Thu 8 Oct
    const drafts = templateForPeriod({ ...base, period: p });
    expect(brief(drafts)).toEqual([
      ['2026-10-02', 'easy', 8],
      ['2026-10-03', 'long', 21],
      ['2026-10-04', 'strength', null],
      ['2026-10-05', 'easy', 10],
      ['2026-10-06', 'threshold', 12],
      ['2026-10-08', 'vo2', 9],
    ]);
    expect(plannedRunKm(drafts)).toBe(60);
    expect(drafts[1]!.title).toBe('Langtur 21 km');
    expect(drafts[0]!.title).toBe('Rolig 8 km');
  });

  it('barneuke, 7 days: morning runs, evening treadmill and spin (not back to back), 28 km', () => {
    const drafts = templateForPeriod({ ...base, period: period('2026-10-12') }); // Fri 9 – Thu 15 Oct
    expect(brief(drafts)).toEqual([
      ['2026-10-09', 'easy', 8],
      ['2026-10-10', 'strength', null],
      ['2026-10-11', 'easy', 7],
      ['2026-10-12', 'treadmill', 6],
      ['2026-10-14', 'spin', null],
      ['2026-10-15', 'easy', 7],
    ]);
    expect(plannedRunKm(drafts)).toBe(28);
    expect(drafts[0]!.title).toBe('Morgentur 8 km');
  });

  it('short 4-day eneuke stays inside the scaled target', () => {
    const p = period('2026-11-03'); // 2–5 Nov
    const t = periodTarget(p);
    const drafts = templateForPeriod({ ...base, period: p });
    const km = plannedRunKm(drafts);
    expect(km).toBeGreaterThanOrEqual(t.min);
    expect(km).toBeLessThanOrEqual(t.max);
    expect(drafts.map((d) => d.kind)).toContain('long');
    expect(new Set(drafts.map((d) => d.date)).size).toBe(drafts.length); // one session per day
  });

  it('long 10-day eneuke adds easy runs towards the target without exceeding it', () => {
    const p = period('2026-10-20'); // 16–25 Oct, 10 days
    const t = periodTarget(p);
    const drafts = templateForPeriod({ ...base, period: p });
    const km = plannedRunKm(drafts);
    expect(km).toBeGreaterThanOrEqual(t.min);
    expect(km).toBeLessThanOrEqual(t.max);
    expect(new Set(drafts.map((d) => d.date)).size).toBe(drafts.length);
  });

  it('puts the race on race day and no hard session the day before', () => {
    const p = period('2026-10-12'); // barneuke 9–15 Oct; treadmill planned Mon 12th
    const drafts = templateForPeriod({ ...base, period: p, races: [{ date: '2026-10-13', title: 'Testløp' }] });
    expect(drafts.find((d) => d.date === '2026-10-13')).toMatchObject({ kind: 'race', title: 'Testløp' });
    const dayBefore = drafts.find((d) => d.date === '2026-10-12');
    expect(dayBefore && SESSION_KINDS[dayBefore.kind].hard).toBeFalsy();
  });

  it('keeps the long run off the day before a race', () => {
    const p = period('2026-11-30'); // eneuke 27 Nov – 3 Dec, race Sun 29th; long run would be Sat 28th
    const drafts = templateForPeriod({ ...base, period: p, races: [{ date: '2026-11-29', title: 'Rotevatnet rundt' }] });
    const saturday = drafts.find((d) => d.date === '2026-11-28');
    expect(saturday === undefined || saturday.kind === 'easy').toBe(true);
    expect(drafts.some((d) => d.kind === 'long')).toBe(true); // moved, not dropped
  });

  it('keeps the last day easy when a race falls on the day after the period', () => {
    const p = period('2026-12-22'); // eneuke 20–26 Dec; fart would land on Sat 26th
    const drafts = templateForPeriod({ ...base, period: p, races: [{ date: '2026-12-27', title: 'Rotevatnet rundt' }] });
    const last = drafts.find((d) => d.date === '2026-12-26');
    expect(last === undefined || last.kind === 'easy').toBe(true);
    expect(drafts.some((d) => d.kind === 'race')).toBe(false); // the race itself belongs to the next period
  });

  it('keeps hard sessions apart', () => {
    for (const d of ['2026-10-05', '2026-10-12', '2026-11-03', '2026-12-12', '2026-12-17']) {
      const hard = templateForPeriod({ ...base, period: period(d) })
        .filter((s) => SESSION_KINDS[s.kind].hard)
        .map((s) => s.date);
      for (const h of hard) expect(hard).not.toContain(addDays(h, 1));
    }
  });

  it('skips past days and dates that already have sessions, and counts used km', () => {
    const p = period('2026-10-05');
    const drafts = templateForPeriod({ ...base, period: p, today: '2026-10-05', takenDates: ['2026-10-06'], usedKm: 30 });
    expect(drafts.every((d) => d.date >= '2026-10-05' && d.date !== '2026-10-06')).toBe(true);
    expect(plannedRunKm(drafts) + 30).toBeLessThanOrEqual(periodTarget(p).max);
  });

  it('plans nothing when the target is already used up', () => {
    const p = period('2026-10-12');
    const drafts = templateForPeriod({ ...base, period: p, usedKm: 40 });
    expect(plannedRunKm(drafts)).toBe(0);
  });
});
