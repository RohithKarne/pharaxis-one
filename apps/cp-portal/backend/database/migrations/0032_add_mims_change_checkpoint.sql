-- Bridge row 4: the portal follows its MIMS cases by asking "what changed since my
-- last check" instead of asking about each case in turn.
--
-- The close-check used to ask MIMS about the oldest 100 open requests per client,
-- one call each, every five minutes — request 101 onwards was never checked, and a
-- burst of calls ran into MIMS's rate limit. It now keeps a checkpoint per connection:
-- the MIMS change time and case id it has read up to (UTC). Empty means "read from the
-- start"; MIMS only returns cases this connection created, so the first read is short.
ALTER TABLE cp_integration_config
  ADD COLUMN changes_since    VARCHAR(19) NULL,
  ADD COLUMN changes_after_id INT         NULL,
  ADD COLUMN changes_read_at  DATETIME    NULL;
