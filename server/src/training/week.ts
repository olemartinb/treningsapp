// Mon–Sun week: per-day kid-week info, logs and activities, plus the blended km target.
import { addDays, dateRange, isoWeek, mondayOf, type IsoDate } from '../dates.js';
import type { DayInfo, WeekType } from '../calendar/kidWeeks.js';
import type { Race } from '../calendar/service.js';
import type { DailyLog } from '../log/types.js';
import { isRun, type Activity } from '../intervals/types.js';
import { kneeFlag, type KneeFlag } from './knee.js';
import { targetForDays, volumeStatus, type KmRange, type VolumeStatus } from './targets.js';

export interface WeekDay {
  date: IsoDate;
  type: WeekType | null;
  handover: DayInfo['handover'];
  kidsHomeAllDay: boolean;
  flags: DayInfo['flags'];
  races: Race[];
  log: DailyLog | null;
  activities: (Activity & { kneeFlag: KneeFlag | null })[];
  runKm: number;
}

export interface Week {
  start: IsoDate;
  end: IsoDate;
  weekNo: number;
  days: WeekDay[];
  /** Blended target (each day contributes 1/7 of its type's range); null without calendar. */
  target: (KmRange & { unknownDays: number }) | null;
  runKm: number;
  status: VolumeStatus | null;
  mix: Record<WeekType, number>;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function buildWeek(input: {
  anyDate: IsoDate;
  calendarDays: DayInfo[] | null;
  races: Race[];
  logs: DailyLog[];
  activities: Activity[];
}): Week {
  const start = mondayOf(input.anyDate);
  const end = addDays(start, 6);
  const logByDate = new Map(input.logs.map((l) => [l.date, l]));
  const calByDate = new Map((input.calendarDays ?? []).map((d) => [d.date, d]));

  const days: WeekDay[] = dateRange(start, end).map((date) => {
    const cal = calByDate.get(date);
    const log = logByDate.get(date) ?? null;
    const activities = input.activities
      .filter((a) => a.date === date)
      .map((a) => ({ ...a, kneeFlag: kneeFlag(a, log ?? undefined) }));
    const runKm = round1(activities.reduce((sum, a) => sum + (isRun(a) && a.distanceM ? a.distanceM / 1000 : 0), 0));
    return {
      date,
      type: cal?.type ?? null,
      handover: cal?.handover ?? null,
      kidsHomeAllDay: cal?.kidsHomeAllDay ?? false,
      flags: cal?.flags ?? [],
      races: input.races.filter((r) => r.date === date),
      log,
      activities,
      runKm,
    };
  });

  const runKm = round1(days.reduce((sum, d) => sum + d.runKm, 0));
  const target = input.calendarDays ? targetForDays(days) : null;
  const mix = { barneuke: 0, eneuke: 0 };
  for (const d of days) if (d.type) mix[d.type]++;
  return {
    start,
    end,
    weekNo: isoWeek(start),
    days,
    target,
    runKm,
    status: target && target.unknownDays < 7 ? volumeStatus(runKm, target) : null,
    mix,
  };
}
