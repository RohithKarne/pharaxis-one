CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS qms_orgs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_code TEXT NOT NULL UNIQUE,
  org_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qms_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  email CITEXT NOT NULL,
  full_name TEXT NOT NULL,
  role_key TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, email)
);

CREATE TABLE IF NOT EXISTS qms_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  role_key TEXT NOT NULL,
  role_name TEXT NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, role_key)
);

CREATE TABLE IF NOT EXISTS qms_user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES qms_users(id) ON DELETE RESTRICT,
  role_id UUID NOT NULL REFERENCES qms_roles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, user_id, role_id)
);

CREATE TABLE IF NOT EXISTS qms_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  permission_key TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, permission_key)
);

CREATE TABLE IF NOT EXISTS qms_role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  role_id UUID NOT NULL REFERENCES qms_roles(id) ON DELETE RESTRICT,
  permission_id UUID NOT NULL REFERENCES qms_permissions(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS qms_auth_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES qms_users(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL,
  provider_subject TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, provider, provider_subject)
);

CREATE TABLE IF NOT EXISTS qms_e_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES qms_users(id) ON DELETE RESTRICT,
  entity_table TEXT NOT NULL,
  entity_id UUID NOT NULL,
  signature_meaning TEXT NOT NULL,
  signed_payload_hash TEXT NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qms_audit_events (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  module_key TEXT NOT NULL,
  entity_table TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action_key TEXT NOT NULL,
  actor_user_id UUID REFERENCES qms_users(id),
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  prev_hash TEXT,
  curr_hash TEXT NOT NULL UNIQUE
);

CREATE OR REPLACE FUNCTION qms_block_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'qms_audit_events is immutable';
END;
$$;

DROP TRIGGER IF EXISTS qms_audit_events_block_update ON qms_audit_events;
CREATE TRIGGER qms_audit_events_block_update
BEFORE UPDATE ON qms_audit_events
FOR EACH ROW
EXECUTE FUNCTION qms_block_audit_mutation();

DROP TRIGGER IF EXISTS qms_audit_events_block_delete ON qms_audit_events;
CREATE TRIGGER qms_audit_events_block_delete
BEFORE DELETE ON qms_audit_events
FOR EACH ROW
EXECUTE FUNCTION qms_block_audit_mutation();
