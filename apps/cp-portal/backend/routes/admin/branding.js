/**
 * Admin Branding — /api/admin/branding
 * Full branding & theme configuration per client
 */

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth');
const { audit } = require('../../utils/audit');
const { validateContent } = require('../../utils/fileValidation');
const { ratio, AA_NORMAL } = require('../../utils/contrast');
const cache = require('../../utils/cache');
const log = require('../../utils/logger');

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
    const allowed = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
});

// GET /api/admin/branding/:clientId
router.get('/:clientId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const [[row]] = await pool.execute('SELECT * FROM cp_branding WHERE client_id = ?', [req.params.clientId]);
    if (!row) return res.status(404).json({ error: 'Branding config not found.' });
    res.json({ branding: row });
  } catch (err) {
    log.error('admin.branding.error', { err, route: 'GET /:clientId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/branding/:clientId/upload-logo — logo file upload
router.post('/:clientId/upload-logo', authenticateAdmin, requireClientAccess, uploadLogo.single('logo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No valid image file provided. Allowed: PNG, JPG, GIF, WebP (max 5 MB).' });

    // SEC: the logos directory is publicly served, and the on-disk extension was
    // taken from the attacker-supplied filename. Validate the real image content
    // (magic bytes) and force a safe, content-derived extension so a disguised
    // .html/.svg can never be written to a public path and executed as XSS.
    const LOGO_MIMES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    const { ok, safeExt } = validateContent(req.file.path, req.file.mimetype, LOGO_MIMES);
    if (!ok) {
      try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
      return res.status(400).json({ error: 'File is not a valid PNG, JPG, GIF, or WebP image.' });
    }
    const safeName = `client-${req.params.clientId}-logo${safeExt}`;
    const safePath = path.join(path.dirname(req.file.path), safeName);
    if (safePath !== req.file.path) {
      try { fs.renameSync(req.file.path, safePath); } catch { /* fall back to original name on rename failure */ }
    }
    const logoUrl = `/uploads/logos/${safeName}`;
    await pool.execute(`UPDATE cp_branding SET logo_url = ?, updated_at = NOW() WHERE client_id = ?`, [logoUrl, req.params.clientId]);
    await audit(req.admin, req.params.clientId, 'UPLOAD', 'branding', req.params.clientId, { logo_url: logoUrl });
    cache.invalidate('config:'); // CP-22: refresh portal config cache after logo change
    res.json({ logo_url: logoUrl });
  } catch (err) {
    log.error('admin.branding.error', { err, route: 'POST /:clientId/upload-logo', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// PATCH /api/admin/branding/:clientId — update any branding fields
router.patch('/:clientId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const { clientId } = req.params;

    // CP-29: reject text colors that fail WCAG AA contrast against the background,
    // so a client can't save unreadable body text (the "blue text" root cause).
    if (req.body.text_primary !== undefined || req.body.text_secondary !== undefined || req.body.background_color !== undefined) {
      const [[cur]] = await pool.execute('SELECT background_color, text_primary, text_secondary FROM cp_branding WHERE client_id = ?', [clientId]);
      const bg = req.body.background_color ?? cur?.background_color ?? '#FFFFFF';
      for (const field of ['text_primary', 'text_secondary']) {
        const color = req.body[field] ?? cur?.[field];
        if (!color) continue;
        const r = ratio(color, bg);
        if (r !== null && r < AA_NORMAL) {
          return res.status(400).json({
            error: `${field} (${color}) fails accessibility contrast against the background (${bg}) — ${r.toFixed(2)}:1, needs at least ${AA_NORMAL}:1. Pick a darker or lighter text color.`,
          });
        }
      }
    }

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
    updates.push(`updated_at = NOW()`);
    params.push(clientId);
    await pool.execute(`UPDATE cp_branding SET ${updates.join(', ')} WHERE client_id = ?`, params);
    await audit(req.admin, clientId, 'UPDATE', 'branding', clientId, { fields: Object.keys(req.body) });
    cache.invalidate('config:'); // CP-22: refresh portal config cache after edits
    res.json({ message: 'Branding updated.' });
  } catch (err) {
    log.error('admin.branding.error', { err, route: 'PATCH /:clientId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/branding/:clientId/reset — reset to defaults
router.post('/:clientId/reset', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    await pool.execute(`
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
        updated_at=NOW()
      WHERE client_id = ?
    `, [req.params.clientId]);
    res.json({ message: 'Branding reset to defaults.' });
  } catch (err) {
    log.error('admin.branding.error', { err, route: 'POST /:clientId/reset', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
