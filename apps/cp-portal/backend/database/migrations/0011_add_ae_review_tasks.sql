-- PD-2: adverse-event screening on portal submissions.
-- Every non-AE submission asks whether anyone became unwell. A "Yes" raises one
-- review task here for the client safety team. The task is the control — it
-- cannot be closed without a recorded outcome, and the two outcomes are stored
-- distinctly so "reviewed by a clinician" is never conflated with "cleared
-- because it went stale" (Sowmya / Vasu, locked 2026-08-04).
--
-- Phase 1 is CP-only: the flag is raised and worked here. Sending it to MIMS is
-- phase 2 and needs a MIMS-side field first — see MIMS-64.
CREATE TABLE IF NOT EXISTS cp_ae_review_tasks (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  client_id      INT NOT NULL,
  submission_id  INT NOT NULL,
  status         VARCHAR(20) NOT NULL DEFAULT 'open',  -- 'open' | 'closed'
  outcome        VARCHAR(30) NULL,                     -- 'reviewed_not_ae' (clinical) | 'cleared_administrative'
  outcome_reason TEXT NULL,                            -- mandatory for cleared_administrative
  reported_detail TEXT NULL,                           -- snapshot of what the submitter typed, if anything
  closed_by      INT NULL,                             -- cp_admin_users.id
  closed_at      DATETIME NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- One task per submission, enforced by the database rather than by application
  -- code. A retried submit must never produce a second task for the same record.
  UNIQUE KEY uq_ae_task_submission (submission_id),
  KEY idx_ae_task_client_status (client_id, status)
);
