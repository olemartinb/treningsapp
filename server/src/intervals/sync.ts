// Pulls activities + wellness from intervals.icu into D1. Runs on demand and nightly.
import { kvGet, kvSet } from '../db.js';
import { addDays, todayOslo, type IsoDate } from '../dates.js';
import type { Env } from '../env.js';
import { IntervalsClient, type IntervalsSource } from './client.js';
import { deleteActivitiesExcept, upsertActivity, upsertWellness } from './repo.js';

const LAST_SYNC_KEY = 'intervals.last_sync';
const HIDDEN_KEY = 'intervals.hidden';
/** Set once a backfill has actually returned activities (an empty account doesn't count). */
const BACKFILLED_KEY = 'intervals.backfilled_at';
/** Bump when more wellness fields are stored, so the next sync re-reads the history. */
const WELLNESS_SCHEMA = '2';
const WELLNESS_SCHEMA_KEY = 'intervals.wellness_schema';
/** History fetched until a backfill has found something. */
export const BACKFILL_DAYS = 180;
/** Window re-read on later syncs, so edits and late uploads are picked up. */
export const RECENT_DAYS = 21;
export const NIGHTLY_DAYS = 42;

export interface SyncResult {
  from: IsoDate;
  to: IsoDate;
  activities: number;
  hidden: number;
  wellness: number;
  lastSyncAt: string;
}

export function intervalsFromEnv(env: Pick<Env, 'INTERVALS_API_KEY' | 'INTERVALS_ATHLETE_ID'>): IntervalsSource | null {
  const key = env.INTERVALS_API_KEY?.trim();
  const athlete = env.INTERVALS_ATHLETE_ID?.trim();
  return key && athlete ? new IntervalsClient(key, athlete) : null;
}

export const lastSyncAt = (db: D1Database) => kvGet(db, LAST_SYNC_KEY);
const backfilled = async (db: D1Database) => (await kvGet(db, BACKFILLED_KEY)) !== null;

/** Activities hidden from the API in the last synced window. */
export const hiddenActivities = async (db: D1Database) => Number(await kvGet(db, HIDDEN_KEY)) || 0;

export async function syncRange(db: D1Database, source: IntervalsSource, from: IsoDate, to: IsoDate, now: Date): Promise<SyncResult> {
  const [{ activities, hidden }, wellness] = await Promise.all([source.activities(from, to), source.wellness(from, to)]);
  const at = now.toISOString();
  await db.batch([
    ...activities.map((a) => upsertActivity(db, a, now)),
    deleteActivitiesExcept(db, from, to, activities.map((a) => a.id)),
    ...wellness.map((w) => upsertWellness(db, w, now)),
  ]);
  await kvSet(db, LAST_SYNC_KEY, at);
  await kvSet(db, HIDDEN_KEY, String(hidden));
  const result = { from, to, activities: activities.length, hidden, wellness: wellness.length, lastSyncAt: at };
  console.log('intervals sync', JSON.stringify(result));
  return result;
}

/** Backfills until history has been found (or after a wellness schema bump), otherwise re-reads the recent window. */
export async function syncRecent(db: D1Database, source: IntervalsSource, now: Date, recentDays = RECENT_DAYS): Promise<SyncResult> {
  const today = todayOslo(now);
  const schemaCurrent = (await kvGet(db, WELLNESS_SCHEMA_KEY)) === WELLNESS_SCHEMA;
  const isBackfill = !(await backfilled(db)) || !schemaCurrent;
  const result = await syncRange(db, source, addDays(today, -(isBackfill ? BACKFILL_DAYS : recentDays)), today, now);
  if (isBackfill && result.activities > 0) await kvSet(db, BACKFILLED_KEY, result.lastSyncAt);
  if (!schemaCurrent) await kvSet(db, WELLNESS_SCHEMA_KEY, WELLNESS_SCHEMA);
  return result;
}

/** Cron Trigger entry point. */
export async function nightlySync(env: Env, now = new Date()): Promise<SyncResult | null> {
  const source = intervalsFromEnv(env);
  if (!source) return null;
  return syncRecent(env.DB, source, now, NIGHTLY_DAYS);
}
