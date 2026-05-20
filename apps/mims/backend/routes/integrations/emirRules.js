'use strict';

const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../../middleware/auth');
const pool = require('../../database/db');

router.get('/admin/emir/sender-rules', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM emir_sender_rules WHERE org_id = ? ORDER BY sender_email ASC',
      [req.user.orgId]
    );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/admin/emir/sender-rules', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const { sender_email, sender_name, is_trusted, notes } = req.body;
    const [result] = await pool.query(
      `INSERT INTO emir_sender_rules (org_id, sender_email, sender_name, is_trusted, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [req.user.orgId, sender_email, sender_name, is_trusted, notes]
    );
    return res.json({ id: result.insertId });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.put('/admin/emir/sender-rules/:id', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { sender_email, sender_name, is_trusted, notes } = req.body;

    const [rows] = await pool.query(
      'SELECT id FROM emir_sender_rules WHERE id = ? AND org_id = ? LIMIT 1',
      [id, req.user.orgId]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Sender rule not found' });
    }

    await pool.query(
      `UPDATE emir_sender_rules
       SET sender_email = ?, sender_name = ?, is_trusted = ?, notes = ?
       WHERE id = ? AND org_id = ?`,
      [sender_email, sender_name, is_trusted, notes, id, req.user.orgId]
    );

    return res.json({ message: 'Updated' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.delete('/admin/emir/sender-rules/:id', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      'SELECT id FROM emir_sender_rules WHERE id = ? AND org_id = ? LIMIT 1',
      [id, req.user.orgId]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Sender rule not found' });
    }

    await pool.query('DELETE FROM emir_sender_rules WHERE id = ? AND org_id = ?', [id, req.user.orgId]);
    return res.json({ message: 'Deleted' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/admin/emir/routing-rules', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM emir_routing_rules WHERE org_id = ? ORDER BY priority ASC',
      [req.user.orgId]
    );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/admin/emir/routing-rules', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const {
      rule_name,
      match_field,
      match_value,
      route_to_queue,
      route_to_user_id,
      priority,
      is_active,
    } = req.body;

    const [result] = await pool.query(
      `INSERT INTO emir_routing_rules
       (org_id, rule_name, match_field, match_value, route_to_queue, route_to_user_id, priority, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.orgId,
        rule_name,
        match_field,
        match_value,
        route_to_queue,
        route_to_user_id,
        priority,
        is_active,
      ]
    );

    return res.json({ id: result.insertId });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.put('/admin/emir/routing-rules/:id', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      rule_name,
      match_field,
      match_value,
      route_to_queue,
      route_to_user_id,
      priority,
      is_active,
    } = req.body;

    const [rows] = await pool.query(
      'SELECT id FROM emir_routing_rules WHERE id = ? AND org_id = ? LIMIT 1',
      [id, req.user.orgId]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Routing rule not found' });
    }

    await pool.query(
      `UPDATE emir_routing_rules
       SET rule_name = ?,
           match_field = ?,
           match_value = ?,
           route_to_queue = ?,
           route_to_user_id = ?,
           priority = ?,
           is_active = ?
       WHERE id = ? AND org_id = ?`,
      [
        rule_name,
        match_field,
        match_value,
        route_to_queue,
        route_to_user_id,
        priority,
        is_active,
        id,
        req.user.orgId,
      ]
    );

    return res.json({ message: 'Updated' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.delete('/admin/emir/routing-rules/:id', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      'SELECT id FROM emir_routing_rules WHERE id = ? AND org_id = ? LIMIT 1',
      [id, req.user.orgId]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Routing rule not found' });
    }

    await pool.query('DELETE FROM emir_routing_rules WHERE id = ? AND org_id = ?', [id, req.user.orgId]);
    return res.json({ message: 'Deleted' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
