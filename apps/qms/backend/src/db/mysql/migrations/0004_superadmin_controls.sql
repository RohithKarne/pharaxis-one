CREATE TABLE IF NOT EXISTS sa_org_profiles (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL UNIQUE,
  legal_name VARCHAR(255),
  billing_contact_name VARCHAR(255),
  billing_contact_email VARCHAR(255),
  status VARCHAR(100) NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS sa_org_feature_flags (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  feature_key VARCHAR(100) NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE (org_id, feature_key),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS sa_org_billing_controls (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL UNIQUE,
  plan_key VARCHAR(100) NOT NULL,
  billing_status VARCHAR(100) NOT NULL,
  license_limit INT,
  reporting_email VARCHAR(255),
  notes TEXT,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS sa_org_billing_reports (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  report_type VARCHAR(100) NOT NULL,
  report_period_start DATE,
  report_period_end DATE,
  total_amount DECIMAL(14, 2),
  currency_code VARCHAR(100) DEFAULT 'USD',
  generated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS sa_user_admin_actions (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  org_id CHAR(36) NOT NULL,
  actor_user_id CHAR(36),
  action_key VARCHAR(100) NOT NULL,
  target_entity_type VARCHAR(100) NOT NULL,
  target_entity_id CHAR(36),
  details_json JSON NOT NULL DEFAULT (JSON_OBJECT()),
  occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_user_id) REFERENCES qms_users(id)
);
