CREATE TABLE IF NOT EXISTS qc_complaints (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  complaint_code VARCHAR(100) NOT NULL,
  source_channel VARCHAR(100) NOT NULL CHECK (source_channel IN ('Customer', 'Regulatory', 'Internal', 'Partner')),
  customer_name VARCHAR(255),
  product_name VARCHAR(255),
  batch_lot_no VARCHAR(255),
  severity VARCHAR(100) NOT NULL CHECK (severity IN ('Low', 'Medium', 'High', 'Critical')),
  status VARCHAR(100) NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Investigation', 'CapaLinked', 'Closed', 'Escalated')),
  summary TEXT NOT NULL,
  details TEXT,
  assigned_to CHAR(36),
  due_date DATE,
  closed_at DATETIME(3),
  closed_by CHAR(36),
  created_by CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE (org_id, complaint_code),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (assigned_to) REFERENCES qms_users(id) ON DELETE SET NULL,
  FOREIGN KEY (closed_by) REFERENCES qms_users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS qc_complaint_capa_links (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  complaint_id CHAR(36) NOT NULL,
  capa_id CHAR(36) NOT NULL,
  linked_by CHAR(36),
  linked_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE (complaint_id, capa_id),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (complaint_id) REFERENCES qc_complaints(id) ON DELETE CASCADE,
  FOREIGN KEY (capa_id) REFERENCES ca_capa_records(id) ON DELETE CASCADE,
  FOREIGN KEY (linked_by) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS qn_nonconformance_records (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  nc_code VARCHAR(100) NOT NULL,
  source_type VARCHAR(100) NOT NULL CHECK (source_type IN ('Manufacturing', 'Supplier', 'Audit', 'IncomingInspection', 'Warehouse', 'Laboratory')),
  item_reference VARCHAR(255),
  severity VARCHAR(100) NOT NULL CHECK (severity IN ('Low', 'Medium', 'High', 'Critical')),
  disposition VARCHAR(100) CHECK (disposition IN ('UseAsIs', 'Rework', 'Reject', 'ReturnToSupplier', 'Scrap')),
  status VARCHAR(100) NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Containment', 'Dispositioned', 'CapaLinked', 'Closed')),
  summary TEXT NOT NULL,
  details TEXT,
  assigned_to CHAR(36),
  due_date DATE,
  closed_at DATETIME(3),
  closed_by CHAR(36),
  created_by CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE (org_id, nc_code),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (assigned_to) REFERENCES qms_users(id) ON DELETE SET NULL,
  FOREIGN KEY (closed_by) REFERENCES qms_users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS qn_nonconformance_capa_links (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  nonconformance_id CHAR(36) NOT NULL,
  capa_id CHAR(36) NOT NULL,
  linked_by CHAR(36),
  linked_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE (nonconformance_id, capa_id),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (nonconformance_id) REFERENCES qn_nonconformance_records(id) ON DELETE CASCADE,
  FOREIGN KEY (capa_id) REFERENCES ca_capa_records(id) ON DELETE CASCADE,
  FOREIGN KEY (linked_by) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sq_suppliers (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  supplier_code VARCHAR(100) NOT NULL,
  supplier_name VARCHAR(255) NOT NULL,
  supplier_type VARCHAR(100) NOT NULL CHECK (supplier_type IN ('RawMaterial', 'ContractManufacturer', 'ServiceProvider', 'Laboratory', 'Distributor')),
  contact_email VARCHAR(255),
  qualification_status VARCHAR(100) NOT NULL DEFAULT 'Pending' CHECK (qualification_status IN ('Pending', 'Qualified', 'Conditional', 'Disqualified')),
  risk_level VARCHAR(100) NOT NULL DEFAULT 'Medium' CHECK (risk_level IN ('Low', 'Medium', 'High', 'Critical')),
  scorecard_rating DECIMAL(5,2),
  approved_at DATETIME(3),
  created_by CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE (org_id, supplier_code),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sq_supplier_audits (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  supplier_id CHAR(36) NOT NULL,
  audit_code VARCHAR(100) NOT NULL,
  audit_type VARCHAR(100) NOT NULL CHECK (audit_type IN ('Onsite', 'Remote', 'DocumentReview')),
  planned_date DATE,
  outcome VARCHAR(100) CHECK (outcome IN ('Pass', 'Conditional', 'Fail', 'InProgress')),
  findings_count INT NOT NULL DEFAULT 0,
  summary TEXT,
  created_by CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE (org_id, audit_code),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (supplier_id) REFERENCES sq_suppliers(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sq_scar_records (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  supplier_id CHAR(36) NOT NULL,
  scar_code VARCHAR(100) NOT NULL,
  issue_summary TEXT NOT NULL,
  status VARCHAR(100) NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'SupplierResponse', 'Implementation', 'Effectiveness', 'Closed')),
  due_date DATE,
  effectiveness_result VARCHAR(100) CHECK (effectiveness_result IN ('Effective', 'PartiallyEffective', 'NotEffective')),
  created_by CHAR(36),
  closed_by CHAR(36),
  closed_at DATETIME(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE (org_id, scar_code),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (supplier_id) REFERENCES sq_suppliers(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES qms_users(id) ON DELETE SET NULL,
  FOREIGN KEY (closed_by) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS rm_risk_register (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  risk_code VARCHAR(100) NOT NULL,
  risk_title VARCHAR(255) NOT NULL,
  risk_domain VARCHAR(100) NOT NULL CHECK (risk_domain IN ('Product', 'Process', 'Supplier', 'Compliance', 'Cyber', 'Clinical')),
  severity INT NOT NULL CHECK (severity BETWEEN 1 AND 5),
  occurrence INT NOT NULL CHECK (occurrence BETWEEN 1 AND 5),
  detectability INT NOT NULL CHECK (detectability BETWEEN 1 AND 5),
  risk_score INT NOT NULL,
  risk_band VARCHAR(100) NOT NULL CHECK (risk_band IN ('Low', 'Medium', 'High', 'Critical')),
  mitigation_plan TEXT,
  owner_user_id CHAR(36),
  status VARCHAR(100) NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Mitigating', 'Accepted', 'Closed')),
  review_due_date DATE,
  created_by CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE (org_id, risk_code),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (owner_user_id) REFERENCES qms_users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS rm_risk_reviews (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  risk_id CHAR(36) NOT NULL,
  review_notes TEXT NOT NULL,
  residual_score INT,
  reviewed_by CHAR(36),
  reviewed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (risk_id) REFERENCES rm_risk_register(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS mr_management_reviews (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  review_code VARCHAR(100) NOT NULL,
  review_period_start DATE NOT NULL,
  review_period_end DATE NOT NULL,
  chairperson VARCHAR(255),
  status VARCHAR(100) NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'InReview', 'Approved', 'Closed')),
  summary TEXT,
  decisions TEXT,
  created_by CHAR(36),
  approved_by CHAR(36),
  approved_at DATETIME(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE (org_id, review_code),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES qms_users(id) ON DELETE SET NULL,
  FOREIGN KEY (approved_by) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS mr_review_actions (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  review_id CHAR(36) NOT NULL,
  action_title VARCHAR(255) NOT NULL,
  owner_user_id CHAR(36),
  due_date DATE,
  status VARCHAR(100) NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'InProgress', 'Closed')),
  closure_notes TEXT,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (review_id) REFERENCES mr_management_reviews(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_user_id) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ai_quality_insights_cache (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  insight_key VARCHAR(100) NOT NULL,
  insight_payload JSON NOT NULL,
  generated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  generated_by CHAR(36),
  UNIQUE (org_id, insight_key),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (generated_by) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS qms_integration_adapters (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  adapter_key VARCHAR(100) NOT NULL CHECK (adapter_key IN ('PLM', 'ERP', 'LIMS', 'DMS')),
  endpoint_url VARCHAR(255),
  auth_mode VARCHAR(100) NOT NULL DEFAULT 'None' CHECK (auth_mode IN ('None', 'ApiKey', 'Basic', 'OAuth2')),
  status VARCHAR(100) NOT NULL DEFAULT 'Disconnected' CHECK (status IN ('Disconnected', 'Connected', 'Error')),
  last_sync_at DATETIME(3),
  config_json JSON NOT NULL DEFAULT (JSON_OBJECT()),
  created_by CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE (org_id, adapter_key),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS qms_integration_sync_jobs (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  adapter_id CHAR(36) NOT NULL,
  job_type VARCHAR(100) NOT NULL,
  status VARCHAR(100) NOT NULL DEFAULT 'Queued' CHECK (status IN ('Queued', 'Running', 'Success', 'Failed')),
  payload_json JSON NOT NULL DEFAULT (JSON_OBJECT()),
  result_json JSON NOT NULL DEFAULT (JSON_OBJECT()),
  started_at DATETIME(3),
  finished_at DATETIME(3),
  created_by CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (adapter_id) REFERENCES qms_integration_adapters(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE INDEX idx_qc_complaints_status_due ON qc_complaints (org_id, status, due_date, updated_at DESC);
CREATE INDEX idx_qn_nonconformance_status_due ON qn_nonconformance_records (org_id, status, due_date, updated_at DESC);
CREATE INDEX idx_sq_suppliers_status_risk ON sq_suppliers (org_id, qualification_status, risk_level, updated_at DESC);
CREATE INDEX idx_sq_scar_status_due ON sq_scar_records (org_id, status, due_date, updated_at DESC);
CREATE INDEX idx_rm_risk_status_due ON rm_risk_register (org_id, status, review_due_date, updated_at DESC);
CREATE INDEX idx_mr_reviews_status_period ON mr_management_reviews (org_id, status, review_period_end DESC);
CREATE INDEX idx_integration_jobs_status ON qms_integration_sync_jobs (org_id, status, created_at DESC);

-- RLS removed: tenant isolation is enforced in the application layer (Phase 0).
