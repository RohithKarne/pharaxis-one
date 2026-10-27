-- CPPM-160 (Rohith, 27 Oct 2026, decision 6). An "Other request" never goes to MIMS,
-- so nothing outside the portal watches it. Each client can name who holds new
-- ones on arrival, and how long one may wait without an answer before the client's
-- admins and its holder are told.
ALTER TABLE cp_alert_settings
  ADD COLUMN other_owner_id   INT NULL,
  ADD COLUMN other_wait_hours INT NOT NULL DEFAULT 48;
