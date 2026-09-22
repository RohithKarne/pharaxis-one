-- CPPM-18: a side effect mentioned in chat reaches the safety team, and a
-- reviewer can confirm a real side effect and send it to MIMS.
--
-- 1. A review task can now come from a chat conversation as well as a form
--    submission. Exactly one source per task, and one task per conversation —
--    both enforced by the database, as uq_ae_task_submission already is for forms.
-- 2. The third outcome, 'confirmed_ae', creates a new adverse_event submission
--    that syncs to MIMS through the ordinary path (and its retries). The original
--    submission is never reclassified (PD-2); ae_submission_id links the two.
ALTER TABLE cp_ae_review_tasks
  MODIFY submission_id INT NULL,
  ADD COLUMN chat_conversation_id INT NULL AFTER submission_id,
  ADD COLUMN ae_submission_id INT NULL AFTER outcome_reason,
  ADD UNIQUE KEY uq_ae_task_chat (chat_conversation_id),
  ADD CONSTRAINT chk_ae_task_one_source CHECK ((submission_id IS NULL) <> (chat_conversation_id IS NULL));
