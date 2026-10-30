// Plan view model: upcoming periods with their days, planned sessions and planned km vs target.
import { addDays, type IsoDate } from '../dates.js';
import type { DayInfo } from '../calendar/kidWeeks.js';
import type { PeriodWithTarget, Race } from '../calendar/service.js';
import { isRun, type Activity } from '../intervals/types.js';
import { volumeStatus, type VolumeStatus } from '../training/targets.js';
import { plannedRunKm, type PlannedSession } from './types.js';

export interface PlanDay {
  date: IsoDate;
  handover: DayInfo['handover'];
  kidsHomeAllDay: boolean;
  races: Race[];
  sessions: PlannedSession[];
  /** Run km actually logged (past days). */
  doneKm: number;
}

export interface PlanPeriod extends PeriodWithTarget {
  /** One entry per day in the period (`days` is the period length). */
  dates: PlanDay[];
  /** Planned run km from today on. */
  plannedKm: number;
  /** Run km already logged before today. */
  doneKm: number;
  /** doneKm + plannedKm: what the period ends at if the plan holds. */
  projectedKm: number;
  /** Projected km vs target – "over" breaks volume discipline. */
  plannedStatus: VolumeStatus;
  /** Has future days without sessions, so the template can fill something. */
  canFill: boolean;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function buildPlan(input: {
  today: IsoDate;
  periods: PeriodWithTarget[];
  days: DayInfo[];
  races: Race[];
  sessions: PlannedSession[];
  activities: Activity[];
}): PlanPeriod[] {
  const dayInfo = new Map(input.days.map((d) => [d.date, d]));
  return input.periods.map((p) => {
    const days: PlanDay[] = [];
    for (let date = p.start; date < p.end; date = addDays(date, 1)) {
      const info = dayInfo.get(date);
      days.push({
        date,
        handover: info?.handover ?? null,
        kidsHomeAllDay: info?.kidsHomeAllDay ?? false,
        races: input.races.filter((r) => r.date === date),
        sessions: input.sessions.filter((s) => s.date === date),
        doneKm: round1(
          input.activities.reduce((sum, a) => sum + (a.date === date && isRun(a) && a.distanceM ? a.distanceM / 1000 : 0), 0),
        ),
      });
    }
    const plannedKm = plannedRunKm(days.filter((d) => d.date >= input.today).flatMap((d) => d.sessions));
    const doneKm = round1(days.filter((d) => d.date < input.today).reduce((sum, d) => sum + d.doneKm, 0));
    const projectedKm = round1(doneKm + plannedKm);
    return {
      ...p,
      dates: days,
      plannedKm,
      doneKm,
      projectedKm,
      plannedStatus: volumeStatus(projectedKm, p.target),
      canFill: days.some((d) => d.date >= input.today && d.sessions.length === 0 && d.races.length === 0),
    };
  });
}
