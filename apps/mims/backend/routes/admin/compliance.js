'use strict';

/**
 * compliance.js — Theme 9 surface (Wave 5).
 *
 * Endpoints (gated by cf.theme9_compliance):
 *   GET    /api/compliance/field-locks?status=&section=
 *   POST   /api/compliance/field-locks/check          body { section, field, status }
 *   GET    /api/admin/field-locks
 *   POST   /api/admin/field-locks                     body { id?, section_name, field_name, status, lock_mode, reason }
 *   DELETE /api/admin/field-locks/:id
 *
 *   POST   /api/cases/:caseId/esign                   body { transition, from_status?, to_status?, meaning?, reason?, auth_method?, password? }
 *   GET    /api/cases/:caseId/esign                   list e-sign events for a case
 *   GET    /api/admin/esign?case_id=&limit=
 *
 *   POST   /api/masked-reveal                         body { entity_type, entity_id, field, section?, reason }
 *                                                     → returns { ok:true, id } after logging (caller already has the value)
 *   GET    /api/admin/masked-reveal-log               query filters
 *
 *   GET    /api/compliance/audit-export.csv           inspector-ready CSV blob
 */

const express = require('express');
const router  = express.Router();
const { authenticate, requireRole } = require('../../middleware/auth');
const flags = require('../../services/featureFlagsService');
const compliance = require('../../services/complianceService');
const { csvEscape } = require('../../shared/csvHelpers');

const FLAG  = 'cf.theme9_compliance';
const ADMIN = ['admin', 'platform_admin'];

async function gated(req, res) {
  const on = await flags.isEnabledForOrg(FLAG, req.user.orgId);
  if (!on) { res.status(403).json({ error: 'Compliance hardening not enabled for this tenant.', flag: FLAG }); return false; }
  return true;
}
function clientMeta(req) {
  return {
    ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || null,
    userAgent: String(req.headers['user-agent'] || '').slice(0, 255),
  };
}

// ── Field locks ──────────────────────────────────────────────────────────────
router.get('/compliance/field-locks', authenticate, async (req, res) => {
  try {
    const on = await flags.isEnabledForOrg(FLAG, req.user.orgId);
    if (!on) return res.json({ enabled: false, locks: [] });
    res.json({ enabled: true, locks: await compliance.listLocks({ orgId: req.user.orgId }) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/compliance/field-locks/check', authenticate, async (req, res) => {
  try {
    const { section, field, status } = req.body || {};
    const on = await flags.isEnabledForOrg(FLAG, req.user.orgId);
    if (!on) return res.json({ enabled: false, locked: false });
    const r = await compliance.isFieldLocked({
      orgId: req.user.orgId, section, field, status, userRole: req.user.role,
    });
    res.json({ enabled: true, ...r });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/admin/field-locks', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    res.json({ locks: await compliance.listLocks({ orgId: req.user.orgId }) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/admin/field-locks', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const { id, org_id, section_name, field_name, status, lock_mode, reason } = req.body || {};
    await compliance.upsertLock({
      id, orgId: org_id ?? req.user.orgId ?? null,
      sectionName: section_name, fieldName: field_name, status,
      lockMode: lock_mode || 'read_only', reason, userId: req.user.userId,
    });
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/admin/field-locks/:id', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    await compliance.removeLock({ orgId: req.user.orgId, id: req.params.id });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── E-signature ──────────────────────────────────────────────────────────────
router.post('/cases/:caseId/esign', authenticate, async (req, res) => {
  try {
    if (!(await gated(req, res))) return;
    const { transition, from_status, to_status, meaning, reason, auth_method, password } = req.body || {};
    if (!transition) return res.status(400).json({ error: 'transition required' });
    const meta = clientMeta(req);
    const out = await compliance.captureESign({
      orgId: req.user.orgId, caseId: Number(req.params.caseId),
      transition, fromStatus: from_status || null, toStatus: to_status || null,
      signedBy: req.user.userId, signedName: req.user.name || req.user.email,
      meaning: meaning || `I confirm this ${transition} action under 21 CFR Part 11.`,
      reason: reason || null,
      authMethod: auth_method || 'password', password,
      ip: meta.ip, userAgent: meta.userAgent,
    });
    res.json({ ok: true, ...out });
  } catch (err) { res.status(401).json({ error: err.message }); }
});

router.get('/cases/:caseId/esign', authenticate, async (req, res) => {
  try {
    const on = await flags.isEnabledForOrg(FLAG, req.user.orgId);
    if (!on) return res.json({ enabled: false, events: [] });
    res.json({
      enabled: true,
      events: await compliance.listESignEvents({
        orgId: req.user.orgId, caseId: req.params.caseId, limit: req.query.limit,
      }),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/admin/esign', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    res.json({ events: await compliance.listESignEvents({
      orgId: req.user.orgId, caseId: req.query.case_id || null, limit: req.query.limit,
    }) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Masked reveal ────────────────────────────────────────────────────────────
router.post('/masked-reveal', authenticate, async (req, res) => {
  try {
    if (!(await gated(req, res))) return;
    const { entity_type, entity_id, field, section, reason } = req.body || {};
    const meta = clientMeta(req);
    const r = await compliance.logMaskedReveal({
      orgId: req.user.orgId, userId: req.user.userId,
      entityType: entity_type, entityId: entity_id, section, field, reason,
      ip: meta.ip, userAgent: meta.userAgent,
    });
    res.json({ ok: true, ...r });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.get('/admin/masked-reveal-log', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    res.json({
      reveals: await compliance.listMaskedReveals({
        orgId: req.user.orgId,
        entityType: req.query.entity_type || null,
        entityId:   req.query.entity_id   || null,
        userId:     req.query.user_id     || null,
        since:      req.query.since       || null,
        limit:      req.query.limit,
      }),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Compliance audit CSV export ──────────────────────────────────────────────
router.get('/compliance/audit-export.csv', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const { case_id } = req.query || {};
    const esigns  = await compliance.listESignEvents({ orgId: req.user.orgId, caseId: case_id || null, limit: 10_000 });
    const reveals = await compliance.listMaskedReveals({ orgId: req.user.orgId, entityType: 'case', entityId: case_id || null, limit: 10_000 });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="compliance-audit-${case_id || 'all'}.csv"`);
    const lines = ['event_type,timestamp,case_id,actor,detail,hash_chain,ip,user_agent'];
    for (const e of esigns) {
      lines.push([
        'esign', e.created_at?.toISOString?.() || e.created_at,
        e.case_id, e.signed_by_name || e.signed_name || e.signed_by,
        `${e.transition} ${e.from_status || ''}→${e.to_status || ''} ${e.meaning || ''} ${e.reason || ''}`,
        e.hash_chain || '', e.ip_address || '', e.user_agent || '',
      ].map(csvEscape).join(','));
    }
    for (const m of reveals) {
      lines.push([
        'masked_reveal', m.revealed_at?.toISOString?.() || m.revealed_at,
        m.entity_id, m.revealed_by_name || m.revealed_by_email || m.revealed_by,
        `${m.section_name || ''}/${m.field_name} ${m.reason || ''}`,
        '', m.ip_address || '', m.user_agent || '',
      ].map(csvEscape).join(','));
    }
    res.send(lines.join('\n'));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
