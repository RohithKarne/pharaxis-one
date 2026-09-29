-- CPPM-39: every uploaded attachment carries its virus-scan result.
--
-- clean    scanned by ClamAV and nothing found — the only state that can be
--          downloaded or forwarded to MIMS
-- pending  not scanned yet (the scanner was unreachable at upload, or the file
--          predates scanning); held, and rescanned by the background job
-- infected a known virus was found; the file itself has been deleted
-- missing  the row's file is no longer on disk, so it can never be scanned
--
-- Existing rows start as 'pending' on purpose: they were never scanned, and the
-- background job scans them before anyone can download them again.
ALTER TABLE cp_submission_attachments
  ADD COLUMN scan_status VARCHAR(20)  NOT NULL DEFAULT 'pending',
  ADD COLUMN scan_detail VARCHAR(255) NULL,
  ADD COLUMN scanned_at  DATETIME     NULL,
  ADD KEY idx_subatt_scan (scan_status);
