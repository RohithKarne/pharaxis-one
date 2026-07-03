/**
 * Portal Documents — /api/portal/documents
 * F-04: Authenticated document list + download for portal users
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticatePortal, requirePortalAuth } = require('../../middleware/auth');
const { applyTranslation } = require('../../utils/translator');
const path = require('path');
const fs   = require('fs');
const http = require("http");

function httpPost(url, headers, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const data = typeof body === "string" ? body : JSON.stringify(body);
    const opts = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: "POST",
      headers: { ...headers, "Content-Length": Buffer.byteLength(data) },
    };
    const req = http.request(opts, (res) => {
      let raw = "";
      res.on("data", chunk => raw += chunk);
      res.on("end", () => resolve({
        ok: res.statusCode >= 200 && res.statusCode < 300,
        status: res.statusCode,
        json: () => Promise.resolve(JSON.parse(raw)),
      }));
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function isFeatureEnabled(clientId, featureKey) {
  const [[row]] = await pool.execute('SELECT is_enabled FROM cp_features WHERE client_id = ? AND feature_key = ?', [clientId, featureKey]);
  return row ? row.is_enabled === 1 : false;
}

// GET /api/portal/documents?clientCode=xxx
// Returns active documents visible to the user's user_type
router.get('/', authenticatePortal, requirePortalAuth, async (req, res) => {
  try {
    const { clientCode } = req.query;
    if (!clientCode) return res.status(400).json({ error: 'clientCode required.' });

    const [[client]] = await pool.execute('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1', [clientCode]);
    if (!client) return res.status(404).json({ error: 'Client not found.' });

    if (!await isFeatureEnabled(client.id, 'document_library')) {
      return res.status(403).json({ error: 'Document library is not enabled for this portal.' });
    }

    const userType = req.portalUser?.user_type || 'other';
    const lang     = req.query.lang || 'en';

    const [docs] = await pool.execute(`
      SELECT id, title, category, doc_type, file_name, file_size, mime_type, visible_to_json, source,
             version, download_count, created_at, translations_json
      FROM cp_documents
      WHERE client_id = ? AND is_active = 1
        AND (status = 'published' OR (status = 'scheduled' AND publish_at <= NOW()))
        AND (expires_at IS NULL OR expires_at > NOW())
        AND (publish_at IS NULL OR publish_at <= NOW())
      ORDER BY created_at DESC
    `, [client.id]);

    // Filter by user_type, then apply translations
    const filtered = docs
      .filter(doc => {
        const visibleTo = JSON.parse(doc.visible_to_json || '[]');
        return visibleTo.length === 0 || visibleTo.includes(userType);
      })
      .map(doc => applyTranslation(doc, lang, ['title']));

    const visibleCategoryNames = new Set(filtered.map(d => d.category).filter(Boolean));
    const [allCategories] = await pool.execute('SELECT * FROM cp_document_categories WHERE client_id = ? ORDER BY sort_order ASC', [client.id]);
    const categories = allCategories.filter(c => visibleCategoryNames.has(c.name));

    res.json({ documents: filtered, categories });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/portal/documents/ai-search
// Authenticated AI-assisted semantic document search
router.post('/ai-search', authenticatePortal, requirePortalAuth, async (req, res) => {
  try {
    const { clientCode, query } = req.body || {};
    if (!clientCode || !query) {
      return res.status(400).json({ error: 'clientCode and query required.' });
    }

    const [[client]] = await pool.execute('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1', [clientCode]);
    if (!client) return res.status(404).json({ error: 'Client not found.' });

    if (!await isFeatureEnabled(client.id, 'document_library')) {
      return res.status(403).json({ error: 'Document library is not enabled for this portal.' });
    }

    const [docs] = await pool.execute(`
      SELECT id, title, category, doc_type, file_size, expires_at
      FROM cp_documents
      WHERE client_id = ? AND is_active = 1
        AND (status = 'published' OR (status = 'scheduled' AND publish_at <= NOW()))
        AND (expires_at IS NULL OR expires_at > NOW())
        AND (publish_at IS NULL OR publish_at <= NOW())
      ORDER BY created_at DESC
    `, [client.id]);

    const context = docs.map(doc => ({
      id: doc.id,
      title: doc.title,
      category: doc.category,
      doc_type: doc.doc_type,
    }));

    let aiResponse;
    try {
      aiResponse = await httpPost("http://localhost:6000/api/v1/agent/query", { "Content-Type": "application/json", "Authorization": "Bearer " + process.env.AI_AGENT_INTERNAL_TOKEN }, JSON.stringify({ org_id: client.id, app_source: "cp_portal", query_type: "document_search", payload: { query, context: { documents: context } } }));
    } catch (_) {
      return res.json({ ai_unavailable: true, results: [] });
    }

    if (!aiResponse.ok) {
      return res.json({ ai_unavailable: true, results: [] });
    }

    let aiJson;
    try {
      aiJson = await aiResponse.json();
    } catch (_) {
      return res.json({ ai_unavailable: true, results: [] });
    }

    const rawResults = Array.isArray(aiJson?.results)
      ? aiJson.results
      : Array.isArray(aiJson?.data?.results)
        ? aiJson.data.results
        : Array.isArray(aiJson?.payload?.results)
          ? aiJson.payload.results
          : [];

    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const docsByLowerTitle = new Map(
      docs
        .filter(doc => doc.title)
        .map(doc => [String(doc.title).trim().toLowerCase(), doc])
    );

    const results = rawResults
      .map(item => {
        const aiTitle = String(item?.title || '').trim();
        if (!aiTitle) return null;
        const doc = docsByLowerTitle.get(aiTitle.toLowerCase());
        if (!doc) return null;

        const expiresAtMs = doc.expires_at ? new Date(doc.expires_at).getTime() : null;
        const isExpiringSoon = Boolean(
          expiresAtMs &&
          expiresAtMs > now &&
          (expiresAtMs - now) <= thirtyDaysMs
        );

        return {
          id: doc.id,
          title: doc.title,
          category: doc.category,
          doc_type: doc.doc_type,
          file_size: doc.file_size,
          relevance_score: item?.relevance_score ?? item?.score ?? null,
          reason: item?.reason || item?.match_reason || '',
          is_expiring_soon: isExpiringSoon,
        };
      })
      .filter(Boolean);

    return res.json({ results });
  } catch (_) {
    return res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/portal/documents/:docId/download
// Authenticated file download — streams file, does not expose public path
router.get('/:docId/download', authenticatePortal, requirePortalAuth, async (req, res) => {
  try {
    const [[doc]] = await pool.execute('SELECT * FROM cp_documents WHERE id = ? AND is_active = 1', [req.params.docId]);
    if (!doc) return res.status(404).json({ error: 'Document not found.' });

    // Verify user is from same client
    if (doc.client_id !== req.portalUser.clientId) return res.status(403).json({ error: 'Access denied.' });

    // Verify user_type access
    const userType  = req.portalUser.user_type || 'other';
    const visibleTo = JSON.parse(doc.visible_to_json || '[]');
    if (visibleTo.length > 0 && !visibleTo.includes(userType)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const filePath = path.join(__dirname, '../../', doc.file_path);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on server.' });

    // F3-04: Track download count
    await pool.execute(`UPDATE cp_documents SET download_count = download_count + 1, updated_at = NOW() WHERE id = ?`, [doc.id]);

    const encodedName = encodeURIComponent(doc.file_name);
    const dispo = req.query.disposition === 'inline' ? 'inline' : 'attachment';
    res.setHeader('Content-Disposition', `${dispo}; filename="${doc.file_name}"; filename*=UTF-8''${encodedName}`);
    res.setHeader('Content-Type', doc.mime_type);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
