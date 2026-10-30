// Daily knee test + fasting weight, one row per Oslo date.
import type { IsoDate } from '../dates.js';
import type { DailyLog, DailyLogPatch } from './types.js';

export type { DailyLog, DailyLogPatch };

interface Row {
  date: string;
  knee_ok: number | null;
  knee_note: string | null;
  knee_tested_at: string | null;
  weight_kg: number | null;
}

const fromRow = (r: Row): DailyLog => ({
  date: r.date,
  kneeOk: r.knee_ok === null ? null : r.knee_ok === 1,
  kneeNote: r.knee_note,
  kneeTestedAt: r.knee_tested_at,
  weightKg: r.weight_kg,
});

export const emptyLog = (date: IsoDate): DailyLog => ({ date, kneeOk: null, kneeNote: null, kneeTestedAt: null, weightKg: null });

export async function getLog(db: D1Database, date: IsoDate): Promise<DailyLog> {
  const row = await db.prepare('SELECT * FROM daily_log WHERE date = ?').bind(date).first<Row>();
  return row ? fromRow(row) : emptyLog(date);
}

export async function listLogs(db: D1Database, from: IsoDate, to: IsoDate): Promise<DailyLog[]> {
  const { results } = await db.prepare('SELECT * FROM daily_log WHERE date BETWEEN ? AND ? ORDER BY date').bind(from, to).all<Row>();
  return results.map(fromRow);
}

/** Latest logged weight on or before a date. */
export async function lastWeight(db: D1Database, onOrBefore: IsoDate): Promise<{ date: IsoDate; weightKg: number } | null> {
  const row = await db
    .prepare('SELECT date, weight_kg FROM daily_log WHERE date <= ? AND weight_kg IS NOT NULL ORDER BY date DESC LIMIT 1')
    .bind(onOrBefore)
    .first<{ date: string; weight_kg: number }>();
  return row ? { date: row.date, weightKg: row.weight_kg } : null;
}

/** Applies only the fields present in the patch. */
export async function upsertLog(db: D1Database, date: IsoDate, patch: DailyLogPatch, now = new Date()): Promise<DailyLog> {
  const next = { ...(await getLog(db, date)) };
  if (patch.kneeOk !== undefined) {
    next.kneeOk = patch.kneeOk;
    next.kneeTestedAt = patch.kneeOk === null ? null : now.toISOString();
  }
  if (patch.kneeNote !== undefined) next.kneeNote = patch.kneeNote?.trim() || null;
  if (patch.weightKg !== undefined) next.weightKg = patch.weightKg === null ? null : Math.round(patch.weightKg * 10) / 10;

  await db
    .prepare(
      `INSERT INTO daily_log (date, knee_ok, knee_note, knee_tested_at, weight_kg, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET
         knee_ok = excluded.knee_ok, knee_note = excluded.knee_note, knee_tested_at = excluded.knee_tested_at,
         weight_kg = excluded.weight_kg, updated_at = excluded.updated_at`,
    )
    .bind(
      next.date,
      next.kneeOk === null ? null : Number(next.kneeOk),
      next.kneeNote,
      next.kneeTestedAt,
      next.weightKg,
      now.toISOString(),
    )
    .run();
  return next;
}
