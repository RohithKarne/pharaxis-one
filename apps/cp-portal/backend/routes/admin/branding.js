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
const { audit, changesBetween } = require('../../utils/audit');
const { validateContent, inspectDangerousContent } = require('../../utils/fileValidation');
const { refuseUnlessClean } = require('../../utils/virusScan');
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
    // CPPM-46: a fresh name for every upload. The old fixed name meant multer wrote over
    // the current logo before any check ran, so a refused upload deleted it. The new file
    // replaces the logo only after every check passes (the rename in the route below).
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `client-${req.params.clientId}-logo-upload-${Date.now()}${ext}`);
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
router.post('/:clientId/upload-logo', authenticateAdmin, requireClientAccess, (req, res, next) => {
  // CPPM-46: multer errors (e.g. over 5 MB) otherwise reach the global handler as a 500.
  uploadLogo.single('logo')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Logo is larger than 5 MB. Choose a smaller image.' });
    res.status(400).json({ error: err.message || 'Logo upload failed.' });
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No valid image file provided. Allowed: PNG, JPG, GIF, WebP (max 5 MB).' });

    // SEC: the logos directory is publicly served, and the on-disk extension was
    // taken from the attacker-supplied filename. Validate the real image content
    // (magic bytes) and force a safe, content-derived extension so a disguised
    // .html/.svg can never be written to a public path and executed as XSS.
    const LOGO_MIMES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    const { ok, safeExt, signature } = validateContent(req.file.path, req.file.mimetype, LOGO_MIMES);
    if (!ok) {
      try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
      return res.status(400).json({ error: 'File is not a valid PNG, JPG, GIF, or WebP image.' });
    }
    // CPPM-12: the logo is served publicly; refuse anything carrying a payload.
    const danger = inspectDangerousContent(req.file.path, signature);
    if (!danger.ok) {
      try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
      return res.status(400).json({ error: `This image was not accepted because ${danger.reason}.` });
    }
    // CPPM-39: and against ClamAV's list of known viruses.
    const scanRefusal = await refuseUnlessClean([req.file]);
    if (scanRefusal) return res.status(scanRefusal.status).json({ error: scanRefusal.error });
    const safeName = `client-${req.params.clientId}-logo${safeExt}`;
    const safePath = path.join(path.dirname(req.file.path), safeName);
    // CPPM-46: only now, with every check passed, does the new file take the logo's name.
    // If that fails, drop the upload and report it rather than point the logo at nothing.
    try { fs.renameSync(req.file.path, safePath); }
    catch (err) { try { fs.unlinkSync(req.file.path); } catch { /* ignore */ } throw err; }
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
            error: `The ${field === 'text_primary' ? 'text' : 'quieter text'} colour (${color}) is too hard to read on the box background (${bg}): ${r.toFixed(2)} to 1, and it needs at least ${AA_NORMAL} to 1. Pick a darker or lighter colour.`,
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
    const [[before]] = await pool.execute('SELECT * FROM cp_branding WHERE client_id = ?', [clientId]);
    await pool.execute(`UPDATE cp_branding SET ${updates.join(', ')} WHERE client_id = ?`, params);
    const [[after]] = await pool.execute('SELECT * FROM cp_branding WHERE client_id = ?', [clientId]);
    // CPPM-43: what changed, from → to — not just which fields the screen sent.
    await audit(req.admin, clientId, 'UPDATE', 'branding', clientId, { changes: changesBetween(before, after, allowed) });
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
        font_family='Arial, Helvetica, sans-serif', heading_font='Arial, Helvetica, sans-serif',
        base_font_size='14px', border_radius='2px',
        header_style='solid', show_powered_by=1,
        updated_at=NOW()
      WHERE client_id = ?
    `, [req.params.clientId]);
    await audit(req.admin, req.params.clientId, 'RESET', 'branding', Number(req.params.clientId), {});
    cache.invalidate('config:'); // the portal must show the defaults at once, as it does after an edit
    res.json({ message: 'Branding reset to defaults.' });
  } catch (err) {
    log.error('admin.branding.error', { err, route: 'POST /:clientId/reset', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
