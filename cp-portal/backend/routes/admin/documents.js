/**
 * Admin Documents — /api/admin/documents
 * F-04: Medical document library — upload, manage, categories
 */

const express = require('express');
const router  = express.Router();
const db      = require('../../database/db');
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

// SEC-03: only allow safe document MIME types
const ALLOWED_MIMES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    // SEC-04: store documents under private/ so direct URL access is blocked by server.js
    const dir = path.join(__dirname, '../../uploads/private/docs', req.params.clientId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${unique}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Only PDF and DOCX files are allowed.'));
  },
});

// ── CATEGORIES ────────────────────────────────────────────────

// GET /api/admin/documents/:clientId/categories
router.get('/:clientId/categories', authenticateAdmin, requireClientAccess, (req, res) => {
  const rows = db.prepare('SELECT * FROM cp_document_categories WHERE client_id = ? ORDER BY sort_order ASC').all(req.params.clientId);
  res.json({ categories: rows });
});

// POST /api/admin/documents/:clientId/categories
router.post('/:clientId/categories', authenticateAdmin, requireClientAccess, (req, res) => {
  const { name, sort_order } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required.' });
  try {
    const result = db.prepare('INSERT INTO cp_document_categories (client_id, name, sort_order) VALUES (?, ?, ?)').run(req.params.clientId, name.trim(), sort_order || 0);
    res.json({ category: db.prepare('SELECT * FROM cp_document_categories WHERE id = ?').get(result.lastInsertRowid) });
  } catch {
    res.status(409).json({ error: 'Category already exists.' });
  }
});

// PUT /api/admin/documents/:clientId/categories/:catId
router.put('/:clientId/categories/:catId', authenticateAdmin, requireClientAccess, (req, res) => {
  const { name, sort_order } = req.body;
  const fields = [], values = [];
  if (name !== undefined) { fields.push('name = ?'); values.push(name.trim()); }
  if (sort_order !== undefined) { fields.push('sort_order = ?'); values.push(sort_order); }
  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update.' });
  values.push(req.params.catId, req.params.clientId);
  db.prepare(`UPDATE cp_document_categories SET ${fields.join(', ')} WHERE id = ? AND client_id = ?`).run(...values);
  res.json({ ok: true });
});

// DELETE /api/admin/documents/:clientId/categories/:catId
router.delete('/:clientId/categories/:catId', authenticateAdmin, requireClientAccess, (req, res) => {
  db.prepare('DELETE FROM cp_document_categories WHERE id = ? AND client_id = ?').run(req.params.catId, req.params.clientId);
  res.json({ ok: true });
});

// ── DOCUMENTS ─────────────────────────────────────────────────

// GET /api/admin/documents/:clientId
router.get('/:clientId', authenticateAdmin, requireClientAccess, (req, res) => {
  const rows = db.prepare('SELECT * FROM cp_documents WHERE client_id = ? ORDER BY created_at DESC').all(req.params.clientId);
  res.json({ documents: rows });
});

// POST /api/admin/documents/:clientId — upload
router.post('/:clientId', authenticateAdmin, requireClientAccess, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'File is required.' });

    // Re-validate MIME server-side (defense in depth)
    if (!ALLOWED_MIMES.includes(req.file.mimetype)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Only PDF and DOCX files are allowed.' });
    }

    const { title, category, doc_type, visible_to, source } = req.body;
    if (!title) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'title is required.' });
    }

    const visible_to_json = visible_to ? JSON.stringify(typeof visible_to === 'string' ? JSON.parse(visible_to) : visible_to) : '[]';
    const filePath = `/uploads/private/docs/${req.params.clientId}/${req.file.filename}`;

    const result = db.prepare(`
      INSERT INTO cp_documents (client_id, title, category, doc_type, file_path, file_name, file_size, mime_type, visible_to_json, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.params.clientId, title, category || null, doc_type || 'other', filePath, req.file.originalname, req.file.size, req.file.mimetype, visible_to_json, source || 'manual');

    res.json({ document: db.prepare('SELECT * FROM cp_documents WHERE id = ?').get(result.lastInsertRowid) });
  });
});

// PUT /api/admin/documents/:clientId/:docId — update metadata (no file re-upload)
router.put('/:clientId/:docId', authenticateAdmin, requireClientAccess, (req, res) => {
  const { title, category, doc_type, visible_to, source, is_active } = req.body;
  const fields = [], values = [];
  if (title !== undefined)      { fields.push('title = ?');           values.push(title); }
  if (category !== undefined)   { fields.push('category = ?');        values.push(category); }
  if (doc_type !== undefined)   { fields.push('doc_type = ?');        values.push(doc_type); }
  if (visible_to !== undefined) { fields.push('visible_to_json = ?'); values.push(JSON.stringify(visible_to)); }
  if (source !== undefined)     { fields.push('source = ?');          values.push(source); }
  if (is_active !== undefined)  { fields.push('is_active = ?');       values.push(is_active ? 1 : 0); }
  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update.' });
  fields.push("updated_at = datetime('now')");
  values.push(req.params.docId, req.params.clientId);
  db.prepare(`UPDATE cp_documents SET ${fields.join(', ')} WHERE id = ? AND client_id = ?`).run(...values);
  res.json({ ok: true });
});

// DELETE /api/admin/documents/:clientId/:docId — soft delete (sets is_active = 0)
router.delete('/:clientId/:docId', authenticateAdmin, requireClientAccess, (req, res) => {
  db.prepare("UPDATE cp_documents SET is_active = 0, updated_at = datetime('now') WHERE id = ? AND client_id = ?").run(req.params.docId, req.params.clientId);
  res.json({ ok: true });
});

module.exports = router;
