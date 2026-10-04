const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// F5-01: the eight readiness checks. CPPM-136: the one rule for readiness — the
// client Overview and the dashboard both show this score, so they cannot disagree,
// and no point is given without checking something.
async function readinessChecks(pool, id) {
  const [[branding]] = await pool.execute('SELECT * FROM cp_branding WHERE client_id = ?', [id]);
  const [[{ cnt: enabledFeatureCount }]] = await pool.execute('SELECT COUNT(*) as cnt FROM cp_features WHERE client_id = ? AND is_enabled = 1', [id]);
  const [[{ cnt: newsCount }]] = await pool.execute("SELECT COUNT(*) as cnt FROM cp_news_posts WHERE client_id = ? AND status = 'published'", [id]);
  const [[{ cnt: safetyCount }]] = await pool.execute("SELECT COUNT(*) as cnt FROM cp_safety_alerts WHERE client_id = ? AND status = 'active'", [id]);
  const [[{ cnt: docCount }]] = await pool.execute("SELECT COUNT(*) as cnt FROM cp_documents WHERE client_id = ? AND is_active = 1 AND status = 'published'", [id]);
  const [[{ cnt: mslCount }]] = await pool.execute('SELECT COUNT(*) as cnt FROM cp_msls WHERE client_id = ? AND is_active = 1', [id]);
  const [[compliance]] = await pool.execute('SELECT * FROM cp_compliance_config WHERE client_id = ?', [id]);

  const checks = [
    { key: 'branding',     label: 'Branding configured',          done: !!(branding?.logo_url && branding?.portal_name),          hint: 'Upload a logo and set a portal name', path: 'branding' },
    { key: 'logo',         label: 'Logo uploaded',                done: !!branding?.logo_url,                                      hint: 'Upload a logo in Branding & Theme', path: 'branding' },
    { key: 'compliance',   label: 'Compliance enabled',           done: !!(compliance && compliance.jurisdictions_json !== '[]'),  hint: 'Configure compliance jurisdictions', path: 'compliance' },
    { key: 'features',     label: 'Features configured',          done: enabledFeatureCount > 0,                                   hint: 'Enable at least one portal feature', path: 'features' },
    { key: 'news',         label: 'News post published',          done: newsCount > 0,                                             hint: 'Publish at least one news post', path: 'news' },
    { key: 'content',      label: 'Safety alert or document live', done: safetyCount > 0 || docCount > 0,                          hint: 'Add a safety alert or publish a document', path: 'documents' },
    { key: 'msl',          label: 'MSL added',                    done: mslCount > 0,                                              hint: 'Add at least one Medical Science Liaison', path: 'msls' },
    { key: 'portal_url',   label: 'Custom brand color set',       done: !!(branding?.primary_color && branding.primary_color !== '#2563EB'), hint: 'Set a custom brand color in Branding & Theme', path: 'branding' },
  ];

  const doneCount = checks.filter(c => c.done).length;
  const score = Math.round((doneCount / checks.length) * 100);
  const label = score >= 90 ? 'Ready' : score >= 60 ? 'Almost Ready' : 'Not Ready';

  return { checks, score, label, done: doneCount, total: checks.length };
}

function readinessForClient(client, expiredDocCounts, readiness, now = Date.now()) {
  const readiness_score = readiness.score;
  const readiness_label = readiness.label;
  const expired_doc_count = expiredDocCounts[client.id] || 0;
  const news_stale = !!client.latest_news_at && (now - new Date(client.latest_news_at).getTime()) > THIRTY_DAYS_MS;

  return { ...client, readiness_score, readiness_label, expired_doc_count, news_stale };
}

async function listClients(pool) {
  const [rows] = await pool.execute(`
    SELECT c.*,
      COUNT(DISTINCT CASE WHEN s.status != 'closed' THEN s.id END) as submission_count,
      b.logo_url, b.portal_name, b.primary_color,
      COUNT(DISTINCT f.id)  as enabled_feature_count,
      COUNT(DISTINCT m.id)  as msl_count,
      MAX(n.publish_at)     as latest_news_at
    FROM cp_clients c
    LEFT JOIN cp_submissions s  ON s.client_id = c.id
    LEFT JOIN cp_branding b     ON b.client_id = c.id
    LEFT JOIN cp_features f     ON f.client_id = c.id AND f.is_enabled = 1
    LEFT JOIN cp_msls m         ON m.client_id = c.id AND m.is_active = 1
    LEFT JOIN cp_news_posts n   ON n.client_id = c.id AND n.status = 'published'
    GROUP BY c.id
    ORDER BY c.name ASC
  `);

  const [expiredDocRows] = await pool.execute(`
    SELECT client_id, COUNT(*) as cnt
    FROM cp_documents
    WHERE is_active = 1 AND status = 'published' AND expires_at IS NOT NULL AND expires_at <= NOW()
    GROUP BY client_id
  `);
  const expiredDocCounts = expiredDocRows.reduce((acc, row) => {
    acc[row.client_id] = row.cnt;
    return acc;
  }, {});

  // Documents expiring within the next 7 days (not yet expired) — proactive alert
  const [expiringSoonRows] = await pool.execute(`
    SELECT client_id, COUNT(*) as cnt
    FROM cp_documents
    WHERE is_active = 1 AND status = 'published'
      AND expires_at IS NOT NULL
      AND expires_at > NOW() AND expires_at <= (NOW() + INTERVAL 7 DAY)
    GROUP BY client_id
  `);
  const expiringSoonCounts = expiringSoonRows.reduce((acc, row) => {
    acc[row.client_id] = row.cnt;
    return acc;
  }, {});

  // CPPM-130: what each client has waiting on someone — the same counts the Inbox
  // shows (Safety Queue, Review Queue, Access Requests, Data Requests).
  const [waitingRows] = await pool.execute(`
    SELECT c.id AS client_id,
      (SELECT COUNT(*) FROM cp_ae_review_tasks t WHERE t.client_id = c.id AND t.status = 'open') AS safety,
      (SELECT COUNT(*) FROM cp_news_posts n WHERE n.client_id = c.id AND n.status = 'review')
        + (SELECT COUNT(*) FROM cp_documents d WHERE d.client_id = c.id AND d.status = 'review' AND d.is_active = 1) AS review,
      (SELECT COUNT(*) FROM cp_portal_users u WHERE u.client_id = c.id AND u.access_status = 'requested') AS access,
      (SELECT COUNT(*) FROM cp_data_requests r WHERE r.client_id = c.id AND r.status = 'pending') AS data_requests
    FROM cp_clients c WHERE c.is_active = 1
  `);
  const waiting = Object.fromEntries(waitingRows.map(r => [r.client_id, {
    safety: Number(r.safety), review: Number(r.review), access: Number(r.access), data_requests: Number(r.data_requests),
  }]));

  // CPPM-138: each client's lowest confirmation rate among live, active high and
  // critical safety letters — the same rule as Reports › Safety Confirmations.
  const { confirmationData } = require('./safetyConfirmations');
  const lowest = {};
  for (const c of rows) {
    const live = (await confirmationData(c.id))
      .filter(l => l.status === 'active' && l.addressed > 0 && (!l.publish_at || new Date(l.publish_at) <= new Date()));
    if (!live.length) { lowest[c.id] = null; continue; }
    const worst = live.reduce((w, l) => (l.confirmed / l.addressed < w.confirmed / w.addressed ? l : w));
    // Rounded as the report rounds, so the two always show the same figure.
    lowest[c.id] = { rate: Math.round(100 * worst.confirmed / worst.addressed), letter_id: worst.id, letter_title: worst.title };
  }

  const readiness = {};
  for (const c of rows) readiness[c.id] = await readinessChecks(pool, c.id);

  return rows.map(client => ({
    ...readinessForClient(client, expiredDocCounts, readiness[client.id]),
    expiring_soon_doc_count: expiringSoonCounts[client.id] || 0,
    waiting: waiting[client.id] || { safety: 0, review: 0, access: 0, data_requests: 0 },
    safety_confirmation: lowest[client.id],
  }));
}

async function getClientBundle(pool, clientId) {
  const [[client]] = await pool.execute('SELECT * FROM cp_clients WHERE id = ?', [clientId]);
  if (!client) return null;
  const [[branding]] = await pool.execute('SELECT * FROM cp_branding WHERE client_id = ?', [clientId]);
  const [features] = await pool.execute('SELECT * FROM cp_features WHERE client_id = ? ORDER BY display_order ASC', [clientId]);
  return { client, branding: branding || null, features };
}

module.exports = { getClientBundle, listClients, readinessForClient, readinessChecks };
