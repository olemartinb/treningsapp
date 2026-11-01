// Helse view model: last night's sleep, recovery markers vs. the personal 7-day baseline, and trends.
import { addDays, dateRange, type IsoDate } from '../dates.js';
import type { Wellness } from '../intervals/types.js';
import { rollingMean } from '../progress/build.js';

/** Resting HR this much above the 7-day baseline counts as elevated (bpm). */
export const RHR_ELEVATED_BPM = 5;
/** HRV this far below the 7-day baseline counts as suppressed. */
export const HRV_LOW_FRACTION = 0.15;
const BASELINE_DAYS = 7;

export type DayForm = 'normal' | 'lav' | 'ukjent';

export interface HealthDay {
  date: IsoDate;
  sleepH: number | null;
  sleepScore: number | null;
  restingHr: number | null;
  hrv: number | null;
  readiness: number | null;
  steps: number | null;
  /** Trailing 7-day means (including the day). */
  sleepH7: number | null;
  restingHr7: number | null;
  hrv7: number | null;
}

export interface Health {
  today: IsoDate;
  /** Latest day with sleep data (normally today: Garmin files sleep under the wake-up date). */
  lastNight: { date: IsoDate; sleepH: number; sleepScore: number | null; sleepHr: number | null } | null;
  /** Latest recovery markers, compared with the 7 days before. */
  latest: {
    date: IsoDate;
    restingHr: number | null;
    restingHrBaseline: number | null;
    hrv: number | null;
    hrvBaseline: number | null;
    readiness: number | null;
    spo2: number | null;
    steps: number | null;
  } | null;
  form: DayForm;
  reasons: string[];
  days: HealthDay[];
}

const round1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);
const mean = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

export function buildHealth(input: { today: IsoDate; days: number; wellness: Wellness[] }): Health {
  const { today } = input;
  const from = addDays(today, -(input.days - 1));
  const byDate = new Map(input.wellness.map((w) => [w.date, w]));
  const dates = dateRange(from, today);
  const day = (d: IsoDate) => byDate.get(d);

  const sleepH = dates.map((d) => {
    const secs = day(d)?.sleepSecs;
    return secs ? secs / 3600 : null;
  });
  const rhr = dates.map((d) => day(d)?.restingHr ?? null);
  const hrv = dates.map((d) => day(d)?.hrv ?? null);
  const sleep7 = rollingMean(sleepH, BASELINE_DAYS);
  const rhr7 = rollingMean(rhr, BASELINE_DAYS);
  const hrv7 = rollingMean(hrv, BASELINE_DAYS);

  const days: HealthDay[] = dates.map((date, i) => ({
    date,
    sleepH: round1(sleepH[i]!),
    sleepScore: day(date)?.sleepScore ?? null,
    restingHr: rhr[i]!,
    hrv: hrv[i]!,
    readiness: day(date)?.readiness ?? null,
    steps: day(date)?.steps ?? null,
    sleepH7: round1(sleep7[i]!),
    restingHr7: round1(rhr7[i]!),
    hrv7: round1(hrv7[i]!),
  }));

  const sleepIdx = sleepH.findLastIndex((v) => v !== null);
  const lastNight =
    sleepIdx < 0
      ? null
      : {
          date: dates[sleepIdx]!,
          sleepH: round1(sleepH[sleepIdx]!)!,
          sleepScore: day(dates[sleepIdx]!)?.sleepScore ?? null,
          sleepHr: day(dates[sleepIdx]!)?.sleepHr ?? null,
        };

  // Baseline = the 7 days before the latest day with recovery data, so today doesn't pull its own baseline.
  const latestIdx = dates.findLastIndex((d) => (day(d)?.restingHr ?? null) !== null || (day(d)?.hrv ?? null) !== null);
  let latest: Health['latest'] = null;
  let form: DayForm = 'ukjent';
  const reasons: string[] = [];
  if (latestIdx >= 0) {
    const d = dates[latestIdx]!;
    const before = (v: (number | null)[]) => round1(mean(v.slice(Math.max(0, latestIdx - BASELINE_DAYS), latestIdx)));
    latest = {
      date: d,
      restingHr: rhr[latestIdx]!,
      restingHrBaseline: before(rhr),
      hrv: hrv[latestIdx]!,
      hrvBaseline: before(hrv),
      readiness: day(d)?.readiness ?? null,
      spo2: day(d)?.spo2 ?? null,
      steps: day(d)?.steps ?? null,
    };
    const { restingHr, restingHrBaseline, hrv: h, hrvBaseline } = latest;
    if (restingHr !== null && restingHrBaseline !== null && restingHr - restingHrBaseline >= RHR_ELEVATED_BPM) {
      reasons.push(`Hvilepulsen er ${Math.round(restingHr - restingHrBaseline)} slag over snittet`);
    }
    if (h !== null && hrvBaseline !== null && h < hrvBaseline * (1 - HRV_LOW_FRACTION)) {
      reasons.push(`HRV er ${Math.round((1 - h / hrvBaseline) * 100)} % under snittet`);
    }
    const comparable = (restingHr !== null && restingHrBaseline !== null) || (h !== null && hrvBaseline !== null);
    form = reasons.length ? 'lav' : comparable ? 'normal' : 'ukjent';
  }

  return { today, lastNight, latest, form, reasons, days };
}
