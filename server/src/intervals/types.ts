// Shared with the web app (type-only imports), so no Worker globals here.
import type { IsoDate } from '../dates.js';

export interface Activity {
  id: string;
  date: IsoDate;
  startLocal: string;
  type: string;
  name: string | null;
  distanceM: number | null;
  movingS: number | null;
  avgHr: number | null;
  maxHr: number | null;
  load: number | null;
}

export interface Wellness {
  date: IsoDate;
  ctl: number | null;
  atl: number | null;
  weightKg: number | null;
  restingHr: number | null;
}

/** Types that count towards running volume (VirtualRun = treadmill). */
export const RUN_TYPES: readonly string[] = ['Run', 'TrailRun', 'VirtualRun'];

export const isRun = (a: Pick<Activity, 'type'>) => RUN_TYPES.includes(a.type);

/** Seconds per km, or null without distance/time. */
export function paceSecPerKm(a: Pick<Activity, 'distanceM' | 'movingS'>): number | null {
  return a.distanceM && a.movingS ? a.movingS / (a.distanceM / 1000) : null;
}
