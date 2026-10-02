-- CPPM-63: a person can reply to the medical answer they received, and staff can
-- answer the reply.
--
-- The first answer stays in cp_submission_answers (CPPM-14). Everything after it is
-- a conversation on the same enquiry, kept here in order:
--
--   direction 'in'  — the person's reply, from the portal. status 'received'.
--                     Who wrote it is the enquiry's owner (cp_submissions.user_id);
--                     it is not stored again here, so an erasure that severs the
--                     enquiry's identity severs the reply's too.
--                     ae_screen_answer is their answer to "did anyone become
--                     unwell" (PD-2), asked on every reply as on every enquiry.
--   direction 'out' — a staff follow-up. Drafted, approved by a named person, then
--                     sent, exactly like the first answer. A draft is never visible
--                     outside the admin area.
--
-- One draft per enquiry at a time, enforced by the database: draft_for is the
-- enquiry while a row is a draft and NULL once it is sent, and NULLs never collide.
-- (It cannot be a generated column: MySQL refuses ON DELETE CASCADE on a column a
-- stored generated column is built from, and the cascade matters more.)
CREATE TABLE IF NOT EXISTS cp_submission_messages (
  id               INT          NOT NULL AUTO_INCREMENT,
  submission_id    INT          NOT NULL,
  client_id        INT          NOT NULL,
  direction        VARCHAR(3)   NOT NULL,
  body             MEDIUMTEXT   NOT NULL,
  status           VARCHAR(20)  NOT NULL,
  ae_screen_answer VARCHAR(3)   NULL,
  ae_screen_detail TEXT         NULL,
  drafted_by       INT          NULL,
  approved_by      INT          NULL,
  approved_at      DATETIME     NULL,
  sent_at          DATETIME     NULL,
  send_error       TEXT         NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  draft_for        INT          NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_message_one_draft (draft_for),
  KEY idx_message_submission (submission_id, id),
  KEY idx_message_client (client_id, direction, status),
  CONSTRAINT chk_message_direction CHECK (direction IN ('in', 'out')),
  CONSTRAINT fk_message_submission FOREIGN KEY (submission_id) REFERENCES cp_submissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- A reply that says someone became unwell raises a safety review task, as an
-- enquiry does. Until now an enquiry could hold one task, ever. A reply after that
-- task was closed is new information and needs its own task (the chat already
-- works this way: a closed task is never silently appended to). reply_id says which
-- reply raised the task; the enquiry's own task has none. The unique key stays one
-- task per enquiry, and becomes one per reply as well, so a retried request can
-- still never raise two.
ALTER TABLE cp_ae_review_tasks
  ADD COLUMN reply_id  INT NULL AFTER chat_conversation_id,
  ADD COLUMN reply_key INT AS (IFNULL(reply_id, 0)) STORED,
  DROP INDEX uq_ae_task_submission,
  ADD UNIQUE KEY uq_ae_task_submission (submission_id, reply_key);
