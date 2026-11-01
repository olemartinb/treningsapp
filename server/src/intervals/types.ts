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
  /** Sleep for the night ending on this date. */
  sleepSecs: number | null;
  sleepScore: number | null;
  /** Average heart rate while asleep. */
  sleepHr: number | null;
  /** HRV (rMSSD), ms. */
  hrv: number | null;
  readiness: number | null;
  steps: number | null;
  spo2: number | null;
  respiration: number | null;
  /** The full intervals.icu record as JSON (set by the API client, stored for later use). */
  raw?: string;
}

/** A wellness day with only the given fields set. */
export const emptyWellness = (date: IsoDate): Wellness => ({
  date,
  ctl: null,
  atl: null,
  weightKg: null,
  restingHr: null,
  sleepSecs: null,
  sleepScore: null,
  sleepHr: null,
  hrv: null,
  readiness: null,
  steps: null,
  spo2: null,
  respiration: null,
});

/** Types that count towards running volume (VirtualRun = treadmill). */
export const RUN_TYPES: readonly string[] = ['Run', 'TrailRun', 'VirtualRun'];

export const isRun = (a: Pick<Activity, 'type'>) => RUN_TYPES.includes(a.type);

/** Seconds per km, or null without distance/time. */
export function paceSecPerKm(a: Pick<Activity, 'distanceM' | 'movingS'>): number | null {
  return a.distanceM && a.movingS ? a.movingS / (a.distanceM / 1000) : null;
}
