// Pulls activities + wellness from intervals.icu into D1. Runs on demand and nightly.
import { kvGet, kvSet } from '../db.js';
import { addDays, todayOslo, type IsoDate } from '../dates.js';
import type { Env } from '../env.js';
import { IntervalsClient, type IntervalsSource } from './client.js';
import { deleteActivitiesExcept, upsertActivity, upsertWellness } from './repo.js';

const LAST_SYNC_KEY = 'intervals.last_sync';
/** History fetched on the very first sync. */
export const BACKFILL_DAYS = 180;
/** Window re-read on later syncs, so edits and late uploads are picked up. */
export const RECENT_DAYS = 21;
export const NIGHTLY_DAYS = 42;

export interface SyncResult {
  from: IsoDate;
  to: IsoDate;
  activities: number;
  wellness: number;
  lastSyncAt: string;
}

export function intervalsFromEnv(env: Pick<Env, 'INTERVALS_API_KEY' | 'INTERVALS_ATHLETE_ID'>): IntervalsSource | null {
  const key = env.INTERVALS_API_KEY?.trim();
  const athlete = env.INTERVALS_ATHLETE_ID?.trim();
  return key && athlete ? new IntervalsClient(key, athlete) : null;
}

export const lastSyncAt = (db: D1Database) => kvGet(db, LAST_SYNC_KEY);

export async function syncRange(db: D1Database, source: IntervalsSource, from: IsoDate, to: IsoDate, now: Date): Promise<SyncResult> {
  const [activities, wellness] = await Promise.all([source.activities(from, to), source.wellness(from, to)]);
  const at = now.toISOString();
  await db.batch([
    ...activities.map((a) => upsertActivity(db, a, now)),
    deleteActivitiesExcept(db, from, to, activities.map((a) => a.id)),
    ...wellness.map((w) => upsertWellness(db, w, now)),
  ]);
  await kvSet(db, LAST_SYNC_KEY, at);
  return { from, to, activities: activities.length, wellness: wellness.length, lastSyncAt: at };
}

/** Backfills on the first run, otherwise re-reads the recent window. */
export async function syncRecent(db: D1Database, source: IntervalsSource, now: Date, days?: number): Promise<SyncResult> {
  const today = todayOslo(now);
  const window = days ?? ((await lastSyncAt(db)) ? RECENT_DAYS : BACKFILL_DAYS);
  return syncRange(db, source, addDays(today, -window), today, now);
}

/** Cron Trigger entry point. */
export async function nightlySync(env: Env, now = new Date()): Promise<SyncResult | null> {
  const source = intervalsFromEnv(env);
  if (!source) return null;
  const backfilled = Boolean(await lastSyncAt(env.DB));
  return syncRecent(env.DB, source, now, backfilled ? NIGHTLY_DAYS : BACKFILL_DAYS);
}
