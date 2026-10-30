// Weekly volume targets per week type, scaled by the actual number of days.
import type { DayInfo, KidPeriod, WeekType } from '../calendar/kidWeeks.js';

export interface KmRange {
  min: number;
  max: number;
}

export const WEEKLY_KM: Record<WeekType, KmRange> = {
  eneuke: { min: 60, max: 68 },
  barneuke: { min: 25, max: 35 },
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export interface PeriodTarget extends KmRange {
  /** days / 7 – below 1 is a short week, above 1 a long one. */
  scale: number;
  scaled: boolean;
}

/** Target for one handover-to-handover period, proportional to its length. */
export function periodTarget(p: Pick<KidPeriod, 'type' | 'days'>): PeriodTarget {
  const base = WEEKLY_KM[p.type];
  const scale = p.days / 7;
  return { min: round1(base.min * scale), max: round1(base.max * scale), scale: Math.round(scale * 100) / 100, scaled: p.days !== 7 };
}

/**
 * Target for an arbitrary set of days (e.g. a Mon–Sun calendar week that spans a handover):
 * each day contributes 1/7 of its week type's range. Days with unknown type contribute nothing.
 */
export function targetForDays(days: Pick<DayInfo, 'type'>[]): KmRange & { unknownDays: number } {
  let min = 0;
  let max = 0;
  let unknownDays = 0;
  for (const d of days) {
    if (!d.type) {
      unknownDays++;
      continue;
    }
    min += WEEKLY_KM[d.type].min / 7;
    max += WEEKLY_KM[d.type].max / 7;
  }
  return { min: round1(min), max: round1(max), unknownDays };
}

export type VolumeStatus = 'under' | 'in-range' | 'over';

/** Volume discipline: anything above max is flagged – extra km is not a win. */
export function volumeStatus(km: number, target: KmRange): VolumeStatus {
  if (km > target.max) return 'over';
  if (km < target.min) return 'under';
  return 'in-range';
}
