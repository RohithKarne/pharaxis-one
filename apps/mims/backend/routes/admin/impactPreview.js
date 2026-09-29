/**
 * impactPreview.js — D2: Master-data Impact Preview
 * POST /api/admin/impact-preview
 * Returns blast-radius counts before admin publishes changes to:
 *   - field_definition: form field label/type/options changes
 *   - taxonomy:         picklist value changes
 *   - workflow_rule:    state / transition rule changes
 */

const express = require('express');
const router  = express.Router();
const pool    = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');

// ── TTL cache: 5 min keyed by org+change_type+entity_id ──────────────────────
const _impactCache = new Map();
const IMPACT_TTL   = 5 * 60 * 1000;

function impactCacheGet(key) {
  const e = _impactCache.get(key);
  if (!e || Date.now() - e.ts > IMPACT_TTL) { _impactCache.delete(key); return null; }
  return e.data;
}
function impactCacheSet(key, data) { _impactCache.set(key, { ts: Date.now(), data }); }

// ── Risk level helper ─────────────────────────────────────────────────────────
function riskLevel(affectedCases) {
  if (affectedCases > 100) return 'high';
  if (affectedCases > 10)  return 'medium';
  return 'low';
}

// ── POST /api/admin/impact-preview ───────────────────────────────────────────
router.post('/impact-preview', authenticate, async (req, res) => {
  const { change_type, entity_id } = req.body;
  if (!change_type || !entity_id) {
    return res.status(400).json({ error: 'change_type and entity_id are required.' });
  }

  const orgId   = req.user.orgId;
  const cacheKey = `${orgId}:${change_type}:${entity_id}`;
  const cached   = impactCacheGet(cacheKey);
  if (cached) return res.json(cached);

  try {
    let impact = {};

    // ── Change type: field_definition ────────────────────────────────────────
    if (change_type === 'field_definition') {
      // entity_id is a field_setup id; values reference it as field_id. Counts are
      // this org's cases only. (Was field_definition_id + a case_form_fields table
      // that does not exist, the latter hidden behind a catch that returned 0.)
      const [[dynVals]] = await pool.execute(
        `SELECT COUNT(*) AS cnt FROM case_dynamic_field_values v
           JOIN cases c ON c.id = v.case_id
          WHERE v.field_id = ? AND c.org_id = ?`,
        [entity_id, orgId]
      );
      // Case forms (MI / AE / PC) that show this field's section.
      const [[formConfigs]] = await pool.execute(
        `SELECT COUNT(*) AS cnt FROM case_form_definition d
           JOIN field_setup f ON f.section_name = d.section_name
          WHERE f.id = ? AND d.org_id = ? AND d.is_visible = 1`,
        [entity_id, orgId]
      );

      // Breakdown by case type
      const [byType] = await pool.execute(
        `SELECT c.case_type, COUNT(*) AS cnt
         FROM case_dynamic_field_values v
         JOIN cases c ON c.id = v.case_id
         WHERE v.field_id = ? AND c.org_id = ?
         GROUP BY c.case_type`,
        [entity_id, orgId]
      );
      const breakdownByCaseType = {};
      byType.forEach(r => { breakdownByCaseType[r.case_type] = Number(r.cnt); });

      const affectedCases = Number(dynVals.cnt || 0);
      impact = {
        change_type:          'field_definition',
        entity_id:            Number(entity_id),
        affected_cases:       affectedCases,
        affected_form_configs:Number(formConfigs.cnt || 0),
        breakdown_by_case_type: breakdownByCaseType,
        risk_level:           riskLevel(affectedCases),
        warnings:             affectedCases > 0
          ? [`${affectedCases} existing case record(s) store values for this field. Changing the field type may cause rendering issues.`]
          : [],
      };
    }

    // ── Change type: taxonomy ─────────────────────────────────────────────────
    else if (change_type === 'taxonomy') {
      // entity_id is a picklist row id; case records store the picklist VALUE, so
      // look it up and count this org's records holding it. (Was: the id compared
      // against AE columns that do not exist, behind catches that returned 0.)
      const [[pick]] = await pool.execute(
        'SELECT value FROM picklists WHERE id = ? AND org_id = ?',
        [entity_id, orgId]
      );
      if (!pick) return res.status(404).json({ error: 'Picklist value not found for this organisation.' });

      // Picklist value used in AE general
      const [[aeCount]] = await pool.execute(
        `SELECT COUNT(*) AS cnt FROM case_ae_general g
           JOIN case_ae_versions v ON v.id = g.version_id
           JOIN cases c ON c.id = v.case_id
          WHERE c.org_id = ? AND ? IN (g.ae_status, g.report_type, g.regulatory_reportability)`,
        [orgId, pick.value]
      );

      // Picklist value used in PC general
      const [[pcCount]] = await pool.execute(
        `SELECT COUNT(*) AS cnt FROM case_pc_general g
           JOIN case_pc_versions v ON v.id = g.version_id
           JOIN cases c ON c.id = v.case_id
          WHERE c.org_id = ? AND ? IN (g.pc_status, g.pc_category, g.pc_classification, g.severity)`,
        [orgId, pick.value]
      );

      // Dynamic field values matching this taxonomy value
      const [[dynCount]] = await pool.execute(
        `SELECT COUNT(*) AS cnt FROM case_dynamic_field_values dv
           JOIN cases c ON c.id = dv.case_id
          WHERE c.org_id = ? AND dv.field_value = ?`,
        [orgId, pick.value]
      );

      const totalAffected = Number(aeCount.cnt || 0) + Number(pcCount.cnt || 0) + Number(dynCount.cnt || 0);
      impact = {
        change_type:         'taxonomy',
        entity_id:           Number(entity_id),
        affected_ae_records: Number(aeCount.cnt || 0),
        affected_pc_records: Number(pcCount.cnt || 0),
        affected_dynamic_values: Number(dynCount.cnt || 0),
        affected_cases:      totalAffected,
        risk_level:          riskLevel(totalAffected),
        warnings:            totalAffected > 0
          ? [`${totalAffected} existing record(s) reference this taxonomy value. Renaming the value label is safe; deleting or changing the key may break historical records.`]
          : [],
      };
    }

    // ── Change type: workflow_rule ────────────────────────────────────────────
    else if (change_type === 'workflow_rule') {
      // Cases currently in the affected workflow state
      const [[casesInState]] = await pool.execute(
        `SELECT COUNT(*) AS cnt FROM cases c
         JOIN workflow_states ws ON ws.id = c.status_id
         WHERE ws.id = ? AND c.org_id = ?`,
        [entity_id, orgId]
      ).catch(() => [[{ cnt: 0 }]]);

      // Workflow rules referencing this state (from_state or to_state)
      const [[rulesCount]] = await pool.execute(
        `SELECT COUNT(*) AS cnt FROM workflow_rules
         WHERE from_state_id = ? OR to_state_id = ?`,
        [entity_id, entity_id]
      ).catch(() => [[{ cnt: 0 }]]);

      // Orgs using this state
      const [orgRows] = await pool.execute(
        `SELECT DISTINCT c.org_id FROM cases c
         JOIN workflow_states ws ON ws.id = c.status_id
         WHERE ws.id = ?`,
        [entity_id]
      ).catch(() => [[]]);

      const strandedCases = Number(casesInState.cnt || 0);
      impact = {
        change_type:         'workflow_rule',
        entity_id:           Number(entity_id),
        cases_in_state:      strandedCases,
        referencing_rules:   Number(rulesCount.cnt || 0),
        affected_orgs:       orgRows.length,
        affected_cases:      strandedCases,
        risk_level:          riskLevel(strandedCases),
        warnings:            strandedCases > 0
          ? [`⚠ ${strandedCases} active case(s) are currently in this state. Removing or renaming the state may strand these cases.`]
          : [],
      };
    }

    else {
      return res.status(400).json({ error: `Unknown change_type: ${change_type}. Must be field_definition, taxonomy, or workflow_rule.` });
    }

    impactCacheSet(cacheKey, impact);
    res.json(impact);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
