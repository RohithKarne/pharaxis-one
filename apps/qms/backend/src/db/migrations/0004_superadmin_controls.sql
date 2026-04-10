CREATE TABLE IF NOT EXISTS sa_org_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL UNIQUE REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  legal_name TEXT,
  billing_contact_name TEXT,
  billing_contact_email CITEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sa_org_feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  feature_key TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, feature_key)
);

CREATE TABLE IF NOT EXISTS sa_org_billing_controls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL UNIQUE REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  plan_key TEXT NOT NULL,
  billing_status TEXT NOT NULL,
  license_limit INT,
  reporting_email CITEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sa_org_billing_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  report_type TEXT NOT NULL,
  report_period_start DATE,
  report_period_end DATE,
  total_amount NUMERIC(14, 2),
  currency_code TEXT DEFAULT 'USD',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sa_user_admin_actions (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  actor_user_id UUID REFERENCES qms_users(id),
  action_key TEXT NOT NULL,
  target_entity_type TEXT NOT NULL,
  target_entity_id UUID,
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

