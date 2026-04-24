'use strict';

const pool = require('../database/db');

const DEFAULT_EVIDENCE_RULES = [
  {
    rule_name: 'Publish requires approved status',
    applies_to: 'document',
    mode_scope: 'publish',
    check_type: 'status_in',
    check_config: { values: ['Approved'] },
    severity: 'block',
    priority: 10,
  },
  {
    rule_name: 'Document must not be expired',
    applies_to: 'document',
    mode_scope: 'both',
    check_type: 'not_expired',
    check_config: {},
    severity: 'block',
    priority: 20,
  },
  {
    rule_name: 'Document needs minimum content',
    applies_to: 'document',
    mode_scope: 'both',
    check_type: 'min_content_length',
    check_config: { min: 80 },
    severity: 'block',
    priority: 30,
  },
  {
    rule_name: 'Document should have evidence attachment',
    applies_to: 'document',
    mode_scope: 'publish',
    check_type: 'min_attachment_count',
    check_config: { min: 1 },
    severity: 'warning',
    priority: 40,
  },
  {
    rule_name: 'Document should reference supporting content',
    applies_to: 'document',
    mode_scope: 'publish',
    check_type: 'min_reference_count',
    check_config: { min: 1 },
    severity: 'warning',
    priority: 50,
  },
  {
    rule_name: 'FAQ publish requires approved status',
    applies_to: 'faq',
    mode_scope: 'publish',
    check_type: 'status_in',
    check_config: { values: ['Approved'] },
    severity: 'block',
    priority: 10,
  },
  {
    rule_name: 'FAQ must not be expired',
    applies_to: 'faq',
    mode_scope: 'both',
    check_type: 'not_expired',
    check_config: {},
    severity: 'block',
    priority: 20,
  },
  {
    rule_name: 'FAQ should include enough answer detail',
    applies_to: 'faq',
    mode_scope: 'both',
    check_type: 'min_content_length',
    check_config: { min: 60 },
    severity: 'block',
    priority: 30,
  },
  {
    rule_name: 'Template response requires active status',
    applies_to: 'template',
    mode_scope: 'response',
    check_type: 'status_in',
    check_config: { values: ['Active'] },
    severity: 'block',
    priority: 10,
  },
  {
    rule_name: 'Template should include enough response text',
    applies_to: 'template',
    mode_scope: 'response',
    check_type: 'min_content_length',
    check_config: { min: 40 },
    severity: 'block',
    priority: 20,
  },
  {
    rule_name: 'Open contradiction findings should be resolved',
    applies_to: 'all',
    mode_scope: 'both',
    check_type: 'max_open_contradictions',
    check_config: { max: 0 },
    severity: 'warning',
    priority: 90,
  },
];

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'in', 'into', 'is', 'it', 'its', 'of', 'on', 'or',
  'that', 'the', 'to', 'was', 'were', 'will', 'with', 'this', 'these', 'those', 'their', 'there', 'than', 'then', 'about',
  'during', 'within', 'without', 'per', 'via', 'can', 'could', 'should', 'would', 'may', 'might', 'must', 'our', 'your',
  'they', 'them', 'you', 'we', 'he', 'she', 'his', 'her', 'also', 'very', 'more', 'most', 'such', 'any', 'all', 'each',
  'other', 'using', 'used', 'use', 'have', 'had', 'not', 'no'
]);

const NEGATION_WORDS = ['not', 'no', 'never', 'without', 'avoid', 'contraindicated', 'prohibited', 'deny', 'denied'];
const INCREASE_WORDS = ['increase', 'increases', 'higher', 'high', 'escalate', 'escalates', 'promote', 'promotes'];
const DECREASE_WORDS = ['decrease', 'decreases', 'lower', 'low', 'reduce', 'reduces', 'suppress', 'suppresses'];

const ALLOWED_CONTENT_TYPES = new Set(['document', 'faq', 'template', 'module']);
const ALLOWED_MODES = new Set(['publish', 'response', 'release']);

function parseJson(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeContentType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ALLOWED_CONTENT_TYPES.has(normalized) ? normalized : null;
}

function normalizeMode(value) {
  const normalized = String(value || 'publish').trim().toLowerCase();
  return ALLOWED_MODES.has(normalized) ? normalized : null;
}

function toInt(value, fallback = null) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function tokenSet(text) {
  const tokens = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
  return new Set(tokens);
}

function overlapTokens(setA, setB) {
  const overlap = [];
  for (const token of setA) {
    if (setB.has(token)) overlap.push(token);
  }
  return overlap;
}

function hasAnyWord(sentence, words) {
  const lower = String(sentence || '').toLowerCase();
  return words.some((word) => lower.includes(word));
}

function inferDirection(sentence) {
  if (hasAnyWord(sentence, INCREASE_WORDS)) return 'up';
  if (hasAnyWord(sentence, DECREASE_WORDS)) return 'down';
  return null;
}

function hasNegation(sentence) {
  return hasAnyWord(sentence, NEGATION_WORDS);
}

function splitSentences(text, maxSentences = 4) {
  const chunks = String(text || '')
    .split(/[.!?;\n]+/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length >= 40);
  return chunks.slice(0, maxSentences);
}

async function getContradictionCount(orgId, contentType, contentId) {
  if (!orgId || !contentType || !contentId) return 0;
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS total
       FROM contradiction_radar_findings
      WHERE org_id = ?
        AND status = 'open'
        AND (
          (left_source_type = ? AND left_source_id = ?)
          OR
          (right_source_type = ? AND right_source_id = ?)
        )`,
    [orgId, contentType, contentId, contentType, contentId]
  ).catch(() => [[{ total: 0 }]]);
  return Number(rows[0]?.total || 0);
}

function evaluateRule(rule, context) {
  const checkType = String(rule.check_type || '').trim();
  const cfg = parseJson(rule.check_config, {}) || {};
  const details = {
    check_type: checkType,
    expected: cfg,
    actual: null,
    message: '',
    passed: true,
  };

  if (checkType === 'status_in') {
    const values = Array.isArray(cfg.values) ? cfg.values.map((v) => String(v)) : [];
    details.actual = context.status;
    details.passed = values.includes(String(context.status));
    details.message = details.passed
      ? `Status ${context.status} is allowed.`
      : `Status ${context.status} is not allowed. Expected one of: ${values.join(', ') || 'none configured'}.`;
    return details;
  }

  if (checkType === 'not_expired') {
    details.actual = context.expiry_date || null;
    details.passed = !context.is_expired;
    details.message = details.passed ? 'Content is not expired.' : `Content expired on ${context.expiry_date}.`;
    return details;
  }

  if (checkType === 'min_content_length') {
    const min = toInt(cfg.min, 0);
    details.actual = context.content_length;
    details.passed = context.content_length >= min;
    details.message = details.passed
      ? `Content length ${context.content_length} meets minimum ${min}.`
      : `Content length ${context.content_length} is below minimum ${min}.`;
    return details;
  }

  if (checkType === 'min_attachment_count') {
    const min = toInt(cfg.min, 0);
    details.actual = context.attachment_count;
    details.passed = context.attachment_count >= min;
    details.message = details.passed
      ? `Attachment count ${context.attachment_count} meets minimum ${min}.`
      : `Attachment count ${context.attachment_count} is below minimum ${min}.`;
    return details;
  }

  if (checkType === 'min_reference_count') {
    const min = toInt(cfg.min, 0);
    details.actual = context.reference_count;
    details.passed = context.reference_count >= min;
    details.message = details.passed
      ? `Reference count ${context.reference_count} meets minimum ${min}.`
      : `Reference count ${context.reference_count} is below minimum ${min}.`;
    return details;
  }

  if (checkType === 'max_open_contradictions') {
    const max = toInt(cfg.max, 0);
    details.actual = context.open_contradictions;
    details.passed = context.open_contradictions <= max;
    details.message = details.passed
      ? `Open contradictions ${context.open_contradictions} within limit ${max}.`
      : `Open contradictions ${context.open_contradictions} exceed limit ${max}.`;
    return details;
  }

  details.actual = null;
  details.passed = true;
  details.message = `Unknown check_type ${checkType}. Ignored.`;
  return details;
}

async function listEvidenceRules(orgId, contentType, mode) {
  const [rows] = await pool.execute(
    `SELECT id, org_id, rule_name, applies_to, mode_scope, check_type, check_config, severity, priority, is_active, created_at, updated_at
       FROM evidence_chain_rules
      WHERE org_id = ?
        AND is_active = 1
        AND (applies_to = ? OR applies_to = 'all')
        AND (mode_scope = ? OR mode_scope = 'both')
      ORDER BY priority ASC, id ASC`,
    [orgId, contentType, mode]
  ).catch(() => [[]]);

  if (rows.length > 0) {
    return rows.map((row) => ({
      ...row,
      check_config: parseJson(row.check_config, {}),
    }));
  }

  return DEFAULT_EVIDENCE_RULES
    .filter((rule) => (rule.applies_to === 'all' || rule.applies_to === contentType)
      && (rule.mode_scope === 'both' || rule.mode_scope === mode))
    .map((rule, idx) => ({
      id: `default-${idx + 1}`,
      org_id: orgId,
      rule_name: rule.rule_name,
      applies_to: rule.applies_to,
      mode_scope: rule.mode_scope,
      check_type: rule.check_type,
      check_config: rule.check_config,
      severity: rule.severity,
      priority: rule.priority,
      is_active: 1,
    }));
}

async function getContentSnapshot(orgId, contentType, contentId) {
  const id = toInt(contentId, null);
  if (!orgId || !contentType || !id) return null;

  if (contentType === 'document') {
    const [rows] = await pool.execute(
      `SELECT
         d.id,
         d.status,
         d.expiry_date,
         d.name,
         d.content_html,
         d.search_tags,
         d.usage_instructions,
         d.regulatory_ref,
         d.file_name,
         d.file_path,
         (
           SELECT COUNT(*)
             FROM cm_document_attachments a
            WHERE a.document_id = d.id
         ) AS attachment_count,
         (
           SELECT COUNT(*)
             FROM cm_document_relations r
            WHERE r.doc_id = d.id OR r.related_doc_id = d.id
         ) AS reference_count
       FROM cm_documents d
       INNER JOIN cm_folders f ON f.id = d.folder_id
      WHERE d.id = ?
        AND f.org_id = ?
      LIMIT 1`,
      [id, orgId]
    );
    if (!rows[0]) return null;
    const row = rows[0];
    const combined = [row.name, row.content_html, row.search_tags, row.usage_instructions, row.regulatory_ref].filter(Boolean).join(' ');
    return {
      content_type: 'document',
      content_id: row.id,
      title: row.name,
      status: row.status,
      expiry_date: row.expiry_date,
      content_text: stripHtml(combined),
      content_length: stripHtml(combined).length,
      attachment_count: Number(row.attachment_count || (row.file_path ? 1 : 0)),
      reference_count: Number(row.reference_count || 0),
    };
  }

  if (contentType === 'faq') {
    const [rows] = await pool.execute(
      `SELECT f.id, f.status, f.expiry_date, f.question, f.answer_html, f.category
         FROM cm_faqs f
         INNER JOIN cm_folders fo ON fo.id = f.folder_id
        WHERE f.id = ?
          AND fo.org_id = ?
        LIMIT 1`,
      [id, orgId]
    );
    if (!rows[0]) return null;
    const row = rows[0];
    const combined = [row.question, row.answer_html, row.category].filter(Boolean).join(' ');
    return {
      content_type: 'faq',
      content_id: row.id,
      title: stripHtml(row.question).slice(0, 120),
      status: row.status,
      expiry_date: row.expiry_date,
      content_text: stripHtml(combined),
      content_length: stripHtml(combined).length,
      attachment_count: 0,
      reference_count: 0,
    };
  }

  if (contentType === 'template') {
    const [scopedRows] = await pool.execute(
      `SELECT t.id, t.status, t.name, t.subject, t.body_html
         FROM cm_templates t
         INNER JOIN user_org_access uoa
            ON uoa.user_id = t.created_by
           AND uoa.org_id = ?
           AND uoa.is_active = 1
        WHERE t.id = ?
        LIMIT 1`,
      [orgId, id]
    ).catch(() => [[]]);

    let row = scopedRows[0] || null;
    if (!row) {
      const [rows] = await pool.execute(
        `SELECT id, status, name, subject, body_html
           FROM cm_templates
          WHERE id = ?
          LIMIT 1`,
        [id]
      ).catch(() => [[]]);
      row = rows[0] || null;
    }
    if (!row) return null;

    const combined = [row.name, row.subject, row.body_html].filter(Boolean).join(' ');
    return {
      content_type: 'template',
      content_id: row.id,
      title: row.name,
      status: row.status,
      expiry_date: null,
      content_text: stripHtml(combined),
      content_length: stripHtml(combined).length,
      attachment_count: 0,
      reference_count: 0,
    };
  }

  return null;
}

function computeEvidenceRiskScore(context, blockers, warnings) {
  let score = 0;
  score += blockers.length * 25;
  score += warnings.length * 10;
  score += Math.min(20, context.open_contradictions * 5);
  if (context.is_expired) score += 20;
  if (context.mode === 'publish' && context.status !== 'Approved') score += 10;
  if (context.mode === 'response' && context.status !== 'Active' && context.content_type === 'template') score += 10;
  if (context.content_length < 40) score += 10;
  return clamp(score, 0, 100);
}

async function evaluateEvidenceChain({ orgId, contentType, contentId, mode = 'publish' }) {
  const normalizedType = normalizeContentType(contentType);
  const normalizedMode = normalizeMode(mode);
  const normalizedId = toInt(contentId, null);

  if (!orgId || !normalizedType || !normalizedMode || !normalizedId) {
    return {
      allow: false,
      result: 'block',
      blockers: ['Invalid org_id/content_type/content_id/mode.'],
      warnings: [],
      checks: [],
      risk_score: 100,
      context: null,
    };
  }

  const snapshot = await getContentSnapshot(orgId, normalizedType, normalizedId);
  if (!snapshot) {
    return {
      allow: false,
      result: 'block',
      blockers: ['Content not found in organisation scope.'],
      warnings: [],
      checks: [],
      risk_score: 100,
      context: null,
    };
  }

  const today = new Date();
  const expiryDate = snapshot.expiry_date ? new Date(snapshot.expiry_date) : null;
  const isExpired = Boolean(expiryDate && !Number.isNaN(expiryDate.getTime()) && expiryDate < new Date(today.toISOString().slice(0, 10)));
  const openContradictions = await getContradictionCount(orgId, normalizedType, normalizedId);

  const context = {
    org_id: orgId,
    content_type: normalizedType,
    content_id: normalizedId,
    mode: normalizedMode,
    status: snapshot.status,
    expiry_date: snapshot.expiry_date,
    is_expired: isExpired,
    content_length: snapshot.content_length,
    attachment_count: snapshot.attachment_count,
    reference_count: snapshot.reference_count,
    open_contradictions: openContradictions,
  };

  const rules = await listEvidenceRules(orgId, normalizedType, normalizedMode);
  const blockers = [];
  const warnings = [];
  const checks = [];

  for (const rule of rules) {
    const evalResult = evaluateRule(rule, context);
    const severity = String(rule.severity || 'block').toLowerCase();
    checks.push({
      rule_id: rule.id,
      rule_name: rule.rule_name,
      severity,
      status: evalResult.passed ? 'pass' : (severity === 'warning' ? 'warn' : 'fail'),
      check_type: rule.check_type,
      detail: evalResult.message,
      expected: evalResult.expected,
      actual: evalResult.actual,
    });

    if (!evalResult.passed) {
      if (severity === 'warning') warnings.push(evalResult.message);
      else blockers.push(evalResult.message);
    }
  }

  const riskScore = computeEvidenceRiskScore(context, blockers, warnings);
  const allow = blockers.length === 0;

  return {
    allow,
    result: allow ? 'allow' : 'block',
    risk_score: riskScore,
    blockers,
    warnings,
    checks,
    context,
    content: {
      type: snapshot.content_type,
      id: snapshot.content_id,
      title: snapshot.title,
      status: snapshot.status,
    },
  };
}

async function logEvidenceRun({ orgId, contentType, contentId, mode, requestedBy, evaluation, metadata = {} }) {
  const [result] = await pool.execute(
    `INSERT INTO evidence_chain_runs
      (org_id, content_type, content_id, mode, result, risk_score, blockers_json, warnings_json, evidence_json, request_json, requested_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      orgId,
      contentType,
      contentId,
      mode,
      evaluation.allow ? 'allow' : 'block',
      evaluation.risk_score,
      JSON.stringify(evaluation.blockers || []),
      JSON.stringify(evaluation.warnings || []),
      JSON.stringify(evaluation.checks || []),
      JSON.stringify(metadata || {}),
      requestedBy || null,
    ]
  ).catch(() => [{ insertId: null }]);
  return result?.insertId || null;
}

async function compileEvidenceChain({ orgId, contentType, contentId, mode = 'publish', requestedBy, metadata = {} }) {
  const evaluation = await evaluateEvidenceChain({ orgId, contentType, contentId, mode });
  const runId = await logEvidenceRun({
    orgId,
    contentType: normalizeContentType(contentType),
    contentId: toInt(contentId, null),
    mode: normalizeMode(mode),
    requestedBy,
    evaluation,
    metadata,
  });

  return {
    ...evaluation,
    run_id: runId,
  };
}

async function enforceEvidenceGate({ orgId, contentType, contentId, mode = 'publish', actorUserId, metadata = {} }) {
  const result = await compileEvidenceChain({
    orgId,
    contentType,
    contentId,
    mode,
    requestedBy: actorUserId,
    metadata,
  });
  return {
    allow: result.allow,
    run_id: result.run_id,
    result,
  };
}

async function listEvidenceRuns({ orgId, limit = 50 }) {
  const safeLimit = clamp(toInt(limit, 50), 1, 200);
  const [rows] = await pool.execute(
    `SELECT id, org_id, content_type, content_id, mode, result, risk_score, blockers_json, warnings_json, requested_by, created_at
       FROM evidence_chain_runs
      WHERE org_id = ?
      ORDER BY id DESC
      LIMIT ${safeLimit}`,
    [orgId]
  ).catch(() => [[]]);

  return rows.map((row) => ({
    ...row,
    blockers_json: parseJson(row.blockers_json, []),
    warnings_json: parseJson(row.warnings_json, []),
  }));
}

async function loadContradictionCorpus(orgId, includeNonPublished = false) {
  const docStatuses = includeNonPublished ? ['Draft', 'CheckedOut', 'Pending', 'Under Review', 'Approved', 'Published'] : ['Approved', 'Published'];
  const faqStatuses = includeNonPublished ? ['Draft', 'CheckedOut', 'Pending', 'Under Review', 'Approved', 'Published'] : ['Approved', 'Published'];
  const tmplStatuses = includeNonPublished ? ['Active', 'Inactive'] : ['Active'];

  const [documents] = await pool.execute(
    `SELECT d.id, d.name, d.content_html, d.usage_instructions
       FROM cm_documents d
       INNER JOIN cm_folders f ON f.id = d.folder_id
      WHERE f.org_id = ?
        AND d.status IN (${docStatuses.map(() => '?').join(',')})
      ORDER BY d.updated_at DESC
      LIMIT 80`,
    [orgId, ...docStatuses]
  ).catch(() => [[]]);

  const [faqs] = await pool.execute(
    `SELECT fq.id, fq.question, fq.answer_html
       FROM cm_faqs fq
       INNER JOIN cm_folders f ON f.id = fq.folder_id
      WHERE f.org_id = ?
        AND fq.status IN (${faqStatuses.map(() => '?').join(',')})
      ORDER BY fq.updated_at DESC
      LIMIT 80`,
    [orgId, ...faqStatuses]
  ).catch(() => [[]]);

  const [templates] = await pool.execute(
    `SELECT t.id, t.name, t.subject, t.body_html
       FROM cm_templates t
      WHERE t.status IN (${tmplStatuses.map(() => '?').join(',')})
      ORDER BY t.updated_at DESC
      LIMIT 80`,
    [...tmplStatuses]
  ).catch(() => [[]]);

  const sources = [];

  documents.forEach((row) => {
    const text = stripHtml([row.name, row.content_html, row.usage_instructions].filter(Boolean).join(' '));
    if (text.length < 40) return;
    sources.push({
      source_type: 'document',
      source_id: Number(row.id),
      title: row.name || `Document ${row.id}`,
      text,
      sentences: splitSentences(text),
    });
  });

  faqs.forEach((row) => {
    const text = stripHtml([row.question, row.answer_html].filter(Boolean).join(' '));
    if (text.length < 40) return;
    sources.push({
      source_type: 'faq',
      source_id: Number(row.id),
      title: stripHtml(row.question).slice(0, 120) || `FAQ ${row.id}`,
      text,
      sentences: splitSentences(text),
    });
  });

  templates.forEach((row) => {
    const text = stripHtml([row.name, row.subject, row.body_html].filter(Boolean).join(' '));
    if (text.length < 40) return;
    sources.push({
      source_type: 'template',
      source_id: Number(row.id),
      title: row.name || `Template ${row.id}`,
      text,
      sentences: splitSentences(text),
    });
  });

  return sources.slice(0, 180);
}

function classifyContradiction(sentenceA, sentenceB, overlapCount) {
  const negA = hasNegation(sentenceA);
  const negB = hasNegation(sentenceB);
  const dirA = inferDirection(sentenceA);
  const dirB = inferDirection(sentenceB);

  if (dirA && dirB && dirA !== dirB && overlapCount >= 3) {
    return {
      type: 'directional_conflict',
      rationale: 'Statements discuss same topic with opposite direction (increase vs decrease).',
      confidence: clamp(0.55 + overlapCount * 0.05, 0, 0.98),
    };
  }

  if (negA !== negB && overlapCount >= 4) {
    return {
      type: 'negation_mismatch',
      rationale: 'Statements share core tokens but one is negated and the other is not.',
      confidence: clamp(0.5 + overlapCount * 0.04, 0, 0.95),
    };
  }

  return null;
}

function buildAnchorKey(tokens, type) {
  return `${type}:${tokens.slice(0, 6).join('|')}`.slice(0, 190);
}

async function persistContradictionFinding(orgId, finding, detectedBy) {
  await pool.execute(
    `INSERT INTO contradiction_radar_findings
      (org_id, left_source_type, left_source_id, right_source_type, right_source_id, contradiction_type, anchor_key,
       overlap_score, confidence_score, left_snippet, right_snippet, rationale, status, detected_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)
     ON DUPLICATE KEY UPDATE
       overlap_score = GREATEST(overlap_score, VALUES(overlap_score)),
       confidence_score = GREATEST(confidence_score, VALUES(confidence_score)),
       left_snippet = VALUES(left_snippet),
       right_snippet = VALUES(right_snippet),
       rationale = VALUES(rationale),
       detected_by = VALUES(detected_by),
       detected_at = NOW(),
       status = IF(status = 'resolved', status, 'open')`,
    [
      orgId,
      finding.left_source_type,
      finding.left_source_id,
      finding.right_source_type,
      finding.right_source_id,
      finding.contradiction_type,
      finding.anchor_key,
      finding.overlap_score,
      finding.confidence_score,
      finding.left_snippet,
      finding.right_snippet,
      finding.rationale,
      detectedBy || null,
    ]
  ).catch(() => null);
}

async function listContradictionFindings({ orgId, status = 'open', limit = 100 }) {
  const safeLimit = clamp(toInt(limit, 100), 1, 300);
  const clauses = ['org_id = ?'];
  const params = [orgId];
  if (status && status !== 'all') {
    clauses.push('status = ?');
    params.push(status);
  }

  const [rows] = await pool.execute(
    `SELECT id, org_id, left_source_type, left_source_id, right_source_type, right_source_id,
            contradiction_type, anchor_key, overlap_score, confidence_score,
            left_snippet, right_snippet, rationale, status, detected_at, detected_by,
            resolved_at, resolved_by, resolution_note
       FROM contradiction_radar_findings
      WHERE ${clauses.join(' AND ')}
      ORDER BY detected_at DESC, id DESC
      LIMIT ${safeLimit}`,
    params
  ).catch(() => [[]]);

  return rows;
}

async function runContradictionScan({ orgId, minTokenOverlap = 4, limit = 50, includeNonPublished = false, requestedBy }) {
  const safeOverlap = clamp(toInt(minTokenOverlap, 4), 2, 8);
  const safeLimit = clamp(toInt(limit, 50), 1, 200);
  const corpus = await loadContradictionCorpus(orgId, includeNonPublished);

  const findings = [];

  for (let i = 0; i < corpus.length; i += 1) {
    const left = corpus[i];
    const leftSentences = left.sentences.length ? left.sentences : [left.text.slice(0, 300)];

    for (let j = i + 1; j < corpus.length; j += 1) {
      const right = corpus[j];
      if (left.source_type === right.source_type && left.source_id === right.source_id) continue;

      const rightSentences = right.sentences.length ? right.sentences : [right.text.slice(0, 300)];

      for (const sentenceA of leftSentences) {
        const setA = tokenSet(sentenceA);
        if (setA.size < safeOverlap) continue;

        for (const sentenceB of rightSentences) {
          const setB = tokenSet(sentenceB);
          if (setB.size < safeOverlap) continue;

          const overlap = overlapTokens(setA, setB);
          if (overlap.length < safeOverlap) continue;

          const verdict = classifyContradiction(sentenceA, sentenceB, overlap.length);
          if (!verdict) continue;

          const finding = {
            left_source_type: left.source_type,
            left_source_id: left.source_id,
            right_source_type: right.source_type,
            right_source_id: right.source_id,
            contradiction_type: verdict.type,
            overlap_score: overlap.length,
            confidence_score: verdict.confidence,
            anchor_key: buildAnchorKey(overlap, verdict.type),
            left_snippet: sentenceA.slice(0, 280),
            right_snippet: sentenceB.slice(0, 280),
            rationale: verdict.rationale,
            overlap_tokens: overlap.slice(0, 10),
          };

          findings.push(finding);
          if (findings.length >= safeLimit) break;
        }
        if (findings.length >= safeLimit) break;
      }
      if (findings.length >= safeLimit) break;
    }
    if (findings.length >= safeLimit) break;
  }

  for (const finding of findings) {
    await persistContradictionFinding(orgId, finding, requestedBy);
  }

  const latest = await listContradictionFindings({ orgId, status: 'open', limit: safeLimit });
  return {
    scanned_sources: corpus.length,
    generated_findings: findings.length,
    open_findings: latest,
  };
}

function summarizeRiskBand(score) {
  if (score >= 75) return 'high';
  if (score >= 45) return 'medium';
  return 'low';
}

function summarizeGate(score, blockedCount) {
  if (blockedCount > 0) return 'hold';
  if (score >= 75) return 'hold';
  if (score >= 45) return 'review';
  return 'go';
}

async function simulateDigitalTwinRelease({ orgId, scenarioName, changes = [], context = {}, simulatedBy }) {
  const startedAt = Date.now();
  const normalizedChanges = Array.isArray(changes)
    ? changes
      .map((item) => ({
        content_type: normalizeContentType(item?.content_type),
        content_id: toInt(item?.content_id, null),
        action: String(item?.action || 'publish').trim().toLowerCase(),
      }))
      .filter((item) => item.content_type && item.content_id)
    : [];

  const changeEvaluations = [];
  let totalUsage = 0;
  let totalContradictions = 0;
  let totalPolicyDenies = 0;

  for (const change of normalizedChanges) {
    const evidence = await evaluateEvidenceChain({
      orgId,
      contentType: change.content_type,
      contentId: change.content_id,
      mode: change.action === 'response' ? 'response' : 'publish',
    });

    const [[usage]] = await pool.execute(
      `SELECT COUNT(*) AS usage_count, COUNT(DISTINCT case_id) AS case_count
         FROM cm_content_usage
        WHERE content_type = ?
          AND content_id = ?
          AND used_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)`,
      [change.content_type, change.content_id]
    ).catch(() => [[{ usage_count: 0, case_count: 0 }]]);

    const [[policy]] = await pool.execute(
      `SELECT COUNT(*) AS deny_count
         FROM policy_decision_logs
        WHERE org_id = ?
          AND content_type = ?
          AND content_id = ?
          AND result = 'deny'
          AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
      [orgId, change.content_type, change.content_id]
    ).catch(() => [[{ deny_count: 0 }]]);

    const contradictionCount = await getContradictionCount(orgId, change.content_type, change.content_id);

    totalUsage += Number(usage.usage_count || 0);
    totalContradictions += contradictionCount;
    totalPolicyDenies += Number(policy.deny_count || 0);

    changeEvaluations.push({
      ...change,
      evidence,
      usage_count_90d: Number(usage.usage_count || 0),
      case_count_90d: Number(usage.case_count || 0),
      contradiction_count: contradictionCount,
      policy_denies_30d: Number(policy.deny_count || 0),
    });
  }

  const blockedChanges = changeEvaluations.filter((item) => !item.evidence.allow).length;
  const highRiskChanges = changeEvaluations.filter((item) => item.evidence.risk_score >= 70).length;

  let score = 0;
  score += blockedChanges * 30;
  score += highRiskChanges * 12;
  score += Math.min(20, Math.floor(totalUsage / 5));
  score += Math.min(20, totalContradictions * 5);
  score += Math.min(20, totalPolicyDenies * 4);

  if (context?.change_window_hours !== undefined && Number(context.change_window_hours) < 24) {
    score += 10;
  }

  score = clamp(score, 0, 100);
  const riskBand = summarizeRiskBand(score);
  const recommendedGate = summarizeGate(score, blockedChanges);

  const metrics = {
    total_changes: changeEvaluations.length,
    blocked_changes: blockedChanges,
    high_risk_changes: highRiskChanges,
    usage_events_90d: totalUsage,
    contradiction_findings: totalContradictions,
    policy_denies_30d: totalPolicyDenies,
    projected_sla_minutes: 20 + blockedChanges * 45 + totalContradictions * 8 + Math.min(180, Math.floor(totalUsage / 3)),
    risk_score: score,
    risk_band: riskBand,
    recommended_gate: recommendedGate,
  };

  const simulationMs = Date.now() - startedAt;

  const [insert] = await pool.execute(
    `INSERT INTO digital_twin_runs
      (org_id, scenario_name, request_json, metrics_json, risk_score, risk_band, recommended_gate, simulation_ms, simulated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      orgId,
      String(scenarioName || 'Untitled simulation').slice(0, 255),
      JSON.stringify({ changes: normalizedChanges, context: context || {} }),
      JSON.stringify({ ...metrics, change_evaluations: changeEvaluations }),
      metrics.risk_score,
      metrics.risk_band,
      metrics.recommended_gate,
      simulationMs,
      simulatedBy || null,
    ]
  ).catch(() => [{ insertId: null }]);

  return {
    run_id: insert?.insertId || null,
    scenario_name: String(scenarioName || 'Untitled simulation').slice(0, 255),
    metrics,
    change_evaluations: changeEvaluations,
    simulation_ms: simulationMs,
  };
}

async function ensureDefaultAdaptiveRiskRules(orgId, userId = null) {
  const [[existing]] = await pool.execute(
    'SELECT COUNT(*) AS total FROM adaptive_risk_rules WHERE org_id = ?',
    [orgId]
  ).catch(() => [[{ total: 0 }]]);

  if (Number(existing.total || 0) > 0) return;

  const defaults = [
    ['Auto approve low risk', 0, 24, 'auto_approve', 'none', 2, 10],
    ['Manager review', 25, 49, 'manager_review', 'manager', 8, 20],
    ['Medical review', 50, 69, 'medical_review', 'medical_reviewer', 12, 30],
    ['Compliance escalation', 70, 84, 'compliance_escalation', 'compliance_officer', 24, 40],
    ['Block release', 85, 100, 'block_release', 'compliance_officer', 48, 50],
  ];

  for (const rule of defaults) {
    await pool.execute(
      `INSERT INTO adaptive_risk_rules
        (org_id, rule_name, min_score, max_score, decision_action, escalation_role, sla_hours, priority, is_active, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [orgId, ...rule, userId, userId]
    ).catch(() => null);
  }
}

async function listAdaptiveRiskRules(orgId) {
  await ensureDefaultAdaptiveRiskRules(orgId);
  const [rows] = await pool.execute(
    `SELECT id, org_id, rule_name, min_score, max_score, decision_action, escalation_role, sla_hours, priority, is_active, created_at, updated_at
       FROM adaptive_risk_rules
      WHERE org_id = ?
      ORDER BY priority ASC, min_score ASC, id ASC`,
    [orgId]
  ).catch(() => [[]]);
  return rows;
}

function computeAdaptiveRiskScore(context = {}) {
  const evidenceBlockers = toInt(context.evidence_blockers, 0) || 0;
  const contradictions = toInt(context.contradiction_findings, 0) || 0;
  const projectedUsage = toInt(context.projected_usage, 0) || 0;
  const policyDenies = toInt(context.policy_denies_30d, 0) || 0;
  const changeWindowHours = toInt(context.change_window_hours, 24);
  const manualAdjustment = toInt(context.manual_risk_adjustment, 0) || 0;

  let score = 0;
  score += evidenceBlockers * 22;
  score += contradictions * 8;
  score += Math.min(20, Math.floor(projectedUsage / 10));
  score += Math.min(20, policyDenies * 4);
  if (changeWindowHours < 24) score += 10;
  score += manualAdjustment;

  return clamp(score, 0, 100);
}

async function evaluateAdaptiveRisk({ orgId, contextType = 'release', contextId = null, context = {}, decidedBy }) {
  await ensureDefaultAdaptiveRiskRules(orgId, decidedBy);

  const score = computeAdaptiveRiskScore(context);
  const [rules] = await pool.execute(
    `SELECT id, rule_name, min_score, max_score, decision_action, escalation_role, sla_hours, priority
       FROM adaptive_risk_rules
      WHERE org_id = ?
        AND is_active = 1
      ORDER BY priority ASC, min_score ASC, id ASC`,
    [orgId]
  ).catch(() => [[]]);

  const matchedRule = rules.find((rule) => score >= Number(rule.min_score) && score <= Number(rule.max_score)) || null;

  const decisionAction = matchedRule?.decision_action || (score >= 85
    ? 'block_release'
    : score >= 70
      ? 'compliance_escalation'
      : score >= 50
        ? 'medical_review'
        : score >= 25
          ? 'manager_review'
          : 'auto_approve');

  const escalationRole = matchedRule?.escalation_role || (decisionAction === 'auto_approve' ? 'none' : 'manager');
  const slaHours = toInt(matchedRule?.sla_hours, decisionAction === 'auto_approve' ? 2 : 12);

  const reason = `Risk score ${score} mapped to ${decisionAction} (${escalationRole}).`;

  const [insert] = await pool.execute(
    `INSERT INTO adaptive_risk_decisions
      (org_id, context_type, context_id, context_json, computed_score, decision_action, escalation_role, sla_hours, matched_rule_id, decision_reason, decided_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      orgId,
      String(contextType || 'release').slice(0, 60),
      contextId ? Number(contextId) : null,
      JSON.stringify(context || {}),
      score,
      decisionAction,
      escalationRole,
      slaHours,
      matchedRule?.id || null,
      reason,
      decidedBy || null,
    ]
  ).catch(() => [{ insertId: null }]);

  return {
    decision_id: insert?.insertId || null,
    computed_score: score,
    decision_action: decisionAction,
    escalation_role: escalationRole,
    sla_hours: slaHours,
    matched_rule_id: matchedRule?.id || null,
    decision_reason: reason,
  };
}

async function listDigitalTwinRuns({ orgId, limit = 30 }) {
  const safeLimit = clamp(toInt(limit, 30), 1, 200);
  const [rows] = await pool.execute(
    `SELECT id, org_id, scenario_name, risk_score, risk_band, recommended_gate, simulation_ms, simulated_by, created_at, metrics_json
       FROM digital_twin_runs
      WHERE org_id = ?
      ORDER BY id DESC
      LIMIT ${safeLimit}`,
    [orgId]
  ).catch(() => [[]]);
  return rows.map((row) => ({
    ...row,
    metrics_json: parseJson(row.metrics_json, {}),
  }));
}

async function listAdaptiveRiskDecisions({ orgId, limit = 50 }) {
  const safeLimit = clamp(toInt(limit, 50), 1, 300);
  const [rows] = await pool.execute(
    `SELECT id, org_id, context_type, context_id, context_json, computed_score, decision_action,
            escalation_role, sla_hours, matched_rule_id, decision_reason, decided_by, created_at
       FROM adaptive_risk_decisions
      WHERE org_id = ?
      ORDER BY id DESC
      LIMIT ${safeLimit}`,
    [orgId]
  ).catch(() => [[]]);
  return rows.map((row) => ({
    ...row,
    context_json: parseJson(row.context_json, {}),
  }));
}

module.exports = {
  normalizeContentType,
  normalizeMode,
  evaluateEvidenceChain,
  compileEvidenceChain,
  enforceEvidenceGate,
  listEvidenceRuns,
  runContradictionScan,
  listContradictionFindings,
  simulateDigitalTwinRelease,
  listDigitalTwinRuns,
  listAdaptiveRiskRules,
  evaluateAdaptiveRisk,
  listAdaptiveRiskDecisions,
};
