CREATE TABLE IF NOT EXISTS sa_org_security_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL UNIQUE REFERENCES qms_orgs(id) ON DELETE CASCADE,
  email_otp_required BOOLEAN NOT NULL DEFAULT true,
  allow_org_admin_2fa_reset BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO sa_org_security_policies (org_id)
SELECT id
FROM qms_orgs
ON CONFLICT (org_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS qms_user_2fa_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL UNIQUE REFERENCES qms_users(id) ON DELETE CASCADE,
  email_otp_enabled BOOLEAN NOT NULL DEFAULT true,
  reset_required BOOLEAN NOT NULL DEFAULT false,
  last_verified_at TIMESTAMPTZ,
  reset_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO qms_user_2fa_settings (org_id, user_id, email_otp_enabled)
SELECT u.org_id, u.id, true
FROM qms_users u
WHERE u.role_key <> 'superadmin'
ON CONFLICT (user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS qms_login_otp_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES qms_users(id) ON DELETE CASCADE,
  recipient_email CITEXT NOT NULL,
  otp_code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempt_count INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qms_login_otp_challenges_user
  ON qms_login_otp_challenges (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qms_login_otp_challenges_active
  ON qms_login_otp_challenges (org_id, expires_at DESC)
  WHERE consumed_at IS NULL;

ALTER TABLE sa_org_security_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE qms_user_2fa_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE qms_login_otp_challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sa_org_security_policies_isolation ON sa_org_security_policies;
CREATE POLICY sa_org_security_policies_isolation ON sa_org_security_policies
USING (
  qms_is_superadmin()
  OR org_id = current_setting('app.current_org_id', true)::uuid
)
WITH CHECK (
  qms_is_superadmin()
  OR org_id = current_setting('app.current_org_id', true)::uuid
);

DROP POLICY IF EXISTS qms_user_2fa_settings_isolation ON qms_user_2fa_settings;
CREATE POLICY qms_user_2fa_settings_isolation ON qms_user_2fa_settings
USING (
  qms_is_superadmin()
  OR org_id = current_setting('app.current_org_id', true)::uuid
)
WITH CHECK (
  qms_is_superadmin()
  OR org_id = current_setting('app.current_org_id', true)::uuid
);

DROP POLICY IF EXISTS qms_login_otp_challenges_isolation ON qms_login_otp_challenges;
CREATE POLICY qms_login_otp_challenges_isolation ON qms_login_otp_challenges
USING (
  qms_is_superadmin()
  OR org_id = current_setting('app.current_org_id', true)::uuid
)
WITH CHECK (
  qms_is_superadmin()
  OR org_id = current_setting('app.current_org_id', true)::uuid
);
