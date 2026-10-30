import { describe, expect, it } from 'vitest';
import fixture from './fixtures/samvaer-2026h2.json' with { type: 'json' };
import { periodAt, resolveDays, resolvePeriods, type CalEvent } from '../src/calendar/kidWeeks.js';
import { periodTarget, targetForDays, volumeStatus } from '../src/training/targets.js';
import { addDays, diffDays, mondayOf, todayOslo, weekday } from '../src/dates.js';

const events = fixture.items as CalEvent[];
const periods = resolvePeriods(events);
const day = (d: string) => resolveDays(events, d, d)[0]!;

describe('dates (Europe/Oslo)', () => {
  it('uses the Oslo calendar date, not UTC', () => {
    expect(todayOslo(new Date('2026-10-29T23:30:00Z'))).toBe('2026-10-30');
    expect(todayOslo(new Date('2026-06-30T22:30:00Z'))).toBe('2026-07-01');
  });

  it('day arithmetic is unaffected by the DST change on 25 Oct 2026', () => {
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(diffDays('2026-10-19', '2026-10-26')).toBe(7);
    expect(weekday('2026-10-30')).toBe(5);
    expect(mondayOf('2026-11-01')).toBe('2026-10-26');
  });
});

describe('resolvePeriods', () => {
  it('splits each period at the next handover day', () => {
    expect(periods.slice(0, 3)).toEqual([
      { type: 'barneuke', start: '2026-09-25', end: '2026-10-02', days: 7, provisional: false },
      { type: 'eneuke', start: '2026-10-02', end: '2026-10-09', days: 7, provisional: false },
      { type: 'barneuke', start: '2026-10-09', end: '2026-10-16', days: 7, provisional: false },
    ]);
  });

  it('follows the autumn-break shift instead of a fixed cycle', () => {
    expect(periodAt(periods, '2026-10-20')).toMatchObject({ type: 'eneuke', start: '2026-10-16', days: 10 });
    expect(periodAt(periods, '2026-10-26')).toMatchObject({ type: 'barneuke', start: '2026-10-26', end: '2026-11-02' });
    expect(periodAt(periods, '2026-11-03')).toMatchObject({ type: 'eneuke', start: '2026-11-02', end: '2026-11-06', days: 4 });
  });

  it('handles the Christmas schedule', () => {
    const xmas = periods.filter((p) => p.start >= '2026-12-11' && p.start < '2027-01-14');
    expect(xmas.map((p) => [p.type, p.start, p.days])).toEqual([
      ['eneuke', '2026-12-11', 5],
      ['barneuke', '2026-12-16', 4],
      ['eneuke', '2026-12-20', 7],
      ['barneuke', '2026-12-27', 9],
      ['eneuke', '2027-01-05', 9],
    ]);
  });

  it('marks the last known period as provisional, ending on its last day', () => {
    expect(periods.at(-1)).toEqual({ type: 'barneuke', start: '2027-01-14', end: '2027-01-22', days: 8, provisional: true });
  });

  it('periods are contiguous with no gaps', () => {
    for (let i = 1; i < periods.length; i++) expect(periods[i]!.start).toBe(periods[i - 1]!.end);
  });

  it('accepts dates with a time suffix and ignores cancelled events', () => {
    const p = resolvePeriods([
      { summary: ' pappaveke ', start: { date: '2026-10-09T00:00:00Z' }, end: { date: '2026-10-17T00:00:00Z' } },
      { summary: 'Mammaveke', start: { date: '2026-10-16' }, end: { date: '2026-10-24' } },
      { summary: 'Mammaveke', status: 'cancelled', start: { date: '2026-10-12' }, end: { date: '2026-10-13' } },
    ]);
    expect(p.map((x) => [x.type, x.start, x.end])).toEqual([
      ['barneuke', '2026-10-09', '2026-10-16'],
      ['eneuke', '2026-10-16', '2026-10-23'],
    ]);
  });

  it('merges back-to-back events of the same type', () => {
    const p = resolvePeriods([
      { summary: 'Pappaveke', start: { date: '2026-10-09' }, end: { date: '2026-10-13' } },
      { summary: 'Pappaveke', start: { date: '2026-10-13' }, end: { date: '2026-10-17' } },
      { summary: 'Mammaveke', start: { date: '2026-10-16' }, end: { date: '2026-10-24' } },
    ]);
    expect(p[0]).toMatchObject({ type: 'barneuke', start: '2026-10-09', end: '2026-10-16', days: 7 });
  });

  it('leaves a gap when events do not touch', () => {
    const gapped: CalEvent[] = [
      { summary: 'Pappaveke', start: { date: '2026-10-09' }, end: { date: '2026-10-12' } },
      { summary: 'Mammaveke', start: { date: '2026-10-16' }, end: { date: '2026-10-24' } },
    ];
    expect(resolvePeriods(gapped)[0]).toMatchObject({ end: '2026-10-12', days: 3, provisional: false });
    expect(resolveDays(gapped, '2026-10-13', '2026-10-13')[0]!.type).toBeNull();
    expect(resolveDays(gapped, '2026-10-16', '2026-10-16')[0]!.handover).toBeNull();
  });
});

describe('resolveDays', () => {
  it('Friday handover belongs to the incoming week', () => {
    expect(day('2026-10-09')).toMatchObject({ type: 'barneuke', handover: { from: 'eneuke', to: 'barneuke', time: null } });
    expect(day('2026-10-08')).toMatchObject({ type: 'eneuke', handover: null });
  });

  it('flags BHG planleggingsdag as kids home all day in a barneuke', () => {
    const d = day('2026-10-30');
    expect(d.type).toBe('barneuke');
    expect(d.kidsHomeAllDay).toBe(true);
    expect(d.flags).toEqual([{ kind: 'kids-home-all-day', title: 'BHG planleggingsdag' }]);
  });

  it('does not treat an all-day event in an eneuke as kids home', () => {
    const d = resolveDays(
      [...events, { summary: 'BHG planleggingsdag', start: { date: '2026-10-05' }, end: { date: '2026-10-06' } }],
      '2026-10-05',
      '2026-10-05',
    )[0]!;
    expect(d.type).toBe('eneuke');
    expect(d.kidsHomeAllDay).toBe(false);
    expect(d.flags[0]?.kind).toBe('all-day');
  });

  it('takes the handover time from "Bytte" in Oslo time', () => {
    expect(day('2026-12-20').handover).toEqual({ from: 'barneuke', to: 'eneuke', time: '15:00' });
    expect(day('2026-12-27').handover).toEqual({ from: 'eneuke', to: 'barneuke', time: '15:00' });
  });

  it('returns null type outside known periods', () => {
    expect(day('2026-09-01').type).toBeNull();
  });
});

describe('targets', () => {
  it('full eneuke and barneuke', () => {
    expect(periodTarget({ type: 'eneuke', days: 7 })).toEqual({ min: 60, max: 68, scale: 1, scaled: false });
    expect(periodTarget({ type: 'barneuke', days: 7 })).toEqual({ min: 25, max: 35, scale: 1, scaled: false });
  });

  it('scales a 4-day eneuke proportionally', () => {
    const p = periodAt(periods, '2026-11-03')!;
    expect(periodTarget(p)).toEqual({ min: 34.3, max: 38.9, scale: 0.57, scaled: true });
  });

  it('blends a Mon–Sun week across a handover', () => {
    // Mon 26 Oct – Sun 1 Nov: all barneuke after the autumn shift.
    const allBarne = resolveDays(events, '2026-10-26', '2026-11-01');
    expect(targetForDays(allBarne)).toEqual({ min: 25, max: 35, unknownDays: 0 });
    // Mon 5 Oct – Sun 11 Oct: 4 days eneuke, 3 days barneuke (handover Fri 9th).
    const mixed = resolveDays(events, '2026-10-05', '2026-10-11');
    expect(targetForDays(mixed)).toEqual({ min: 45, max: 53.9, unknownDays: 0 });
  });

  it('flags volume above the plan', () => {
    expect(volumeStatus(70, { min: 60, max: 68 })).toBe('over');
    expect(volumeStatus(64, { min: 60, max: 68 })).toBe('in-range');
    expect(volumeStatus(20, { min: 25, max: 35 })).toBe('under');
  });
});
