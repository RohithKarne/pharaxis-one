CREATE OR REPLACE FUNCTION qms_is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(current_setting('app.is_superadmin', true), 'false') = 'true'
$$;

ALTER TABLE sa_org_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sa_org_feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE sa_org_billing_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE sa_org_billing_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE sa_user_admin_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qms_orgs_isolation ON qms_orgs;
CREATE POLICY qms_orgs_isolation ON qms_orgs
USING (qms_is_superadmin() OR id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS qms_users_isolation ON qms_users;
CREATE POLICY qms_users_isolation ON qms_users
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS qms_roles_isolation ON qms_roles;
CREATE POLICY qms_roles_isolation ON qms_roles
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS qms_user_roles_isolation ON qms_user_roles;
CREATE POLICY qms_user_roles_isolation ON qms_user_roles
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS qms_permissions_isolation ON qms_permissions;
CREATE POLICY qms_permissions_isolation ON qms_permissions
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS qms_role_permissions_isolation ON qms_role_permissions;
CREATE POLICY qms_role_permissions_isolation ON qms_role_permissions
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS qms_auth_accounts_isolation ON qms_auth_accounts;
CREATE POLICY qms_auth_accounts_isolation ON qms_auth_accounts
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS qms_e_signatures_isolation ON qms_e_signatures;
CREATE POLICY qms_e_signatures_isolation ON qms_e_signatures
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS qms_audit_events_isolation ON qms_audit_events;
CREATE POLICY qms_audit_events_isolation ON qms_audit_events
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS sa_org_profiles_isolation ON sa_org_profiles;
CREATE POLICY sa_org_profiles_isolation ON sa_org_profiles
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS sa_org_feature_flags_isolation ON sa_org_feature_flags;
CREATE POLICY sa_org_feature_flags_isolation ON sa_org_feature_flags
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS sa_org_billing_controls_isolation ON sa_org_billing_controls;
CREATE POLICY sa_org_billing_controls_isolation ON sa_org_billing_controls
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS sa_org_billing_reports_isolation ON sa_org_billing_reports;
CREATE POLICY sa_org_billing_reports_isolation ON sa_org_billing_reports
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS sa_user_admin_actions_isolation ON sa_user_admin_actions;
CREATE POLICY sa_user_admin_actions_isolation ON sa_user_admin_actions
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

