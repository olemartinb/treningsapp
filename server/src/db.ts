// SQLite storage with append-only migrations (index = schema version).
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const MIGRATIONS: string[] = [
  `CREATE TABLE kv (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
   );
   CREATE TABLE daily_log (
     date TEXT PRIMARY KEY,           -- YYYY-MM-DD, Europe/Oslo
     knee_ok INTEGER,                 -- 1 pass, 0 fail, NULL not tested
     knee_note TEXT,
     knee_tested_at TEXT,
     weight_kg REAL,
     updated_at TEXT NOT NULL
   );`,
];

export type DB = Database.Database;

export function openDb(file: string): DB {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(db: DB) {
  const version = db.pragma('user_version', { simple: true }) as number;
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]!);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}

export function kvGet(db: DB, key: string): string | null {
  const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function kvSet(db: DB, key: string, value: string | null) {
  if (value === null) db.prepare('DELETE FROM kv WHERE key = ?').run(key);
  else db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}
