-- Bridge plan P5 (approved by Rohith 10 Oct 2026): the receipt MIMS gives for each
-- report. The case number as MIMS shows it, and the fingerprint of the report MIMS
-- confirmed it received (SHA-256, the same calculation on both sides). Empty for
-- reports sent before the receipt existed. Reconciliation (P6) compares the two.
ALTER TABLE cp_submissions ADD COLUMN mims_case_number VARCHAR(100) NULL, ADD COLUMN mims_fingerprint CHAR(64) NULL;
