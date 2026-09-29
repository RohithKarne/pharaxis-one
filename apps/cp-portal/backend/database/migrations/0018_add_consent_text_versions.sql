-- CPPM-13: prove what a person actually agreed to.
--
-- cp_consent_records held a user, a version string and the choices made, but not
-- the wording behind that version. The wording lived in cp_compliance_config and
-- was overwritten in place on every edit, so once the notice was reworded there
-- was nothing left showing what had been accepted.
--
-- The wording of each version is now stored once, in its own row, and every
-- consent record points at the version it belongs to. Rows here are written once
-- and never updated: a reworded notice becomes a new version (enforced in
-- utils/consentText.js), and the FK below refuses to delete a version any
-- consent record still relies on.

CREATE TABLE IF NOT EXISTS cp_consent_text_versions (
  id             INT          NOT NULL AUTO_INCREMENT,
  client_id      INT          NOT NULL,
  version        VARCHAR(20)  NOT NULL,
  title          VARCHAR(500) NULL,
  body           TEXT         NOT NULL,
  effective_from DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by     INT          NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_consent_text_version (client_id, version),
  CONSTRAINT fk_consent_text_client  FOREIGN KEY (client_id)  REFERENCES cp_clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_consent_text_creator FOREIGN KEY (created_by) REFERENCES cp_admin_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE cp_consent_records
  ADD COLUMN consent_text_version_id INT NULL AFTER version,
  ADD KEY idx_cp_consent_text_version (consent_text_version_id),
  ADD CONSTRAINT fk_consent_text_version FOREIGN KEY (consent_text_version_id) REFERENCES cp_consent_text_versions(id) ON DELETE RESTRICT;

-- Seed one version per client from the notice configured today. The fallbacks are
-- the wording the portal banner itself falls back to when a client has configured
-- none, so a client that never customised the banner still gets the real text.
INSERT INTO cp_consent_text_versions (client_id, version, title, body, effective_from)
SELECT cc.client_id,
       cc.version,
       COALESCE(CASE WHEN JSON_VALID(cc.banner_config_json) THEN JSON_UNQUOTE(JSON_EXTRACT(cc.banner_config_json, '$.title')) END, 'We use cookies'),
       COALESCE(CASE WHEN JSON_VALID(cc.banner_config_json) THEN JSON_UNQUOTE(JSON_EXTRACT(cc.banner_config_json, '$.body'))  END,
                'We use cookies and similar technologies to improve your experience on this portal. Please choose your preferences below.'),
       cc.updated_at
FROM cp_compliance_config cc
WHERE NOT EXISTS (
  SELECT 1 FROM cp_consent_text_versions v WHERE v.client_id = cc.client_id AND v.version = cc.version
);

-- Link existing consent records by their version string. A record whose string
-- matches no seeded version keeps a NULL link — we know which version it names
-- but not the wording, and inventing one would be worse than the gap. For the
-- records that do link, effective_from says when that wording was last saved:
-- later than consented_at means the wording may have moved under the record.
UPDATE cp_consent_records cr
  JOIN cp_consent_text_versions v
    ON v.client_id = cr.client_id AND v.version = cr.version
   SET cr.consent_text_version_id = v.id
 WHERE cr.consent_text_version_id IS NULL;
