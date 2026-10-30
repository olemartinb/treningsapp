// D1 cache of intervals.icu activities and wellness.
import type { IsoDate } from '../dates.js';
import type { Activity, Wellness } from './types.js';

interface ActivityRow {
  id: string;
  date: string;
  start_local: string;
  type: string;
  name: string | null;
  distance_m: number | null;
  moving_s: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  load: number | null;
}

const fromRow = (r: ActivityRow): Activity => ({
  id: r.id,
  date: r.date,
  startLocal: r.start_local,
  type: r.type,
  name: r.name,
  distanceM: r.distance_m,
  movingS: r.moving_s,
  avgHr: r.avg_hr,
  maxHr: r.max_hr,
  load: r.load,
});

export async function countActivities(db: D1Database): Promise<number> {
  return (await db.prepare('SELECT count(*) AS n FROM activity').first<number>('n')) ?? 0;
}

export async function listActivities(db: D1Database, from: IsoDate, to: IsoDate): Promise<Activity[]> {
  const { results } = await db
    .prepare('SELECT * FROM activity WHERE date BETWEEN ? AND ? ORDER BY start_local')
    .bind(from, to)
    .all<ActivityRow>();
  return results.map(fromRow);
}

export function upsertActivity(db: D1Database, a: Activity, now: Date): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO activity (id, date, start_local, type, name, distance_m, moving_s, avg_hr, max_hr, load, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         date = excluded.date, start_local = excluded.start_local, type = excluded.type, name = excluded.name,
         distance_m = excluded.distance_m, moving_s = excluded.moving_s, avg_hr = excluded.avg_hr,
         max_hr = excluded.max_hr, load = excluded.load, updated_at = excluded.updated_at`,
    )
    .bind(a.id, a.date, a.startLocal, a.type, a.name, a.distanceM, a.movingS, a.avgHr, a.maxHr, a.load, now.toISOString());
}

/** Removes cached activities in [from, to] that intervals.icu no longer returns (deleted there). */
export function deleteActivitiesExcept(db: D1Database, from: IsoDate, to: IsoDate, keepIds: string[]): D1PreparedStatement {
  return db
    .prepare('DELETE FROM activity WHERE date BETWEEN ? AND ? AND id NOT IN (SELECT value FROM json_each(?))')
    .bind(from, to, JSON.stringify(keepIds));
}

export function upsertWellness(db: D1Database, w: Wellness, now: Date): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO wellness (date, ctl, atl, weight_kg, resting_hr, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET
         ctl = excluded.ctl, atl = excluded.atl, weight_kg = excluded.weight_kg,
         resting_hr = excluded.resting_hr, updated_at = excluded.updated_at`,
    )
    .bind(w.date, w.ctl, w.atl, w.weightKg, w.restingHr, now.toISOString());
}

export async function latestWellness(db: D1Database, onOrBefore: IsoDate): Promise<Wellness | null> {
  const row = await db
    .prepare('SELECT * FROM wellness WHERE date <= ? AND ctl IS NOT NULL ORDER BY date DESC LIMIT 1')
    .bind(onOrBefore)
    .first<{ date: string; ctl: number | null; atl: number | null; weight_kg: number | null; resting_hr: number | null }>();
  return row ? { date: row.date, ctl: row.ctl, atl: row.atl, weightKg: row.weight_kg, restingHr: row.resting_hr } : null;
}
