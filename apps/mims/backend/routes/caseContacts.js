'use strict';

/**
 * caseContacts.js — Case Contact/Requestor Section API
 * F-14: Contact entries linked to a case, live search from F-08 repo, DNUMD sync-back (Bhavya)
 *
 * DNUMD (Do Not Update Master Data): when do_not_update_master = 0 and contact_id is set,
 * edits made to the case contact entry are written back to the master contacts table.
 */

const express = require('express');
const router  = express.Router();
const pool    = require('../database/db');
const { authenticate } = require('../middleware/auth');
const { hasGlobalAdminScope } = require('../utils/adminScope');

// ─── ORG ISOLATION HELPERS ───────────────────────────────────────────────────

// Verify parent case belongs to requesting user's org
async function verifyCaseOrg(caseId, req) {
  const [[c]] = await pool.execute('SELECT org_id FROM cases WHERE id = ?', [caseId]);
  if (!c) return false;
  if (hasGlobalAdminScope(req.user)) return true;
  return Number(c.org_id) === Number(req.user.orgId);
}

// Verify a case_contact row belongs to requesting user's org (via its parent case)
async function verifyCaseContactOrg(ccId, req) {
  const [[row]] = await pool.execute(
    `SELECT c.org_id FROM case_contacts cc
     JOIN cases c ON cc.case_id = c.id
     WHERE cc.id = ?`,
    [ccId]
  );
  if (!row) return false;
  if (hasGlobalAdminScope(req.user)) return true;
  return Number(row.org_id) === Number(req.user.orgId);
}

async function verifyMasterContactOrg(contactId, req) {
  const [[row]] = await pool.execute('SELECT org_id FROM contacts WHERE id = ?', [contactId]);
  if (!row) return false;
  if (hasGlobalAdminScope(req.user)) return true;
  return Number(row.org_id) === Number(req.user.orgId);
}

// GET /api/cases/:id/contacts — list contacts attached to a case
router.get('/cases/:id/contacts', authenticate, async (req, res) => {
  try {
    if (!await verifyCaseOrg(req.params.id, req)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const [rows] = await pool.execute(
      `SELECT cc.*, c.email AS master_email, c.phone AS master_phone
       FROM case_contacts cc
       LEFT JOIN contacts c ON cc.contact_id = c.id
       WHERE cc.case_id = ?
       ORDER BY cc.is_primary DESC, cc.id ASC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET case contacts error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cases/:id/contacts — add a contact to the case
router.post('/cases/:id/contacts', authenticate, async (req, res) => {
  try {
    if (!await verifyCaseOrg(req.params.id, req)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const {
      contact_id, contact_role = 'reporter',
      do_not_update_master = 0, is_primary = 0,
      first_name, last_name, contact_type,
      specialty, institution, phone, email, address
    } = req.body;

    if (contact_id && !await verifyMasterContactOrg(contact_id, req)) {
      return res.status(403).json({ error: 'Invalid contact reference for your organisation.' });
    }

    const [result] = await pool.execute(
      `INSERT INTO case_contacts
        (case_id, contact_id, contact_role, do_not_update_master, is_primary,
         first_name, last_name, contact_type, specialty, institution, phone, email, address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.params.id, contact_id || null, contact_role,
        do_not_update_master ? 1 : 0, is_primary ? 1 : 0,
        first_name || null, last_name || null, contact_type || null,
        specialty || null, institution || null,
        phone || null, email || null, address || null
      ]
    );

    // DNUMD sync-back: if master updates are allowed and contact exists, sync fields back
    if (!do_not_update_master && contact_id) {
      await syncBackToMaster(contact_id, { first_name, specialty, institution, phone, email }, req);
    }

    const [[row]] = await pool.execute(
      'SELECT * FROM case_contacts WHERE id = ?', [result.insertId]
    );
    res.status(201).json(row);
  } catch (err) {
    console.error('POST case contacts error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/cases/contacts/:ccId — update a specific case contact entry
router.put('/cases/contacts/:ccId', authenticate, async (req, res) => {
  try {
    if (!await verifyCaseContactOrg(req.params.ccId, req)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const {
      contact_role, do_not_update_master, is_primary,
      first_name, last_name, contact_type,
      specialty, institution, phone, email, address
    } = req.body;

    await pool.execute(
      `UPDATE case_contacts SET
        contact_role         = COALESCE(?, contact_role),
        do_not_update_master = COALESCE(?, do_not_update_master),
        is_primary           = COALESCE(?, is_primary),
        first_name           = COALESCE(?, first_name),
        last_name            = COALESCE(?, last_name),
        contact_type         = COALESCE(?, contact_type),
        specialty            = COALESCE(?, specialty),
        institution          = COALESCE(?, institution),
        phone                = COALESCE(?, phone),
        email                = COALESCE(?, email),
        address              = COALESCE(?, address)
       WHERE id = ?`,
      [
        contact_role         ?? null,
        do_not_update_master ?? null,
        is_primary           ?? null,
        first_name           ?? null,
        last_name            ?? null,
        contact_type         ?? null,
        specialty            ?? null,
        institution          ?? null,
        phone                ?? null,
        email                ?? null,
        address              ?? null,
        req.params.ccId
      ]
    );

    const [[cc]] = await pool.execute(
      'SELECT * FROM case_contacts WHERE id = ?', [req.params.ccId]
    );

    // DNUMD sync-back on edit
    if (cc && !cc.do_not_update_master && cc.contact_id) {
      if (await verifyMasterContactOrg(cc.contact_id, req)) {
        await syncBackToMaster(cc.contact_id, { first_name, specialty, institution, phone, email }, req);
      }
    }

    res.json(cc);
  } catch (err) {
    console.error('PUT case contact error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/cases/contacts/:ccId — remove contact from case
router.delete('/cases/contacts/:ccId', authenticate, async (req, res) => {
  try {
    if (!await verifyCaseContactOrg(req.params.ccId, req)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    await pool.execute('DELETE FROM case_contacts WHERE id = ?', [req.params.ccId]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE case contact error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── CONTACT SEARCH (live search for Case Form lookup) ────────────────────────

// GET /api/cases/contacts/search?q=... — search master contacts repo for case form lookup
router.get('/cases/contacts/search', authenticate, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) return res.json([]);
    const term = `%${q.trim()}%`;
    const params = [term, term, term, term];
    let orgClause = '';
    if (!hasGlobalAdminScope(req.user)) {
      orgClause = ' AND org_id = ?';
      params.push(req.user.orgId);
    }
    const [rows] = await pool.execute(
      `SELECT id, first_name, last_name, type, specialty, institution, phone, email, address,
              do_not_update_master
       FROM contacts
       WHERE is_active = 1
         AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR phone LIKE ?)
         ${orgClause}
       LIMIT 20`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error('contact search error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── INTERNAL HELPER ─────────────────────────────────────────────────────────

async function syncBackToMaster(contactId, fields, req) {
  const updates = [];
  const params  = [];
  const map = {
    first_name:  fields.first_name,
    specialty:   fields.specialty,
    institution: fields.institution,
    phone:       fields.phone,
    email:       fields.email,
  };
  for (const [col, val] of Object.entries(map)) {
    if (val !== undefined && val !== null) {
      updates.push(`${col} = ?`);
      params.push(val);
    }
  }
  if (updates.length) {
    if (req?.user?.role === 'platform_admin') {
      params.push(contactId);
      await pool.execute(
        `UPDATE contacts SET ${updates.join(', ')} WHERE id = ?`,
        params
      );
      return;
    }
    params.push(contactId, req.user.orgId);
    await pool.execute(
      `UPDATE contacts SET ${updates.join(', ')} WHERE id = ? AND org_id = ?`,
      params
    );
  }
}

module.exports = router;
