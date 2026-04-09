'use strict';

/**
 * admin/contacts.js — Contacts and Company Reps API
 * Manages case contacts (HCP, Patient, Other) and company representative directory.
 */

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate, requireRole, requireOrg } = require('../../middleware/auth');

async function audit(userId, userName, action, entity, entityId, details) {
  try {
    await pool.execute(
      'INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, userName, action, entity, entityId, JSON.stringify(details)]
    );
  } catch (_) {}
}

function isSuperadmin(req) {
  return req.user.role === 'superadmin';
}

function getScopedOrgId(req, providedOrgId = null) {
  return isSuperadmin(req) ? (providedOrgId || null) : req.user.orgId;
}

// ─── CONTACTS ────────────────────────────────────────────────────────────────

// GET /api/admin/contacts — list contacts with filters and pagination
router.get('/contacts', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const { type, search, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let query = `
      SELECT c.*, o.name AS org_name
      FROM contacts c
      LEFT JOIN organisations o ON c.org_id = o.id
      WHERE c.is_active = 1
    `;
    const params = [];

    if (type) {
      query += ' AND c.type = ?';
      params.push(type);
    }
    if (!isSuperadmin(req)) {
      query += ' AND c.org_id = ?';
      params.push(req.user.orgId);
    }
    if (search) {
      query += ' AND (c.first_name LIKE ? OR c.last_name LIKE ? OR c.email LIKE ? OR c.phone LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    const countQuery = query.replace('SELECT c.*, o.name AS org_name', 'SELECT COUNT(*) AS total');
    const [[{ total }]] = await pool.execute(countQuery, params);

    query += ` ORDER BY c.first_name, c.last_name LIMIT ${parseInt(limit, 10)} OFFSET ${offset}`;

    const [contacts] = await pool.execute(query, params);
    res.json({ contacts, total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) {
    console.error('GET /contacts error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/contacts — create contact
router.post('/contacts', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const { type, first_name, last_name, specialty, institution, email, phone, site_id, notes, address, do_not_update_master } = req.body;
    if (!first_name) return res.status(400).json({ error: 'first_name is required.' });
    const orgId = getScopedOrgId(req, req.body.org_id);

    // Duplicate detection: same (first_name + last_name + email) OR (first_name + last_name + phone)
    if (email || phone) {
      let dupQuery = 'SELECT id FROM contacts WHERE first_name = ? AND last_name <=> ? AND org_id <=> ? AND is_active = 1 AND (';
      const dupParams = [first_name.trim(), last_name || null, orgId];
      const clauses = [];
      if (email) { clauses.push('email = ?'); dupParams.push(email); }
      if (phone) { clauses.push('phone = ?'); dupParams.push(phone); }
      dupQuery += clauses.join(' OR ') + ')';
      const [dups] = await pool.execute(dupQuery, dupParams);
      if (dups.length > 0) {
        return res.status(409).json({ error: 'Duplicate contact detected — same name and email/phone already exists.', duplicate_id: dups[0].id });
      }
    }

    const [result] = await pool.execute(
      `INSERT INTO contacts (type, first_name, last_name, specialty, institution, email, phone, org_id, site_id, notes, address, do_not_update_master)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [type || 'HCP', first_name.trim(), last_name || null, specialty || null, institution || null,
       email || null, phone || null, orgId, site_id || null, notes || null,
       address || null, do_not_update_master ? 1 : 0]
    );
    await audit(req.user.userId, req.user.email, 'CREATE', 'contact', result.insertId, { first_name, last_name, type });
    const [[created]] = await pool.execute('SELECT * FROM contacts WHERE id = ?', [result.insertId]);
    res.status(201).json({ message: 'Contact created.', id: result.insertId, contact: created });
  } catch (err) {
    console.error('POST /contacts error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/admin/contacts/:id — get single contact
router.get('/contacts/:id', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const [[contact]] = await pool.execute(
      `SELECT c.*, o.name AS org_name
       FROM contacts c
       LEFT JOIN organisations o ON c.org_id = o.id
       WHERE c.id = ? ${isSuperadmin(req) ? '' : 'AND c.org_id = ?'}`,
      isSuperadmin(req) ? [req.params.id] : [req.params.id, req.user.orgId]
    );
    if (!contact) return res.status(404).json({ error: 'Contact not found.' });
    res.json({ contact });
  } catch (err) {
    console.error('GET /contacts/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/admin/contacts/:id — update contact
router.put('/contacts/:id', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const { id } = req.params;
    const [[existing]] = await pool.execute(
      isSuperadmin(req)
        ? 'SELECT id FROM contacts WHERE id = ?'
        : 'SELECT id FROM contacts WHERE id = ? AND org_id = ?',
      isSuperadmin(req) ? [id] : [id, req.user.orgId]
    );
    if (!existing) return res.status(404).json({ error: 'Contact not found.' });

    const { type, first_name, last_name, specialty, institution, email, phone, site_id, notes, address, do_not_update_master } = req.body;
    if (!first_name) return res.status(400).json({ error: 'first_name is required.' });
    const orgId = getScopedOrgId(req, req.body.org_id);

    await pool.execute(
      `UPDATE contacts SET type = ?, first_name = ?, last_name = ?, specialty = ?, institution = ?,
         email = ?, phone = ?, org_id = ?, site_id = ?, notes = ?, address = ?,
         do_not_update_master = ?, updated_at = NOW()
       WHERE id = ?`,
      [type || 'HCP', first_name.trim(), last_name || null, specialty || null, institution || null,
       email || null, phone || null, orgId, site_id || null, notes || null,
       address || null, do_not_update_master ? 1 : 0, id]
    );
    await audit(req.user.userId, req.user.email, 'UPDATE', 'contact', Number(id), { first_name, last_name, type });
    res.json({ message: 'Contact updated.' });
  } catch (err) {
    console.error('PUT /contacts/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/admin/contacts/:id — soft delete
router.delete('/contacts/:id', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const { id } = req.params;
    const [[existing]] = await pool.execute(
      isSuperadmin(req)
        ? 'SELECT id, first_name, last_name FROM contacts WHERE id = ?'
        : 'SELECT id, first_name, last_name FROM contacts WHERE id = ? AND org_id = ?',
      isSuperadmin(req) ? [id] : [id, req.user.orgId]
    );
    if (!existing) return res.status(404).json({ error: 'Contact not found.' });

    await pool.execute('UPDATE contacts SET is_active = 0, updated_at = NOW() WHERE id = ?', [id]);
    await audit(req.user.userId, req.user.email, 'DELETE', 'contact', Number(id), { first_name: existing.first_name, last_name: existing.last_name });
    res.json({ message: 'Contact deactivated.' });
  } catch (err) {
    console.error('DELETE /contacts/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── COMPANY REPS ────────────────────────────────────────────────────────────

// GET /api/admin/company-reps — list company reps
router.get('/company-reps', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const { search, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let query = `
      SELECT cr.*, o.name AS org_name
      FROM company_reps cr
      LEFT JOIN organisations o ON cr.org_id = o.id
      WHERE cr.is_active = 1
    `;
    const params = [];

    if (search) {
      query += ' AND (cr.name LIKE ? OR cr.email LIKE ? OR cr.title LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (!isSuperadmin(req)) {
      query += ' AND cr.org_id = ?';
      params.push(req.user.orgId);
    }

    const countQuery = query.replace('SELECT cr.*, o.name AS org_name', 'SELECT COUNT(*) AS total');
    const [[{ total }]] = await pool.execute(countQuery, params);

    query += ` ORDER BY cr.name LIMIT ${parseInt(limit, 10)} OFFSET ${offset}`;

    const [reps] = await pool.execute(query, params);
    res.json({ reps, total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) {
    console.error('GET /company-reps error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/company-reps — create company rep
router.post('/company-reps', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const { name, title, territory, email, phone } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required.' });
    const orgId = getScopedOrgId(req, req.body.org_id);

    const [result] = await pool.execute(
      'INSERT INTO company_reps (name, title, territory, email, phone, org_id) VALUES (?, ?, ?, ?, ?, ?)',
      [name.trim(), title || null, territory || null, email || null, phone || null, orgId]
    );
    await audit(req.user.userId, req.user.email, 'CREATE', 'company_rep', result.insertId, { name });
    const [[created]] = await pool.execute('SELECT * FROM company_reps WHERE id = ?', [result.insertId]);
    res.status(201).json({ message: 'Company rep created.', id: result.insertId, rep: created });
  } catch (err) {
    console.error('POST /company-reps error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/admin/company-reps/:id — update company rep
router.put('/company-reps/:id', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const { id } = req.params;
    const [[existing]] = await pool.execute(
      isSuperadmin(req)
        ? 'SELECT id FROM company_reps WHERE id = ?'
        : 'SELECT id FROM company_reps WHERE id = ? AND org_id = ?',
      isSuperadmin(req) ? [id] : [id, req.user.orgId]
    );
    if (!existing) return res.status(404).json({ error: 'Company rep not found.' });

    const { name, title, territory, email, phone } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required.' });
    const orgId = getScopedOrgId(req, req.body.org_id);

    await pool.execute(
      'UPDATE company_reps SET name = ?, title = ?, territory = ?, email = ?, phone = ?, org_id = ?, updated_at = NOW() WHERE id = ?',
      [name.trim(), title || null, territory || null, email || null, phone || null, orgId, id]
    );
    await audit(req.user.userId, req.user.email, 'UPDATE', 'company_rep', Number(id), { name });
    res.json({ message: 'Company rep updated.' });
  } catch (err) {
    console.error('PUT /company-reps/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/admin/company-reps/:id — soft delete
router.delete('/company-reps/:id', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const { id } = req.params;
    const [[existing]] = await pool.execute(
      isSuperadmin(req)
        ? 'SELECT id, name FROM company_reps WHERE id = ?'
        : 'SELECT id, name FROM company_reps WHERE id = ? AND org_id = ?',
      isSuperadmin(req) ? [id] : [id, req.user.orgId]
    );
    if (!existing) return res.status(404).json({ error: 'Company rep not found.' });

    await pool.execute('UPDATE company_reps SET is_active = 0, updated_at = NOW() WHERE id = ?', [id]);
    await audit(req.user.userId, req.user.email, 'DELETE', 'company_rep', Number(id), { name: existing.name });
    res.json({ message: 'Company rep deactivated.' });
  } catch (err) {
    console.error('DELETE /company-reps/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
