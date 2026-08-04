-- Bug sweep 2026-07-04: three schema/query mismatches found in the full CP Portal audit.
--
-- 1) cp_chatbox_config was missing the api_key column that both the admin config
--    PATCH (writes it) and the portal chatbox handler (gates on it) depend on.
--    Without it: admin save → ER_BAD_FIELD_ERROR 500, and the portal chatbox is
--    permanently 503 "not configured". Stored value is AES-GCM encrypted (enc:v1:).
-- 2) cp_form_config was missing updated_at, but the field-edit PATCH and the
--    reorder handler both write updated_at = NOW() → ER_BAD_FIELD_ERROR 500, so
--    editing or reordering custom form fields was entirely broken.
-- 3) cp_notifications had no unique key, so the INSERT IGNORE in notify.js never
--    de-duplicated — re-publishing an item created duplicate notification rows.

ALTER TABLE cp_chatbox_config
  ADD COLUMN api_key TEXT NULL AFTER max_tokens;

ALTER TABLE cp_form_config
  ADD COLUMN updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- Remove any pre-existing duplicate notifications (keep the earliest row) before
-- adding the unique key, or the ALTER would fail on existing data.
DELETE n1 FROM cp_notifications n1
  INNER JOIN cp_notifications n2
    ON  n1.portal_user_id = n2.portal_user_id
    AND n1.type           = n2.type
    AND n1.item_id        = n2.item_id
    AND n1.id             > n2.id;

ALTER TABLE cp_notifications
  ADD UNIQUE KEY uq_notif_dedup (portal_user_id, type, item_id);
