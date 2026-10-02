-- CPPM-6: who is working an open safety review task.
--
-- Until now a person appeared on a task only at the end, as whoever closed it.
-- Two people could work the same task, or each assume the other had it.
--
-- owner_id is the staff member holding the task now (cp_admin_users.id), NULL when
-- nobody has taken it. owner_since is when they took it or were handed it. Every
-- take, release and hand-over is also written to cp_audit_logs, which is the record
-- of how a task passed between people. These two columns only say who holds it now.
--
-- Holding a task is never a condition for closing it: the close control (an outcome
-- is required) is unchanged, and anyone who could close a task before still can.
ALTER TABLE cp_ae_review_tasks
  ADD COLUMN owner_id    INT      NULL AFTER reported_detail,
  ADD COLUMN owner_since DATETIME NULL AFTER owner_id;
