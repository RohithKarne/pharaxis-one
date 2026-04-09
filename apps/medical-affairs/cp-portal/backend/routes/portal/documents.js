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
    res.setHeader('Content-Disposition', `attachment; filename="${doc.file_name}"; filename*=UTF-8''${encodedName}`);
    res.setHeader('Content-Type', doc.mime_type);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
