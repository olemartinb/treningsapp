// D1 storage for planned sessions.
import type { IsoDate } from '../dates.js';
import type { PlannedSession, SessionDraft, SessionKind, SessionPatch } from './types.js';

interface Row {
  id: number;
  date: string;
  kind: string;
  title: string;
  km: number | null;
  details: string | null;
  done: number;
  source: string;
}

const fromRow = (r: Row): PlannedSession => ({
  id: r.id,
  date: r.date,
  kind: r.kind as SessionKind,
  title: r.title,
  km: r.km,
  details: r.details,
  done: r.done === 1,
  source: r.source === 'template' ? 'template' : 'manual',
});

export async function listSessions(db: D1Database, from: IsoDate, to: IsoDate): Promise<PlannedSession[]> {
  const { results } = await db
    .prepare('SELECT * FROM planned_session WHERE date BETWEEN ? AND ? ORDER BY date, id')
    .bind(from, to)
    .all<Row>();
  return results.map(fromRow);
}

export async function getSession(db: D1Database, id: number): Promise<PlannedSession | null> {
  const row = await db.prepare('SELECT * FROM planned_session WHERE id = ?').bind(id).first<Row>();
  return row ? fromRow(row) : null;
}

export async function createSessions(
  db: D1Database,
  drafts: SessionDraft[],
  source: PlannedSession['source'],
  now: Date,
): Promise<PlannedSession[]> {
  if (!drafts.length) return [];
  const at = now.toISOString();
  const results = await db.batch<Row>(
    drafts.map((d) =>
      db
        .prepare(
          `INSERT INTO planned_session (date, kind, title, km, details, done, source, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?) RETURNING *`,
        )
        .bind(d.date, d.kind, d.title, d.km, d.details, source, at, at),
    ),
  );
  return results.flatMap((r) => r.results.map(fromRow));
}

export async function updateSession(db: D1Database, id: number, patch: SessionPatch, now: Date): Promise<PlannedSession | null> {
  const current = await getSession(db, id);
  if (!current) return null;
  const next = { ...current, ...patch };
  await db
    .prepare('UPDATE planned_session SET date = ?, kind = ?, title = ?, km = ?, details = ?, done = ?, updated_at = ? WHERE id = ?')
    .bind(next.date, next.kind, next.title, next.km, next.details, next.done ? 1 : 0, now.toISOString(), id)
    .run();
  return next;
}

export async function deleteSession(db: D1Database, id: number): Promise<boolean> {
  const existing = await getSession(db, id);
  if (!existing) return false;
  await db.prepare('DELETE FROM planned_session WHERE id = ?').bind(id).run();
  return true;
}
