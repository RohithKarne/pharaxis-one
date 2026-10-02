-- Bridge row 8: one answer path. A request that went to MIMS is answered there — the
-- approved answer MIMS sends comes back and is shown to the person. The portal's own
-- answer box stays for requests MIMS never receives ("Other request").
--
-- source            'portal' (written and approved here) or 'mims' (approved and sent in MIMS)
-- mims_response_id  which MIMS answer it is, so a re-read of the change list never adds it twice
ALTER TABLE cp_submission_answers
  ADD COLUMN source           VARCHAR(20) NOT NULL DEFAULT 'portal',
  ADD COLUMN mims_response_id INT         NULL;
