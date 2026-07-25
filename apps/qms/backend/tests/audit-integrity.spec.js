import { getDbPool } from '../src/db/pool.js';
import { verifyAuditHashChain } from '../src/utils/auditVerify.js';

async function runAuditIntegrityTest() {
  console.log('--- Starting QMS Audit Hash Chain Integrity Verification ---');
  const pool = getDbPool();
  const client = await pool.connect();

  try {
    await client.query("SELECT set_config('app.is_superadmin', 'true', false)");

    // 1. Fetch seed organization ID
    const { rows: orgRows } = await client.query("SELECT id, org_code FROM qms_orgs WHERE org_code = 'PHA_DEV' LIMIT 1");
    if (!orgRows[0]) {
      console.error('❌ Error: Default seed org PHA_DEV not found. Please run npm run db:seed:dev');
      process.exit(1);
    }

    const orgId = orgRows[0].id;
    console.log(`Checking audit ledger for org: ${orgRows[0].org_code} (${orgId})`);

    // 2. Verify audit ledger chain
    const result = await verifyAuditHashChain(client, orgId);
    console.log(`Total Audit Events Found: ${result.totalEvents}`);
    console.log(`Verified Events: ${result.verifiedCount}`);
    console.log(`Corrupted Events: ${result.corruptedCount}`);

    if (result.valid) {
      console.log('✅ PASS: Cryptographic Audit Ledger Hash Chain is 100% valid and unbroken!');
    } else {
      console.error('❌ FAIL: Audit Ledger Chain Corruption Detected:', result.corruptedEvents);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Test error:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runAuditIntegrityTest();
