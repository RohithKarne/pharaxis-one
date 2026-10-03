'use strict';

/**
 * seed-volume.js — fills a local MIMS database with a realistic amount of data,
 * so list screens can be checked the way a busy medical information team sees them.
 *
 * Usage (from apps/mims):
 *   node --env-file=<env> backend/scripts/seed-volume.js --org 1 --yes
 *   node --env-file=<env> backend/scripts/seed-volume.js --org 1 --remove --yes
 *
 * Adds, to one organisation: 300 users with long names, 2,000 cases, 3,000 inbox
 * messages, 1,000 contacts, 1,000 transmission records, 5,000 case audit rows,
 * 500 notifications for the first admin, and 500 content documents.
 * Every row carries a "volume-seed" marker so --remove takes out exactly these rows.
 *
 * Refuses to run when NODE_ENV is production. Never point it at a shared database.
 */

const pool = require('../database/db');

const MARK = 'volume-seed';
const args = process.argv.slice(2);
const has = flag => args.includes(flag);
const orgId = Number(args[args.indexOf('--org') + 1]);

const FIRST = ['Alexandria', 'Bartholomew', 'Chidimma', 'Dmitri', 'Esperanza', 'Fionnuala', 'Gunnar', 'Hyun-woo', 'Ifeoma', 'Jean-Baptiste', 'Kamalakannan', 'Ludmila', 'Maximiliano', 'Nkechinyere', 'Oluwaseun', 'Priyadarshini'];
const LAST = ['Konstantinopoulou-Vanderbilt', 'Ramasubramanian', 'Okonkwo-Adeyemi', 'Wojciechowski', 'Fitzgerald-Montgomery', 'Venkataraghavan', 'Schwarzenegger', 'Nakamura', 'de la Cruz Hernández', 'Abernathy', 'Chukwuemeka', 'Lindqvist'];
const PRODUCTS = ['Cardiolex 10 mg film-coated tablets', 'Respiramax inhaler 100 micrograms', 'Oncovir 50 mg/ml concentrate for solution for infusion', 'Dermacalm cream', 'Neurozen extended-release capsules 75 mg'];
const TYPES = ['MI', 'AE', 'PC'];
const PRIORITIES = ['low', 'normal', 'normal', 'normal', 'high', 'urgent'];
const CHANNELS = ['phone', 'email', 'web', 'fax'];
const SYSTEMS = ['MI Email', 'Argus Safety', 'Veeva Vault Safety', 'Partner PV mailbox'];
const pick = (list, i) => list[i % list.length];
const name = i => `${pick(FIRST, i)} ${pick(LAST, Math.floor(i / FIRST.length))}`;
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
  const [users] = await pool.query(`SELECT id FROM users WHERE email LIKE ?`, [`%@${MARK}.test`]);
  const [cases] = await pool.query(`SELECT id FROM cases WHERE description = ?`, [MARK]);
  const caseIds = cases.map(c => c.id);
  await pool.query(`DELETE FROM inquiries WHERE source_tag = ?`, [MARK]);
  if (caseIds.length) {
    await pool.query(`DELETE FROM transmission_audit_trail WHERE case_id IN (?)`, [caseIds]);
    await pool.query(`DELETE FROM case_audit_trail WHERE case_id IN (?)`, [caseIds]);
    await pool.query(`DELETE FROM cases WHERE id IN (?)`, [caseIds]);
  }
  await pool.query(`DELETE FROM contacts WHERE notes = ?`, [MARK]);
  await pool.query(`DELETE FROM notifications WHERE event_key LIKE ?`, [`${MARK}-%`]);
  await pool.query(`DELETE FROM cm_documents WHERE search_tags = ?`, [MARK]);
  await pool.query(`DELETE FROM cm_folders WHERE description = ?`, [MARK]);
  if (users.length) await pool.query(`DELETE FROM users WHERE id IN (?)`, [users.map(u => u.id)]);
  console.log(`Removed ${caseIds.length} cases, ${users.length} users and their seeded rows.`);
}

async function seed() {
  const [[site]] = await pool.query(`SELECT id FROM sites WHERE org_id = ? ORDER BY id LIMIT 1`, [orgId]);
  const [[admin]] = await pool.query(`SELECT id, name FROM users ORDER BY id LIMIT 1`);
  const [states] = await pool.query(`SELECT id FROM workflow_states ORDER BY id`);
  if (!site || !admin || !states.length) throw new Error(`Organisation ${orgId} needs a site, a user and workflow states first.`);

  console.log(`Seeding organisation ${orgId}:`);

  // A placeholder hash nobody can sign in with.
  const users = Array.from({ length: 300 }, (_, i) => [`${name(i)}`, `seed.user${i}@${MARK}.test`, `!${MARK}`, 'agent', orgId, 1]);
  await insertMany('users', ['name', 'email', 'password', 'role', 'org_id', 'is_active'], users);
  const [seedUsers] = await pool.query(`SELECT id, name FROM users WHERE email LIKE ? ORDER BY id`, [`%@${MARK}.test`]);

  const cases = Array.from({ length: 2000 }, (_, i) => {
    const type = pick(TYPES, i);
    const owner = i % 4 === 0 ? null : (i % 3 === 0 ? admin.id : pick(seedUsers, i).id);
    const created = daysAgo(i, 365);
    return [`${type}-${String(9000 + i).padStart(6, '0')}`, type, orgId, site.id, pick(states, i).id, owner, pick(PRIORITIES, i), pick(CHANNELS, i), created, created, MARK, admin.id, created, created];
  });
  await insertMany('cases', ['case_number', 'case_type', 'org_id', 'site_id', 'status_id', 'case_owner_id', 'priority', 'intake_channel', 'date_received', 'date_of_intake', 'description', 'created_by', 'created_at', 'updated_at'], cases);
  const [seedCases] = await pool.query(`SELECT id FROM cases WHERE description = ? ORDER BY id`, [MARK]);

  // One message in three has already been turned into a case, as in a working inbox.
  const inquiries = Array.from({ length: 3000 }, (_, i) => {
    const received = daysAgo(i, 120);
    const linked = i % 3 === 0 ? seedCases[(i / 3) % seedCases.length].id : null;
    return [orgId, `${name(i + 7)} <${pick(FIRST, i).toLowerCase()}.${i}@hospital-${i % 40}.example>`,
      `Question about ${pick(PRODUCTS, i)}: dosing in patients with moderate renal impairment who are also taking a strong CYP3A4 inhibitor (ref ${10000 + i})`,
      `Dear Medical Information team,\n\nA patient asked about ${pick(PRODUCTS, i)}. Please advise.\n\nKind regards`,
      linked ? 'processed' : pick(['inbox', 'inbox', 'pending', 'non_processed'], i), pick(PRIORITIES, i), i % 5 === 0 ? null : pick(seedUsers, i).id,
      received, received, linked ? 1 : 0, linked, MARK];
  });
  await insertMany('inquiries', ['org_id', 'sender', 'subject', 'body', 'status', 'priority', 'assigned_to', 'received_at', 'created_at', 'is_read', 'case_id', 'source_tag'], inquiries);

  const contacts = Array.from({ length: 1000 }, (_, i) => [pick(['HCP', 'Patient', 'Pharmacist', 'Consumer'], i), pick(['Cardiology', 'Oncology', 'General Practice', 'Respiratory Medicine'], i),
    pick(FIRST, i + 3), pick(LAST, i + 5), `contact${i}@${MARK}.test`, `+44 20 7946 ${String(i).padStart(4, '0')}`,
    `${pick(['St Bartholomew', 'Royal Brompton', 'Addenbrooke', 'Queen Elizabeth'], i)}'s Hospital NHS Foundation Trust, Department of ${pick(['Clinical Pharmacology', 'Internal Medicine'], i)}`, orgId, site.id, MARK, 1]);
  await insertMany('contacts', ['type', 'specialty', 'first_name', 'last_name', 'email', 'phone', 'institution', 'org_id', 'site_id', 'notes', 'is_active'], contacts);

  const tx = Array.from({ length: 1000 }, (_, i) => [pick(seedCases, i * 3).id, admin.id, `${admin.name} (${MARK})`, pick(SYSTEMS, i),
    `AE report for ${pick(PRODUCTS, i)}; serious: ${i % 4 === 0 ? 'yes' : 'no'}`, pick(['Sent', 'SENT', 'Sent', 'Failed', 'NO_TARGET'], i), pick(['200', '200', '200', '500', '0'], i), daysAgo(i, 180)]);
  await insertMany('transmission_audit_trail', ['case_id', 'user_id', 'user_name', 'target_system', 'payload_summary', 'status', 'response_code', 'timestamp'], tx);

  const audit = Array.from({ length: 5000 }, (_, i) => [pick(seedCases, i).id, admin.id, `${admin.name} (${MARK})`, pick(['UPDATE', 'UPDATE', 'CREATE', 'STATUS_CHANGE'], i),
    pick(['priority', 'case_owner_id', 'description', 'status_id'], i), 'normal', pick(PRIORITIES, i), daysAgo(i, 365)]);
  await insertMany('case_audit_trail', ['case_id', 'user_id', 'user_name', 'action_type', 'field_name', 'old_value', 'new_value', 'timestamp'], audit);

  const notes = Array.from({ length: 500 }, (_, i) => [admin.id, pick(['case', 'sla', 'system'], i), `Case ${cases[i][0]} was assigned to you by ${name(i)}`,
    `Priority ${pick(PRIORITIES, i)}. Due in ${1 + (i % 9)} days.`, pick(['info', 'warning'], i), i % 2, daysAgo(i, 60), 'delivered', `${MARK}-${i}`]);
  await insertMany('notifications', ['user_id', 'category', 'title', 'message', 'severity', 'is_read', 'created_at', 'delivery_status', 'event_key'], notes);

  await pool.query(`INSERT INTO cm_folders (name, site_id, description, status, created_by, org_id) VALUES (?, ?, ?, 'active', ?, ?)`,
    ['Standard Responses: Cardiovascular and Respiratory Portfolio (EU and UK)', site.id, MARK, admin.id, orgId]);
  const [[folder]] = await pool.query(`SELECT id FROM cm_folders WHERE description = ? ORDER BY id DESC LIMIT 1`, [MARK]);
  const docs = Array.from({ length: 500 }, (_, i) => [folder.id, `SRL-${String(i).padStart(5, '0')}`, pick(['standard_response', 'letter', 'faq'], i),
    `Standard response: ${pick(PRODUCTS, i)} use in pregnancy, breastfeeding and patients over 75 years (version ${1 + (i % 4)})`, pick(['draft', 'approved', 'published', 'retired'], i), MARK, admin.id, daysAgo(i, 400)]);
  await insertMany('cm_documents', ['folder_id', 'doc_id', 'doc_type', 'name', 'status', 'search_tags', 'created_by', 'created_at'], docs);
}

(async () => {
  if (process.env.NODE_ENV === 'production') { console.error('Refusing to run: NODE_ENV is production.'); process.exit(1); }
  if (!has('--yes') || (!has('--remove') && !Number.isInteger(orgId))) {
    console.error('Usage: seed-volume.js --org <id> --yes   or   seed-volume.js --remove --yes');
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
