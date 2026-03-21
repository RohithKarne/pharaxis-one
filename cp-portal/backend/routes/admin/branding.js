/**
 * Admin Branding — /api/admin/branding
 * Full branding & theme configuration per client
 */

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const router  = express.Router();
const db      = require('../../database/db');
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth');
const { audit } = require('../../utils/audit');

// Multer — logo uploads only (5 MB, images only)
const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/logos');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `client-${req.params.clientId}-logo${ext}`);
  },
});
const uploadLogo = multer({
  storage: logoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];
    cb(null, allowed.includes(file.mimetype));
  },
});

// GET /api/admin/branding/:clientId
router.get('/:clientId', authenticateAdmin, requireClientAccess, (req, res) => {
  const row = db.prepare('SELECT * FROM cp_branding WHERE client_id = ?').get(req.params.clientId);
  if (!row) return res.status(404).json({ error: 'Branding config not found.' });
  res.json({ branding: row });
});

// POST /api/admin/branding/:clientId/upload-logo — logo file upload
router.post('/:clientId/upload-logo', authenticateAdmin, requireClientAccess, uploadLogo.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No valid image file provided. Allowed: PNG, JPG, GIF, WebP, SVG (max 5 MB).' });
  const logoUrl = `/uploads/logos/${req.file.filename}`;
  db.prepare(`UPDATE cp_branding SET logo_url = ?, updated_at = datetime('now') WHERE client_id = ?`)
    .run(logoUrl, req.params.clientId);
  audit(req.admin, req.params.clientId, 'UPLOAD', 'branding', req.params.clientId, { logo_url: logoUrl });
  res.json({ logo_url: logoUrl });
});

// PATCH /api/admin/branding/:clientId — update any branding fields
router.patch('/:clientId', authenticateAdmin, requireClientAccess, (req, res) => {
  const { clientId } = req.params;

  const allowed = [
    'portal_name', 'tagline', 'logo_url', 'favicon_url', 'custom_domain',
    'primary_color', 'secondary_color', 'accent_color', 'background_color',
    'surface_color', 'text_primary', 'text_secondary',
    'header_bg', 'header_text', 'footer_bg', 'footer_text',
    'button_bg', 'button_text', 'link_color', 'border_color',
    'font_family', 'heading_font', 'base_font_size', 'border_radius',
    'header_style', 'footer_text_content', 'copyright_text', 'show_powered_by',
    'sla_response_text',
  ];

  const updates = [], params = [];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      updates.push(`${key} = ?`);
      params.push(req.body[key]);
    }
  }
  if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update.' });
  updates.push(`updated_at = datetime('now')`);
  params.push(clientId);
  db.prepare(`UPDATE cp_branding SET ${updates.join(', ')} WHERE client_id = ?`).run(...params);
  audit(req.admin, clientId, 'UPDATE', 'branding', clientId, { fields: Object.keys(req.body) });
  res.json({ message: 'Branding updated.' });
});

// POST /api/admin/branding/:clientId/reset — reset to defaults
router.post('/:clientId/reset', authenticateAdmin, requireClientAccess, (req, res) => {
  db.prepare(`
    UPDATE cp_branding SET
      primary_color='#6B3FA0', secondary_color='#4A2D7A', accent_color='#9B6FCC',
      background_color='#FFFFFF', surface_color='#F8F8FB',
      text_primary='#1A1A2E', text_secondary='#6B7280',
      header_bg='#6B3FA0', header_text='#FFFFFF',
      footer_bg='#1A1A2E', footer_text='#9CA3AF',
      button_bg='#6B3FA0', button_text='#FFFFFF',
      link_color='#6B3FA0', border_color='#E5E7EB',
      font_family='Inter, sans-serif', heading_font='Inter, sans-serif',
      base_font_size='14px', border_radius='8px',
      header_style='solid', show_powered_by=1,
      updated_at=datetime('now')
    WHERE client_id = ?
  `).run(req.params.clientId);
  res.json({ message: 'Branding reset to defaults.' });
});

module.exports = router;
