ALTER TABLE qms_orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE qms_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE qms_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE qms_user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE qms_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE qms_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE qms_auth_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE qms_e_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE qms_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qms_orgs_isolation ON qms_orgs;
CREATE POLICY qms_orgs_isolation ON qms_orgs
USING (id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS qms_users_isolation ON qms_users;
CREATE POLICY qms_users_isolation ON qms_users
USING (org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS qms_roles_isolation ON qms_roles;
CREATE POLICY qms_roles_isolation ON qms_roles
USING (org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS qms_user_roles_isolation ON qms_user_roles;
CREATE POLICY qms_user_roles_isolation ON qms_user_roles
USING (org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS qms_permissions_isolation ON qms_permissions;
CREATE POLICY qms_permissions_isolation ON qms_permissions
USING (org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS qms_role_permissions_isolation ON qms_role_permissions;
CREATE POLICY qms_role_permissions_isolation ON qms_role_permissions
USING (org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS qms_auth_accounts_isolation ON qms_auth_accounts;
CREATE POLICY qms_auth_accounts_isolation ON qms_auth_accounts
USING (org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS qms_e_signatures_isolation ON qms_e_signatures;
CREATE POLICY qms_e_signatures_isolation ON qms_e_signatures
USING (org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS qms_audit_events_isolation ON qms_audit_events;
CREATE POLICY qms_audit_events_isolation ON qms_audit_events
USING (org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);
