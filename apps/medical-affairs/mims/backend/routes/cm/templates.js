'use strict';

/**
 * cm/templates.js — Content Management Templates API
 * Email/response/acknowledgment templates (no lifecycle, just Active/Inactive).
 */

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate } = require('../../middleware/auth');

async function audit(userId, userName, action, entity, entityId, details) {
  try {
    await pool.execute(
      'INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, userName, action, entity, entityId, JSON.stringify(details)]
    );
  } catch (_) {}
}

// GET /api/cm/templates — list with filters
router.get('/templates', authenticate, async (req, res) => {
  try {
    const { type, status, search, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let query = `
      SELECT t.*, u.name AS created_by_name
      FROM cm_templates t
      LEFT JOIN users u ON t.created_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (type) {
      query += ' AND t.type = ?';
      params.push(type);
    }
    if (status) {
      query += ' AND t.status = ?';
      params.push(status);
    }
    if (search) {
      query += ' AND (t.name LIKE ? OR t.subject LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    const countQuery = query.replace('SELECT t.*, u.name AS created_by_name', 'SELECT COUNT(*) AS total');
    const [[{ total }]] = await pool.execute(countQuery, params);

    query += ` ORDER BY t.name LIMIT ${parseInt(limit, 10)} OFFSET ${offset}`;

    const [templates] = await pool.execute(query, params);
    res.json({ templates, total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) {
    console.error('GET /cm/templates error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/cm/templates — create template
router.post('/templates', authenticate, async (req, res) => {
  try {
    const { type, name, subject, body_html, status } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required.' });

    const [result] = await pool.execute(
      'INSERT INTO cm_templates (type, name, subject, body_html, status, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      [type || 'Response', name.trim(), subject || null, body_html || null, status || 'Active', req.user.userId]
    );
    await audit(req.user.userId, req.user.email, 'CREATE', 'cm_template', result.insertId, { name, type: type || 'Response' });
    const [[created]] = await pool.execute('SELECT * FROM cm_templates WHERE id = ?', [result.insertId]);
    res.status(201).json({ message: 'Template created.', id: result.insertId, template: created });
  } catch (err) {
    console.error('POST /cm/templates error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/cm/templates/:id — get template
router.get('/templates/:id', authenticate, async (req, res) => {
  try {
    const [[template]] = await pool.execute(
      `SELECT t.*, u.name AS created_by_name, uu.name AS updated_by_name
       FROM cm_templates t
       LEFT JOIN users u ON t.created_by = u.id
       LEFT JOIN users uu ON t.updated_by = uu.id
       WHERE t.id = ?`,
      [req.params.id]
    );
    if (!template) return res.status(404).json({ error: 'Template not found.' });
    res.json({ template });
  } catch (err) {
    console.error('GET /cm/templates/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/cm/templates/:id — update template
router.put('/templates/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const [[existing]] = await pool.execute('SELECT id FROM cm_templates WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Template not found.' });

    const { type, name, subject, body_html, status } = req.body;
    await pool.execute(
      'UPDATE cm_templates SET type = ?, name = ?, subject = ?, body_html = ?, status = ?, updated_by = ?, updated_at = NOW() WHERE id = ?',
      [type || 'Response', name, subject || null, body_html || null, status || 'Active', req.user.userId, id]
    );
    await audit(req.user.userId, req.user.email, 'UPDATE', 'cm_template', Number(id), { name, type });
    res.json({ message: 'Template updated.' });
  } catch (err) {
    console.error('PUT /cm/templates/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PATCH /api/cm/templates/:id/status — toggle Active/Inactive
router.patch('/templates/:id/status', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const [[existing]] = await pool.execute('SELECT id, status, name FROM cm_templates WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Template not found.' });

    const newStatus = existing.status === 'Active' ? 'Inactive' : 'Active';
    await pool.execute(
      'UPDATE cm_templates SET status = ?, updated_by = ?, updated_at = NOW() WHERE id = ?',
      [newStatus, req.user.userId, id]
    );
    await audit(req.user.userId, req.user.email, 'STATUS_CHANGE', 'cm_template', Number(id), { name: existing.name, status: newStatus });
    res.json({ message: `Template ${newStatus === 'Active' ? 'activated' : 'deactivated'}.`, status: newStatus });
  } catch (err) {
    console.error('PATCH /cm/templates/:id/status error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
