-- CPPM-113 (Doctor Review E1; Decision 1, Rohith, 3 Oct 2026): a doctor with no
-- account can ask for one, and the client's admin approves or declines it.
-- A request is a cp_portal_users row that cannot sign in (is_active = 0, no usable
-- password) with access_status 'requested'. Approving sets the status back to NULL,
-- activates the account and emails the usual set-password invitation; declining sets
-- 'declined' and the account stays inactive. NULL means an ordinary account.
-- Times are UTC.
ALTER TABLE cp_portal_users
  ADD COLUMN access_status       VARCHAR(20) NULL,
  ADD COLUMN access_requested_at DATETIME    NULL,
  ADD COLUMN access_decided_at   DATETIME    NULL;
