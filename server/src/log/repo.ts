// Daily knee test + fasting weight, one row per Oslo date.
import type { DB } from '../db.js';
import type { IsoDate } from '../dates.js';

export interface DailyLog {
  date: IsoDate;
  /** true = 100 % pain-free, false = failed, null = not tested. */
  kneeOk: boolean | null;
  kneeNote: string | null;
  kneeTestedAt: string | null;
  weightKg: number | null;
}

export interface DailyLogPatch {
  kneeOk?: boolean | null;
  kneeNote?: string | null;
  weightKg?: number | null;
}

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

export function getLog(db: DB, date: IsoDate): DailyLog {
  const row = db.prepare('SELECT * FROM daily_log WHERE date = ?').get(date) as Row | undefined;
  return row ? fromRow(row) : emptyLog(date);
}

export function listLogs(db: DB, from: IsoDate, to: IsoDate): DailyLog[] {
  const rows = db.prepare('SELECT * FROM daily_log WHERE date BETWEEN ? AND ? ORDER BY date').all(from, to) as Row[];
  return rows.map(fromRow);
}

/** Applies only the fields present in the patch. */
export function upsertLog(db: DB, date: IsoDate, patch: DailyLogPatch, now = new Date()): DailyLog {
  const next = { ...getLog(db, date) };
  if (patch.kneeOk !== undefined) {
    next.kneeOk = patch.kneeOk;
    next.kneeTestedAt = patch.kneeOk === null ? null : now.toISOString();
  }
  if (patch.kneeNote !== undefined) next.kneeNote = patch.kneeNote?.trim() || null;
  if (patch.weightKg !== undefined) next.weightKg = patch.weightKg === null ? null : Math.round(patch.weightKg * 10) / 10;

  db.prepare(
    `INSERT INTO daily_log (date, knee_ok, knee_note, knee_tested_at, weight_kg, updated_at)
     VALUES (@date, @kneeOk, @kneeNote, @kneeTestedAt, @weightKg, @updatedAt)
     ON CONFLICT(date) DO UPDATE SET
       knee_ok = excluded.knee_ok, knee_note = excluded.knee_note, knee_tested_at = excluded.knee_tested_at,
       weight_kg = excluded.weight_kg, updated_at = excluded.updated_at`,
  ).run({
    ...next,
    kneeOk: next.kneeOk === null ? null : Number(next.kneeOk),
    updatedAt: now.toISOString(),
  });
  return next;
}
