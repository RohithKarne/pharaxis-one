-- Rohith, 10 Nov 2026 (raised by John, Head of Medical Affairs). Every client's
-- side-effect form asked only for the patient's age, and that was optional. EU
-- pharmacovigilance guidance (GVP Module VI) needs an identifiable patient for a valid
-- report, so a report could reach MIMS with nothing that identifies the patient.
-- The form gains two optional questions after "Patient Age": initials and sex. The
-- bridge already sends both to MIMS (patient.initials, patient.gender).
--
-- Only forms that are in use get them, placed right after Patient Age. A client that
-- already has either question, active or switched off, keeps its own choice:
-- INSERT IGNORE skips it on the (client_id, form_type, field_key) unique key.

-- Make room after Patient Age on forms that will gain both questions.
UPDATE cp_form_config f
JOIN (
  SELECT a.client_id, a.display_order AS age_order
  FROM cp_form_config a
  WHERE a.form_type = 'adverse_event' AND a.field_key = 'patient_age' AND a.is_active = 1
    AND NOT EXISTS (SELECT 1 FROM cp_form_config x WHERE x.client_id = a.client_id
                    AND x.form_type = 'adverse_event' AND x.field_key IN ('patient_initials', 'patient_sex'))
) age ON age.client_id = f.client_id
SET f.display_order = f.display_order + 2
WHERE f.form_type = 'adverse_event' AND f.display_order > age.age_order;

INSERT IGNORE INTO cp_form_config
  (client_id, form_type, field_key, field_label, field_type, field_options, placeholder, help_text, is_required, is_active, display_order)
SELECT a.client_id, 'adverse_event', 'patient_initials', 'Patient Initials', 'text', NULL, 'e.g. J.D.',
       'Initials or another identifier, never the full name. It lets the safety team follow up on this report.',
       0, 1, a.display_order + 1
FROM cp_form_config a
WHERE a.form_type = 'adverse_event' AND a.field_key = 'patient_age' AND a.is_active = 1;

INSERT IGNORE INTO cp_form_config
  (client_id, form_type, field_key, field_label, field_type, field_options, placeholder, help_text, is_required, is_active, display_order)
SELECT a.client_id, 'adverse_event', 'patient_sex', 'Patient Sex', 'select', 'Female\nMale\nOther\nUnknown', NULL, NULL,
       0, 1, a.display_order + 2
FROM cp_form_config a
WHERE a.form_type = 'adverse_event' AND a.field_key = 'patient_age' AND a.is_active = 1;
