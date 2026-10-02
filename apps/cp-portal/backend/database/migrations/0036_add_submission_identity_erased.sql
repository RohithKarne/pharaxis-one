-- Bridge row 10: when the reporter's identity on a request has been erased — by the
-- portal's own erasure, or by MIMS on the case and reported on the change list. Set
-- once; a later report of the same erasure then changes nothing. Times are UTC.
ALTER TABLE cp_submissions
  ADD COLUMN identity_erased_at DATETIME NULL;
