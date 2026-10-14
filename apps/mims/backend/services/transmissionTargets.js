'use strict';

/**
 * transmissionTargets.js — where an AE or PC case is handed off to (Transmission
 * Setup, MI response and hand-off review, Rohith 2026-10-14).
 *
 * Two targets per organisation, kept as org_integrations rows the existing
 * hand-off engine already sends to:
 * - safety_system: receives AE cases (event case.ae.handoff);
 * - quality_system: receives PC cases (event case.pc.handoff).
 * The outbound key is stored encrypted in config.outbound_key_enc, never in
 * api_key (that column authenticates inbound API calls). config.handoff_days is
 * how many working days after awareness a case is due at the target; one by
 * default, the common commitment for passing safety and quality information on.
 */

const pool = require('../database/db');
const { encryptMailboxSecret, decryptMailboxSecret } = require('./mailboxCrypto');

const TARGETS = {
  safety_system: { label: 'Safety system', caseType: 'AE', event: 'case.ae.handoff' },
  quality_system: { label: 'Quality system', caseType: 'PC', event: 'case.pc.handoff' },
};
const DEFAULT_HANDOFF_DAYS = 1;

const parse = (v) => { if (!v) return {}; if (typeof v === 'object') return v; try { return JSON.parse(v) || {}; } catch { return {}; } };

async function getTargets(orgId, db = pool) {
  const [rows] = await db.execute(
    `SELECT id, integration_type, endpoint_url, enabled, config, last_sync_at FROM org_integrations
      WHERE org_id = ? AND integration_type IN ('safety_system', 'quality_system')`, [orgId]);
  return Object.entries(TARGETS).map(([type, t]) => {
    const row = rows.find(r => r.integration_type === type);
    const cfg = parse(row?.config);
    return {
      type, label: t.label, case_type: t.caseType,
      endpoint_url: row?.endpoint_url || '',
      enabled: !!row?.enabled,
      has_key: !!cfg.outbound_key_enc,
      handoff_days: Number.isFinite(Number(cfg.handoff_days)) && cfg.handoff_days !== null && cfg.handoff_days !== '' ? Number(cfg.handoff_days) : DEFAULT_HANDOFF_DAYS,
      last_sync_at: row?.last_sync_at || null,
    };
  });
}

async function saveTarget(orgId, type, body, db = pool) {
  if (!TARGETS[type]) throw Object.assign(new Error('Unknown target.'), { status: 400 });
  const [[row]] = await db.execute('SELECT id, config FROM org_integrations WHERE org_id = ? AND integration_type = ? LIMIT 1', [orgId, type]);
  const cfg = parse(row?.config);
  if (typeof body.api_key === 'string' && body.api_key.trim()) cfg.outbound_key_enc = encryptMailboxSecret(body.api_key.trim());
  if (body.clear_key) delete cfg.outbound_key_enc;
  if (body.handoff_days !== undefined) {
    const n = Math.round(Number(body.handoff_days));
    cfg.handoff_days = Number.isFinite(n) && n >= 0 && n <= 30 ? n : DEFAULT_HANDOFF_DAYS;
  }
  const endpoint = String(body.endpoint_url ?? '').trim() || null;
  const enabled = body.enabled ? 1 : 0;
  const triggers = JSON.stringify([TARGETS[type].event]);
  if (row) {
    await db.execute('UPDATE org_integrations SET endpoint_url = ?, enabled = ?, event_triggers = ?, config = ? WHERE id = ?',
      [endpoint, enabled, triggers, JSON.stringify(cfg), row.id]);
  } else {
    await db.execute(
      `INSERT INTO org_integrations (org_id, integration_type, endpoint_url, enabled, event_triggers, config) VALUES (?, ?, ?, ?, ?, ?)`,
      [orgId, type, endpoint, enabled, triggers, JSON.stringify(cfg)]);
  }
  return (await getTargets(orgId, db)).find(t => t.type === type);
}

// The key a webhook is sent with: the encrypted outbound key when the row has
// one, else the legacy api_key column.
function outboundKey(row) {
  const cfg = parse(row?.config);
  if (cfg.outbound_key_enc) { try { return decryptMailboxSecret(cfg.outbound_key_enc); } catch { return ''; } }
  return row?.api_key || '';
}

async function handoffDays(orgId, caseType, db = pool) {
  const type = caseType === 'PC' ? 'quality_system' : 'safety_system';
  return (await getTargets(orgId, db)).find(t => t.type === type)?.handoff_days ?? DEFAULT_HANDOFF_DAYS;
}

module.exports = { TARGETS, DEFAULT_HANDOFF_DAYS, getTargets, saveTarget, outboundKey, handoffDays };
