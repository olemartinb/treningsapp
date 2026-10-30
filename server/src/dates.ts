// Calendar-date helpers. A "date" is always a plain 'YYYY-MM-DD' string in Europe/Oslo;
// arithmetic is done on UTC midnight so DST never shifts a day.

export const TZ = 'Europe/Oslo';

export type IsoDate = string;

const osloDate = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const osloTime = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });

export function todayOslo(now: Date = new Date()): IsoDate {
  return osloDate.format(now);
}

/** Oslo calendar date of an instant. */
export function toOsloDate(instant: Date | string): IsoDate {
  return osloDate.format(new Date(instant));
}

/** Oslo wall-clock time 'HH:MM' of an instant. */
export function toOsloTime(instant: Date | string): string {
  return osloTime.format(new Date(instant));
}

function toUtc(d: IsoDate): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`Invalid date: ${d}`);
  return Date.parse(`${d}T00:00:00Z`);
}

export function addDays(d: IsoDate, n: number): IsoDate {
  return new Date(toUtc(d) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Whole days from a to b (b - a). */
export function diffDays(a: IsoDate, b: IsoDate): number {
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

/** ISO weekday, 1 = Monday … 7 = Sunday. */
export function weekday(d: IsoDate): number {
  return new Date(toUtc(d)).getUTCDay() || 7;
}

export function mondayOf(d: IsoDate): IsoDate {
  return addDays(d, 1 - weekday(d));
}

/** Inclusive list of dates from start to end. */
export function dateRange(start: IsoDate, endInclusive: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  for (let d = start; d <= endInclusive; d = addDays(d, 1)) out.push(d);
  return out;
}

export function isIsoDate(s: unknown): s is IsoDate {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(toUtc(s));
}

/** ISO 8601 week number (weeks start Monday; week 1 contains the first Thursday). */
export function isoWeek(d: IsoDate): number {
  const thursday = addDays(d, 4 - weekday(d));
  const jan1 = `${thursday.slice(0, 4)}-01-01`;
  return Math.floor(diffDays(jan1, thursday) / 7) + 1;
}
