const pool = require('../database/db');
const { seedNewOrg } = require('../services/seedService');

async function backfillExistingOrgs() {
  let seeded = 0;
  let failed = 0;

  const [orgs] = await pool.query(
    'SELECT id, name FROM organisations WHERE is_active = 1'
  );

  for (const org of orgs) {
    console.log(`Seeding org ${org.id} — ${org.name}...`);
    try {
      await seedNewOrg(org.id, 4);
      seeded += 1;
      console.log('Done.');
    } catch (error) {
      failed += 1;
      console.error(`Error seeding org ${org.id} (${org.name}):`, error);
    }
  }

  console.log(`Backfill complete. ${seeded} orgs seeded, ${failed} failed.`);
  process.exit(0);
}

backfillExistingOrgs().catch((error) => {
  console.error('Backfill failed before processing orgs:', error);
  process.exit(0);
});
