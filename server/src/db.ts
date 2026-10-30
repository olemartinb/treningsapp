// D1 helpers. Schema lives in ../migrations (applied with `wrangler d1 migrations apply`).
export async function kvGet(db: D1Database, key: string): Promise<string | null> {
  return db.prepare('SELECT value FROM kv WHERE key = ?').bind(key).first<string>('value');
}

export async function kvSet(db: D1Database, key: string, value: string | null): Promise<void> {
  if (value === null) await db.prepare('DELETE FROM kv WHERE key = ?').bind(key).run();
  else
    await db
      .prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .bind(key, value)
      .run();
}
