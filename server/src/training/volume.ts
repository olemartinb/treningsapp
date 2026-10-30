// Running volume per period vs. its target.
import { addDays, type IsoDate } from '../dates.js';
import { isRun, type Activity } from '../intervals/types.js';
import { volumeStatus, type KmRange, type VolumeStatus } from './targets.js';

export interface PeriodVolume {
  km: number;
  status: VolumeStatus;
  /** Run km per date within the period (dates without runs omitted). */
  kmByDate: Record<IsoDate, number>;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function periodVolume(activities: Activity[], period: { start: IsoDate; end: IsoDate }, target: KmRange): PeriodVolume {
  const last = addDays(period.end, -1);
  const kmByDate: Record<IsoDate, number> = {};
  let km = 0;
  for (const a of activities) {
    if (!isRun(a) || !a.distanceM || a.date < period.start || a.date > last) continue;
    const k = a.distanceM / 1000;
    km += k;
    kmByDate[a.date] = round1((kmByDate[a.date] ?? 0) + k);
  }
  km = round1(km);
  return { km, status: volumeStatus(km, target), kmByDate };
}
