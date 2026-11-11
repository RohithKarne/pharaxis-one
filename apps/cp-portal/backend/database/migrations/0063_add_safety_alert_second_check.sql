-- Rohith, 10 Nov 2026 (option c of the safety-alert decision; Daniel and Saad's view).
-- A safety alert still reaches doctors the moment it is saved as live; nothing holds a
-- warning back. A second person must then read it within 24 hours. Until they do, it
-- is on the client's "To do today", and red once the 24 hours have passed.
--
--   written_by           the admin who created the alert, or last changed what doctors read
--   second_check_due_at  24 hours after it goes live; reset when its content changes
--   second_check_by/_at  who read it, and when; must not be written_by
--
-- Alerts published before this rule have no due time and are not asked for a check.
ALTER TABLE cp_safety_alerts
  ADD COLUMN written_by          INT      NULL,
  ADD COLUMN second_check_due_at DATETIME NULL,
  ADD COLUMN second_check_by     INT      NULL,
  ADD COLUMN second_check_at     DATETIME NULL;
