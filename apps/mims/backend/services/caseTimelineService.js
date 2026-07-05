'use strict';

/**
 * caseTimelineService.js — Sprint 2 #13: unified case chronology.
 *
 * Aggregates all events related to a case into a single chronological feed:
 *   - audit_logs            (CRUD / state changes captured by the auditAutoCapture middleware)
 *   - case_audit_trail      (case-level domain events)
 *   - field_value_history   (every field change with reason, Wave 0 #2)
 *   - esign_events          (e-signatures on transitions / MI responses)
 *   - case_comments         (Theme 5)
 *   - case_mentions         (Theme 5)
 *   - case_state_timings    (Sprint 2 #11)
 *   - case_ha_clocks        (Sprint 1 #1, if table exists)
 *   - icsr_reports + icsr_acknowledgements (Sprint 1 #6, #7)
 *   - transmission_audit_trail
 *   - field_action_records  (Sprint 2 #28, where source_case_id = caseId)
 *   - capa_records          (Sprint 2 #20)
 *
 * The service handles missing tables gracefully (older schemas) — each sub-query
 * is in a separate try/catch so the timeline still returns if one source 500s.
 */

const pool = require('../database/db');

async function _q(sql, params) {
  try { const [rows] = await pool.execute(sql, params); return rows; }
  catch (_) { return []; }
}

/**
 * getTimeline({orgId, caseId, since?, limit?})
 *   → flat array of events { ts, type, title, detail, actor, meta }, newest first.
 */
async function getTimeline({ orgId, caseId, since = null, limit = 500 }) {
  const sinceParam = since ? new Date(since).toISOString().slice(0, 19).replace('T', ' ') : null;
  const events = [];

  // C-04: verify the case belongs to the caller's org before assembling the timeline.
  // Every sub-query below keys on caseId alone, so without this ownership gate an
  // authenticated user in one org could read any other org's full case chronology
  // (comments, e-signatures, field changes, transmissions).
  const owner = await _q('SELECT id FROM cases WHERE id = ? AND org_id = ?', [caseId, orgId]);
  if (!owner.length) return [];

  // Audit logs (CRUD / actions captured by middleware)
  events.push(...(await _q(
    `SELECT a.created_at AS ts, 'audit' AS type,
            a.action AS title, JSON_OBJECT('entity', a.entity, 'entity_id', a.entity_id) AS detail,
            u.name AS actor_name
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
      WHERE a.entity = 'case' AND a.entity_id = ?
        ${sinceParam ? 'AND a.created_at >= ?' : ''}
      ORDER BY a.created_at DESC LIMIT ?`,
    sinceParam ? [caseId, sinceParam, Number(limit)] : [caseId, Number(limit)]
  )));

  // Case-level audit trail
  events.push(...(await _q(
    `SELECT t.created_at AS ts, 'case_audit' AS type, t.action_type AS title,
            JSON_OBJECT('summary', t.action_summary, 'detail', t.action_detail) AS detail,
            u.name AS actor_name
       FROM case_audit_trail t
       LEFT JOIN users u ON u.id = t.changed_by
      WHERE t.case_id = ?
        ${sinceParam ? 'AND t.created_at >= ?' : ''}
      ORDER BY t.created_at DESC LIMIT ?`,
    sinceParam ? [caseId, sinceParam, Number(limit)] : [caseId, Number(limit)]
  )));

  // Field-value history (Wave 0 #2)
  events.push(...(await _q(
    `SELECT h.changed_at AS ts, 'field_change' AS type,
            CONCAT(h.section_name, '/', h.field_name) AS title,
            JSON_OBJECT('old', h.old_value, 'new', h.new_value, 'reason', h.reason) AS detail,
            u.name AS actor_name
       FROM field_value_history h
       LEFT JOIN users u ON u.id = h.changed_by
      WHERE h.entity_type = 'case' AND h.entity_id = ?
        ${sinceParam ? 'AND h.changed_at >= ?' : ''}
      ORDER BY h.changed_at DESC LIMIT ?`,
    sinceParam ? [caseId, sinceParam, Number(limit)] : [caseId, Number(limit)]
  )));

  // E-sign events
  events.push(...(await _q(
    `SELECT e.created_at AS ts, 'esign' AS type, e.transition AS title,
            JSON_OBJECT('meaning', e.meaning, 'from', e.from_status, 'to', e.to_status, 'hash', e.hash_chain) AS detail,
            COALESCE(u.name, e.signed_name) AS actor_name
       FROM esign_events e
       LEFT JOIN users u ON u.id = e.signed_by
      WHERE e.case_id = ?
        ${sinceParam ? 'AND e.created_at >= ?' : ''}
      ORDER BY e.created_at DESC LIMIT ?`,
    sinceParam ? [caseId, sinceParam, Number(limit)] : [caseId, Number(limit)]
  )));

  // Comments
  events.push(...(await _q(
    `SELECT c.created_at AS ts, 'comment' AS type, COALESCE(c.field_name, c.section_name, 'case') AS title,
            JSON_OBJECT('body', SUBSTRING(c.body_md, 1, 240), 'field', c.field_name, 'section', c.section_name, 'resolved', c.resolved) AS detail,
            u.name AS actor_name
       FROM case_comments c
       LEFT JOIN users u ON u.id = c.author_id
      WHERE c.case_id = ? AND c.deleted_at IS NULL
        ${sinceParam ? 'AND c.created_at >= ?' : ''}
      ORDER BY c.created_at DESC LIMIT ?`,
    sinceParam ? [caseId, sinceParam, Number(limit)] : [caseId, Number(limit)]
  )));

  // Mentions
  events.push(...(await _q(
    `SELECT m.created_at AS ts, 'mention' AS type, 'mention' AS title,
            JSON_OBJECT('mentioned_user_id', m.mentioned_user_id) AS detail,
            u.name AS actor_name
       FROM case_mentions m
       LEFT JOIN users u ON u.id = m.mentioned_by_user_id
      WHERE m.case_id = ?
        ${sinceParam ? 'AND m.created_at >= ?' : ''}
      ORDER BY m.created_at DESC LIMIT ?`,
    sinceParam ? [caseId, sinceParam, Number(limit)] : [caseId, Number(limit)]
  )));

  // State timings (Sprint 2 #11)
  events.push(...(await _q(
    `SELECT t.entered_at AS ts, 'state_enter' AS type, t.state AS title,
            JSON_OBJECT('sla_hours', t.sla_hours_snapshot, 'breached', t.breached_at IS NOT NULL) AS detail,
            u.name AS actor_name
       FROM case_state_timings t
       LEFT JOIN users u ON u.id = t.moved_by
      WHERE t.case_id = ? AND t.org_id = ?
        ${sinceParam ? 'AND t.entered_at >= ?' : ''}
      ORDER BY t.entered_at DESC LIMIT ?`,
    sinceParam ? [caseId, orgId, sinceParam, Number(limit)] : [caseId, orgId, Number(limit)]
  )));

  // ICSR submission lifecycle
  events.push(...(await _q(
    `SELECT r.created_at AS ts, 'icsr_initiated' AS type,
            CONCAT(r.submission_type, ' submission') AS title,
            JSON_OBJECT('report_id', r.id, 'sender_id', r.sender_safety_report_id, 'receiver', r.receiver_id, 'status', r.status) AS detail,
            u.name AS actor_name
       FROM icsr_reports r
       LEFT JOIN users u ON u.id = r.created_by
      WHERE r.case_id = ?
        ${sinceParam ? 'AND r.created_at >= ?' : ''}
      ORDER BY r.created_at DESC LIMIT ?`,
    sinceParam ? [caseId, sinceParam, Number(limit)] : [caseId, Number(limit)]
  )));

  // ACKs (Sprint 1 #6)
  events.push(...(await _q(
    `SELECT k.received_at AS ts, CONCAT('ack', LOWER(k.level)) AS type,
            CONCAT(k.level, ' received') AS title,
            JSON_OBJECT('status', k.ack_status, 'code', k.ack_code) AS detail,
            'gateway' AS actor_name
       FROM icsr_acknowledgements k
       JOIN icsr_reports r ON r.id = k.icsr_report_id
      WHERE r.case_id = ?
        ${sinceParam ? 'AND k.received_at >= ?' : ''}
      ORDER BY k.received_at DESC LIMIT ?`,
    sinceParam ? [caseId, sinceParam, Number(limit)] : [caseId, Number(limit)]
  )));

  // Transmissions
  events.push(...(await _q(
    `SELECT t.timestamp AS ts, 'transmission' AS type, t.target_system AS title,
            JSON_OBJECT('status', t.status, 'response_code', t.response_code, 'summary', t.payload_summary) AS detail,
            u.name AS actor_name
       FROM transmission_audit_trail t
       LEFT JOIN users u ON u.id = t.user_id
      WHERE t.case_id = ?
        ${sinceParam ? 'AND t.timestamp >= ?' : ''}
      ORDER BY t.timestamp DESC LIMIT ?`,
    sinceParam ? [caseId, sinceParam, Number(limit)] : [caseId, Number(limit)]
  )));

  // Field actions where this case is linked
  events.push(...(await _q(
    `SELECT fa.initiated_at AS ts, 'field_action' AS type, fa.action_number AS title,
            JSON_OBJECT('type', fa.action_type, 'class', fa.classification, 'status', fa.status,
                        'relation', fac.relation) AS detail,
            u.name AS actor_name
       FROM field_action_records fa
       JOIN field_action_cases fac ON fac.field_action_id = fa.id
       LEFT JOIN users u ON u.id = fa.initiated_by
      WHERE fac.case_id = ?
        ${sinceParam ? 'AND fa.initiated_at >= ?' : ''}
      ORDER BY fa.initiated_at DESC LIMIT ?`,
    sinceParam ? [caseId, sinceParam, Number(limit)] : [caseId, Number(limit)]
  )));

  // CAPA records sourced from this case
  events.push(...(await _q(
    `SELECT c.opened_at AS ts, 'capa' AS type, c.capa_number AS title,
            JSON_OBJECT('title', c.title, 'severity', c.severity, 'status', c.status) AS detail,
            u.name AS actor_name
       FROM capa_records c
       LEFT JOIN users u ON u.id = c.opened_by
      WHERE c.source_case_id = ?
        ${sinceParam ? 'AND c.opened_at >= ?' : ''}
      ORDER BY c.opened_at DESC LIMIT ?`,
    sinceParam ? [caseId, sinceParam, Number(limit)] : [caseId, Number(limit)]
  )));

  // ── Merge + sort newest-first, then truncate.
  events.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  return events.slice(0, Number(limit) || 500).map(e => ({
    ts: e.ts,
    type: e.type,
    title: e.title,
    detail: _safeJson(e.detail),
    actor: e.actor_name || null,
  }));
}

function _safeJson(v) {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return v; }
}

module.exports = { getTimeline };
