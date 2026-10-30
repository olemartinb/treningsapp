// In-memory stand-in for D1 backed by better-sqlite3, with the real migrations applied.
// Covers the subset of the D1 API the app uses (prepare/bind/first/all/run/batch).
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const MIGRATIONS = path.resolve(import.meta.dirname, '../migrations');

export function testD1(): D1Database {
  const db = new Database(':memory:');
  for (const file of fs.readdirSync(MIGRATIONS).sort()) db.exec(fs.readFileSync(path.join(MIGRATIONS, file), 'utf8'));

  const statement = (sql: string, args: unknown[] = []) => ({
    bind: (...next: unknown[]) => statement(sql, next),
    first: async (column?: string) => {
      const row = db.prepare(sql).get(...args) as Record<string, unknown> | undefined;
      return (column ? row?.[column] : row) ?? null;
    },
    all: async () => ({ results: db.prepare(sql).all(...args), success: true, meta: {} }),
    run: async () => {
      const info = db.prepare(sql).run(...args);
      return { success: true, meta: { changes: info.changes } };
    },
    runSync: () => {
      const st = db.prepare(sql);
      if (st.reader) return { results: st.all(...args), success: true, meta: {} };
      st.run(...args);
      return { results: [], success: true, meta: {} };
    },
  });

  return {
    prepare: (sql: string) => statement(sql),
    // Like D1: all statements in one transaction.
    batch: async (stmts: ReturnType<typeof statement>[]) => db.transaction(() => stmts.map((s) => s.runSync()))(),
  } as unknown as D1Database;
}
