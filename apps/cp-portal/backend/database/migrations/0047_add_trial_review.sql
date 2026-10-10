-- CP ease-of-use plan, phase 3 row 21 (Rohith, 10 Oct 2026: trials need review before
-- going live). A trial is a draft, waits for review, or is live on the portal. Every
-- trial that exists today is live, so nothing a doctor sees changes. submitted_by is
-- the admin who sent it for review; someone else must publish it.
ALTER TABLE cp_clinical_trials ADD COLUMN publish_status VARCHAR(20) NOT NULL DEFAULT 'published', ADD COLUMN submitted_by INT NULL;
