-- Bridge: a visitor who sends a report without signing in can follow it (Rohith,
-- 10 Oct 2026: "proceed with all 1,2,3,4"). Their confirmation email carries a private
-- link that opens the request: its progress, the answer, and questions from the
-- medical team, which they can answer there.
--   visitor_token_hash: SHA-256 of the link's secret, so the link can be checked
--     without the secret being stored as it is;
--   visitor_token_enc: the secret, encrypted (utils/secretCrypto), so a later email —
--     a question from MIMS — can carry the same link again;
--   visitor_token_expires_at: the link stops working after this (a year from sending).
-- All three are emptied when the person's details are erased.
ALTER TABLE cp_submissions
  ADD COLUMN visitor_token_hash CHAR(64) NULL,
  ADD COLUMN visitor_token_enc VARCHAR(255) NULL,
  ADD COLUMN visitor_token_expires_at DATETIME NULL,
  ADD UNIQUE KEY uq_cp_submissions_visitor_token (visitor_token_hash);
