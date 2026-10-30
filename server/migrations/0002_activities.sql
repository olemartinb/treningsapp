-- Activities cached from intervals.icu (which syncs from Garmin Connect).
CREATE TABLE activity (
  id TEXT PRIMARY KEY,             -- intervals.icu activity id
  date TEXT NOT NULL,              -- YYYY-MM-DD, athlete-local
  start_local TEXT NOT NULL,       -- YYYY-MM-DDTHH:MM:SS, athlete-local
  type TEXT NOT NULL,              -- Run, TrailRun, VirtualRun, Ride, VirtualRide, WeightTraining, ...
  name TEXT,
  distance_m REAL,
  moving_s INTEGER,
  avg_hr REAL,
  max_hr REAL,
  load REAL,                       -- icu_training_load
  updated_at TEXT NOT NULL
);
CREATE INDEX activity_date ON activity (date);

-- Daily wellness / fitness from intervals.icu.
CREATE TABLE wellness (
  date TEXT PRIMARY KEY,           -- YYYY-MM-DD
  ctl REAL,                        -- fitness
  atl REAL,                        -- fatigue
  weight_kg REAL,
  resting_hr REAL,
  updated_at TEXT NOT NULL
);
