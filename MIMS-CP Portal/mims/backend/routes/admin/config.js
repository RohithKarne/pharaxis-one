/**
 * admin/config.js — Workflow States, Source Types, Products API
 */

const express = require('express');
const router = express.Router();
const db = require('../../database/db');
const bcrypt = require('bcrypt');
const userModel = require('../../models/userModel');
const { authenticate, requireRole } = require('../../middleware/auth');
const { logService } = require('../../services/serviceLogger');

function audit(userId, userName, action, entity, entityId, details) {
  db.prepare(`INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details)
    VALUES (?, ?, ?, ?, ?, ?)`).run(userId, userName, action, entity, entityId, JSON.stringify(details));
}

// ─── WORKFLOW STATES ────────────────────────────────────────
router.get('/workflow-states', authenticate, requireRole('admin', 'superadmin'), (_req, res) => {
  res.json({ states: db.prepare('SELECT * FROM workflow_states ORDER BY name').all() });
});

router.post('/workflow-states', authenticate, requireRole('admin', 'superadmin'), (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required.' });
  try {
    const result = db.prepare('INSERT INTO workflow_states (name) VALUES (?)').run(name.trim());
    audit(req.user.userId, req.user.email, 'CREATE', 'workflow_state', result.lastInsertRowid, { name });
    const created_at = db.prepare('SELECT created_at FROM workflow_states WHERE id = ?').get(result.lastInsertRowid).created_at;
    res.status(201).json({ id: result.lastInsertRowid, name, is_active: 1, created_at });
  } catch { res.status(409).json({ error: 'Workflow state already exists.' }); }
});

router.put('/workflow-states/:id', authenticate, requireRole('admin', 'superadmin'), (req, res) => {
  const { name, is_active } = req.body;
  db.prepare('UPDATE workflow_states SET name = ?, is_active = ? WHERE id = ?').run(name, is_active ? 1 : 0, req.params.id);
  audit(req.user.userId, req.user.email, 'UPDATE', 'workflow_state', req.params.id, req.body);
  res.json({ message: 'Updated.' });
});

// ─── SOURCE TYPES ────────────────────────────────────────────
router.get('/source-types', authenticate, requireRole('admin', 'superadmin'), (_req, res) => {
  res.json({ sources: db.prepare('SELECT * FROM source_types ORDER BY name').all() });
});

router.post('/source-types', authenticate, requireRole('admin', 'superadmin'), (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required.' });
  try {
    const result = db.prepare('INSERT INTO source_types (name) VALUES (?)').run(name.trim());
    audit(req.user.userId, req.user.email, 'CREATE', 'source_type', result.lastInsertRowid, { name });
    const created_at = db.prepare('SELECT created_at FROM source_types WHERE id = ?').get(result.lastInsertRowid).created_at;
    res.status(201).json({ id: result.lastInsertRowid, name, is_active: 1, created_at });
  } catch { res.status(409).json({ error: 'Source type already exists.' }); }
});

router.put('/source-types/:id', authenticate, requireRole('admin', 'superadmin'), (req, res) => {
  const { name, is_active } = req.body;
  db.prepare('UPDATE source_types SET name = ?, is_active = ? WHERE id = ?').run(name, is_active ? 1 : 0, req.params.id);
  audit(req.user.userId, req.user.email, 'UPDATE', 'source_type', req.params.id, req.body);
  res.json({ message: 'Updated.' });
});

// ─── PRODUCTS ─────────────────────────────────────────────────
router.get('/products', authenticate, requireRole('admin', 'superadmin'), (_req, res) => {
  const products = db.prepare(`
    SELECT p.*, o.name as org_name
    FROM products p LEFT JOIN organisations o ON p.org_id = o.id
    ORDER BY p.trade_name
  `).all();
  res.json({ products });
});

router.post('/products', authenticate, requireRole('admin', 'superadmin'), (req, res) => {
  const { trade_name, org_id } = req.body;
  if (!trade_name) return res.status(400).json({ error: 'Trade name is required.' });
  const result = db.prepare('INSERT INTO products (trade_name, org_id) VALUES (?, ?)').run(trade_name.trim(), org_id || null);
  audit(req.user.userId, req.user.email, 'CREATE', 'product', result.lastInsertRowid, { trade_name });
  const created_at = db.prepare('SELECT created_at FROM products WHERE id = ?').get(result.lastInsertRowid).created_at;
  res.status(201).json({ id: result.lastInsertRowid, trade_name, is_active: 1, created_at });
});

router.put('/products/:id', authenticate, requireRole('admin', 'superadmin'), (req, res) => {
  const { trade_name, org_id, is_active } = req.body;
  db.prepare('UPDATE products SET trade_name = ?, org_id = ?, is_active = ? WHERE id = ?').run(trade_name, org_id, is_active ? 1 : 0, req.params.id);
  audit(req.user.userId, req.user.email, 'UPDATE', 'product', req.params.id, req.body);
  res.json({ message: 'Updated.' });
});

// ─── AUDIT LOGS ───────────────────────────────────────────────
router.get('/audit-logs', authenticate, requireRole('admin', 'superadmin'), (req, res) => {
  const { from, to, user, action, entity, entity_id } = req.query;
  let query = 'SELECT * FROM audit_logs WHERE 1=1';
  const params = [];
  if (from)   { query += ' AND created_at >= ?'; params.push(from); }
  if (to)     { query += ' AND created_at <= ?'; params.push(to + ' 23:59:59'); }
  if (user)   { query += ' AND user_name LIKE ?'; params.push(`%${user}%`); }
  if (action) { query += ' AND action = ?'; params.push(action); }
  if (entity) { query += ' AND entity = ?'; params.push(entity); }
  if (entity_id) { query += ' AND entity_id = ?'; params.push(entity_id); }
  query += ' ORDER BY created_at DESC LIMIT 500';
  const logs = db.prepare(query).all(...params);
  res.json({ logs });
});

// ─── USERS (admin view) ───────────────────────────────────────
router.get('/users', authenticate, requireRole('admin', 'superadmin'), (_req, res) => {
  const users = db.prepare('SELECT id, name, email, role, is_active, created_at FROM users ORDER BY created_at DESC').all();
  res.json({ users });
});

router.post('/users', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password are required.' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    const validRoles = ['admin', 'agent', 'reviewer', 'content_manager'];
    const userRole = role && validRoles.includes(role) ? role : 'agent';
    if (userModel.emailExists(email)) return res.status(409).json({ error: 'An account with this email already exists.' });
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = userModel.create({ name, email: email.toLowerCase().trim(), password: hashedPassword, role: userRole });
    audit(req.user.userId, req.user.email, 'CREATE', 'user', newUser.id, { name, email, role: userRole });
    res.status(201).json({ user: { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role, is_active: 1, created_at: newUser.created_at } });
  } catch (err) {
    console.error('Admin create user error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── ELECTRONIC SIGNATURE VERIFY (ESIG-01, ESIG-02, ESIG-03) ──
router.post('/esig-verify', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { password, reason, action, entity, entity_id } = req.body;
    if (!password || !reason) return res.status(400).json({ error: 'Password and reason are required.' });
    const userWithHash = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.userId);
    if (!userWithHash) return res.status(404).json({ error: 'User not found.' });
    const match = await bcrypt.compare(password, userWithHash.password);
    if (!match) return res.status(401).json({ error: 'Incorrect password. Electronic signature rejected.' });
    audit(req.user.userId, req.user.email, 'ESIG', entity || 'system', entity_id || null, {
      action, reason, signed_by: req.user.email
    });
    res.json({ verified: true });
  } catch (err) {
    console.error('ESIG verify error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── ROLE PERMISSIONS ─────────────────────────────────────────
router.get('/permissions', authenticate, requireRole('admin', 'superadmin'), (req, res) => {
  const perms = db.prepare('SELECT * FROM role_permissions ORDER BY role, module').all();
  res.json({ permissions: perms });
});

router.put('/permissions', authenticate, requireRole('admin', 'superadmin'), (req, res) => {
  const { role, module, can_access } = req.body;
  if (!role || !module) return res.status(400).json({ error: 'role and module required.' });
  db.prepare('UPDATE role_permissions SET can_access = ? WHERE role = ? AND module = ?')
    .run(can_access ? 1 : 0, role, module);
  audit(req.user.userId, req.user.email, 'UPDATE', 'role_permission', null,
    { role, module, can_access });
  res.json({ message: 'Permission updated.' });
});

// ─── LOGIN AUDIT TRAIL ────────────────────────────────────────
router.get('/login-audit', authenticate, requireRole('admin', 'superadmin'), (req, res) => {
  const { from, to, user } = req.query;
  let query = 'SELECT * FROM login_audit WHERE 1=1';
  const params = [];
  if (from) { query += ' AND login_time >= ?'; params.push(from); }
  if (to)   { query += ' AND login_time <= ?'; params.push(to + ' 23:59:59'); }
  if (user) { query += ' AND user_name LIKE ?'; params.push(`%${user}%`); }
  query += ' ORDER BY login_time DESC LIMIT 500';
  const logs = db.prepare(query).all(...params);
  res.json({ logs });
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
router.get('/email-accounts', authenticate, requireRole('admin', 'superadmin'), (_req, res) => {
  const accounts = db.prepare(`
    SELECT ea.*, o.name as org_name
    FROM email_accounts ea
    LEFT JOIN organisations o ON ea.org_id = o.id
    ORDER BY o.name, ea.account_name
  `).all().map(maskAccount);
  res.json({ accounts });
});

// POST — create account
router.post('/email-accounts', authenticate, requireRole('admin', 'superadmin'), (req, res) => {
  const {
    org_id, account_name, provider, direction, is_active,
    mailbox_email, from_email, display_name, is_default_outbound,
    imap_host, imap_port, imap_encryption, imap_username, imap_password,
    smtp_host, smtp_port, smtp_encryption, smtp_username, smtp_password,
    polling_interval_min, initial_fetch_days, mailbox_folder,
    ingest_attachments, max_attachment_mb
  } = req.body;

  if (!org_id || !account_name || !provider || !direction)
    return res.status(400).json({ error: 'org_id, account_name, provider, and direction are required.' });
  if (!['Gmail', 'Microsoft365', 'Generic'].includes(provider))
    return res.status(400).json({ error: 'Invalid provider.' });
  if (!['Inbound', 'Outbound', 'Both'].includes(direction))
    return res.status(400).json({ error: 'Invalid direction.' });
  if (['Inbound', 'Both'].includes(direction) && !mailbox_email)
    return res.status(400).json({ error: 'Mailbox email required for inbound accounts.' });
  if (['Outbound', 'Both'].includes(direction) && !from_email)
    return res.status(400).json({ error: 'From email required for outbound accounts.' });

  const result = db.prepare(`
    INSERT INTO email_accounts (
      org_id, account_name, provider, direction, is_active,
      mailbox_email, from_email, display_name, is_default_outbound,
      imap_host, imap_port, imap_encryption, imap_username, imap_password,
      smtp_host, smtp_port, smtp_encryption, smtp_username, smtp_password,
      polling_interval_min, initial_fetch_days, mailbox_folder,
      ingest_attachments, max_attachment_mb
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    org_id, account_name, provider, direction,
    // Default is active unless explicitly set false.
    (is_active === undefined || is_active === null) ? 1 : (is_active ? 1 : 0),
    mailbox_email || null, from_email || null, display_name || null,
    is_default_outbound ? 1 : 0,
    imap_host || null, imap_port || null, imap_encryption || null,
    imap_username || null, imap_password || null,
    smtp_host || null, smtp_port || null, smtp_encryption || null,
    smtp_username || null, smtp_password || null,
    polling_interval_min || 5, initial_fetch_days || 7,
    mailbox_folder || 'INBOX', ingest_attachments ? 1 : 0,
    max_attachment_mb || 10
  );

  if (is_default_outbound) {
    db.prepare(`UPDATE email_accounts SET is_default_outbound = 0 WHERE org_id = ? AND id != ?`)
      .run(org_id, result.lastInsertRowid);
  }

  audit(req.user.userId, req.user.email, 'CREATE', 'email_account', result.lastInsertRowid,
    { account_name, org_id, provider, direction });

  const created = db.prepare('SELECT ea.*, o.name as org_name FROM email_accounts ea LEFT JOIN organisations o ON ea.org_id = o.id WHERE ea.id = ?').get(result.lastInsertRowid);
  res.status(201).json({ account: maskAccount(created) });
});

// PUT — update account (passwords replace-only: blank = keep existing)
router.put('/email-accounts/:id', authenticate, requireRole('admin', 'superadmin'), (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM email_accounts WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Account not found.' });

  const {
    org_id, account_name, provider, direction, is_active,
    mailbox_email, from_email, display_name, is_default_outbound,
    imap_host, imap_port, imap_encryption, imap_username,
    smtp_host, smtp_port, smtp_encryption, smtp_username,
    polling_interval_min, initial_fetch_days, mailbox_folder,
    ingest_attachments, max_attachment_mb
  } = req.body;

  // Replace-only: keep existing password if blank/absent
  const imapPwd = req.body.imap_password || existing.imap_password;
  const smtpPwd = req.body.smtp_password || existing.smtp_password;

  if (['Inbound', 'Both'].includes(direction) && !mailbox_email)
    return res.status(400).json({ error: 'Mailbox email required for inbound accounts.' });
  if (['Outbound', 'Both'].includes(direction) && !from_email)
    return res.status(400).json({ error: 'From email required for outbound accounts.' });

  db.prepare(`
    UPDATE email_accounts SET
      org_id = ?, account_name = ?, provider = ?, direction = ?, is_active = ?,
      mailbox_email = ?, from_email = ?, display_name = ?, is_default_outbound = ?,
      imap_host = ?, imap_port = ?, imap_encryption = ?, imap_username = ?, imap_password = ?,
      smtp_host = ?, smtp_port = ?, smtp_encryption = ?, smtp_username = ?, smtp_password = ?,
      polling_interval_min = ?, initial_fetch_days = ?, mailbox_folder = ?,
      ingest_attachments = ?, max_attachment_mb = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    org_id, account_name, provider, direction, is_active ? 1 : 0,
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
  );

  if (is_default_outbound) {
    db.prepare(`UPDATE email_accounts SET is_default_outbound = 0 WHERE org_id = ? AND id != ?`)
      .run(org_id, id);
  }

  audit(req.user.userId, req.user.email, 'UPDATE', 'email_account', Number(id),
    { account_name, org_id, provider, direction });

  res.json({ message: 'Email account updated.' });
});

// PATCH — toggle active status
router.patch('/email-accounts/:id/toggle', authenticate, requireRole('admin', 'superadmin'), (req, res) => {
  const { id } = req.params;
  const account = db.prepare('SELECT id, is_active FROM email_accounts WHERE id = ?').get(id);
  if (!account) return res.status(404).json({ error: 'Account not found.' });

  const newActive = account.is_active ? 0 : 1;
  db.prepare(`UPDATE email_accounts SET is_active = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(newActive, id);
  audit(req.user.userId, req.user.email, 'UPDATE', 'email_account', Number(id), { is_active: newActive });
  res.json({ message: newActive ? 'Account activated.' : 'Account deactivated.', is_active: newActive });
});

// DELETE — remove account (credentials deleted from storage)
router.delete('/email-accounts/:id', authenticate, requireRole('admin', 'superadmin'), (req, res) => {
  const { id } = req.params;
  const account = db.prepare('SELECT id, account_name, org_id FROM email_accounts WHERE id = ?').get(id);
  if (!account) return res.status(404).json({ error: 'Account not found.' });

  const fs = require('fs');

  const tx = db.transaction(() => {
    // Collect attachment paths to delete from disk
    const attachments = db.prepare(`
      SELECT ia.storage_path
      FROM inquiry_attachments ia
      INNER JOIN inquiries i ON ia.inquiry_id = i.id
      WHERE i.email_account_id = ?
    `).all(id);

    // Delete attachment rows
    db.prepare(`
      DELETE FROM inquiry_attachments
      WHERE inquiry_id IN (SELECT id FROM inquiries WHERE email_account_id = ?)
    `).run(id);

    // Delete inquiries for this email account
    db.prepare('DELETE FROM inquiries WHERE email_account_id = ?').run(id);

    // Delete the email account
    db.prepare('DELETE FROM email_accounts WHERE id = ?').run(id);

    // Delete files on disk (best effort)
    for (const a of attachments) {
      if (!a.storage_path) continue;
      try { fs.unlinkSync(a.storage_path); } catch (_) {}
    }
  });

  tx();
  audit(req.user.userId, req.user.email, 'DELETE', 'email_account', Number(id), { account_name: account.account_name, org_id: account.org_id });
  res.json({ message: 'Email account deleted.' });
});

// POST — test IMAP connection
router.post('/email-accounts/:id/test-imap', authenticate, requireRole('admin', 'superadmin'), (req, res) => {
  const { id } = req.params;
  const account = db.prepare('SELECT * FROM email_accounts WHERE id = ?').get(id);
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
    password: account.imap_password,
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
    db.prepare(`UPDATE email_accounts SET last_imap_test_at = datetime('now'), last_imap_test_status = ?, last_imap_test_error = ? WHERE id = ?`)
      .run(status, errorMsg, id);
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
});

// POST — test SMTP connection
router.post('/email-accounts/:id/test-smtp', authenticate, requireRole('admin', 'superadmin'), (req, res) => {
  const { id } = req.params;
  const account = db.prepare('SELECT * FROM email_accounts WHERE id = ?').get(id);
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
    auth: { user: account.smtp_username, pass: account.smtp_password },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 10000,
  });

  transporter.verify((err) => {
    const status = err ? 'fail' : 'pass';
    const errorMsg = err ? sanitizeError(err.message, account) : null;
    const tested_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
    db.prepare(`UPDATE email_accounts SET last_smtp_test_at = datetime('now'), last_smtp_test_status = ?, last_smtp_test_error = ? WHERE id = ?`)
      .run(status, errorMsg, id);
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
});

// POST — send test email
router.post('/email-accounts/:id/send-test', authenticate, requireRole('admin', 'superadmin'), (req, res) => {
  const { id } = req.params;
  const { recipient } = req.body;
  if (!recipient) return res.status(400).json({ error: 'Recipient email is required.' });

  const account = db.prepare('SELECT * FROM email_accounts WHERE id = ?').get(id);
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
    auth: { user: account.smtp_username, pass: account.smtp_password },
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
    db.prepare(`UPDATE email_accounts SET last_send_test_at = datetime('now'), last_send_test_status = ?, last_send_test_error = ? WHERE id = ?`)
      .run(status, errorMsg, id);
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
});

// POST — fetch emails now (immediate IMAP ingest, bypasses polling interval)
router.post('/email-accounts/:id/fetch-now', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  const { id } = req.params;
  const account = db.prepare('SELECT * FROM email_accounts WHERE id = ?').get(id);
  if (!account) return res.status(404).json({ error: 'Account not found.' });
  if (!['Inbound', 'Both'].includes(account.direction))
    return res.status(400).json({ error: 'Account is not configured for inbound.' });
  if (!account.imap_host || !account.imap_port || !account.imap_username || !account.imap_password)
    return res.status(400).json({ error: 'IMAP configuration incomplete.' });

  try {
    const { ingestAccount } = require('../../services/emailPoller');
    // Fetch from initial_fetch_days back (same window as first-time ingest)
    const sinceDt = new Date(Date.now() - (account.initial_fetch_days || 7) * 24 * 60 * 60 * 1000);
    const n = await ingestAccount(account, sinceDt);
    db.prepare(`UPDATE email_accounts SET last_ingest_at = datetime('now') WHERE id = ?`).run(id);
    audit(req.user.userId, req.user.email, 'FETCH_NOW', 'email_account', Number(id), { ingested: n });
    logService({
      source: 'Email Accounts',
      service_type: 'IMAP',
      description: `Manual fetch triggered for "${account.account_name}" — ${n} new email${n !== 1 ? 's' : ''} ingested`,
      status: 'success',
    });
    res.json({ message: 'Fetch complete.', ingested: n });
  } catch (err) {
    const msg = err?.message || String(err)
    logService({
      source: 'Email Accounts',
      service_type: 'IMAP',
      description: `Manual fetch failed for "${account.account_name}" — ${msg}`,
      status: 'failed',
    });
    res.status(500).json({ error: msg });
  }
});

module.exports = router;
