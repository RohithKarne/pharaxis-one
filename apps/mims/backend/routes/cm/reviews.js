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
const { logAudit } = require('../../utils/auditLog');
const { createNotification } = require('../../services/notificationCenterService');

async function audit(userId, userName, action, entity, entityId, details) {
  await logAudit(userId, userName, action, entity, entityId, details);
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

// MIPM-204: in a sequential review, whose turn it is — the first reviewer, in the
// chosen order, who has not decided. Null for a parallel review or when all decided.
async function currentTurn(review) {
  if (review.review_mode !== 'sequential') return null;
  const [[row]] = await pool.execute(
    `SELECT cr.user_id, u.name FROM cm_reviewers cr JOIN users u ON u.id = cr.user_id
     WHERE cr.review_id = ? AND cr.status = 'Ongoing' ORDER BY cr.sort_order ASC, cr.id ASC LIMIT 1`,
    [review.id]
  );
  return row || null;
}

async function notifyTurn(review, userId) {
  const [[doc]] = review.doc_type === 'faq'
    ? await pool.execute('SELECT question AS name FROM cm_faqs WHERE id = ?', [review.doc_id])
    : await pool.execute('SELECT name FROM cm_documents WHERE id = ?', [review.doc_id]);
  await createNotification(Number(userId), {
    category: 'content_review',
    title: `Your turn to review — ${doc?.name || review.title}`,
    message: `The reviewer before you has decided. "${review.title}" is now with you, by ${String(review.planned_end_date).slice(0, 10)}.`,
    linkUrl: '/content?view=reviews',
    metadata: { review_id: Number(review.id), doc_id: review.doc_id, doc_type: review.doc_type },
    eventKey: 'cm-review-turn',
  }).catch(() => {});
}

// GET /api/cm/reviews — get my review tasks (where I am a reviewer)
router.get('/reviews', authenticate, async (req, res) => {
  try {
    const scope = reviewOrgFilter(req);
    const [reviews] = await pool.execute(
      `SELECT r.*, cr.status AS reviewer_status, cr.reason AS reviewer_reason, cr.reviewed_at, cr.sort_order,
              u.name AS created_by_name, COALESCE(d.name, f.question) AS document_name
       FROM cm_reviews r
       JOIN cm_reviewers cr ON r.id = cr.review_id
       LEFT JOIN users u ON r.created_by = u.id
       ${reviewOrgJoins()}
       WHERE cr.user_id = ?${scope.clause}
       ORDER BY r.created_at DESC`,
      [req.user.userId, ...scope.params]
    );
    // MIPM-204: a sequential review says whose turn it is, so the row can show
    // "Waiting for …" instead of a button the server would refuse.
    for (const review of reviews) {
      const turn = review.status === 'Open' ? await currentTurn(review) : null;
      review.is_my_turn = review.review_mode !== 'sequential' || (turn && Number(turn.user_id) === Number(req.user.userId));
      review.waiting_on_name = turn && Number(turn.user_id) !== Number(req.user.userId) ? turn.name : null;
    }
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
    if (review.status !== 'Open') return res.status(409).json({ error: 'This review is closed; its decisions can no longer change.' });

    // MIPM-178: the decisions the reviewer's dialog offers. The route accepted only
    // Approved/Withdrawn besides Ongoing/Rejected, so Accepted, Accepted with
    // Changes and Declined were refused and a reviewer could only reject.
    const validStatuses = ['Ongoing', 'Accepted', 'Accepted with Changes', 'Declined', 'Rejected', 'Approved', 'Withdrawn'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
    }
    // MIPM-204: in a sequential review only the reviewer whose turn it is decides.
    const turn = await currentTurn(review);
    if (turn && Number(turn.user_id) !== Number(req.user.userId)) {
      return res.status(409).json({ error: `It is ${turn.name}'s turn to review. You will be told when it is yours.` });
    }

    await pool.execute(
      'UPDATE cm_reviewers SET status = ?, reason = ?, reviewed_at = NOW() WHERE review_id = ? AND user_id = ?',
      [status, reason || null, id, req.user.userId]
    );
    await audit(req.user.userId, req.user.email, 'REVIEWER_STATUS', 'cm_review', Number(id), { status, reason });
    // MIPM-179: the last decision closes the review — there was no way to close one on screen.
    // MIPM-204: a rejection in a sequential review closes it at once; the reviewers
    // after it are not asked to read a document that is going back to Draft.
    const decided = review.status === 'Open' && status !== 'Ongoing';
    if (decided && (!(await undecidedCount(id)) || (review.review_mode === 'sequential' && status === 'Rejected'))) {
      const wasRejected = await closeReview(review, req);
      return res.json({ message: wasRejected ? 'Decision saved. The review is closed and the document returned to Draft.' : 'Decision saved. The review is closed and the document is ready for approval.', closed: true, wasRejected });
    }
    if (decided && review.review_mode === 'sequential') {
      const next = await currentTurn(review);
      if (next) await notifyTurn(review, next.user_id);
      return res.json({ message: next ? `Decision saved. The review has moved on to ${next.name}.` : 'Reviewer status updated.' });
    }
    res.json({ message: 'Reviewer status updated.' });
  } catch (err) {
    console.error('PUT /cm/reviews/:id/reviewer-status error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// MIPM-179: a review closes when every reviewer has decided — by itself after the
// last decision, or by its owner. Closing never approves: approval is the
// approver's e-signed step, and the author may not approve their own document.
// Before, the owner (the author) could close a review nobody had answered and
// the document became Approved with no decision and no signature.
async function closeReview(review, req) {
  const [[{ rejectedCount }]] = await pool.execute(
    `SELECT COUNT(*) AS rejectedCount FROM cm_reviewers WHERE review_id = ? AND status = 'Rejected'`,
    [review.id]
  );
  const wasRejected = rejectedCount > 0;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute("UPDATE cm_reviews SET status = 'Closed', updated_at = NOW() WHERE id = ?", [review.id]);
    // Rejected → back to the author as Draft. Accepted → stays Under Review, ready for approval.
    if (wasRejected && review.doc_type === 'document') {
      await conn.execute("UPDATE cm_documents SET status = 'Draft', updated_at = NOW() WHERE id = ? AND status = 'Under Review'", [review.doc_id]);
    } else if (wasRejected && review.doc_type === 'faq') {
      await conn.execute("UPDATE cm_faqs SET status = 'Draft', updated_at = NOW() WHERE id = ? AND status = 'Under Review'", [review.doc_id]);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  try {
    const [[owner]] = review.doc_type === 'faq'
      ? await pool.execute('SELECT created_by AS notify_user_id FROM cm_faqs WHERE id = ?', [review.doc_id])
      : await pool.execute('SELECT COALESCE(owner_user_id, created_by) AS notify_user_id FROM cm_documents WHERE id = ?', [review.doc_id]);
    if (owner?.notify_user_id) {
      await pool.execute(
        `INSERT INTO notifications (user_id, category, title, message, link_url, metadata)
         VALUES (?, ?, ?, ?, '/content', ?)`,
        [
          owner.notify_user_id,
          wasRejected ? 'cm_review_rejected' : 'content_review',
          wasRejected ? 'Review Rejected' : 'Review complete',
          wasRejected
            ? `Review "${review.title}" was closed with rejections. The ${review.doc_type} has been returned to Draft.`
            : `Review "${review.title}" is complete. The ${review.doc_type} is ready for approval.`,
          JSON.stringify({ review_id: Number(review.id), doc_id: review.doc_id, doc_type: review.doc_type }),
        ]
      );
    }
  } catch (_) {}

  await audit(req.user.userId, req.user.email, 'CLOSE_REVIEW', 'cm_review', Number(review.id), { doc_id: review.doc_id, doc_type: review.doc_type, wasRejected });
  return wasRejected;
}

async function undecidedCount(reviewId) {
  const [[row]] = await pool.execute("SELECT COUNT(*) AS n FROM cm_reviewers WHERE review_id = ? AND status = 'Ongoing'", [reviewId]);
  return Number(row?.n || 0);
}

// POST /api/cm/reviews/:id/close — close a review whose reviewers have all decided
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
    if (await undecidedCount(id)) {
      return res.status(409).json({ error: 'Every reviewer must decide before the review is closed.' });
    }
    const wasRejected = await closeReview(review, req);
    res.json({
      message: wasRejected ? 'Review closed with rejections. Document returned to Draft.' : 'Review closed. The document is ready for approval.',
      wasRejected,
    });
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
    // MIPM-204: the mode lives on the review itself (cm_review_config was keyed
    // by doc_id alone, so a document and a FAQ with the same id shared a row).
    res.json({ config: { review_mode: review.review_mode || 'parallel' } });
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
    // Any reviewer could change the mode for the whole review (MIPM-203).
    if (review.created_by !== req.user.userId && !hasGlobalAdminScope(req.user)) {
      return res.status(403).json({ error: 'Only the person who started this review can change its mode.' });
    }
    // Once a reviewer has decided, the order has been relied on; the mode is fixed.
    const [[{ decided }]] = await pool.execute(
      "SELECT COUNT(*) AS decided FROM cm_reviewers WHERE review_id = ? AND status <> 'Ongoing'", [review.id]);
    if (decided) return res.status(409).json({ error: 'A reviewer has already decided; the review mode can no longer change.' });
    await pool.execute('UPDATE cm_reviews SET review_mode = ?, updated_at = NOW() WHERE id = ?', [review_mode, review.id]);
    await audit(req.user.userId, req.user.email, 'SET_REVIEW_MODE', 'cm_review', Number(req.params.reviewId), { review_mode });
    res.json({ success: true, review_mode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
