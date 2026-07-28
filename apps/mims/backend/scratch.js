const pool = require('./database/db');
async function run() {
  try {
    await pool.initPromise;
  } catch (e) {
    console.log("DB init error:", e);
  }
  const tables = ['tenant_picklists', 'case_form_rules', 'field_setup', 'security_groups', 'security_group_privileges', 'workflow_states', 'workflow_transitions', 'case_number_config', 'tenant_feature_flags'];
  for (const t of tables) {
    try {
      const [cols] = await pool.execute(`SHOW COLUMNS FROM ${t}`);
      console.log(`Table: ${t}`);
      console.log(cols.map(c => c.Field).join(', '));
    } catch(e) { console.log(`Table ${t} not found`); }
  }
  process.exit(0);
}
run();
