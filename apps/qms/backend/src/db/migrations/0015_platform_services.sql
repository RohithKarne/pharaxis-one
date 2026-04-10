CREATE TABLE IF NOT EXISTS qms_file_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  storage_provider TEXT NOT NULL DEFAULT 'local',
  object_key TEXT NOT NULL,
  blob_uri TEXT,
  mime_type TEXT,
  byte_size BIGINT,
  checksum_sha256 TEXT,
  uploaded_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, object_key)
);

CREATE TABLE IF NOT EXISTS qms_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  recipient_user_id UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qms_email_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  recipient_email CITEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  delivery_status TEXT NOT NULL DEFAULT 'Queued' CHECK (
    delivery_status IN ('Queued', 'Sent', 'Failed')
  ),
  retry_count INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS qms_event_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  topic_key TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  publish_status TEXT NOT NULL DEFAULT 'Queued' CHECK (
    publish_status IN ('Queued', 'Published', 'Failed')
  ),
  retry_count INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_qms_notifications_unread
  ON qms_notifications (org_id, recipient_user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qms_outbox_status
  ON qms_event_outbox (org_id, publish_status, created_at ASC);

ALTER TABLE qms_file_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE qms_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE qms_email_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE qms_event_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qms_file_objects_isolation ON qms_file_objects;
CREATE POLICY qms_file_objects_isolation ON qms_file_objects
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS qms_notifications_isolation ON qms_notifications;
CREATE POLICY qms_notifications_isolation ON qms_notifications
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS qms_email_notifications_isolation ON qms_email_notifications;
CREATE POLICY qms_email_notifications_isolation ON qms_email_notifications
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS qms_event_outbox_isolation ON qms_event_outbox;
CREATE POLICY qms_event_outbox_isolation ON qms_event_outbox
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

