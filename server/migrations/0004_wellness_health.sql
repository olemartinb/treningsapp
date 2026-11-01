-- Sleep and recovery fields from intervals.icu wellness (synced from Garmin).
ALTER TABLE wellness ADD COLUMN sleep_secs INTEGER;
ALTER TABLE wellness ADD COLUMN sleep_score REAL;
ALTER TABLE wellness ADD COLUMN sleep_hr REAL;      -- average heart rate while asleep
ALTER TABLE wellness ADD COLUMN hrv REAL;           -- rMSSD, ms
ALTER TABLE wellness ADD COLUMN readiness REAL;
ALTER TABLE wellness ADD COLUMN steps INTEGER;
ALTER TABLE wellness ADD COLUMN spo2 REAL;
ALTER TABLE wellness ADD COLUMN respiration REAL;
ALTER TABLE wellness ADD COLUMN raw TEXT;           -- the full intervals.icu record (JSON)
