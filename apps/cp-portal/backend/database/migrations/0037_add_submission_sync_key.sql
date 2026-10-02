-- Post-merge review of bridge #701: each request's own key, sent to MIMS with it.
-- MIMS treats a delivery as a repeat only when this key matches, so a portal set up
-- again (or a second database on the same MIMS connection) can never be handed
-- another person's case because its numbers start again. Given at the first send.
ALTER TABLE cp_submissions
  ADD COLUMN sync_key CHAR(36) NULL,
  ADD UNIQUE KEY uq_cp_submissions_sync_key (sync_key);
