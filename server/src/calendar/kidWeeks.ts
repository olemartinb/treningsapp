// Resolves kid weeks (barneuke / eneuke) from the "Samvær" calendar.
//
// Conventions observed in the real calendar:
// - "Pappaveke" / "Mammaveke" are all-day events whose (exclusive) end date is one day
//   AFTER the next event's start, i.e. the handover day is covered by both events.
// - Holidays move events (e.g. autumn break: Mammaveke 16.–26. Oct, Pappaveke 26. Oct–2. Nov),
//   so nothing here assumes a 14-day cycle. Each period runs from its own start to the
//   next period's start.
// - "Bytte" is a timed event giving the exact handover time; other all-day events
//   ("BHG planleggingsdag") mean the kids are home all day.
import { addDays, diffDays, toOsloDate, toOsloTime, type IsoDate } from '../dates.js';

export type WeekType = 'barneuke' | 'eneuke';

/** Minimal shape of a Google Calendar event (as returned by events.list). */
export interface CalEvent {
  id?: string;
  summary?: string;
  status?: string;
  start: { date?: string; dateTime?: string };
  end: { date?: string; dateTime?: string };
}

export interface KidPeriod {
  type: WeekType;
  /** First day (a handover day unless it is the first period seen). */
  start: IsoDate;
  /** Exclusive end = the next handover day. */
  end: IsoDate;
  /** Days between handovers. */
  days: number;
  /** True when the end was inferred without seeing the following event. */
  provisional: boolean;
}

export interface Handover {
  from: WeekType | null;
  to: WeekType;
  /** 'HH:MM' from a "Bytte" event, if any. */
  time: string | null;
}

export interface DayFlag {
  kind: 'kids-home-all-day' | 'all-day' | 'timed';
  title: string;
  time?: string;
}

export interface DayInfo {
  date: IsoDate;
  type: WeekType | null;
  handover: Handover | null;
  /** Kids are home the whole day (e.g. kindergarten closed) during a barneuke. */
  kidsHomeAllDay: boolean;
  flags: DayFlag[];
}

const KID_TITLES: Record<string, WeekType> = {
  pappaveke: 'barneuke',
  mammaveke: 'eneuke',
};

export function kidWeekType(summary: string | undefined): WeekType | null {
  return KID_TITLES[(summary ?? '').trim().toLowerCase()] ?? null;
}

const isHandoverTitle = (s: string) => /^bytte\b/i.test(s.trim());

/** All-day date of an event boundary. Accepts '2026-10-02' and '2026-10-02T00:00:00Z'. */
function allDayDate(b: { date?: string }): IsoDate | null {
  return b.date ? b.date.slice(0, 10) : null;
}

function active(events: CalEvent[]): CalEvent[] {
  return events.filter((e) => e.status !== 'cancelled');
}

/** Turn kid-week events into contiguous periods split at each handover day. */
export function resolvePeriods(events: CalEvent[]): KidPeriod[] {
  const raw = active(events)
    .map((e) => {
      const type = kidWeekType(e.summary);
      const start = allDayDate(e.start);
      const end = allDayDate(e.end);
      return type && start && end && end > start ? { type, start, end } : null;
    })
    .filter((x): x is { type: WeekType; start: IsoDate; end: IsoDate } => x !== null)
    .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));

  // Merge duplicates / back-to-back events of the same type.
  const merged: typeof raw = [];
  for (const ev of raw) {
    const last = merged.at(-1);
    if (last && last.type === ev.type && ev.start <= last.end) {
      if (ev.end > last.end) last.end = ev.end;
    } else {
      merged.push({ ...ev });
    }
  }

  return merged.map((ev, i) => {
    const next = merged[i + 1];
    let end: IsoDate;
    let provisional = false;
    if (next && next.start <= ev.end) {
      // Normal case: overlap (or touching) – the next event's start is the handover.
      end = next.start > ev.start ? next.start : ev.end;
    } else if (next) {
      // Gap before the next event: the event's own end stands.
      end = ev.end;
    } else {
      // Last known event: by convention its final day is the next handover.
      end = diffDays(ev.start, ev.end) > 1 ? addDays(ev.end, -1) : ev.end;
      provisional = true;
    }
    return { type: ev.type, start: ev.start, end, days: diffDays(ev.start, end), provisional };
  });
}

/** Day-by-day view over [from, to] (inclusive). */
export function resolveDays(events: CalEvent[], from: IsoDate, to: IsoDate): DayInfo[] {
  const periods = resolvePeriods(events);
  const handoverTimes = new Map<IsoDate, string>();
  const flagsByDate = new Map<IsoDate, DayFlag[]>();
  const pushFlag = (d: IsoDate, f: DayFlag) => flagsByDate.set(d, [...(flagsByDate.get(d) ?? []), f]);

  for (const e of active(events)) {
    const title = (e.summary ?? '').trim();
    if (kidWeekType(title)) continue;
    if (e.start.dateTime) {
      const date = toOsloDate(e.start.dateTime);
      const time = toOsloTime(e.start.dateTime);
      if (isHandoverTitle(title)) handoverTimes.set(date, time);
      pushFlag(date, { kind: 'timed', title, time });
    } else {
      const start = allDayDate(e.start);
      const end = allDayDate(e.end);
      if (!start || !end) continue;
      for (let d = start; d < end; d = addDays(d, 1)) pushFlag(d, { kind: 'all-day', title });
    }
  }

  const days: DayInfo[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const idx = periods.findIndex((p) => p.start <= d && d < p.end);
    const period = idx >= 0 ? periods[idx]! : null;
    const prev = idx > 0 ? periods[idx - 1]! : null;

    let handover: Handover | null = null;
    if (period && period.start === d && prev && prev.end === d) {
      handover = { from: prev.type, to: period.type, time: handoverTimes.get(d) ?? null };
    }

    const type = period?.type ?? null;
    const flags = (flagsByDate.get(d) ?? []).map((f) =>
      f.kind === 'all-day' && type === 'barneuke' ? { ...f, kind: 'kids-home-all-day' as const } : f,
    );
    days.push({
      date: d,
      type,
      handover,
      kidsHomeAllDay: flags.some((f) => f.kind === 'kids-home-all-day'),
      flags,
    });
  }
  return days;
}

/** The period covering a date, if any. */
export function periodAt(periods: KidPeriod[], date: IsoDate): KidPeriod | null {
  return periods.find((p) => p.start <= date && date < p.end) ?? null;
}
