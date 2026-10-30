// Progress view model: weekly volume vs target, threshold and easy-run trends,
// weight (7-day rolling average), fitness/fatigue/form and knee test history.
import { addDays, dateRange, isoWeek, mondayOf, type IsoDate } from '../dates.js';
import type { DayInfo, WeekType } from '../calendar/kidWeeks.js';
import type { DailyLog } from '../log/types.js';
import { isRun, paceSecPerKm, type Activity, type Wellness } from '../intervals/types.js';
import type { PlannedSession } from '../plan/types.js';
import { targetForDays, type KmRange } from '../training/targets.js';

/** Target half-marathon pace: sub-1:20 over 21.1 km. */
export const GOAL_PACE_SEC = 227; // 3:47/km
export const GOAL_WEIGHT_KG = 68;
/** Heart rate the aerobic-efficiency trend is normalised to. */
export const EF_REFERENCE_HR = 140;
/** Upper average HR for a run to count as easy (Z1/Z2). */
export const EASY_MAX_HR = 150;
/** Runs in the easy-run trend's moving average. */
export const EFFICIENCY_WINDOW = 8;
const EASY_MIN_KM = 4;

const THRESHOLD_NAME = /terskel|threshold|tempo|\d+\s*[x×]\s*\d+(?:[.,]\d+)?\s*km/i;

export interface WeekVolume {
  start: IsoDate;
  weekNo: number;
  km: number;
  target: (KmRange & { unknownDays: number }) | null;
  /** The week type with most days, for colouring. */
  type: WeekType | null;
}

export interface Progress {
  from: IsoDate;
  to: IsoDate;
  weekly: WeekVolume[];
  threshold: { date: IsoDate; name: string | null; km: number; paceSec: number }[];
  efficiency: { date: IsoDate; km: number; avgHr: number; paceSec: number; paceAtRefHr: number; trend: number | null }[];
  weight: { date: IsoDate; kg: number | null; avg7: number | null }[];
  fitness: { date: IsoDate; ctl: number; atl: number; tsb: number }[];
  knee: { date: IsoDate; ok: boolean | null }[];
  kneeStreak: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const km = (a: Activity) => (a.distanceM ?? 0) / 1000;

/** Threshold runs: planned as threshold that day, or named like one. */
export function isThresholdRun(a: Activity, plannedKinds: Map<IsoDate, Set<string>>): boolean {
  return isRun(a) && (plannedKinds.get(a.date)?.has('threshold') === true || THRESHOLD_NAME.test(a.name ?? ''));
}

/** Pace the run would have at the reference HR, assuming speed scales with HR (efficiency factor). */
export function paceAtHr(a: Pick<Activity, 'distanceM' | 'movingS' | 'avgHr'>, hr = EF_REFERENCE_HR): number | null {
  const pace = paceSecPerKm(a);
  return pace && a.avgHr ? (pace * a.avgHr) / hr : null;
}

/** Mean of the values in the trailing window (inclusive), skipping nulls. */
export function rollingMean(values: (number | null)[], window: number): (number | null)[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1).filter((v): v is number => v !== null);
    return slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : null;
  });
}

/** Consecutive passed knee tests ending today (or yesterday, if today isn't tested yet). */
export function kneeStreak(logs: Map<IsoDate, DailyLog>, today: IsoDate): number {
  const todayOk = logs.get(today)?.kneeOk;
  if (todayOk === false) return 0;
  let day = todayOk === true ? today : addDays(today, -1);
  let n = 0;
  while (logs.get(day)?.kneeOk === true) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

export function buildProgress(input: {
  today: IsoDate;
  weeks: number;
  calendarDays: DayInfo[] | null;
  activities: Activity[];
  logs: DailyLog[];
  wellness: Wellness[];
  sessions: PlannedSession[];
  kneeDays: number;
}): Progress {
  const { today } = input;
  const from = addDays(mondayOf(today), -7 * (input.weeks - 1));
  const calByDate = new Map((input.calendarDays ?? []).map((d) => [d.date, d]));
  const logByDate = new Map(input.logs.map((l) => [l.date, l]));
  const runs = input.activities.filter((a) => isRun(a) && a.distanceM);

  const weekly: WeekVolume[] = [];
  for (let start = from; start <= today; start = addDays(start, 7)) {
    const dates = dateRange(start, addDays(start, 6));
    const days = dates.map((date) => ({ type: calByDate.get(date)?.type ?? null }));
    const counts = { barneuke: 0, eneuke: 0 };
    for (const d of days) if (d.type) counts[d.type]++;
    weekly.push({
      start,
      weekNo: isoWeek(start),
      km: round1(runs.filter((a) => a.date >= start && a.date <= dates[6]!).reduce((sum, a) => sum + km(a), 0)),
      target: input.calendarDays ? targetForDays(days) : null,
      type: counts.barneuke || counts.eneuke ? (counts.barneuke > counts.eneuke ? 'barneuke' : 'eneuke') : null,
    });
  }

  const plannedKinds = new Map<IsoDate, Set<string>>();
  for (const s of input.sessions) plannedKinds.set(s.date, (plannedKinds.get(s.date) ?? new Set()).add(s.kind));
  const threshold = runs
    .filter((a) => a.date >= from && isThresholdRun(a, plannedKinds))
    .map((a) => ({ date: a.date, name: a.name, km: round1(km(a)), paceSec: Math.round(paceSecPerKm(a)!) }));

  const easy = runs.filter(
    (a) => a.date >= from && a.avgHr && a.avgHr <= EASY_MAX_HR && km(a) >= EASY_MIN_KM && !isThresholdRun(a, plannedKinds),
  );
  const easyTrend = rollingMean(
    easy.map((a) => paceAtHr(a)),
    EFFICIENCY_WINDOW,
  );
  const efficiency = easy.map((a, i) => ({
    date: a.date,
    km: round1(km(a)),
    avgHr: Math.round(a.avgHr!),
    paceSec: Math.round(paceSecPerKm(a)!),
    paceAtRefHr: Math.round(paceAtHr(a)!),
    trend: easyTrend[i] === null ? null : Math.round(easyTrend[i]!),
  }));

  // Weight: own log first, intervals.icu (e.g. Garmin scale) as fallback.
  const wellnessWeight = new Map(input.wellness.filter((w) => w.weightKg !== null).map((w) => [w.date, w.weightKg!]));
  const weightDates = dateRange(from, today);
  const kgs = weightDates.map((d) => logByDate.get(d)?.weightKg ?? wellnessWeight.get(d) ?? null);
  const avg7 = rollingMean(kgs, 7);
  const firstWeight = kgs.findIndex((k) => k !== null);
  const weight =
    firstWeight < 0
      ? []
      : weightDates.slice(firstWeight).map((date, i) => ({
          date,
          kg: kgs[firstWeight + i]!,
          avg7: avg7[firstWeight + i] === null ? null : round1(avg7[firstWeight + i]!),
        }));

  const fitness = input.wellness
    .filter((w) => w.date >= from && w.ctl !== null && w.atl !== null)
    .map((w) => ({ date: w.date, ctl: round1(w.ctl!), atl: round1(w.atl!), tsb: round1(w.ctl! - w.atl!) }));

  const kneeFrom = addDays(today, -(input.kneeDays - 1));
  const knee = dateRange(kneeFrom, today).map((date) => ({ date, ok: logByDate.get(date)?.kneeOk ?? null }));

  return {
    from,
    to: today,
    weekly,
    threshold,
    efficiency,
    weight,
    fitness,
    knee,
    kneeStreak: kneeStreak(logByDate, today),
  };
}

