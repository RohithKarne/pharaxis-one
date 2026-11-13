'use strict';

// L3 (Rohith, 2026-11-13): personal emails per client. A client's company domains
// are the ones its company login lists plus its own list (company_email_domains).
// An email outside them is personal: refused unless the client allows personal
// emails, and then only with an access end date no more than 12 months away.
// A client with no domains listed cannot tell the two apart, so no rule applies.

const pool = require('../database/db');
const { parseAllowedDomains } = require('./ssoService');

const MAX_MONTHS = 12;

function emailDomain(email) {
  return String(email || '').split('@')[1]?.trim().toLowerCase() || '';
}

async function companyDomains(orgId, conn = pool) {
  const [[org]] = await conn.execute(
    'SELECT name, allow_personal_emails, company_email_domains FROM organisations WHERE id = ? LIMIT 1', [orgId]);
  if (!org) return null;
  const [sso] = await conn.execute(
    'SELECT allowed_domains FROM access_sso_provider_configs WHERE org_id = ? AND is_active = 1', [orgId]);
  const domains = new Set(parseAllowedDomains(org.company_email_domains));
  for (const row of sso) parseAllowedDomains(row.allowed_domains).forEach((d) => domains.add(d));
  return { name: org.name, allowPersonal: !!Number(org.allow_personal_emails), domains: [...domains] };
}

function toDay(value) {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value).slice(0, 10));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function latestAllowedDay(today = new Date()) {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + MAX_MONTHS, today.getUTCDate()));
  return d.toISOString().slice(0, 10);
}

// For an email joining these organisations: { error } to refuse, or { endsOn: {orgId: day|null} }.
async function checkOrgEmails({ email, orgIds, accessEndsOn, conn = pool, today = new Date() }) {
  const domain = emailDomain(email);
  const endsOn = {};
  const todayDay = today.toISOString().slice(0, 10);
  for (const orgId of (orgIds || []).map(Number).filter(Boolean)) {
    const policy = await companyDomains(orgId, conn);
    if (!policy || !policy.domains.length || policy.domains.includes(domain)) { endsOn[orgId] = null; continue; }
    if (!policy.allowPersonal) {
      return { error: `${policy.name} does not allow personal email addresses. Use an email at ${policy.domains.join(', ')}.` };
    }
    const day = toDay(accessEndsOn);
    if (!day) return { error: `${email} is a personal email address. ${policy.name} allows it for contractors only, with an "Access ends on" date.` };
    if (day <= todayDay) return { error: '"Access ends on" must be a date after today.' };
    if (day > latestAllowedDay(today)) return { error: `"Access ends on" can be at most ${MAX_MONTHS} months from today.` };
    endsOn[orgId] = day;
  }
  return { endsOn };
}

module.exports = { checkOrgEmails, companyDomains, emailDomain, MAX_MONTHS };
