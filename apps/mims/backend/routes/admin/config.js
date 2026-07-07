/**
 * admin/config.js — Workflow States, Source Types, Products API
 */

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const bcrypt = require('bcrypt');
const userModel = require('../../models/userModel');
const { authenticate, requireRole, requireOrg } = require('../../middleware/auth');
const { validate, schemas } = require('../../middleware/validate');
const { logService } = require('../../services/serviceLogger');
const { hasGlobalAdminScope } = require('../../utils/adminScope');
const crypto = require('crypto');
// P7/F12: reuse the SAME AES-256-GCM secret encryption the codebase uses for SSO
// secrets so IMAP/SMTP mailbox passwords are no longer stored in plaintext at rest.
const { encryptSecret } = require('../../services/ssoService');

// ssoService only exports encryptSecret; mirror its decrypt (same key derivation and
// iv.tag.ciphertext format) locally, tolerating not-yet-encrypted (plaintext) rows so
// existing accounts keep working without a data migration.
//
// Mailbox passwords are written with ssoService.encryptSecret, so the dedicated
// SSO_CONFIG_ENCRYPTION_KEY is the primary key here too. Fail closed if it is missing —
// no fallback to JWT_SECRET or a hardcoded constant (mirrors getSsoEncryptionKeyMaterial).
function getMailboxEncryptionKeyMaterial() {
  const configured = String(process.env.SSO_CONFIG_ENCRYPTION_KEY || '').trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'SSO_CONFIG_ENCRYPTION_KEY must be set in production to encrypt/decrypt mailbox credentials.'
    );
  }
  throw new Error(
    'SSO_CONFIG_ENCRYPTION_KEY is not set. Add it to your environment (.env) to manage mailbox credentials.'
  );
}

function deriveMailboxSecretKey() {
  return crypto.createHash('sha256').update(getMailboxEncryptionKeyMaterial()).digest();
}

// Read-compatibility only: keys previously used to derive the mailbox secret key
// before a dedicated key was required. Used solely to decrypt legacy DB rows; new
// writes always use deriveMailboxSecretKey(). Never includes the removed 'mims-sso'
// constant — a predictable key is not an acceptable fallback.
function legacyMailboxDecryptionKeys() {
  const keys = [];
  const seen = new Set();
  const push = (material) => {
    const base = String(material || '').trim();
    if (!base || seen.has(base)) return;
    seen.add(base);
    keys.push(crypto.createHash('sha256').update(base).digest());
  };
  push(process.env.JWT_SECRET);
  push(require('../../utils/jwtSecret'));
  return keys;
}

function decryptWithMailboxKey(key, ivB64, tagB64, encryptedB64) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedB64, 'base64')), decipher.final()]);
  return decrypted.toString('utf8');
}

// Attempt to open an iv.tag.ciphertext envelope with the dedicated key, then any
// legacy key. Returns the plaintext, or null if no configured key decrypts it. The
// GCM auth tag makes a wrong-key attempt throw rather than return garbage. A missing
// dedicated key throws out of deriveMailboxSecretKey() (fail closed) — it is a
// deployment misconfiguration, not a legacy-plaintext row.
function tryDecryptMailboxEnvelope(ivB64, tagB64, encryptedB64) {
  const candidateKeys = [deriveMailboxSecretKey(), ...legacyMailboxDecryptionKeys()];
  for (const key of candidateKeys) {
    try {
      return decryptWithMailboxKey(key, ivB64, tagB64, encryptedB64);
    } catch (_) { /* wrong key → try next */ }
  }
  return null;
}

function decryptMailboxSecret(value) {
  const payload = String(value == null ? '' : value).trim();
  if (!payload) return value;
  const parts = payload.split('.');
  if (parts.length !== 3) return value; // not our envelope → assume legacy plaintext
  const [ivB64, tagB64, encryptedB64] = parts;
  if (!ivB64 || !tagB64 || !encryptedB64) return value;
  const plain = tryDecryptMailboxEnvelope(ivB64, tagB64, encryptedB64);
  return plain === null ? value : plain; // no key matched → treat as legacy plaintext
}

// Encrypt a mailbox password for write. Idempotent: an already-encrypted value
// (e.g. the kept existing value on PUT replace-only) is returned unchanged.
function encryptMailboxSecret(value) {
  if (value == null || value === '') return value == null ? null : value;
  const str = String(value);
  const parts = str.split('.');
  if (parts.length === 3 && parts.every(Boolean)) {
    // Looks like our envelope; only re-encrypt if it does NOT decrypt cleanly with
    // the dedicated or any legacy key.
    if (tryDecryptMailboxEnvelope(parts[0], parts[1], parts[2]) !== null) {
      return str; // already validly encrypted → leave as-is
    }
  }
  return encryptSecret(str);
}

async function audit(userId, userName, action, entity, entityId, details) {
  try {
    await pool.execute(
      `INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, userName, action, entity, entityId, JSON.stringify(details)]
    );
  } catch (_) {}
}

function hasPlatformAdminScope(req) {
  return hasGlobalAdminScope(req.user);
}

function getScopedOrgId(req, providedOrgId = null) {
  return hasPlatformAdminScope(req) ? (providedOrgId || null) : req.user.orgId;
}

async function requireAdminConsoleAccess(req, res, next) {
  if (hasPlatformAdminScope(req)) return next();
  try {
    const [rows] = await pool.execute(
      `SELECT id FROM user_module_permissions
       WHERE user_id = ? AND module = 'admin_console' AND can_access = 1
       LIMIT 1`,
      [req.user.userId]
    );
    if (rows.length > 0) return next();
    return res.status(403).json({ error: 'You do not have permission to view MIMS Admin data.' });
  } catch (err) {
    return res.status(500).json({ error: 'Access check failed.' });
  }
}

// ─── WORKFLOW STATES ────────────────────────────────────────
router.get('/workflow-states', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const [states] = await pool.execute(
      hasPlatformAdminScope(req)
        ? 'SELECT * FROM workflow_states ORDER BY name'
        : 'SELECT * FROM workflow_states WHERE org_id = ? OR org_id IS NULL ORDER BY org_id IS NULL DESC, name',
      hasPlatformAdminScope(req) ? [] : [req.user.orgId]
    );
    res.json({ states });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

router.post('/workflow-states', authenticate, requireRole('admin', 'platform_admin'), requireOrg, validate(schemas.createWorkflowState), async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required.' });
  try {
    const orgId = getScopedOrgId(req, req.body.org_id);
    const [result] = await pool.execute('INSERT INTO workflow_states (name, org_id) VALUES (?, ?)', [name.trim(), orgId]);
    await audit(req.user.userId, req.user.email, 'CREATE', 'workflow_state', result.insertId, { name });
    const [[row]] = await pool.execute('SELECT created_at FROM workflow_states WHERE id = ?', [result.insertId]);
    res.status(201).json({ id: result.insertId, name, is_active: 1, created_at: row.created_at });
  } catch { res.status(409).json({ error: 'Workflow state already exists.' }); }
});

router.put('/workflow-states/:id', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const { name, is_active } = req.body;
    const [[existing]] = await pool.execute(
      hasPlatformAdminScope(req)
        ? 'SELECT id FROM workflow_states WHERE id = ?'
        : 'SELECT id FROM workflow_states WHERE id = ? AND org_id = ?',
      hasPlatformAdminScope(req) ? [req.params.id] : [req.params.id, req.user.orgId]
    );
    if (!existing) return res.status(404).json({ error: 'Workflow state not found.' });
    await pool.execute(
      'UPDATE workflow_states SET name = ?, is_active = ? WHERE id = ?',
      [name ?? null, is_active ? 1 : 0, req.params.id]
    );
    await audit(req.user.userId, req.user.email, 'UPDATE', 'workflow_state', req.params.id, req.body);
    res.json({ message: 'Updated.' });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// ─── SOURCE TYPES ────────────────────────────────────────────
router.get('/source-types', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const [sources] = await pool.execute(
      hasPlatformAdminScope(req)
        ? 'SELECT * FROM source_types ORDER BY name'
        : 'SELECT * FROM source_types WHERE (org_id = ? OR org_id IS NULL) ORDER BY name',
      hasPlatformAdminScope(req) ? [] : [req.user.orgId]
    );
    res.json({ sources });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

router.post('/source-types', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required.' });
  try {
    const orgId = getScopedOrgId(req, req.body.org_id);
    const [result] = await pool.execute('INSERT INTO source_types (name, org_id) VALUES (?, ?)', [name.trim(), orgId]);
    await audit(req.user.userId, req.user.email, 'CREATE', 'source_type', result.insertId, { name });
    const [[row]] = await pool.execute('SELECT created_at FROM source_types WHERE id = ?', [result.insertId]);
    res.status(201).json({ id: result.insertId, name, is_active: 1, created_at: row.created_at });
  } catch { res.status(409).json({ error: 'Source type already exists.' }); }
});

router.put('/source-types/:id', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const { name, is_active } = req.body;
    const [[existing]] = await pool.execute(
      hasPlatformAdminScope(req)
        ? 'SELECT id FROM source_types WHERE id = ?'
        : 'SELECT id FROM source_types WHERE id = ? AND org_id = ?',
      hasPlatformAdminScope(req) ? [req.params.id] : [req.params.id, req.user.orgId]
    );
    if (!existing) return res.status(404).json({ error: 'Source type not found.' });
    await pool.execute(
      'UPDATE source_types SET name = ?, is_active = ? WHERE id = ?',
      [name ?? null, is_active ? 1 : 0, req.params.id]
    );
    await audit(req.user.userId, req.user.email, 'UPDATE', 'source_type', req.params.id, req.body);
    res.json({ message: 'Updated.' });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// ─── PRODUCTS ─────────────────────────────────────────────────
router.get('/products', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const [products] = await pool.execute(
      hasPlatformAdminScope(req)
        ? `SELECT p.*, o.name as org_name, pf.name AS family_name
           FROM products p
           LEFT JOIN organisations o ON p.org_id = o.id
           LEFT JOIN product_families pf ON pf.id = p.family_id
           ORDER BY p.trade_name`
        : `SELECT p.*, o.name as org_name, pf.name AS family_name
           FROM products p
           LEFT JOIN organisations o ON p.org_id = o.id
           LEFT JOIN product_families pf ON pf.id = p.family_id
           WHERE p.org_id = ?
           ORDER BY p.trade_name`,
      hasPlatformAdminScope(req) ? [] : [req.user.orgId]
    );
    res.json({ products });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

router.post('/products', authenticate, requireRole('admin', 'platform_admin'), requireOrg, validate(schemas.createProduct), async (req, res) => {
  try {
    const { trade_name, mah, family_id, dosage, atc_code, authorization_country } = req.body;
    if (!trade_name) return res.status(400).json({ error: 'Trade name is required.' });
    const orgId = getScopedOrgId(req, req.body.org_id);
    const [result] = await pool.execute(
      'INSERT INTO products (trade_name, mah, org_id, family_id, dosage, atc_code, authorization_country) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [trade_name.trim(), mah || null, orgId, family_id || null, dosage || null, atc_code || null, authorization_country || null]
    );
    await audit(req.user.userId, req.user.email, 'CREATE', 'product', result.insertId, { trade_name });
    const [[row]] = await pool.execute('SELECT created_at FROM products WHERE id = ?', [result.insertId]);
    res.status(201).json({ id: result.insertId, trade_name, mah: mah || null, family_id: family_id || null, dosage: dosage || null, atc_code: atc_code || null, authorization_country: authorization_country || null, is_active: 1, created_at: row.created_at });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

router.put('/products/:id', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const { trade_name, mah, family_id, dosage, atc_code, authorization_country, is_active } = req.body;
    const [[existing]] = await pool.execute(
      hasPlatformAdminScope(req)
        ? 'SELECT id FROM products WHERE id = ?'
        : 'SELECT id FROM products WHERE id = ? AND org_id = ?',
      hasPlatformAdminScope(req) ? [req.params.id] : [req.params.id, req.user.orgId]
    );
    if (!existing) return res.status(404).json({ error: 'Product not found.' });
    const orgId = getScopedOrgId(req, req.body.org_id);
    await pool.execute(
      'UPDATE products SET trade_name = ?, mah = ?, org_id = ?, family_id = ?, dosage = ?, atc_code = ?, authorization_country = ?, is_active = ? WHERE id = ?',
      [trade_name ?? null, mah || null, orgId, family_id || null, dosage || null, atc_code || null, authorization_country || null, is_active ? 1 : 0, req.params.id]
    );
    await audit(req.user.userId, req.user.email, 'UPDATE', 'product', req.params.id, req.body);
    res.json({ message: 'Updated.' });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// ─── AUDIT LOGS ───────────────────────────────────────────────
router.get('/audit-logs', authenticate, requireAdminConsoleAccess, async (req, res) => {
  try {
    const { from, to, user, action, entity, entity_id, search } = req.query;
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(100, Math.max(10, parseInt(req.query.page_size || '20', 10)));
    const offset = (page - 1) * pageSize;
    let query = 'SELECT * FROM audit_logs WHERE 1=1';
    let countQuery = 'SELECT COUNT(*) AS total FROM audit_logs WHERE 1=1';
    const params = [];
    const whereParts = [];
    if (from)      { whereParts.push('created_at >= ?'); params.push(from); }
    if (to)        { whereParts.push('created_at <= ?'); params.push(to + ' 23:59:59'); }
    if (user)      { whereParts.push('user_name LIKE ?'); params.push(`%${user}%`); }
    if (action)    { whereParts.push('action = ?'); params.push(action); }
    if (entity)    { whereParts.push('entity = ?'); params.push(entity); }
    if (entity_id) { whereParts.push('entity_id = ?'); params.push(entity_id); }
    if (search) {
      whereParts.push('(user_name LIKE ? OR action LIKE ? OR entity LIKE ? OR CAST(entity_id AS CHAR) LIKE ? OR details LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (whereParts.length > 0) {
      const whereSql = ` AND ${whereParts.join(' AND ')}`;
      query += whereSql;
      countQuery += whereSql;
    }
    query += ` ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${offset}`;
    const [[countRow]] = await pool.execute(countQuery, params);
    const [logs] = await pool.execute(query, params);
    const total = Number(countRow?.total || 0);
    res.json({ logs, total, page, page_size: pageSize, total_pages: Math.max(1, Math.ceil(total / pageSize)) });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// ─── USERS (admin view) ───────────────────────────────────────
router.get('/users', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const [users] = await pool.execute(
      hasPlatformAdminScope(req)
        ? 'SELECT id, name, email, role, is_active, created_at FROM users ORDER BY created_at DESC'
        : `SELECT DISTINCT u.id, u.name, u.email, u.role, u.is_active, u.created_at
           FROM users u
           INNER JOIN user_org_access uoa ON uoa.user_id = u.id
           WHERE uoa.org_id = ? AND uoa.is_active = 1
           ORDER BY u.created_at DESC`,
      hasPlatformAdminScope(req) ? [] : [req.user.orgId]
    );
    res.json({ users });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

router.post('/users', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password are required.' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    const validRoles = ['admin', 'agent', 'reviewer', 'content_manager'];
    const userRole = role && validRoles.includes(role) ? role : 'agent';
    if (await userModel.emailExists(email)) return res.status(409).json({ error: 'An account with this email already exists.' });
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await userModel.create({
      name,
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role: userRole,
      email_verified: 1,
    });
    await audit(req.user.userId, req.user.email, 'CREATE', 'user', newUser.id, { name, email, role: userRole });
    res.status(201).json({ user: { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role, is_active: 1, created_at: newUser.created_at } });
  } catch (err) {
    console.error('Admin create user error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── ELECTRONIC SIGNATURE VERIFY (ESIG-01, ESIG-02, ESIG-03) ──
router.post('/esig-verify', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const { password, reason, action, entity, entity_id } = req.body;
    if (!password || !reason) return res.status(400).json({ error: 'Password and reason are required.' });
    const [[userWithHash]] = await pool.execute('SELECT * FROM users WHERE id = ?', [req.user.userId]);
    if (!userWithHash) return res.status(404).json({ error: 'User not found.' });
    const match = await bcrypt.compare(password, userWithHash.password);
    if (!match) return res.status(401).json({ error: 'Incorrect password. Electronic signature rejected.' });
    await audit(req.user.userId, req.user.email, 'ESIG', entity || 'system', entity_id || null, {
      action, reason, signed_by: req.user.email
    });
    res.json({ verified: true });
  } catch (err) {
    console.error('ESIG verify error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── ROLE PERMISSIONS ─────────────────────────────────────────
router.get('/permissions', authenticate, requireRole('admin', 'platform_admin'), async (_req, res) => {
  try {
    const [permissions] = await pool.execute('SELECT * FROM role_permissions ORDER BY role, module');
    res.json({ permissions });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

router.put('/permissions', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const { role, module, can_access } = req.body;
    if (!role || !module) return res.status(400).json({ error: 'role and module required.' });
    await pool.execute(
      'UPDATE role_permissions SET can_access = ? WHERE role = ? AND module = ?',
      [can_access ? 1 : 0, role, module]
    );
    await audit(req.user.userId, req.user.email, 'UPDATE', 'role_permission', null, { role, module, can_access });
    res.json({ message: 'Permission updated.' });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// ─── LOGIN AUDIT TRAIL ────────────────────────────────────────
router.get('/login-audit', authenticate, requireAdminConsoleAccess, async (req, res) => {
  try {
    const { from, to, user, status, search } = req.query;
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(100, Math.max(10, parseInt(req.query.page_size || '20', 10)));
    const offset = (page - 1) * pageSize;
    let query = 'SELECT * FROM login_audit WHERE 1=1';
    let countQuery = 'SELECT COUNT(*) AS total FROM login_audit WHERE 1=1';
    const params = [];
    const whereParts = [];
    if (from)   { whereParts.push('login_time >= ?'); params.push(from); }
    if (to)     { whereParts.push('login_time <= ?'); params.push(to + ' 23:59:59'); }
    if (user)   { whereParts.push('user_name LIKE ?'); params.push(`%${user}%`); }
    if (status) { whereParts.push('status = ?'); params.push(status); }
    if (search) {
      whereParts.push('(user_name LIKE ? OR role LIKE ? OR status LIKE ? OR auth_event LIKE ? OR fail_reason LIKE ? OR metadata LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (whereParts.length > 0) {
      const whereSql = ` AND ${whereParts.join(' AND ')}`;
      query += whereSql;
      countQuery += whereSql;
    }
    query += ` ORDER BY login_time DESC LIMIT ${pageSize} OFFSET ${offset}`;
    const [[countRow]] = await pool.execute(countQuery, params);
    const [logs] = await pool.execute(query, params);
    const total = Number(countRow?.total || 0);
    res.json({ logs, total, page, page_size: pageSize, total_pages: Math.max(1, Math.ceil(total / pageSize)) });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// ─── EMAIL ACCOUNTS ───────────────────────────────────────────

function sanitizeError(msg, account) {
  return (msg || '')
    .replace(account.imap_password || '', '[REDACTED]')
    .replace(account.smtp_password || '', '[REDACTED]')
    .replace(account.imap_username || '', '[REDACTED]')
    .replace(account.smtp_username || '', '[REDACTED]')
    .substring(0, 500);
}

function maskAccount(a) {
  return { ...a, imap_password: null, smtp_password: null };
}

// GET — list all accounts (passwords always null)
router.get('/email-accounts', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const [accounts] = await pool.execute(
      hasPlatformAdminScope(req)
        ? `SELECT ea.*, o.name as org_name
           FROM email_accounts ea
           LEFT JOIN organisations o ON ea.org_id = o.id
           ORDER BY o.name, ea.account_name`
        : `SELECT ea.*, o.name as org_name
           FROM email_accounts ea
           LEFT JOIN organisations o ON ea.org_id = o.id
           WHERE ea.org_id = ?
           ORDER BY o.name, ea.account_name`,
      hasPlatformAdminScope(req) ? [] : [req.user.orgId]
    );
    res.json({ accounts: accounts.map(maskAccount) });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// POST — create account
router.post('/email-accounts', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const {
      account_name, provider, direction, is_active,
      mailbox_email, from_email, display_name, is_default_outbound,
      imap_host, imap_port, imap_encryption, imap_username, imap_password,
      smtp_host, smtp_port, smtp_encryption, smtp_username, smtp_password,
      polling_interval_min, initial_fetch_days, mailbox_folder,
      ingest_attachments, max_attachment_mb
    } = req.body;
    const orgId = getScopedOrgId(req, req.body.org_id);

    if (!orgId || !account_name || !provider || !direction)
      return res.status(400).json({ error: 'org_id, account_name, provider, and direction are required.' });
    if (!['Gmail', 'Microsoft365', 'Generic'].includes(provider))
      return res.status(400).json({ error: 'Invalid provider.' });
    if (!['Inbound', 'Outbound', 'Both'].includes(direction))
      return res.status(400).json({ error: 'Invalid direction.' });
    if (['Inbound', 'Both'].includes(direction) && !mailbox_email)
      return res.status(400).json({ error: 'Mailbox email required for inbound accounts.' });
    if (['Outbound', 'Both'].includes(direction) && !from_email)
      return res.status(400).json({ error: 'From email required for outbound accounts.' });

    const [result] = await pool.execute(`
      INSERT INTO email_accounts (
        org_id, account_name, provider, direction, is_active,
        mailbox_email, from_email, display_name, is_default_outbound,
        imap_host, imap_port, imap_encryption, imap_username, imap_password,
        smtp_host, smtp_port, smtp_encryption, smtp_username, smtp_password,
        polling_interval_min, initial_fetch_days, mailbox_folder,
        ingest_attachments, max_attachment_mb
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      orgId, account_name, provider, direction,
      (is_active === undefined || is_active === null) ? 1 : (is_active ? 1 : 0),
      mailbox_email || null, from_email || null, display_name || null,
      is_default_outbound ? 1 : 0,
      imap_host || null, imap_port || null, imap_encryption || null,
      imap_username || null, imap_password ? encryptMailboxSecret(imap_password) : null,
      smtp_host || null, smtp_port || null, smtp_encryption || null,
      smtp_username || null, smtp_password ? encryptMailboxSecret(smtp_password) : null,
      polling_interval_min || 5, initial_fetch_days || 7,
      mailbox_folder || 'INBOX', ingest_attachments ? 1 : 0,
      max_attachment_mb || 10
    ]);

    if (is_default_outbound) {
      await pool.execute(
        `UPDATE email_accounts SET is_default_outbound = 0 WHERE org_id = ? AND id != ?`,
        [orgId, result.insertId]
      );
    }

    await audit(req.user.userId, req.user.email, 'CREATE', 'email_account', result.insertId,
      { account_name, org_id: orgId, provider, direction });

    const [[created]] = await pool.execute(
      'SELECT ea.*, o.name as org_name FROM email_accounts ea LEFT JOIN organisations o ON ea.org_id = o.id WHERE ea.id = ?',
      [result.insertId]
    );
    res.status(201).json({ account: maskAccount(created) });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// PUT — update account (passwords replace-only: blank = keep existing)
router.put('/email-accounts/:id', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const { id } = req.params;
    const [[existing]] = await pool.execute(
      hasPlatformAdminScope(req)
        ? 'SELECT * FROM email_accounts WHERE id = ?'
        : 'SELECT * FROM email_accounts WHERE id = ? AND org_id = ?',
      hasPlatformAdminScope(req) ? [id] : [id, req.user.orgId]
    );
    if (!existing) return res.status(404).json({ error: 'Account not found.' });

    const {
      account_name, provider, direction, is_active,
      mailbox_email, from_email, display_name, is_default_outbound,
      imap_host, imap_port, imap_encryption, imap_username,
      smtp_host, smtp_port, smtp_encryption, smtp_username,
      polling_interval_min, initial_fetch_days, mailbox_folder,
      ingest_attachments, max_attachment_mb
    } = req.body;
    const orgId = getScopedOrgId(req, req.body.org_id || existing.org_id);

    // Replace-only: keep existing password if blank/absent. A newly-supplied plaintext
    // password is encrypted; a kept existing value is already encrypted (encryptMailboxSecret
    // is idempotent on our envelope), so both paths store ciphertext at rest.
    const imapPwd = encryptMailboxSecret(req.body.imap_password || existing.imap_password);
    const smtpPwd = encryptMailboxSecret(req.body.smtp_password || existing.smtp_password);

    if (['Inbound', 'Both'].includes(direction) && !mailbox_email)
      return res.status(400).json({ error: 'Mailbox email required for inbound accounts.' });
    if (['Outbound', 'Both'].includes(direction) && !from_email)
      return res.status(400).json({ error: 'From email required for outbound accounts.' });

    await pool.execute(`
      UPDATE email_accounts SET
        org_id = ?, account_name = ?, provider = ?, direction = ?, is_active = ?,
        mailbox_email = ?, from_email = ?, display_name = ?, is_default_outbound = ?,
        imap_host = ?, imap_port = ?, imap_encryption = ?, imap_username = ?, imap_password = ?,
        smtp_host = ?, smtp_port = ?, smtp_encryption = ?, smtp_username = ?, smtp_password = ?,
        polling_interval_min = ?, initial_fetch_days = ?, mailbox_folder = ?,
        ingest_attachments = ?, max_attachment_mb = ?,
        updated_at = NOW()
      WHERE id = ?
    `, [
      orgId, account_name, provider, direction, is_active ? 1 : 0,
      mailbox_email || null, from_email || null, display_name || null,
      is_default_outbound ? 1 : 0,
      imap_host || null, imap_port || null, imap_encryption || null,
      imap_username || null, imapPwd,
      smtp_host || null, smtp_port || null, smtp_encryption || null,
      smtp_username || null, smtpPwd,
      polling_interval_min || 5, initial_fetch_days || 7,
      mailbox_folder || 'INBOX', ingest_attachments ? 1 : 0,
      max_attachment_mb || 10,
      id
    ]);

    if (is_default_outbound) {
      await pool.execute(
        `UPDATE email_accounts SET is_default_outbound = 0 WHERE org_id = ? AND id != ?`,
        [orgId, id]
      );
    }

    await audit(req.user.userId, req.user.email, 'UPDATE', 'email_account', Number(id),
      { account_name, org_id: orgId, provider, direction });

    res.json({ message: 'Email account updated.' });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// PATCH — toggle active status
router.patch('/email-accounts/:id/toggle', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const { id } = req.params;
    const [[account]] = await pool.execute(
      hasPlatformAdminScope(req)
        ? 'SELECT id, is_active FROM email_accounts WHERE id = ?'
        : 'SELECT id, is_active FROM email_accounts WHERE id = ? AND org_id = ?',
      hasPlatformAdminScope(req) ? [id] : [id, req.user.orgId]
    );
    if (!account) return res.status(404).json({ error: 'Account not found.' });

    const newActive = account.is_active ? 0 : 1;
    await pool.execute(
      `UPDATE email_accounts SET is_active = ?, updated_at = NOW() WHERE id = ?`,
      [newActive, id]
    );
    await audit(req.user.userId, req.user.email, 'UPDATE', 'email_account', Number(id), { is_active: newActive });
    res.json({ message: newActive ? 'Account activated.' : 'Account deactivated.', is_active: newActive });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// DELETE — remove account (credentials deleted from storage)
router.delete('/email-accounts/:id', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const { id } = req.params;
    const [[account]] = await pool.execute(
      hasPlatformAdminScope(req)
        ? 'SELECT id, account_name, org_id FROM email_accounts WHERE id = ?'
        : 'SELECT id, account_name, org_id FROM email_accounts WHERE id = ? AND org_id = ?',
      hasPlatformAdminScope(req) ? [id] : [id, req.user.orgId]
    );
    if (!account) return res.status(404).json({ error: 'Account not found.' });

    const fs = require('fs');
    const conn = await pool.getConnection();
    let attachments = [];
    try {
      await conn.beginTransaction();
      const [rows] = await conn.execute(`
        SELECT ia.storage_path
        FROM inquiry_attachments ia
        INNER JOIN inquiries i ON ia.inquiry_id = i.id
        WHERE i.email_account_id = ?
      `, [id]);
      attachments = rows;
      await conn.execute(`
        DELETE FROM inquiry_attachments
        WHERE inquiry_id IN (SELECT id FROM inquiries WHERE email_account_id = ?)
      `, [id]);
      await conn.execute('DELETE FROM inquiries WHERE email_account_id = ?', [id]);
      await conn.execute('DELETE FROM email_accounts WHERE id = ?', [id]);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    for (const a of attachments) {
      if (!a.storage_path) continue;
      try { fs.unlinkSync(a.storage_path); } catch (_) {}
    }

    await audit(req.user.userId, req.user.email, 'DELETE', 'email_account', Number(id),
      { account_name: account.account_name, org_id: account.org_id });
    res.json({ message: 'Email account deleted.' });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// POST — test IMAP connection
router.post('/email-accounts/:id/test-imap', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const { id } = req.params;
    const [[account]] = await pool.execute(
      hasPlatformAdminScope(req)
        ? 'SELECT * FROM email_accounts WHERE id = ?'
        : 'SELECT * FROM email_accounts WHERE id = ? AND org_id = ?',
      hasPlatformAdminScope(req) ? [id] : [id, req.user.orgId]
    );
    if (!account) return res.status(404).json({ error: 'Account not found.' });
    if (!['Inbound', 'Both'].includes(account.direction))
      return res.status(400).json({ error: 'Account is not configured for inbound.' });
    if (!account.imap_host || !account.imap_port || !account.imap_username || !account.imap_password)
      return res.status(400).json({ error: 'IMAP configuration incomplete.' });

    const Imap = require('imap');
    const tls = account.imap_encryption === 'SSL/TLS';
    const starttls = account.imap_encryption === 'STARTTLS';

    const imap = new Imap({
      user: account.imap_username,
      password: decryptMailboxSecret(account.imap_password),
      host: account.imap_host,
      port: account.imap_port,
      tls,
      starttls,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 10000,
      authTimeout: 10000,
    });

    let settled = false;

    function finish(status, rawError) {
      if (settled) return;
      settled = true;
      try { imap.destroy(); } catch (_) {}
      const errorMsg = rawError ? sanitizeError(rawError, account) : null;
      const tested_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
      pool.execute(
        `UPDATE email_accounts SET last_imap_test_at = NOW(), last_imap_test_status = ?, last_imap_test_error = ? WHERE id = ?`,
        [status, errorMsg, id]
      );
      audit(req.user.userId, req.user.email, 'TEST_IMAP', 'email_account', Number(id), { status, error: errorMsg });
      logService({
        source: 'Email Accounts',
        service_type: 'IMAP',
        description: status === 'pass'
          ? `IMAP connection test passed for "${account.account_name}"`
          : `IMAP connection test failed for "${account.account_name}" — ${errorMsg}`,
        status: status === 'pass' ? 'success' : 'failed',
      });
      res.json({ status, error: errorMsg, tested_at });
    }

    imap.once('ready', () => {
      imap.openBox(account.mailbox_folder || 'INBOX', true, (err) => {
        if (err) return finish('fail', err.message);
        finish('pass', null);
      });
    });
    imap.once('error', (err) => finish('fail', err.message));
    imap.once('end', () => { if (!settled) finish('fail', 'Connection ended unexpectedly'); });

    try { imap.connect(); } catch (err) { finish('fail', err.message); }
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// POST — test SMTP connection
router.post('/email-accounts/:id/test-smtp', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const { id } = req.params;
    const [[account]] = await pool.execute(
      hasPlatformAdminScope(req)
        ? 'SELECT * FROM email_accounts WHERE id = ?'
        : 'SELECT * FROM email_accounts WHERE id = ? AND org_id = ?',
      hasPlatformAdminScope(req) ? [id] : [id, req.user.orgId]
    );
    if (!account) return res.status(404).json({ error: 'Account not found.' });
    if (!['Outbound', 'Both'].includes(account.direction))
      return res.status(400).json({ error: 'Account is not configured for outbound.' });
    if (!account.smtp_host || !account.smtp_port || !account.smtp_username || !account.smtp_password)
      return res.status(400).json({ error: 'SMTP configuration incomplete.' });

    const nodemailer = require('nodemailer');
    const secure = account.smtp_encryption === 'SSL/TLS';
    const requireTLS = account.smtp_encryption === 'STARTTLS';

    const transporter = nodemailer.createTransport({
      host: account.smtp_host,
      port: account.smtp_port,
      secure,
      requireTLS,
      auth: { user: account.smtp_username, pass: decryptMailboxSecret(account.smtp_password) },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 10000,
    });

    transporter.verify((err) => {
      const status = err ? 'fail' : 'pass';
      const errorMsg = err ? sanitizeError(err.message, account) : null;
      const tested_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
      pool.execute(
        `UPDATE email_accounts SET last_smtp_test_at = NOW(), last_smtp_test_status = ?, last_smtp_test_error = ? WHERE id = ?`,
        [status, errorMsg, id]
      );
      audit(req.user.userId, req.user.email, 'TEST_SMTP', 'email_account', Number(id), { status, error: errorMsg });
      logService({
        source: 'Email Accounts',
        service_type: 'SMTP',
        description: status === 'pass'
          ? `SMTP connection test passed for "${account.account_name}"`
          : `SMTP connection test failed for "${account.account_name}" — ${errorMsg}`,
        status: status === 'pass' ? 'success' : 'failed',
      });
      res.json({ status, error: errorMsg, tested_at });
    });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// POST — send test email
router.post('/email-accounts/:id/send-test', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const { id } = req.params;
    const { recipient } = req.body;
    if (!recipient) return res.status(400).json({ error: 'Recipient email is required.' });

    const [[account]] = await pool.execute(
      hasPlatformAdminScope(req)
        ? 'SELECT * FROM email_accounts WHERE id = ?'
        : 'SELECT * FROM email_accounts WHERE id = ? AND org_id = ?',
      hasPlatformAdminScope(req) ? [id] : [id, req.user.orgId]
    );
    if (!account) return res.status(404).json({ error: 'Account not found.' });
    if (!['Outbound', 'Both'].includes(account.direction))
      return res.status(400).json({ error: 'Account is not configured for outbound.' });
    if (!account.smtp_host || !account.smtp_port || !account.smtp_username || !account.smtp_password)
      return res.status(400).json({ error: 'SMTP configuration incomplete.' });

    const nodemailer = require('nodemailer');
    const secure = account.smtp_encryption === 'SSL/TLS';
    const requireTLS = account.smtp_encryption === 'STARTTLS';

    const transporter = nodemailer.createTransport({
      host: account.smtp_host,
      port: account.smtp_port,
      secure,
      requireTLS,
      auth: { user: account.smtp_username, pass: decryptMailboxSecret(account.smtp_password) },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 10000,
    });

    const fromLabel = account.display_name || account.account_name;
    transporter.sendMail({
      from: `"${fromLabel}" <${account.from_email}>`,
      to: recipient,
      subject: `MIMS Test Email — ${account.account_name}`,
      text: 'This is a test email sent from the MIMS Admin Console to verify outbound email configuration.',
    }, (err) => {
      const status = err ? 'fail' : 'pass';
      const errorMsg = err ? sanitizeError(err.message, account) : null;
      const tested_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
      pool.execute(
        `UPDATE email_accounts SET last_send_test_at = NOW(), last_send_test_status = ?, last_send_test_error = ? WHERE id = ?`,
        [status, errorMsg, id]
      );
      audit(req.user.userId, req.user.email, 'SEND_TEST_EMAIL', 'email_account', Number(id), { recipient, status });
      logService({
        source: 'Email Accounts',
        service_type: 'SMTP',
        description: status === 'pass'
          ? `Send test email succeeded for "${account.account_name}" → ${recipient}`
          : `Send test email failed for "${account.account_name}" → ${recipient} — ${errorMsg}`,
        status: status === 'pass' ? 'success' : 'failed',
      });
      res.json({ status, error: errorMsg, tested_at });
    });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// POST — fetch emails now (immediate IMAP ingest, bypasses polling interval)
router.post('/email-accounts/:id/fetch-now', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const { id } = req.params;
    const [[account]] = await pool.execute(
      hasPlatformAdminScope(req)
        ? 'SELECT * FROM email_accounts WHERE id = ?'
        : 'SELECT * FROM email_accounts WHERE id = ? AND org_id = ?',
      hasPlatformAdminScope(req) ? [id] : [id, req.user.orgId]
    );
    if (!account) return res.status(404).json({ error: 'Account not found.' });
    if (!['Inbound', 'Both'].includes(account.direction))
      return res.status(400).json({ error: 'Account is not configured for inbound.' });
    if (!account.imap_host || !account.imap_port || !account.imap_username || !account.imap_password)
      return res.status(400).json({ error: 'IMAP configuration incomplete.' });

    const { ingestAccount } = require('../../services/emailPoller');
    const sinceDt = new Date(Date.now() - (account.initial_fetch_days || 7) * 24 * 60 * 60 * 1000);
    const n = await ingestAccount(account, sinceDt);
    await pool.execute(`UPDATE email_accounts SET last_ingest_at = NOW() WHERE id = ?`, [id]);
    await audit(req.user.userId, req.user.email, 'FETCH_NOW', 'email_account', Number(id), { ingested: n });
    logService({
      source: 'Email Accounts',
      service_type: 'IMAP',
      description: `Manual fetch triggered for "${account.account_name}" — ${n} new email${n !== 1 ? 's' : ''} ingested`,
      status: 'success',
    });
    res.json({ message: 'Fetch complete.', ingested: n });
  } catch (err) {
    const msg = err?.message || String(err);
    logService({
      source: 'Email Accounts',
      service_type: 'IMAP',
      description: `Manual fetch failed — ${msg}`,
      status: 'failed',
    });
    res.status(500).json({ error: msg });
  }
});

// GET /api/admin/system-config — read one or all system_config values
router.get('/system-config', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const { key } = req.query;
    if (key) {
      const [[row]] = await pool.execute(
        'SELECT config_key, config_value FROM system_config WHERE config_key = ?', [key]
      );
      return res.json(row || { config_key: key, config_value: null });
    }
    const [rows] = await pool.execute('SELECT config_key, config_value FROM system_config');
    res.json({ configs: rows });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// POST /api/admin/system-config — upsert a system_config key/value
router.post('/system-config', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    // M-17: system_config is global; only platform admins may write it. A tenant
    // admin must not be able to upsert arbitrary global config keys/values.
    if (!hasGlobalAdminScope(req.user)) {
      return res.status(403).json({ error: 'Only platform admins can modify system configuration.' });
    }
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'key is required.' });
    await pool.execute(
      `INSERT INTO system_config (config_key, config_value)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), updated_at = NOW()`,
      [key, value != null ? String(value) : null]
    );
    res.json({ success: true, config_key: key, config_value: value });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

module.exports = router;
