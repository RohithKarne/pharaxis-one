-- Bridge row 7: tell the client's team when the portal cannot reach MIMS at all.
--
-- Each call to MIMS now records whether the connection worked (last_sync_status,
-- last_sync_at, last_sync_error — columns that existed but were only ever written by
-- "Test connection", so the Overview's "Integration sync failed" never fired) and how
-- many calls in a row have failed. Three in a row — or MIMS refusing the portal's
-- sign-in — raises one "cannot reach MIMS" alert, which clears on the next success.
ALTER TABLE cp_integration_config
  ADD COLUMN consecutive_failures INT NOT NULL DEFAULT 0;
