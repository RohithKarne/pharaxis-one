-- CPPM-43: an admin edit's audit entry now records what each changed field was
-- before and after, in full — including long text such as a safety alert's body,
-- where the old wording is exactly what an auditor needs. TEXT holds about 64 KB;
-- an entry with a long body before and after could pass that, so the column
-- becomes MEDIUMTEXT (about 16 MB). Existing rows are kept as they are.
ALTER TABLE cp_audit_logs MODIFY details MEDIUMTEXT NULL;
