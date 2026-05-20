'use strict';

/**
 * cm/reviews.js — Content Management Reviews API
 * Review task management for content reviewers and review owners.
 */

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate } = require('../../middleware/auth');
const { hasGlobalAdminScope } = require('../../utils/adminScope');

async function audit(userId, userName, action, entity, entityId, details) {
  try {
    await pool.execute(
      'INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, userName, action, entity, entityId, JSON.stringify(details)]
    );
  } catch (_) {}
}

function hasPlatformAdminScope(req) {
  return hasGlobalAdminScope(req.user);
}

function reviewOrgJoins() {
  return `
    LEFT JOIN cm_documents d ON r.doc_type = 'document' AND r.doc_id = d.id
    LEFT JOIN cm_faqs f ON r.doc_type = 'faq' AND r.doc_id = f.id
    LEFT JOIN cm_folders fd ON d.folder_id = fd.id
    LEFT JOIN cm_folders ff ON f.folder_id = ff.id
  `;
}

function reviewOrgFilter(req) {
  return hasPlatformAdminScope(req) ? { clause: '', params: [] } : { clause: ' AND COALESCE(fd.org_id, ff.org_id) = ?', params: [req.user.orgId] };
}

async function getScopedReview(req, reviewId) {
  const scope = reviewOrgFilter(req);
  const [[review]] = await pool.execute(
    `SELECT r.*, COALESCE(fd.org_id, ff.org_id) AS org_id
     FROM cm_reviews r
     ${reviewOrgJoins()}
     WHERE r.id = ?${scope.clause}
     LIMIT 1`,
    [reviewId, ...scope.params]
  );
  return review || null;
}

async function isUserInScopeOrg(userId, orgId) {
  const [[row]] = await pool.execute(
    `SELECT u.id
     FROM users u
     JOIN user_org_access uoa ON uoa.user_id = u.id
     WHERE u.id = ? AND uoa.org_id = ? AND uoa.is_active = 1
     LIMIT 1`,
    [userId, orgId]
  );
  return !!row;
}

// GET /api/cm/reviews — get my review tasks (where I am a reviewer)
router.get('/reviews', authenticate, async (req, res) => {
  try {
    const scope = reviewOrgFilter(req);
    const [reviews] = await pool.execute(
      `SELECT r.*, cr.status AS reviewer_status, cr.reason AS reviewer_reason, cr.reviewed_at,
              u.name AS created_by_name
       FROM cm_reviews r
       JOIN cm_reviewers cr ON r.id = cr.review_id
       LEFT JOIN users u ON r.created_by = u.id
       ${reviewOrgJoins()}
       WHERE cr.user_id = ?${scope.clause}
       ORDER BY r.created_at DESC`,
      [req.user.userId, ...scope.params]
    );
    res.json({ reviews });
  } catch (err) {
    console.error('GET /cm/reviews error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/cm/reviews/all — all reviews (for review owners / admins)
router.get('/reviews/all', authenticate, async (req, res) => {
  try {
    const { status, doc_type, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let query = `
      SELECT r.*, u.name AS created_by_name
      FROM cm_reviews r
      LEFT JOIN users u ON r.created_by = u.id
      ${reviewOrgJoins()}
      WHERE 1=1
    `;
    const params = [];
    const scope = reviewOrgFilter(req);
    if (scope.clause) {
      query += scope.clause;
      params.push(...scope.params);
    }

    if (status) {
      query += ' AND r.status = ?';
      params.push(status);
    }
    if (doc_type) {
      query += ' AND r.doc_type = ?';
      params.push(doc_type);
    }

    const countQuery = query.replace('SELECT r.*, u.name AS created_by_name', 'SELECT COUNT(*) AS total');
    const [[{ total }]] = await pool.execute(countQuery, params);

    query += ` ORDER BY r.created_at DESC LIMIT ${parseInt(limit, 10)} OFFSET ${offset}`;

    const [reviews] = await pool.execute(query, params);

    // Attach reviewers for each review
    for (const review of reviews) {
      const [reviewers] = await pool.execute(
        `SELECT cr.*, u.name AS user_name, u.email AS user_email
         FROM cm_reviewers cr
         JOIN users u ON cr.user_id = u.id
         WHERE cr.review_id = ?`,
        [review.id]
      );
      review.reviewers = reviewers;
    }

    res.json({ reviews, total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) {
    console.error('GET /cm/reviews/all error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/cm/reviews/:id/reviewer-status — update my reviewer status
router.put('/reviews/:id/reviewer-status', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;
    if (!status) return res.status(400).json({ error: 'status is required.' });
    const review = await getScopedReview(req, id);
    if (!review) return res.status(404).json({ error: 'Review not found.' });

    const [[reviewer]] = await pool.execute(
      'SELECT id FROM cm_reviewers WHERE review_id = ? AND user_id = ?',
      [id, req.user.userId]
    );
    if (!reviewer) return res.status(404).json({ error: 'You are not a reviewer for this review.' });

    const validStatuses = ['Ongoing', 'Approved', 'Rejected', 'Withdrawn'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
    }

    await pool.execute(
      'UPDATE cm_reviewers SET status = ?, reason = ?, reviewed_at = NOW() WHERE review_id = ? AND user_id = ?',
      [status, reason || null, id, req.user.userId]
    );
    await audit(req.user.userId, req.user.email, 'REVIEWER_STATUS', 'cm_review', Number(id), { status, reason });
    res.json({ message: 'Reviewer status updated.' });
  } catch (err) {
    console.error('PUT /cm/reviews/:id/reviewer-status error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/cm/reviews/:id/close — close review (doc → Approved, or Draft if any reviewer rejected)
router.post('/reviews/:id/close', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const review = await getScopedReview(req, id);
    if (!review) return res.status(404).json({ error: 'Review not found.' });
    if (review.created_by !== req.user.userId) {
      return res.status(403).json({ error: 'Only the review owner can close a review.' });
    }
    if (review.status !== 'Open') {
      return res.status(400).json({ error: 'Only Open reviews can be closed.' });
    }

    const [[{ rejectedCount }]] = await pool.execute(
      `SELECT COUNT(*) AS rejectedCount FROM cm_reviewers WHERE review_id = ? AND status = 'Rejected'`,
      [id]
    );
    const wasRejected = rejectedCount > 0;
    const newDocStatus = wasRejected ? 'Draft' : 'Approved';

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.execute(
        "UPDATE cm_reviews SET status = 'Closed', updated_at = NOW() WHERE id = ?",
        [id]
      );

      if (review.doc_type === 'document') {
        await conn.execute(
          `UPDATE cm_documents SET status = ?, updated_at = NOW() WHERE id = ? AND status = 'Under Review'`,
          [newDocStatus, review.doc_id]
        );
      } else if (review.doc_type === 'faq') {
        await conn.execute(
          `UPDATE cm_faqs SET status = ?, updated_at = NOW() WHERE id = ? AND status = 'Under Review'`,
          [newDocStatus, review.doc_id]
        );
      }

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    if (wasRejected) {
      try {
        let notifyUserId = null;
        if (review.doc_type === 'document') {
          const [[doc]] = await pool.execute(
            `SELECT COALESCE(owner_user_id, created_by) AS notify_user_id FROM cm_documents WHERE id = ?`,
            [review.doc_id]
          );
          notifyUserId = doc?.notify_user_id;
        } else if (review.doc_type === 'faq') {
          const [[faq]] = await pool.execute(
            `SELECT created_by AS notify_user_id FROM cm_faqs WHERE id = ?`,
            [review.doc_id]
          );
          notifyUserId = faq?.notify_user_id;
        }
        if (notifyUserId) {
          await pool.execute(
            `INSERT INTO notifications (user_id, category, title, message, link_url, metadata)
             VALUES (?, 'cm_review_rejected', 'Review Rejected', ?, '/content', ?)`,
            [
              notifyUserId,
              `Review "${review.title}" was closed with rejections. The ${review.doc_type} has been returned to Draft.`,
              JSON.stringify({ review_id: Number(id), doc_id: review.doc_id, doc_type: review.doc_type }),
            ]
          );
        }
      } catch (_) {}
    }

    await audit(req.user.userId, req.user.email, 'CLOSE_REVIEW', 'cm_review', Number(id), { doc_id: review.doc_id, doc_type: review.doc_type, wasRejected });
    const statusMsg = wasRejected
      ? 'Review closed with rejections. Document returned to Draft.'
      : 'Review closed. Document status set to Approved.';
    res.json({ message: statusMsg, wasRejected });
  } catch (err) {
    console.error('POST /cm/reviews/:id/close error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/cm/reviews/:id/end — end/cancel review (doc stays Pending)
router.post('/reviews/:id/end', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const review = await getScopedReview(req, id);
    if (!review) return res.status(404).json({ error: 'Review not found.' });
    if (review.created_by !== req.user.userId) {
      return res.status(403).json({ error: 'Only the review owner can end a review.' });
    }
    if (!['Open'].includes(review.status)) {
      return res.status(400).json({ error: 'Only Open reviews can be ended.' });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.execute(
        "UPDATE cm_reviews SET status = 'Cancelled', updated_at = NOW() WHERE id = ?",
        [id]
      );

      // Move doc back to Pending
      if (review.doc_type === 'document') {
        await conn.execute(
          "UPDATE cm_documents SET status = 'Pending', updated_at = NOW() WHERE id = ? AND status = 'Under Review'",
          [review.doc_id]
        );
      } else if (review.doc_type === 'faq') {
        await conn.execute(
          "UPDATE cm_faqs SET status = 'Pending', updated_at = NOW() WHERE id = ? AND status = 'Under Review'",
          [review.doc_id]
        );
      }

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    await audit(req.user.userId, req.user.email, 'END_REVIEW', 'cm_review', Number(id), { reason: reason || null });
    res.json({ message: 'Review cancelled. Document returned to Pending.' });
  } catch (err) {
    console.error('POST /cm/reviews/:id/end error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/cm/reviews/:id/transfer — transfer review ownership
router.put('/reviews/:id/transfer', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { new_owner_id } = req.body;
    if (!new_owner_id) return res.status(400).json({ error: 'new_owner_id is required.' });

    const review = await getScopedReview(req, id);
    if (!review) return res.status(404).json({ error: 'Review not found.' });
    if (review.created_by !== req.user.userId) {
      return res.status(403).json({ error: 'Only the review owner can transfer ownership.' });
    }

    const [[newOwner]] = await pool.execute('SELECT id, name, email FROM users WHERE id = ?', [new_owner_id]);
    if (!newOwner) return res.status(404).json({ error: 'New owner user not found.' });
    if (!hasPlatformAdminScope(req) && !await isUserInScopeOrg(new_owner_id, req.user.orgId)) {
      return res.status(403).json({ error: 'New owner must belong to your organisation.' });
    }

    await pool.execute(
      'UPDATE cm_reviews SET created_by = ?, updated_at = NOW() WHERE id = ?',
      [new_owner_id, id]
    );
    await audit(req.user.userId, req.user.email, 'TRANSFER_REVIEW', 'cm_review', Number(id), { new_owner_id, new_owner_email: newOwner.email });
    res.json({ message: `Review ownership transferred to ${newOwner.name}.` });
  } catch (err) {
    console.error('PUT /cm/reviews/:id/transfer error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── CM-E3: Review mode config (parallel / sequential) ────────────────────────

// GET /api/cm/reviews/:reviewId/config
router.get('/reviews/:reviewId/config', authenticate, async (req, res) => {
  try {
    const review = await getScopedReview(req, req.params.reviewId);
    if (!review) return res.status(404).json({ error: 'Review not found.' });
    const [rows] = await pool.execute(
      `SELECT rc.* FROM cm_review_config rc
       JOIN cm_reviews r ON r.doc_id = rc.doc_id
       WHERE r.id = ?`,
      [req.params.reviewId]
    );
    res.json({ config: rows[0] || { review_mode: 'sequential' } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/cm/reviews/:reviewId/config
router.patch('/reviews/:reviewId/config', authenticate, async (req, res) => {
  try {
    const { review_mode } = req.body;
    if (!['sequential', 'parallel'].includes(review_mode)) {
      return res.status(400).json({ error: 'review_mode must be sequential or parallel' });
    }
    const review = await getScopedReview(req, req.params.reviewId);
    if (!review) return res.status(404).json({ error: 'Review not found' });
    await pool.execute(
      `INSERT INTO cm_review_config (doc_id, review_mode, updated_by)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE review_mode = VALUES(review_mode), updated_by = VALUES(updated_by), updated_at = NOW()`,
      [review.doc_id, review_mode, req.user.userId || null]
    );
    await audit(req.user.userId, req.user.email, 'SET_REVIEW_MODE', 'cm_review', Number(req.params.reviewId), { review_mode });
    res.json({ success: true, review_mode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
