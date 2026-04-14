CREATE TABLE IF NOT EXISTS qms_login_audit (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID REFERENCES qms_orgs(id) ON DELETE SET NULL,
  email CITEXT,
  login_surface TEXT NOT NULL CHECK (login_surface IN ('user', 'superadmin')),
  outcome TEXT NOT NULL CHECK (outcome IN ('Success', 'Failed')),
  reason TEXT,
  ip_address INET,
  user_agent TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qms_login_audit_occurred_at
  ON qms_login_audit (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_qms_login_audit_org
  ON qms_login_audit (org_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS sa_platform_email_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key TEXT NOT NULL UNIQUE DEFAULT 'default',
  smtp_host TEXT NOT NULL,
  smtp_port INT NOT NULL DEFAULT 587 CHECK (smtp_port > 0 AND smtp_port <= 65535),
  smtp_username TEXT,
  smtp_password_encrypted TEXT,
  smtp_from_email CITEXT,
  smtp_from_name TEXT,
  use_tls BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sa_org_upload_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL UNIQUE REFERENCES qms_orgs(id) ON DELETE CASCADE,
  max_upload_mb INT NOT NULL DEFAULT 25 CHECK (max_upload_mb >= 1 AND max_upload_mb <= 500),
  allowed_extensions TEXT[] NOT NULL DEFAULT ARRAY[
    'pdf',
    'doc',
    'docx',
    'xls',
    'xlsx',
    'ppt',
    'pptx',
    'csv',
    'txt',
    'png',
    'jpg',
    'jpeg',
    'tiff',
    'eml',
    'msg'
  ],
  viewer_default_can_download BOOLEAN NOT NULL DEFAULT false,
  viewer_download_requires_watermark BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO sa_org_upload_policies (org_id)
SELECT o.id
FROM qms_orgs o
ON CONFLICT (org_id) DO NOTHING;

INSERT INTO qms_roles (org_id, role_key, role_name, is_system)
SELECT
  o.id,
  role_map.role_key,
  role_map.role_name,
  true
FROM qms_orgs o
CROSS JOIN (
  VALUES
    ('admin', 'Admin'),
    ('author', 'Author'),
    ('qa_reviewer', 'QA Reviewer'),
    ('approver', 'Approver'),
    ('viewer', 'Viewer')
) AS role_map(role_key, role_name)
ON CONFLICT (org_id, role_key) DO NOTHING;

INSERT INTO qms_roles (org_id, role_key, role_name, is_system)
SELECT
  u.org_id,
  u.role_key,
  initcap(replace(u.role_key, '_', ' ')),
  true
FROM qms_users u
WHERE u.role_key IS NOT NULL
ON CONFLICT (org_id, role_key) DO NOTHING;

INSERT INTO qms_user_roles (org_id, user_id, role_id)
SELECT
  u.org_id,
  u.id,
  r.id
FROM qms_users u
JOIN qms_roles r
  ON r.org_id = u.org_id
 AND r.role_key = u.role_key
ON CONFLICT (org_id, user_id, role_id) DO NOTHING;

ALTER TABLE qms_login_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE sa_platform_email_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE sa_org_upload_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qms_login_audit_isolation ON qms_login_audit;
CREATE POLICY qms_login_audit_isolation ON qms_login_audit
USING (
  qms_is_superadmin()
  OR org_id = current_setting('app.current_org_id', true)::uuid
)
WITH CHECK (
  qms_is_superadmin()
  OR org_id = current_setting('app.current_org_id', true)::uuid
);

DROP POLICY IF EXISTS sa_platform_email_config_isolation ON sa_platform_email_config;
CREATE POLICY sa_platform_email_config_isolation ON sa_platform_email_config
USING (qms_is_superadmin())
WITH CHECK (qms_is_superadmin());

DROP POLICY IF EXISTS sa_org_upload_policies_isolation ON sa_org_upload_policies;
CREATE POLICY sa_org_upload_policies_isolation ON sa_org_upload_policies
USING (
  qms_is_superadmin()
  OR org_id = current_setting('app.current_org_id', true)::uuid
)
WITH CHECK (
  qms_is_superadmin()
  OR org_id = current_setting('app.current_org_id', true)::uuid
);
