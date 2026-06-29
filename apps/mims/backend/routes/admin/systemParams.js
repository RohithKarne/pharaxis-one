'use strict';

/**
 * admin/systemParams.js — MIMS Admin > System > System Parameters
 * Platform-wide configuration. Stored in `system_config` (key/value, global).
 *
 * Tabs: General (password rules), Themes, Others (placeholder).
 * All routes: admin + platform admin. No requireOrg — platform-wide.
 */

const express = require('express');
const router  = express.Router();
const pool    = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');
const { invalidateCache: invalidatePasswordPolicyCache } = require('../../services/passwordPolicy');

// ── Config keys + defaults ────────────────────────────────────────────────────
const KEYS = {
  PASSWORD_EXPIRY_DAYS:       'password_expiry_days',
  PASSWORD_REQ_ALPHANUMERIC:  'password_require_alphanumeric',
  PASSWORD_REQ_SPECIAL_CHARS: 'password_require_special_chars',
  PASSWORD_HISTORY_COUNT:     'password_history_count',
  UI_THEME:                   'ui_theme',
};

const DEFAULTS = {
  [KEYS.PASSWORD_EXPIRY_DAYS]:       '90',
  [KEYS.PASSWORD_REQ_ALPHANUMERIC]:  '0',
  [KEYS.PASSWORD_REQ_SPECIAL_CHARS]: '0',
  [KEYS.PASSWORD_HISTORY_COUNT]:     '10',
  [KEYS.UI_THEME]:                   'blue',
};

const ALLOWED_THEMES = ['blue', 'warm', 'green'];

// ── Helpers ───────────────────────────────────────────────────────────────────
async function readAllParams() {
  const [rows] = await pool.execute(
    `SELECT config_key, config_value FROM system_config WHERE config_key IN (${Object.values(KEYS).map(() => '?').join(',')})`,
    Object.values(KEYS)
  );
  const map = {};
  for (const r of rows) map[r.config_key] = r.config_value;

  return {
    general: {
      password_expiry_days:           parseInt(map[KEYS.PASSWORD_EXPIRY_DAYS]      ?? DEFAULTS[KEYS.PASSWORD_EXPIRY_DAYS],      10),
      password_require_alphanumeric:  (map[KEYS.PASSWORD_REQ_ALPHANUMERIC]  ?? DEFAULTS[KEYS.PASSWORD_REQ_ALPHANUMERIC])  === '1',
      password_require_special_chars: (map[KEYS.PASSWORD_REQ_SPECIAL_CHARS] ?? DEFAULTS[KEYS.PASSWORD_REQ_SPECIAL_CHARS]) === '1',
      password_history_count:         parseInt(map[KEYS.PASSWORD_HISTORY_COUNT]    ?? DEFAULTS[KEYS.PASSWORD_HISTORY_COUNT],    10),
    },
    themes: {
      ui_theme: map[KEYS.UI_THEME] ?? DEFAULTS[KEYS.UI_THEME],
    },
  };
}

async function upsertConfig(key, value) {
  await pool.execute(
    `INSERT INTO system_config (config_key, config_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), updated_at = NOW()`,
    [key, String(value)]
  );
}

async function audit(userId, action, details) {
  try {
    await pool.execute(
      `INSERT INTO audit_logs (user_id, entity, entity_id, action, details)
       VALUES (?, 'system_params', NULL, ?, ?)`,
      [userId, action, JSON.stringify(details)]
    );
  } catch (_) {}
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/system-params — read all (general + themes)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/system-params', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const params = await readAllParams();
    res.json(params);
  } catch (err) {
    console.error('GET /system-params error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Public theme endpoint — no auth required (login page needs to show themed UI)
router.get('/system-params/theme', async (req, res) => {
  try {
    const [[row]] = await pool.execute(
      'SELECT config_value FROM system_config WHERE config_key = ? LIMIT 1',
      [KEYS.UI_THEME]
    );
    const theme = row?.config_value || DEFAULTS[KEYS.UI_THEME];
    res.json({ ui_theme: ALLOWED_THEMES.includes(theme) ? theme : 'blue' });
  } catch (err) {
    res.json({ ui_theme: 'blue' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/admin/system-params/general — update password rules
// WP1: writes the GLOBAL system_config (password policy enforced for every tenant)
// — restrict to platform admins so a single tenant admin can't weaken it platform-wide.
// ─────────────────────────────────────────────────────────────────────────────
router.put('/system-params/general', authenticate, requireRole('platform_admin'), async (req, res) => {
  const {
    password_expiry_days,
    password_require_alphanumeric,
    password_require_special_chars,
    password_history_count,
  } = req.body;

  // ── Validation ──────────────────────────────────────────────────────────────
  const errors = [];

  if (password_expiry_days != null) {
    const n = parseInt(password_expiry_days, 10);
    if (!Number.isFinite(n) || n < 1 || n > 3650) {
      errors.push('Password expiry days must be between 1 and 3650.');
    }
  }
  if (password_history_count != null) {
    const n = parseInt(password_history_count, 10);
    if (!Number.isFinite(n) || n < 1 || n > 24) {
      errors.push('Password history count must be between 1 and 24.');
    }
  }
  if (errors.length) {
    return res.status(400).json({ error: errors.join(' ') });
  }

  try {
    if (password_expiry_days != null)
      await upsertConfig(KEYS.PASSWORD_EXPIRY_DAYS, parseInt(password_expiry_days, 10));
    if (password_require_alphanumeric != null)
      await upsertConfig(KEYS.PASSWORD_REQ_ALPHANUMERIC, password_require_alphanumeric ? '1' : '0');
    if (password_require_special_chars != null)
      await upsertConfig(KEYS.PASSWORD_REQ_SPECIAL_CHARS, password_require_special_chars ? '1' : '0');
    if (password_history_count != null)
      await upsertConfig(KEYS.PASSWORD_HISTORY_COUNT, parseInt(password_history_count, 10));

    invalidatePasswordPolicyCache();
    await audit(req.user.userId, 'UPDATE_PASSWORD_RULES', req.body);
    const params = await readAllParams();
    res.json({ ok: true, ...params });
  } catch (err) {
    console.error('PUT /system-params/general error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/admin/system-params/themes — update theme
// ─────────────────────────────────────────────────────────────────────────────
router.put('/system-params/themes', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  const { ui_theme } = req.body;
  if (!ALLOWED_THEMES.includes(ui_theme)) {
    return res.status(400).json({ error: `Theme must be one of: ${ALLOWED_THEMES.join(', ')}.` });
  }

  try {
    await upsertConfig(KEYS.UI_THEME, ui_theme);
    await audit(req.user.userId, 'UPDATE_THEME', { ui_theme });
    res.json({ ok: true, ui_theme });
  } catch (err) {
    console.error('PUT /system-params/themes error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Export both router AND helpers (for use by auth controllers + user creation)
module.exports = router;
module.exports.KEYS     = KEYS;
module.exports.DEFAULTS = DEFAULTS;
module.exports.readAllParams = readAllParams;
