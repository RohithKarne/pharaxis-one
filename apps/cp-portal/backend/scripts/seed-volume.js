'use strict';

/**
 * seed-volume.js — fills a local CP Portal database with a realistic amount of data,
 * so the admin and portal lists can be checked the way a busy team sees them.
 *
 * Usage (from apps/cp-portal/backend):
 *   node --env-file=<env> scripts/seed-volume.js --client 1 --yes
 *   node --env-file=<env> scripts/seed-volume.js --remove --yes
 *
 * Adds, to one client: 300 portal users with long names and 1,000 submissions across the
 * four forms, 120 of them from the first portal user so "My submissions" has a long list,
 * and a short message thread on 200 of them.
 * Every row carries a "volume-seed" marker so --remove takes out exactly these rows.
 *
 * Refuses to run when NODE_ENV is production. Never point it at a shared database.
 */

const { pool } = require('../database/db');

const MARK = 'volume-seed';
const args = process.argv.slice(2);
const has = flag => args.includes(flag);
const clientId = Number(args[args.indexOf('--client') + 1]);

const FIRST = ['Alexandria', 'Bartholomew', 'Chidimma', 'Dmitri', 'Esperanza', 'Fionnuala', 'Gunnar', 'Hyun-woo', 'Ifeoma', 'Jean-Baptiste', 'Kamalakannan', 'Ludmila'];
const LAST = ['Konstantinopoulou-Vanderbilt', 'Ramasubramanian', 'Okonkwo-Adeyemi', 'Wojciechowski', 'Fitzgerald-Montgomery', 'de la Cruz Hernández', 'Lindqvist'];
const PRODUCTS = ['Cardiolex 10 mg film-coated tablets', 'Respiramax inhaler 100 micrograms', 'Oncovir 50 mg/ml concentrate for solution for infusion', 'Dermacalm cream'];
const TYPES = ['medical_inquiry', 'medical_inquiry', 'adverse_event', 'product_complaint', 'other_inquiry'];
const STATUSES = ['submitted', 'pending_sync', 'synced', 'synced', 'failed_sync', 'closed'];
const USER_TYPES = ['hcp', 'hcp', 'patient', 'pharmacist', 'other'];
const pick = (list, i) => list[i % list.length];
const daysAgo = (i, span) => new Date(Date.now() - ((i * 7919) % (span * 86400)) * 1000);

async function insertMany(table, columns, rows) {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const placeholders = chunk.map(() => `(${columns.map(() => '?').join(',')})`).join(',');
    await pool.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES ${placeholders}`, chunk.flat());
  }
  console.log(`  ${table}: ${rows.length}`);
}

async function remove() {
  const [subs] = await pool.query(`SELECT id FROM cp_submissions WHERE ip_address = ?`, [MARK]);
  if (subs.length) {
    const ids = subs.map(s => s.id);
    await pool.query(`DELETE FROM cp_submission_messages WHERE submission_id IN (?)`, [ids]);
    await pool.query(`DELETE FROM cp_submissions WHERE id IN (?)`, [ids]);
  }
  const [users] = await pool.query(`DELETE FROM cp_portal_users WHERE email LIKE ?`, [`%@${MARK}.test`]);
  console.log(`Removed ${subs.length} submissions and ${users.affectedRows} portal users.`);
}

async function seed() {
  const [[client]] = await pool.query(`SELECT id FROM cp_clients WHERE id = ?`, [clientId]);
  const [[firstUser]] = await pool.query(`SELECT id FROM cp_portal_users WHERE client_id = ? ORDER BY id LIMIT 1`, [clientId]);
  if (!client) throw new Error(`Client ${clientId} does not exist.`);

  console.log(`Seeding client ${clientId}:`);
  // A placeholder password nobody can sign in with.
  const users = Array.from({ length: 300 }, (_, i) => [clientId, pick(FIRST, i), pick(LAST, Math.floor(i / FIRST.length)),
    `portal.user${i}@${MARK}.test`, `!${MARK}`, pick(USER_TYPES, i), pick(['Cardiology', 'Oncology', 'General Practice', 'Respiratory Medicine'], i), 'United Kingdom', 1, 1]);
  await insertMany('cp_portal_users', ['client_id', 'first_name', 'last_name', 'email', 'password', 'user_type', 'specialty', 'country', 'is_active', 'is_verified'], users);
  const [seedUsers] = await pool.query(`SELECT id, first_name, last_name, email, user_type FROM cp_portal_users WHERE email LIKE ? ORDER BY id`, [`%@${MARK}.test`]);

  const subs = Array.from({ length: 1000 }, (_, i) => {
    const mine = firstUser && i % 8 === 0 && i < 960;
    const u = pick(seedUsers, i);
    const type = pick(TYPES, i);
    const product = pick(PRODUCTS, i);
    const text = `About ${product}: a patient with moderate renal impairment who also takes a strong CYP3A4 inhibitor asked whether the dose should change, and whether it is safe while breastfeeding (ref ${20000 + i}).`;
    const formData = { product_name: product, inquiry_details: type === 'medical_inquiry' || type === 'other_inquiry' ? text : undefined,
      event_description: type === 'adverse_event' ? text : undefined, complaint_details: type === 'product_complaint' ? text : undefined };
    const status = pick(STATUSES, i);
    const at = daysAgo(i, 200);
    return [clientId, type, mine ? firstUser.id : u.id, `${u.first_name} ${u.last_name}`, u.email, u.user_type, JSON.stringify(formData),
      status, status === 'synced' ? `MI-${String(30000 + i).padStart(6, '0')}` : null, status === 'failed_sync' ? 'MIMS did not answer in time.' : null, MARK, at, at];
  });
  await insertMany('cp_submissions', ['client_id', 'submission_type', 'user_id', 'submitter_name', 'submitter_email', 'submitter_type', 'form_data',
    'status', 'external_ref', 'sync_error', 'ip_address', 'submitted_at', 'updated_at'], subs);
  const [seedSubs] = await pool.query(`SELECT id, submitted_at FROM cp_submissions WHERE ip_address = ? ORDER BY id LIMIT 200`, [MARK]);

  const msgs = seedSubs.flatMap((s, i) => [
    [s.id, clientId, 'out', `Thank you for your question. Based on the current prescribing information, no dose change is needed for moderate renal impairment, but please see section 4.5 for the CYP3A4 interaction (reply ${i}).`, 'sent', s.submitted_at, s.submitted_at],
    [s.id, clientId, 'in', 'Thank you. Could you also confirm whether the tablets can be crushed for a patient with swallowing difficulties?', 'received', null, s.submitted_at],
  ]);
  await insertMany('cp_submission_messages', ['submission_id', 'client_id', 'direction', 'body', 'status', 'sent_at', 'created_at'], msgs);
}

(async () => {
  if (process.env.NODE_ENV === 'production') { console.error('Refusing to run: NODE_ENV is production.'); process.exit(1); }
  if (!has('--yes') || (!has('--remove') && !Number.isInteger(clientId))) {
    console.error('Usage: seed-volume.js --client <id> --yes   or   seed-volume.js --remove --yes');
    process.exit(1);
  }
  try {
    await (has('--remove') ? remove() : seed());
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
