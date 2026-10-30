// Calendar facade used by the routes: caches Google responses briefly and
// turns raw events into days, periods (with km targets) and races.
import { config } from '../config.js';
import { addDays, type IsoDate } from '../dates.js';
import { periodTarget, type PeriodTarget } from '../training/targets.js';
import { resolveDays, resolvePeriods, type CalEvent, type DayInfo, type KidPeriod } from './kidWeeks.js';

export interface CalendarSource {
  listEvents(calendarName: string, from: IsoDate, to: IsoDate): Promise<CalEvent[]>;
}

export interface Race {
  date: IsoDate;
  title: string;
}

export type PeriodWithTarget = KidPeriod & { target: PeriodTarget };

/** Extra days fetched around a range so periods at the edges resolve correctly. */
const MARGIN_DAYS = 28;
const TTL_MS = 15 * 60_000;

export class CalendarService {
  private cache = new Map<string, { at: number; events: Promise<CalEvent[]> }>();

  constructor(private source: CalendarSource) {}

  invalidate() {
    this.cache.clear();
  }

  async days(from: IsoDate, to: IsoDate): Promise<{ days: DayInfo[]; periods: PeriodWithTarget[] }> {
    const events = await this.events(config.google.kidsCalendar, addDays(from, -MARGIN_DAYS), addDays(to, MARGIN_DAYS));
    const periods = resolvePeriods(events)
      .filter((p) => p.end > from && p.start <= to)
      .map((p) => ({ ...p, target: periodTarget(p) }));
    return { days: resolveDays(events, from, to), periods };
  }

  async races(from: IsoDate, to: IsoDate): Promise<Race[]> {
    const events = await this.events(config.google.racesCalendar, from, to);
    return events
      .filter((e) => e.status !== 'cancelled')
      .map((e) => ({ date: (e.start.date ?? e.start.dateTime ?? '').slice(0, 10), title: (e.summary ?? '').trim() }))
      .filter((r) => r.date >= from && r.date <= to)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  private events(calendar: string, from: IsoDate, to: IsoDate): Promise<CalEvent[]> {
    const key = `${calendar}|${from}|${to}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.events;
    const events = this.source.listEvents(calendar, from, to);
    this.cache.set(key, { at: Date.now(), events });
    events.catch(() => this.cache.delete(key));
    return events;
  }
}
