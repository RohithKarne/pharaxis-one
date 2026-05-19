'use strict';
async function up(conn) {
  await conn.execute(`CREATE TABLE IF NOT EXISTS pii_redaction_rules (
    id INT NOT NULL AUTO_INCREMENT, ha_code VARCHAR(20) NULL, field_path VARCHAR(200) NOT NULL,
    action ENUM('redact','mask','generalize','drop') NOT NULL, mask_pattern VARCHAR(60) NULL, generalization VARCHAR(200) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uq_pii_rule (ha_code, field_path), KEY idx_pii_rule_ha (ha_code)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const rules = [
    [null, 'reporter.given_name', 'redact', null, null], [null, 'reporter.family_name', 'redact', null, null],
    [null, 'reporter.street', 'redact', null, null], [null, 'reporter.address', 'redact', null, null],
    [null, 'patient.date_of_birth', 'generalize', null, 'year'], [null, 'patient.dob', 'generalize', null, 'year'],
    ['FDA', 'reporter.postal_code', 'generalize', null, 'first3'], ['EMA', 'reporter.postal_code', 'generalize', null, 'first3'], ['PMDA', 'reporter.postal_code', 'generalize', null, 'first3'],
  ];
  for (const r of rules) await conn.execute('INSERT IGNORE INTO pii_redaction_rules (ha_code, field_path, action, mask_pattern, generalization) VALUES (?, ?, ?, ?, ?)', r);
  await conn.execute(`INSERT IGNORE INTO feature_flags (flag_key, label, description, wave, theme, default_state, is_strict_mode)
    VALUES ('cf.pv_pii_redaction', 'PV — PII Redaction', 'Reporter and patient PII redaction before regulatory XML transmission.', 'PV', 'PV Compliance', 'on', 1)`).catch(() => {});
}
async function down(conn) { try { await conn.execute('DROP TABLE IF EXISTS pii_redaction_rules'); } catch (_) {} }
module.exports = { up, down };
