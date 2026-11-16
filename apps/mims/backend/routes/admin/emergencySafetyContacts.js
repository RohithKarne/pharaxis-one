'use strict';

/**
 * admin/emergencySafetyContacts.js — Emergency Safety Contact Directory API
 *
 * Manages 24/7 on-call medical safety physicians for expedited serious AE handoffs
 * and immediate safety escalation (Ticket 6, Clinical Governance).
 */

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');
const { hasGlobalAdminScope } = require('../../utils/adminScope');
const { logAudit } = require('../../utils/auditLog');

const ADMIN = ['admin', 'platform_admin'];

function resolveOrgId(req) {
  if (hasGlobalAdminScope(req.user)) {
    return Number(req.query.org_id || req.body?.org_id || 0) || req.user.orgId || 1;
  }
  return req.user.orgId || 1;
}

// GET /emergency-safety-contacts
router.get('/emergency-safety-contacts', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    const [rows] = await pool.query(
      `SELECT * FROM emergency_safety_contacts
        WHERE org_id = ?
        ORDER BY is_primary DESC, is_active DESC, physician_name ASC`,
      [orgId]
    );
    res.json({ contacts: rows, org_id: orgId });
  } catch (err) {
    console.error('GET /emergency-safety-contacts error:', err);
    res.status(500).json({ error: 'Server error loading emergency safety contacts.' });
  }
});

// POST /emergency-safety-contacts
router.post('/emergency-safety-contacts', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    const { physician_name, medical_title, email, phone_24h, time_zone, is_primary, is_active } = req.body;

    if (!physician_name || !email || !phone_24h) {
      return res.status(400).json({ error: 'physician_name, email, and phone_24h are required.' });
    }

    if (is_primary) {
      await pool.execute('UPDATE emergency_safety_contacts SET is_primary = 0 WHERE org_id = ?', [orgId]);
    }

    const [insertRes] = await pool.execute(
      `INSERT INTO emergency_safety_contacts
       (org_id, physician_name, medical_title, email, phone_24h, time_zone, is_primary, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        orgId,
        physician_name,
        medical_title || 'Medical Safety Officer',
        email,
        phone_24h,
        time_zone || 'UTC',
        is_primary ? 1 : 0,
        is_active !== undefined ? (is_active ? 1 : 0) : 1
      ]
    );

    await logAudit(req.user.userId, req.user.email, 'CREATE', 'emergency_safety_contact', insertRes.insertId, {
      physician_name,
      email,
      phone_24h,
      is_primary
    });

    res.status(201).json({ id: insertRes.insertId, message: 'Emergency safety contact added successfully.' });
  } catch (err) {
    console.error('POST /emergency-safety-contacts error:', err);
    res.status(500).json({ error: 'Server error adding emergency safety contact.' });
  }
});

// PUT /emergency-safety-contacts/:id
router.put('/emergency-safety-contacts/:id', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const orgId = resolveOrgId(req);
    const [[existing]] = await pool.execute('SELECT * FROM emergency_safety_contacts WHERE id = ? AND org_id = ?', [id, orgId]);
    if (!existing) return res.status(404).json({ error: 'Contact not found.' });

    const { physician_name, medical_title, email, phone_24h, time_zone, is_primary, is_active } = req.body;

    if (is_primary) {
      await pool.execute('UPDATE emergency_safety_contacts SET is_primary = 0 WHERE org_id = ? AND id != ?', [orgId, id]);
    }

    await pool.execute(
      `UPDATE emergency_safety_contacts
          SET physician_name = COALESCE(?, physician_name),
              medical_title  = COALESCE(?, medical_title),
              email          = COALESCE(?, email),
              phone_24h      = COALESCE(?, phone_24h),
              time_zone      = COALESCE(?, time_zone),
              is_primary     = COALESCE(?, is_primary),
              is_active      = COALESCE(?, is_active),
              updated_at     = NOW()
        WHERE id = ? AND org_id = ?`,
      [
        physician_name || null,
        medical_title || null,
        email || null,
        phone_24h || null,
        time_zone || null,
        is_primary !== undefined ? (is_primary ? 1 : 0) : null,
        is_active !== undefined ? (is_active ? 1 : 0) : null,
        id,
        orgId
      ]
    );

    await logAudit(req.user.userId, req.user.email, 'UPDATE', 'emergency_safety_contact', id, { physician_name, email });
    res.json({ message: 'Emergency safety contact updated successfully.' });
  } catch (err) {
    console.error('PUT /emergency-safety-contacts/:id error:', err);
    res.status(500).json({ error: 'Server error updating emergency safety contact.' });
  }
});

// DELETE /emergency-safety-contacts/:id
router.delete('/emergency-safety-contacts/:id', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const orgId = resolveOrgId(req);
    const [[existing]] = await pool.execute('SELECT id FROM emergency_safety_contacts WHERE id = ? AND org_id = ?', [id, orgId]);
    if (!existing) return res.status(404).json({ error: 'Contact not found.' });

    await pool.execute('DELETE FROM emergency_safety_contacts WHERE id = ? AND org_id = ?', [id, orgId]);
    await logAudit(req.user.userId, req.user.email, 'DELETE', 'emergency_safety_contact', id, {});
    res.json({ message: 'Emergency safety contact deleted.' });
  } catch (err) {
    console.error('DELETE /emergency-safety-contacts/:id error:', err);
    res.status(500).json({ error: 'Server error deleting emergency safety contact.' });
  }
});

module.exports = router;
