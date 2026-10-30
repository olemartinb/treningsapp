-- Key/value store: Google refresh token, pending OAuth states.
CREATE TABLE kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Daily knee test + fasting weight, one row per Europe/Oslo date.
CREATE TABLE daily_log (
  date TEXT PRIMARY KEY,           -- YYYY-MM-DD
  knee_ok INTEGER,                 -- 1 pass, 0 fail, NULL not tested
  knee_note TEXT,
  knee_tested_at TEXT,
  weight_kg REAL,
  updated_at TEXT NOT NULL
);
