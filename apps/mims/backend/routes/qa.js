'use strict';
/**
 * routes/qa.js — UAT QA System API
 *
 * Bug Reports:
 *   POST   /api/qa/feedback              — submit a bug report (any authenticated user)
 *   GET    /api/qa/feedback              — list all reports (admin/platform admin)
 *   GET    /api/qa/feedback/:id          — get single report
 *   PATCH  /api/qa/feedback/:id          — update status, notes, assignee (admin)
 *
 * Feature Requests:
 *   POST   /api/qa/features              — submit a feature request (any authenticated user)
 *   GET    /api/qa/features              — list all feature requests (admin)
 *   GET    /api/qa/features/:id          — get single feature request
 *   PATCH  /api/qa/features/:id          — update status, sprint, notes (admin)
 *   POST   /api/qa/features/:id/vote     — upvote a feature request (any user, once per user)
 *   DELETE /api/qa/features/:id/vote     — remove own upvote
 *
 * Stats:
 *   GET    /api/qa/stats                 — dashboard summary counts
 */

const express   = require('express');
const router    = express.Router();
const pool      = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { logger } = require('../services/logger');
const { createNotifications } = require('../services/notificationCenterService');
const { hasGlobalAdminScope, isAdminUser } = require('../utils/adminScope');

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitize(str, max = 5000) {
  if (!str) return null;
  return String(str).trim().slice(0, max) || null;
}

function paginationParams(query) {
  const page     = Math.max(1, parseInt(query.page  || '1',  10));
  const pageSize = Math.min(100, Math.max(5, parseInt(query.page_size || '25', 10)));
  const offset   = (page - 1) * pageSize;
  return { page, pageSize, offset };
}

// ══════════════════════════════════════════════════════════════════════════════
// BUG REPORTS
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/qa/feedback — submit bug report
router.post('/qa/feedback', authenticate, async (req, res) => {
  try {
    const {
      page_url, module: mod, description, steps_to_reproduce,
      severity = 'wrong', browser_info, console_errors,
    } = req.body;

    if (!description || !String(description).trim()) {
      return res.status(400).json({ error: 'Description is required.' });
    }

    const validSeverities = ['critical', 'broken', 'wrong', 'minor'];
    if (!validSeverities.includes(severity)) {
      return res.status(400).json({ error: 'Invalid severity value.' });
    }

    const [result] = await pool.execute(
      `INSERT INTO qa_feedback
         (org_id, user_id, user_name, user_email, page_url, module, description,
          steps_to_reproduce, severity, browser_info, console_errors)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.orgId  || null,
        req.user.userId || null,
        sanitize(req.user.name  || req.user.email, 255),
        sanitize(req.user.email, 255),
        sanitize(page_url, 1000),
        sanitize(mod, 100),
        sanitize(description, 5000),
        sanitize(steps_to_reproduce, 5000),
        severity,
        sanitize(browser_info, 500),
        sanitize(console_errors, 5000),
      ]
    );

    logger.info({ id: result.insertId, severity, user: req.user.email }, 'qa: bug report submitted');
    res.status(201).json({ id: result.insertId, message: 'Bug report submitted. Thank you!' });
  } catch (err) {
    logger.error({ err: err.message }, 'qa: feedback POST error');
    res.status(500).json({ error: 'Failed to submit report.' });
  }
});

// GET /api/qa/feedback — list (admin only)
router.get('/qa/feedback', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { page, pageSize, offset } = paginationParams(req.query);
    const { status = '', severity = '', module: mod = '', search = '' } = req.query;

    const conditions = [];
    const params     = [];

    if (!hasGlobalAdminScope(req.user)) {
      conditions.push('org_id = ?');
      params.push(req.user.orgId);
    }
    if (status)   { conditions.push('status = ?');   params.push(status); }
    if (severity) { conditions.push('severity = ?'); params.push(severity); }
    if (mod)      { conditions.push('module = ?');   params.push(mod); }
    if (search)   {
      conditions.push('(description LIKE ? OR user_email LIKE ? OR page_url LIKE ?)');
      const q = `%${search}%`;
      params.push(q, q, q);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM qa_feedback ${where}`, params
    );
    const [rows] = await pool.execute(
      `SELECT * FROM qa_feedback ${where} ORDER BY reported_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    res.json({ rows, total, page, page_size: pageSize, total_pages: Math.ceil(total / pageSize) });
  } catch (err) {
    logger.error({ err: err.message }, 'qa: feedback GET error');
    res.status(500).json({ error: 'Failed to fetch reports.' });
  }
});

// GET /api/qa/feedback/:id
router.get('/qa/feedback/:id', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const conditions = ['id = ?'];
    const params     = [id];
    if (!hasGlobalAdminScope(req.user)) { conditions.push('org_id = ?'); params.push(req.user.orgId); }

    const [[row]] = await pool.execute(
      `SELECT * FROM qa_feedback WHERE ${conditions.join(' AND ')}`, params
    );
    if (!row) return res.status(404).json({ error: 'Report not found.' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch report.' });
  }
});

// PATCH /api/qa/feedback/:id — update status / notes / assignee
router.patch('/qa/feedback/:id', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { status, assigned_to, dev_notes } = req.body;

    const validStatuses = ['new', 'investigating', 'confirmed', 'fixed', 'verified', 'closed'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value.' });
    }

    const sets      = [];
    const setParams = [];
    if (status !== undefined)      { sets.push('status = ?');      setParams.push(status); }
    if (assigned_to !== undefined) { sets.push('assigned_to = ?'); setParams.push(sanitize(assigned_to, 255)); }
    if (dev_notes !== undefined)   { sets.push('dev_notes = ?');   setParams.push(sanitize(dev_notes, 5000)); }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });

    const orgCond   = hasGlobalAdminScope(req.user) ? '' : ' AND org_id = ?';
    const condParams = hasGlobalAdminScope(req.user) ? [id] : [req.user.orgId, id];

    const [result] = await pool.execute(
      `UPDATE qa_feedback SET ${sets.join(', ')} WHERE id = ?${orgCond}`,
      [...setParams, ...condParams]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Report not found.' });

    // When a bug is confirmed, notify all admins in the org so Varun/Saad see it immediately
    if (status === 'confirmed') {
      try {
        const [[report]] = await pool.execute(`SELECT * FROM qa_feedback WHERE id = ?`, [id]);
        const orgCond    = hasGlobalAdminScope(req.user) ? '' : 'AND role IN (\'admin\',\'platform_admin\') AND org_id = ?';
        const orgParams  = hasGlobalAdminScope(req.user) ? [] : [req.user.orgId];
        const [admins]   = await pool.execute(
          `SELECT id FROM users WHERE is_active = 1 AND role IN ('admin','platform_admin') ${orgCond}`,
          orgParams
        );
        const adminIds = admins.map(a => a.id).filter(uid => uid !== req.user.userId);
        if (adminIds.length && report) {
          await createNotifications(adminIds, {
            category:  'qa',
            title:     `Bug Confirmed: ${report.severity?.toUpperCase()} severity`,
            message:   (report.description || '').slice(0, 120),
            linkUrl:   `/admin-console/uat-bugs`,
            severity:  report.severity === 'critical' ? 'error' : 'warning',
            eventKey:  `qa_bug_confirmed_${id}`,
            metadata:  { bug_id: id, severity: report.severity, confirmed_by: req.user.email },
          }).catch(() => {});
        }
      } catch (_) {}
    }

    logger.info({ id, status, user: req.user.email }, 'qa: feedback updated');
    res.json({ message: 'Report updated.' });
  } catch (err) {
    logger.error({ err: err.message }, 'qa: feedback PATCH error');
    res.status(500).json({ error: 'Failed to update report.' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// FEATURE REQUESTS
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/qa/features — submit feature request
router.post('/qa/features', authenticate, async (req, res) => {
  try {
    const {
      module: mod, current_pain, suggestion, use_frequency = 'weekly', priority = 'nice-to-have',
    } = req.body;

    if (!suggestion || !String(suggestion).trim()) {
      return res.status(400).json({ error: 'Suggestion is required.' });
    }

    const validFreq = ['daily', 'weekly', 'rarely'];
    const validPrio = ['critical', 'nice-to-have'];
    if (!validFreq.includes(use_frequency)) return res.status(400).json({ error: 'Invalid use_frequency.' });
    if (!validPrio.includes(priority))      return res.status(400).json({ error: 'Invalid priority.' });

    const [result] = await pool.execute(
      `INSERT INTO feature_requests
         (org_id, user_id, user_name, user_email, module, current_pain, suggestion, use_frequency, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.orgId  || null,
        req.user.userId || null,
        sanitize(req.user.name  || req.user.email, 255),
        sanitize(req.user.email, 255),
        sanitize(mod, 100),
        sanitize(current_pain, 5000),
        sanitize(suggestion, 5000),
        use_frequency,
        priority,
      ]
    );

    logger.info({ id: result.insertId, user: req.user.email }, 'qa: feature request submitted');
    res.status(201).json({ id: result.insertId, message: 'Feature suggestion submitted. Thank you!' });
  } catch (err) {
    logger.error({ err: err.message }, 'qa: features POST error');
    res.status(500).json({ error: 'Failed to submit feature request.' });
  }
});

// GET /api/qa/features — list
router.get('/qa/features', authenticate, async (req, res) => {
  try {
    const { page, pageSize, offset } = paginationParams(req.query);
    const { status = '', module: mod = '', search = '' } = req.query;
    const isAdmin = isAdminUser(req.user);

    const conditions = [];
    const params     = [];

    if (!hasGlobalAdminScope(req.user)) {
      conditions.push('org_id = ?');
      params.push(req.user.orgId);
    }
    if (status) { conditions.push('status = ?'); params.push(status); }
    if (mod)    { conditions.push('module = ?'); params.push(mod); }
    if (search) {
      conditions.push('(suggestion LIKE ? OR current_pain LIKE ?)');
      const q = `%${search}%`;
      params.push(q, q);
    }
    // Non-admins only see non-declined requests
    if (!isAdmin) { conditions.push("status != 'declined'"); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [[{ total }]] = await pool.execute(`SELECT COUNT(*) AS total FROM feature_requests ${where}`, params);
    const [rows] = await pool.execute(
      `SELECT fr.*,
              (SELECT 1 FROM feature_request_votes frv
               WHERE frv.feature_request_id = fr.id AND frv.user_id = ?) AS user_voted
         FROM feature_requests fr
         ${where}
        ORDER BY votes DESC, submitted_at DESC
        LIMIT ? OFFSET ?`,
      [req.user.userId || 0, ...params, pageSize, offset]
    );

    res.json({ rows, total, page, page_size: pageSize, total_pages: Math.ceil(total / pageSize) });
  } catch (err) {
    logger.error({ err: err.message }, 'qa: features GET error');
    res.status(500).json({ error: 'Failed to fetch feature requests.' });
  }
});

// GET /api/qa/features/:id
router.get('/qa/features/:id', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const conditions = ['fr.id = ?'];
    const params     = [id];
    if (!hasGlobalAdminScope(req.user)) { conditions.push('fr.org_id = ?'); params.push(req.user.orgId); }

    const [[row]] = await pool.execute(
      `SELECT fr.*,
              (SELECT 1 FROM feature_request_votes frv
               WHERE frv.feature_request_id = fr.id AND frv.user_id = ?) AS user_voted
         FROM feature_requests fr
        WHERE ${conditions.join(' AND ')}`,
      [req.user.userId || 0, ...params]
    );
    if (!row) return res.status(404).json({ error: 'Feature request not found.' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch feature request.' });
  }
});

// PATCH /api/qa/features/:id — admin updates
router.patch('/qa/features/:id', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { status, sprint_target, dev_notes, decline_reason } = req.body;

    const validStatuses = ['new', 'under-review', 'planned', 'in-progress', 'shipped', 'declined'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value.' });
    }

    const sets   = [];
    const params = [];
    if (status !== undefined)         { sets.push('status = ?');         params.push(status); }
    if (sprint_target !== undefined)  { sets.push('sprint_target = ?');  params.push(sanitize(sprint_target, 100)); }
    if (dev_notes !== undefined)      { sets.push('dev_notes = ?');      params.push(sanitize(dev_notes, 5000)); }
    if (decline_reason !== undefined) { sets.push('decline_reason = ?'); params.push(sanitize(decline_reason, 2000)); }

    if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });

    const orgCond = hasGlobalAdminScope(req.user) ? '' : ' AND org_id = ?';
    if (!hasGlobalAdminScope(req.user)) params.push(req.user.orgId);
    params.push(id);

    const [result] = await pool.execute(
      `UPDATE feature_requests SET ${sets.join(', ')} WHERE id = ?${orgCond}`,
      params
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Feature request not found.' });

    logger.info({ id, status, user: req.user.email }, 'qa: feature request updated');
    res.json({ message: 'Feature request updated.' });
  } catch (err) {
    logger.error({ err: err.message }, 'qa: features PATCH error');
    res.status(500).json({ error: 'Failed to update feature request.' });
  }
});

// POST /api/qa/features/:id/vote — upvote
router.post('/qa/features/:id/vote', authenticate, async (req, res) => {
  try {
    const featureId = parseInt(req.params.id, 10);
    const userId    = req.user.userId;
    if (!userId) return res.status(401).json({ error: 'User ID required to vote.' });

    // Ensure the feature exists and belongs to the user's org
    const orgCond = hasGlobalAdminScope(req.user) ? '' : ' AND org_id = ?';
    const orgParam = hasGlobalAdminScope(req.user) ? [] : [req.user.orgId];
    const [[feature]] = await pool.execute(
      `SELECT id FROM feature_requests WHERE id = ?${orgCond}`, [featureId, ...orgParam]
    );
    if (!feature) return res.status(404).json({ error: 'Feature request not found.' });

    // Insert vote (unique key prevents double-voting)
    try {
      await pool.execute(
        `INSERT INTO feature_request_votes (feature_request_id, user_id) VALUES (?, ?)`,
        [featureId, userId]
      );
    } catch (dupErr) {
      if (dupErr.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Already voted for this feature.' });
      }
      throw dupErr;
    }

    // Recalculate vote count from votes table (source of truth)
    await pool.execute(
      `UPDATE feature_requests fr
          SET fr.votes = (SELECT COUNT(*) FROM feature_request_votes WHERE feature_request_id = ?)
        WHERE fr.id = ?`,
      [featureId, featureId]
    );

    const [[{ votes }]] = await pool.execute(
      `SELECT votes FROM feature_requests WHERE id = ?`, [featureId]
    );
    res.json({ message: 'Vote recorded.', votes });
  } catch (err) {
    logger.error({ err: err.message }, 'qa: vote POST error');
    res.status(500).json({ error: 'Failed to record vote.' });
  }
});

// DELETE /api/qa/features/:id/vote — remove own vote
router.delete('/qa/features/:id/vote', authenticate, async (req, res) => {
  try {
    const featureId = parseInt(req.params.id, 10);
    const userId    = req.user.userId;

    const [result] = await pool.execute(
      `DELETE FROM feature_request_votes WHERE feature_request_id = ? AND user_id = ?`,
      [featureId, userId]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Vote not found.' });

    await pool.execute(
      `UPDATE feature_requests SET votes = (SELECT COUNT(*) FROM feature_request_votes WHERE feature_request_id = ?) WHERE id = ?`,
      [featureId, featureId]
    );
    const [[{ votes }]] = await pool.execute(`SELECT votes FROM feature_requests WHERE id = ?`, [featureId]);
    res.json({ message: 'Vote removed.', votes });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove vote.' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// DASHBOARD STATS
// ══════════════════════════════════════════════════════════════════════════════

router.get('/qa/stats', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const orgCond  = hasGlobalAdminScope(req.user) ? '' : 'WHERE org_id = ?';
    const orgParam = hasGlobalAdminScope(req.user) ? [] : [req.user.orgId];

    const [[fbStats]] = await pool.execute(
      `SELECT
         COUNT(*) AS total,
         SUM(status = 'new') AS new_count,
         SUM(status = 'investigating') AS investigating_count,
         SUM(status = 'confirmed') AS confirmed_count,
         SUM(status = 'fixed') AS fixed_count,
         SUM(status = 'verified') AS verified_count,
         SUM(severity = 'critical') AS critical_count,
         SUM(severity = 'broken') AS broken_count
       FROM qa_feedback ${orgCond}`,
      orgParam
    );

    const [[frStats]] = await pool.execute(
      `SELECT
         COUNT(*) AS total,
         SUM(status = 'new') AS new_count,
         SUM(status = 'planned') AS planned_count,
         SUM(status = 'shipped') AS shipped_count
       FROM feature_requests ${orgCond}`,
      orgParam
    );

    res.json({ bugs: fbStats, features: frStats });
  } catch (err) {
    logger.error({ err: err.message }, 'qa: stats GET error');
    res.status(500).json({ error: 'Failed to fetch stats.' });
  }
});

module.exports = router;
