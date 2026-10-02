-- CPPM-61: who is working an enquiry, a news post or a document awaiting approval.
--
-- Round 2 of CPPM-6. Round 1 (0025) gave safety review tasks a holder; the enquiry
-- list and the content review queue had the same gap: every item looked the same
-- to everyone, so work was done twice or dropped.
--
-- owner_id is the staff member holding the item now (cp_admin_users.id), NULL when
-- nobody has taken it; owner_since is when they took it or were handed it. As in
-- 0025, the history of who held an item is the audit trail (cp_audit_logs); these
-- columns only say who holds it now. Holding an item is never a condition for
-- working it.
ALTER TABLE cp_submissions
  ADD COLUMN owner_id    INT      NULL,
  ADD COLUMN owner_since DATETIME NULL;

ALTER TABLE cp_news_posts
  ADD COLUMN owner_id    INT      NULL,
  ADD COLUMN owner_since DATETIME NULL;

ALTER TABLE cp_documents
  ADD COLUMN owner_id    INT      NULL,
  ADD COLUMN owner_since DATETIME NULL;
