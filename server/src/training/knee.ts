// Hard rule: knee test before every run. A run on a day without a passed test is flagged.
import type { DailyLog } from '../log/types.js';
import { isRun, type Activity } from '../intervals/types.js';

export type KneeFlag = 'failed' | 'missing';

export function kneeFlag(activity: Pick<Activity, 'type'>, log: Pick<DailyLog, 'kneeOk'> | undefined): KneeFlag | null {
  if (!isRun(activity)) return null;
  if (log?.kneeOk === true) return null;
  return log?.kneeOk === false ? 'failed' : 'missing';
}
