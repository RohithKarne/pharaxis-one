-- Bridge row 9: a person adds information to a request they already sent.
--
-- Each follow-up is kept here first, then sent to the request's MIMS case as a comment
-- (forward_status: pending → forwarded / failed, retried like files, alert after the
-- last try). A request that never goes to MIMS ("Other request") keeps its follow-ups
-- here for the client's team. Files added with a follow-up are ordinary attachments of
-- the same request, so they are scanned and forwarded the same way.
-- Times are UTC.
CREATE TABLE IF NOT EXISTS cp_submission_followups (
  id                 INT           NOT NULL AUTO_INCREMENT,
  submission_id      INT           NOT NULL,
  client_id          INT           NOT NULL,
  body               TEXT          NOT NULL,
  forward_status     VARCHAR(20)   NOT NULL DEFAULT 'pending',
  forward_attempts   INT           NOT NULL DEFAULT 0,
  forward_error      VARCHAR(1000) NULL,
  last_forward_at    DATETIME      NULL,
  mims_comment_id    INT           NULL,
  created_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_followup_submission (submission_id),
  KEY idx_followup_forward (forward_status),
  CONSTRAINT fk_followup_submission FOREIGN KEY (submission_id) REFERENCES cp_submissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
