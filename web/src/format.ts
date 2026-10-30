// Display formatting – Norwegian labels, mm:ss/km paces, kg with one decimal.
import type { WeekType } from './api';

export const WEEK_LABEL: Record<WeekType, string> = { barneuke: 'Barneuke', eneuke: 'Eneuke' };

const parse = (d: string) => new Date(`${d}T12:00:00Z`);
const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('nb-NO', { timeZone: 'UTC', ...opts });

const longDate = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
const shortDate = fmt({ day: 'numeric', month: 'short' });

export const formatLongDate = (d: string) => capitalize(longDate.format(parse(d)));
export const formatShortDate = (d: string) => shortDate.format(parse(d));

/** Inclusive date of an exclusive end. */
export const dayBefore = (d: string) => new Date(parse(d).getTime() - 86_400_000).toISOString().slice(0, 10);

export const formatKg = (kg: number | null) => (kg === null ? '–' : `${kg.toFixed(1).replace('.', ',')} kg`);

export function formatKm(km: number): string {
  return Number.isInteger(km) ? `${km}` : km.toFixed(1).replace('.', ',');
}

/** Seconds per km → 'm:ss/km'. */
export function formatPace(secPerKm: number): string {
  const total = Math.round(secPerKm);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}/km`;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const weekdayShort = fmt({ weekday: 'narrow' });
export const weekdayLetter = (d: string) => weekdayShort.format(parse(d)).toUpperCase();

const weekdayDay = fmt({ weekday: 'short', day: 'numeric', month: 'short' });
export const formatWeekdayDate = (d: string) => weekdayDay.format(parse(d));

const osloTime = new Intl.DateTimeFormat('nb-NO', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit' });
export const formatTime = (iso: string) => osloTime.format(new Date(iso));

const osloHour = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', hour: 'numeric', hour12: false });
export function greeting(now = new Date()): string {
  const h = Number(osloHour.format(now));
  if (h >= 5 && h < 10) return 'God morgen';
  if (h >= 10 && h < 18) return 'God dag';
  return 'God kveld';
}

/** One decimal with a Norwegian comma, no unit. */
export const formatDecimal = (n: number) => n.toFixed(1).replace('.', ',');
