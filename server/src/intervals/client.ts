// intervals.icu API client (HTTP Basic, username "API_KEY"). Server-side only.
import type { IsoDate } from '../dates.js';
import type { Activity, Wellness } from './types.js';

const API = 'https://intervals.icu/api/v1';

export interface ActivitiesResult {
  activities: Activity[];
  /** Activities intervals.icu lists but does not share via the API (e.g. imported from Strava). */
  hidden: number;
}

export interface IntervalsSource {
  activities(oldest: IsoDate, newest: IsoDate): Promise<ActivitiesResult>;
  wellness(oldest: IsoDate, newest: IsoDate): Promise<Wellness[]>;
}

/** Fields we use from GET /athlete/{id}/activities. */
export interface IcuActivity {
  id: string | number;
  start_date_local?: string;
  type?: string;
  name?: string | null;
  distance?: number | null;
  moving_time?: number | null;
  average_heartrate?: number | null;
  max_heartrate?: number | null;
  icu_training_load?: number | null;
  /** Present on activities intervals.icu may not share via the API (e.g. imported from Strava). */
  _note?: string;
}

/** Fields we use from GET /athlete/{id}/wellness. */
export interface IcuWellness {
  id: string;
  ctl?: number | null;
  atl?: number | null;
  weight?: number | null;
  restingHR?: number | null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function toActivity(a: IcuActivity): Activity | null {
  if (a._note || !a.start_date_local || !a.type) return null;
  return {
    id: String(a.id),
    date: a.start_date_local.slice(0, 10),
    startLocal: a.start_date_local.slice(0, 19),
    type: a.type,
    name: a.name?.trim() || null,
    distanceM: num(a.distance),
    movingS: num(a.moving_time),
    avgHr: num(a.average_heartrate),
    maxHr: num(a.max_heartrate),
    load: num(a.icu_training_load),
  };
}

export function toWellness(w: IcuWellness): Wellness | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(w.id)) return null;
  return { date: w.id, ctl: num(w.ctl), atl: num(w.atl), weightKg: num(w.weight), restingHr: num(w.restingHR) };
}

export class IntervalsError extends Error {
  constructor(public status: number, detail: string) {
    super(`intervals.icu ${status}: ${detail}`);
  }
}

export class IntervalsClient implements IntervalsSource {
  constructor(
    private apiKey: string,
    private athleteId: string,
  ) {}

  async activities(oldest: IsoDate, newest: IsoDate): Promise<ActivitiesResult> {
    const raw = await this.get<IcuActivity[]>('/activities', { oldest, newest });
    const activities = raw.map(toActivity).filter((a): a is Activity => a !== null);
    return { activities, hidden: raw.length - activities.length };
  }

  async wellness(oldest: IsoDate, newest: IsoDate): Promise<Wellness[]> {
    const raw = await this.get<IcuWellness[]>('/wellness', { oldest, newest });
    return raw.map(toWellness).filter((w): w is Wellness => w !== null);
  }

  private async get<T>(path: string, query: Record<string, string>): Promise<T> {
    const res = await fetch(`${API}/athlete/${encodeURIComponent(this.athleteId)}${path}?${new URLSearchParams(query)}`, {
      headers: { Authorization: `Basic ${btoa(`API_KEY:${this.apiKey}`)}`, Accept: 'application/json' },
    });
    if (!res.ok) throw new IntervalsError(res.status, (await res.text()).slice(0, 200));
    return (await res.json()) as T;
  }
}
