const pool = require('./database/db'); async function run() { const [cols] = await pool.query('SHOW COLUMNS FROM case_contacts'); console.log(cols); process.exit(0); } run();
