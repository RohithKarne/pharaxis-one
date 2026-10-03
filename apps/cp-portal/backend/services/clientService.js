const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function readinessForClient(client, expiredDocCounts, now = Date.now()) {
  let score = 0;
  if (client.logo_url) score += 20;
  if (client.portal_name) score += 15;
  if (client.enabled_feature_count >= 3) score += 20;
  else if (client.enabled_feature_count > 0) score += 10;
  score += 15;
  if (client.msl_count > 0) score += 10;
  if (client.submission_count > 0) score += 10;
  if (client.primary_color && client.primary_color !== '#2563EB') score += 10;

  const readiness_score = Math.min(100, score);
  const readiness_label = readiness_score >= 90 ? 'Ready'
    : readiness_score >= 60 ? 'Almost Ready'
    : 'Not Ready';
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
    WHERE c.is_active = 1
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

  return rows.map(client => ({
    ...readinessForClient(client, expiredDocCounts),
    expiring_soon_doc_count: expiringSoonCounts[client.id] || 0,
    waiting: waiting[client.id] || { safety: 0, review: 0, access: 0, data_requests: 0 },
  }));
}

async function getClientBundle(pool, clientId) {
  const [[client]] = await pool.execute('SELECT * FROM cp_clients WHERE id = ?', [clientId]);
  if (!client) return null;
  const [[branding]] = await pool.execute('SELECT * FROM cp_branding WHERE client_id = ?', [clientId]);
  const [features] = await pool.execute('SELECT * FROM cp_features WHERE client_id = ? ORDER BY display_order ASC', [clientId]);
  return { client, branding: branding || null, features };
}

module.exports = { getClientBundle, listClients, readinessForClient };
