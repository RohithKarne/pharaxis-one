-- Bridge row 3: a file that fails to reach MIMS is retried, not forgotten.
--
-- Each file sent with a report now carries its own delivery state. Until now a file
-- that MIMS refused (or a crash part-way through sending several) was written to the
-- audit trail once and never tried again — the MIMS case simply had no photo of the
-- batch number, and nothing said so.
--
-- forward_status  pending   — not sent yet (new files start here)
--                 forwarded — on the MIMS case; mims_attachment_id says which file
--                 failed    — the last try failed; retried until forward_attempts
--                             reaches the cap, then an alert is raised
--                 legacy    — sent (or not) before this existed; never retried, so
--                             an old file is not suddenly pushed to MIMS today
-- Times are UTC.
ALTER TABLE cp_submission_attachments
  ADD COLUMN forward_status     VARCHAR(20)  NOT NULL DEFAULT 'pending',
  ADD COLUMN forward_attempts   INT          NOT NULL DEFAULT 0,
  ADD COLUMN forward_error      VARCHAR(1000) NULL,
  ADD COLUMN forwarded_at       DATETIME     NULL,
  ADD COLUMN last_forward_at    DATETIME     NULL,
  ADD COLUMN mims_attachment_id INT          NULL,
  ADD KEY idx_subatt_forward (forward_status);

UPDATE cp_submission_attachments SET forward_status = 'legacy';
