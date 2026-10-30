// Shared with the web app (type-only imports), so no Worker globals here.
import type { IsoDate } from '../dates.js';

export interface DailyLog {
  date: IsoDate;
  /** true = 100 % pain-free, false = failed, null = not tested. */
  kneeOk: boolean | null;
  kneeNote: string | null;
  kneeTestedAt: string | null;
  weightKg: number | null;
}

export interface DailyLogPatch {
  kneeOk?: boolean | null;
  kneeNote?: string | null;
  weightKg?: number | null;
}
