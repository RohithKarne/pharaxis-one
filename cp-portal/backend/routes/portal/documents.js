/**
 * Portal Documents — /api/portal/documents
 * F-04: Authenticated document list + download for portal users
 */

const express = require('express');
const router  = express.Router();
const db      = require('../../database/db');
const { requirePortalAuth } = require('../../middleware/auth');
const path    = require('path');
const fs      = require('fs');

function isFeatureEnabled(clientId, featureKey) {
  const row = db.prepare('SELECT is_enabled FROM cp_features WHERE client_id = ? AND feature_key = ?').get(clientId, featureKey);
  return row ? row.is_enabled === 1 : false;
}

// GET /api/portal/documents?clientCode=xxx
// Returns active documents visible to the user's user_type
router.get('/', requirePortalAuth, (req, res) => {
  const { clientCode } = req.query;
  if (!clientCode) return res.status(400).json({ error: 'clientCode required.' });

  const client = db.prepare('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1').get(clientCode);
  if (!client) return res.status(404).json({ error: 'Client not found.' });

  if (!isFeatureEnabled(client.id, 'document_library')) {
    return res.status(403).json({ error: 'Document library is not enabled for this portal.' });
  }

  const userType = req.portalUser?.user_type || 'other';

  const docs = db.prepare(`
    SELECT id, title, category, doc_type, file_name, file_size, mime_type, visible_to_json, source, created_at
    FROM cp_documents
    WHERE client_id = ? AND is_active = 1
    ORDER BY created_at DESC
  `).all(client.id);

  // Filter by user_type: empty array means visible to all
  const filtered = docs.filter(doc => {
    const visibleTo = JSON.parse(doc.visible_to_json || '[]');
    return visibleTo.length === 0 || visibleTo.includes(userType);
  });

  const visibleCategoryNames = new Set(filtered.map(d => d.category).filter(Boolean));
  const allCategories = db.prepare('SELECT * FROM cp_document_categories WHERE client_id = ? ORDER BY sort_order ASC').all(client.id);
  const categories = allCategories.filter(c => visibleCategoryNames.has(c.name));

  res.json({ documents: filtered, categories });
});

// GET /api/portal/documents/:docId/download
// Authenticated file download — streams file, does not expose public path
router.get('/:docId/download', requirePortalAuth, (req, res) => {
  const doc = db.prepare('SELECT * FROM cp_documents WHERE id = ? AND is_active = 1').get(req.params.docId);
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

  res.setHeader('Content-Disposition', `attachment; filename="${doc.file_name}"`);
  res.setHeader('Content-Type', doc.mime_type);
  fs.createReadStream(filePath).pipe(res);
});

module.exports = router;
