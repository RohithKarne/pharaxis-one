-- Bridge features F1-F3 (Rohith, 10 Oct 2026: "build all F1-F5"). What MIMS reports
-- back about each request beyond its state:
--   mims_serious, mims_due_date: a side effect MIMS holds as serious, and the day it
--     must reach the authorities by (F2);
--   mims_triaged_at: when somebody in MIMS first took the case on (F1, the journey);
--   cp_submission_questions: questions MIMS asks the person who reported, shown on
--     their My Submissions page; their answer is a follow-up carrying question_id (F3).
ALTER TABLE cp_submissions ADD COLUMN mims_serious TINYINT(1) NULL, ADD COLUMN mims_due_date DATE NULL, ADD COLUMN mims_triaged_at DATETIME NULL;

CREATE TABLE IF NOT EXISTS cp_submission_questions (
  id                INT          NOT NULL AUTO_INCREMENT,
  submission_id     INT          NOT NULL,
  client_id         INT          NOT NULL,
  mims_question_id  INT          NOT NULL,
  question          TEXT         NOT NULL,
  asked_at          DATETIME     NULL,
  status            VARCHAR(20)  NOT NULL DEFAULT 'open',
  answered_at       DATETIME     NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_submission_question (submission_id, mims_question_id),
  CONSTRAINT fk_question_submission FOREIGN KEY (submission_id) REFERENCES cp_submissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE cp_submission_followups ADD COLUMN question_id INT NULL;
