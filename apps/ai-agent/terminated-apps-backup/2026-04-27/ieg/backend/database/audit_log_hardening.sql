-- IEG Audit Log Hardening
-- Adds DB-level triggers to enforce immutability on ieg_audit_log
-- No application-layer trust. DB enforces this directly.
-- Run once after schema migration.

DROP TRIGGER IF EXISTS trg_ieg_audit_log_no_update;
DROP TRIGGER IF EXISTS trg_ieg_audit_log_no_delete;

DELIMITER $$

CREATE TRIGGER trg_ieg_audit_log_no_update
BEFORE UPDATE ON ieg_audit_log
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'ieg_audit_log is immutable: UPDATE operations are not permitted';
END$$

CREATE TRIGGER trg_ieg_audit_log_no_delete
BEFORE DELETE ON ieg_audit_log
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'ieg_audit_log is immutable: DELETE operations are not permitted';
END$$

DELIMITER ;
