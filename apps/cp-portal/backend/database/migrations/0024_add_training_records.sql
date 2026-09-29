-- CPPM-15: evidence that a named person completed training, not just that it exists.
--
-- A module now points at one document from the client's library (the reading) and
-- carries a version number. Changing its questions, its document or its pass mark
-- starts a new version, so an earlier completion keeps the version it passed.
--
-- cp_training_questions  multiple-choice questions, one right answer each.
-- cp_training_attempts   every attempt, passed or failed, with a snapshot of who took
--                        it, the module title and version, the score, and each
--                        question as asked with the answer given — so the record
--                        stands on its own even after the module changes. A pass
--                        gets a reference an admin can look up; it is what the
--                        certificate prints. On erasure the row is kept and the
--                        person's name and email are replaced (services/dataSubject.js).
-- Times are UTC.
ALTER TABLE cp_training_modules
  ADD COLUMN document_id INT NULL,
  ADD COLUMN version     INT NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS cp_training_questions (
  id            INT      NOT NULL AUTO_INCREMENT,
  client_id     INT      NOT NULL,
  module_id     INT      NOT NULL,
  question      TEXT     NOT NULL,
  options_json  TEXT     NOT NULL,
  correct_index INT      NOT NULL,
  sort_order    INT      NOT NULL DEFAULT 0,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_training_q_module (module_id, sort_order),
  CONSTRAINT fk_training_q_module FOREIGN KEY (module_id) REFERENCES cp_training_modules(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cp_training_attempts (
  id             INT          NOT NULL AUTO_INCREMENT,
  client_id      INT          NOT NULL,
  module_id      INT          NOT NULL,
  module_version INT          NOT NULL,
  module_title   VARCHAR(500) NOT NULL,
  portal_user_id INT          NULL,
  person_name    VARCHAR(255) NOT NULL,
  person_email   VARCHAR(255) NOT NULL,
  score          INT          NOT NULL,
  pass_score     INT          NOT NULL,
  passed         TINYINT(1)   NOT NULL,
  answers_json   MEDIUMTEXT   NOT NULL,
  reference      VARCHAR(20)  NULL,
  taken_at       DATETIME     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_training_attempt_ref (reference),
  KEY idx_training_attempt_module (client_id, module_id, taken_at),
  KEY idx_training_attempt_user (portal_user_id),
  CONSTRAINT fk_training_attempt_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
