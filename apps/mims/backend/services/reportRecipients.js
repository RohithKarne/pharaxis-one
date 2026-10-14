'use strict';

/**
 * reportRecipients.js — who a scheduled report may be emailed to (reports
 * review, Saad 2026-10-14).
 *
 * A schedule emailed case data as a CSV to any address typed in, outside the
 * organisation included; the "delivery rules" with allowed domains were saved
 * and never applied (finding RS6). A recipient is now a person in the
 * organisation who can open Reports and is in the report's audience — checked
 * when the schedule is saved and again each time it sends.
 */

const pool = require('../database/db');
const { getUserModules } = require('../utils/userModules');
const { isAdminUser } = require('../utils/adminScope');
const { userHasActivityPrivilege } = require('./accessConfigurationService');
const { canSeeAudience } = require('./reportModuleService');

// Active members of the organisation who can open Reports.
async function eligibleRecipients(orgId) {
  const [rows] = await pool.execute(
    `SELECT u.id, u.name, LOWER(u.email) AS email, COALESCE(uoa.role_at_org, u.role) AS role
       FROM user_org_access uoa
       JOIN users u ON u.id = uoa.user_id
      WHERE uoa.org_id = ? AND uoa.is_active = 1 AND u.is_active = 1 AND COALESCE(u.is_disabled, 0) = 0
        AND u.email IS NOT NULL
      ORDER BY u.name`,
    [orgId]
  );
  const out = [];
  for (const row of rows) {
    if ((await getUserModules(row.id)).includes('reports')) out.push(row);
  }
  return out;
}

async function canReceive(orgId, person, audience) {
  const user = { userId: person.id, orgId, role: person.role };
  const viewer = { admin: isAdminUser(user), manage: await userHasActivityPrivilege(user, 'reports.manage') };
  return canSeeAudience(viewer, audience);
}

function parseAddresses(value) {
  return [...new Set(String(value || '').split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))];
}

// Splits the addresses into people who may receive the report and the rest.
async function checkRecipients(orgId, addresses, audience) {
  const people = await eligibleRecipients(orgId);
  const byEmail = new Map(people.map((p) => [p.email, p]));
  const allowed = [];
  const refused = [];
  for (const email of parseAddresses(addresses)) {
    const person = byEmail.get(email);
    if (person && await canReceive(orgId, person, audience)) allowed.push(person);
    else refused.push(email);
  }
  return { allowed, refused };
}

// The people a schedule for a report of this audience may be sent to.
async function recipientsFor(orgId, audience) {
  const out = [];
  for (const person of await eligibleRecipients(orgId)) {
    if (await canReceive(orgId, person, audience)) out.push({ name: person.name, email: person.email });
  }
  return out;
}

module.exports = { eligibleRecipients, checkRecipients, parseAddresses, recipientsFor };
