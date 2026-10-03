-- CPPM-109 (Decision 4, Rohith, 3 Oct 2026): Clinical Trials and CME & Training get
-- on/off switches on the admin Features page, like every other portal page.
-- Every existing client gets both switches, on, so nothing a doctor sees changes
-- until an admin turns one off. The portal also hides each one while the client has
-- nothing published in it. INSERT IGNORE: a re-run, or a client that already has the
-- row, changes nothing.
INSERT IGNORE INTO cp_features (client_id, feature_key, is_enabled, display_name, display_order)
SELECT id, 'clinical_trials', 1, 'Clinical Trials', 15 FROM cp_clients;

INSERT IGNORE INTO cp_features (client_id, feature_key, is_enabled, display_name, display_order)
SELECT id, 'cme_training', 1, 'CME & Training', 16 FROM cp_clients;
