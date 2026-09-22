-- CPPM-14: deliver the approved medical answer back to the person who asked.
--
-- A person asks a medical question through the portal, the client's staff prepare
-- and approve an answer, and nothing carried it back. The answer is written here
-- as a draft, approved by a named person, and only then sent and shown to the
-- person who asked. A draft is never visible outside the admin area.
--
-- One answer per submission: a correction edits the draft, or is a follow-up that
-- replaces it, rather than a second answer racing the first out of the door.
--
-- Definition matches database/db.js exactly so the two paths cannot drift.
CREATE TABLE IF NOT EXISTS cp_submission_answers (
  id             INT          NOT NULL AUTO_INCREMENT,
  submission_id  INT          NOT NULL,
  client_id      INT          NOT NULL,
  body           MEDIUMTEXT   NOT NULL,
  status         VARCHAR(20)  NOT NULL DEFAULT 'draft',
  drafted_by     INT          NULL,
  approved_by    INT          NULL,
  approved_at    DATETIME     NULL,
  sent_at        DATETIME     NULL,
  send_error     TEXT         NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_answer_submission (submission_id),
  KEY idx_answer_client_status (client_id, status),
  CONSTRAINT fk_answer_submission FOREIGN KEY (submission_id) REFERENCES cp_submissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
