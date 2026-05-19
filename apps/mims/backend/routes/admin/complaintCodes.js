'use strict';

/**
 * complaintCodes.js — Sprint 2 #19 surface for complaint codes + lot master.
 *
 *   GET    /api/complaint-codes?family=manufacturer_defect    — read for PC form picker
 *   GET    /api/complaint-codes/families
 *   GET    /api/admin/complaint-codes
 *   POST   /api/admin/complaint-codes
 *   PUT    /api/admin/complaint-codes/:id
 *   DELETE /api/admin/complaint-codes/:id   (soft via is_active=0)
 *
 *   GET    /api/lot-master?product_id=&q=
 *   GET    /api/lot-master/:id
 *   POST   /api/lot-master            (admin)
 *   PUT    /api/lot-master/:id        (admin or QA)
 *   POST   /api/lot-master/:id/recall  body { recall_reason }
 */

const express = require('express');
const router  = express.Router();
const pool    = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');

const ADMIN = ['admin', 'superadmin'];

// ── Complaint code families + codes ──────────────────────────────────────────

router.get('/complaint-codes/families', authenticate, async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT * FROM complaint_code_families WHERE is_active = 1 ORDER BY sort_order, label`
    );
    res.json({ families: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/complaint-codes', authenticate, async (req, res) => {
  try {
    const orgId = req.user.orgId ?? null;
    const { family } = req.query || {};
    const params = [orgId];
    let where = ` WHERE c.is_active = 1 AND (c.org_id IS NULL OR c.org_id = ?) `;
    if (family) { where += ' AND f.code_family = ?'; params.push(family); }
    const [rows] = await pool.execute(
      `SELECT c.id, c.code, c.label, c.description, c.family_id,
              f.code_family, f.label AS family_label
         FROM complaint_codes c
         JOIN complaint_code_families f ON f.id = c.family_id
        ${where}
        ORDER BY f.sort_order, c.sort_order, c.code`,
      params
    );
    res.json({ codes: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/admin/complaint-codes', authenticate, requireRole(...ADMIN), async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT c.*, f.code_family, f.label AS family_label
         FROM complaint_codes c
         JOIN complaint_code_families f ON f.id = c.family_id
        ORDER BY f.sort_order, c.sort_order, c.code`
    );
    res.json({ codes: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/admin/complaint-codes', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const { id, org_id = null, family_id, code, label, description = null, sort_order = 0, is_active = 1 } = req.body || {};
    if (!family_id || !code || !label) return res.status(400).json({ error: 'family_id + code + label required' });
    if (id) {
      await pool.execute(
        `UPDATE complaint_codes SET label = ?, description = ?, sort_order = ?, is_active = ?, updated_at = NOW() WHERE id = ?`,
        [label, description, sort_order, is_active ? 1 : 0, id]
      );
    } else {
      await pool.execute(
        `INSERT INTO complaint_codes (org_id, family_id, code, label, description, sort_order, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [org_id, family_id, code, label, description, sort_order, is_active ? 1 : 0]
      );
    }
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/admin/complaint-codes/:id', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    await pool.execute(`UPDATE complaint_codes SET is_active = 0 WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Lot master ───────────────────────────────────────────────────────────────

router.get('/lot-master', authenticate, async (req, res) => {
  try {
    const { product_id, q } = req.query || {};
    const params = [req.user.orgId];
    let where = ` WHERE org_id = ? `;
    if (product_id) { where += ' AND product_id = ?'; params.push(Number(product_id)); }
    if (q)          { where += ' AND lot_number LIKE ?'; params.push(`%${q}%`); }
    const [rows] = await pool.execute(
      `SELECT id, product_id, lot_number, manufacture_date, expiry_date,
              manufacturer_site, quantity_produced, status, recalled_at
         FROM lot_master ${where}
         ORDER BY expiry_date DESC, lot_number
         LIMIT 200`,
      params
    );
    res.json({ lots: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/lot-master/:id', authenticate, async (req, res) => {
  try {
    const [[row]] = await pool.execute(
      `SELECT * FROM lot_master WHERE id = ? AND org_id = ?`,
      [req.params.id, req.user.orgId]
    );
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json({ lot: row });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/lot-master', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const {
      product_id, lot_number, manufacture_date = null, expiry_date = null,
      manufacturer_site = null, quantity_produced = null, status = 'active', notes = null,
    } = req.body || {};
    if (!product_id || !lot_number) return res.status(400).json({ error: 'product_id + lot_number required' });
    const [r] = await pool.execute(
      `INSERT INTO lot_master
         (org_id, product_id, lot_number, manufacture_date, expiry_date,
          manufacturer_site, quantity_produced, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.orgId, product_id, lot_number, manufacture_date, expiry_date,
       manufacturer_site, quantity_produced, status, notes]
    );
    res.json({ ok: true, id: r.insertId });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.put('/lot-master/:id', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const allowed = ['manufacture_date','expiry_date','manufacturer_site','quantity_produced','status','notes'];
    const sets = []; const params = [];
    for (const k of allowed) {
      if (req.body[k] !== undefined) { sets.push(`${k} = ?`); params.push(req.body[k]); }
    }
    if (!sets.length) return res.json({ ok: true });
    params.push(req.params.id, req.user.orgId);
    await pool.execute(
      `UPDATE lot_master SET ${sets.join(', ')}, updated_at = NOW() WHERE id = ? AND org_id = ?`,
      params
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/lot-master/:id/recall', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const { recall_id = null } = req.body || {};
    await pool.execute(
      `UPDATE lot_master SET status = 'recalled', recalled_at = NOW(), recall_id = ? WHERE id = ? AND org_id = ?`,
      [recall_id, req.params.id, req.user.orgId]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
