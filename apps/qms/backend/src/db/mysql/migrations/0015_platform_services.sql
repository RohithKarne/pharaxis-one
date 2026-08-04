CREATE TABLE IF NOT EXISTS qms_file_objects (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  storage_provider VARCHAR(255) NOT NULL DEFAULT 'local',
  object_key VARCHAR(100) NOT NULL,
  blob_uri TEXT,
  mime_type VARCHAR(100),
  byte_size BIGINT,
  checksum_sha256 TEXT,
  uploaded_by CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE (org_id, object_key),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (uploaded_by) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS qms_notifications (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  recipient_user_id CHAR(36),
  event_type VARCHAR(100) NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  payload_json JSON NOT NULL DEFAULT (JSON_OBJECT()),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (recipient_user_id) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS qms_email_notifications (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  recipient_email VARCHAR(255) NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  delivery_status VARCHAR(100) NOT NULL DEFAULT 'Queued' CHECK (
    delivery_status IN ('Queued', 'Sent', 'Failed')
  ),
  retry_count INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  sent_at DATETIME(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS qms_event_outbox (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  topic_key VARCHAR(100) NOT NULL,
  payload_json JSON NOT NULL DEFAULT (JSON_OBJECT()),
  publish_status VARCHAR(100) NOT NULL DEFAULT 'Queued' CHECK (
    publish_status IN ('Queued', 'Published', 'Failed')
  ),
  retry_count INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  published_at DATETIME(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT
);

CREATE INDEX idx_qms_notifications_unread
  ON qms_notifications (org_id, recipient_user_id, is_read, created_at DESC);
CREATE INDEX idx_qms_outbox_status
  ON qms_event_outbox (org_id, publish_status, created_at ASC);

-- RLS removed: tenant isolation is enforced in the application layer (Phase 0).
