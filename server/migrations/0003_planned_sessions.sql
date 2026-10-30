-- Planned training sessions (manual or generated from the week-type templates).
CREATE TABLE planned_session (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,              -- YYYY-MM-DD, Europe/Oslo
  kind TEXT NOT NULL,              -- see SESSION_KINDS in src/plan/types.ts
  title TEXT NOT NULL,
  km REAL,                         -- planned running km; NULL for non-running sessions
  details TEXT,
  done INTEGER NOT NULL DEFAULT 0, -- checkbox (strength etc.)
  source TEXT NOT NULL DEFAULT 'manual', -- manual | template
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX planned_session_date ON planned_session (date);
