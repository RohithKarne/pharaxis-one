'use strict';
/**
 * cmReviewReminderService.js — CM Review Cycle Reminder
 * Runs weekly on Mondays at 08:00 UTC.
 * Notifies document owners when review_cycle_days has elapsed since last closed review.
 */
const pool = require('../database/db');

async function runCmReviewReminders() {
  let remindersSent = 0;

  const [docs] = await pool.execute(
    `SELECT d.id, d.name, d.doc_id, d.review_cycle_days, d.created_at,
            COALESCE(d.owner_user_id, d.created_by) AS notify_user_id
     FROM cm_documents d
     WHERE d.status = 'Published'
       AND d.review_cycle_days IS NOT NULL
       AND d.review_cycle_days > 0`
  );

  for (const doc of docs) {
    if (!doc.notify_user_id) continue;

    const [[lastReview]] = await pool.execute(
      `SELECT updated_at FROM cm_reviews
       WHERE doc_id = ? AND doc_type = 'document' AND status = 'Closed'
       ORDER BY updated_at DESC LIMIT 1`,
      [doc.id]
    );

    const baselineDate = lastReview ? new Date(lastReview.updated_at) : new Date(doc.created_at);
    const daysSinceReview = Math.floor((Date.now() - baselineDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysSinceReview < doc.review_cycle_days) continue;

    // Spam guard: skip if a reminder was already sent in the last 7 days
    const [[recentReminder]] = await pool.execute(
      `SELECT id FROM notifications
       WHERE user_id = ?
         AND category = 'cm_review_reminder'
         AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.document_id')) = ?
         AND created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
       LIMIT 1`,
      [doc.notify_user_id, String(doc.id)]
    );
    if (recentReminder) continue;

    await pool.execute(
      `INSERT INTO notifications (user_id, category, title, message, link_url, metadata)
       VALUES (?, 'cm_review_reminder', ?, ?, '/content', ?)`,
      [
        doc.notify_user_id,
        'Document Review Due',
        `"${doc.name}"${doc.doc_id ? ` (${doc.doc_id})` : ''} is due for review. ${daysSinceReview} days have passed since the last review (cycle: every ${doc.review_cycle_days} days).`,
        JSON.stringify({ document_id: doc.id, doc_code: doc.doc_id, days_since_review: daysSinceReview, review_cycle_days: doc.review_cycle_days }),
      ]
    ).catch(() => {});

    remindersSent++;
  }

  return { remindersSent };
}

// Review tasks past their planned end date (content review, 2026-10-14). The
// date was shown and then nothing happened when it passed. Daily: each reviewer
// still deciding — in a one-after-another review only the one whose turn it is —
// and the review's owner are told, at most once a day per review.
async function runCmReviewOverdue() {
  const { createNotification } = require('./notificationCenterService');
  let sent = 0;
  const [reviews] = await pool.execute(
    `SELECT r.id, r.title, r.review_mode, r.created_by, DATE_FORMAT(r.planned_end_date, '%Y-%m-%d') AS due
       FROM cm_reviews r WHERE r.status = 'Open' AND r.planned_end_date < CURDATE()`);
  for (const review of reviews) {
    const [waiting] = await pool.execute(
      `SELECT cr.user_id, u.name FROM cm_reviewers cr JOIN users u ON u.id = cr.user_id
        WHERE cr.review_id = ? AND cr.status = 'Ongoing' ORDER BY cr.sort_order, cr.id`, [review.id]);
    if (!waiting.length) continue;
    const askNow = review.review_mode === 'sequential' ? waiting.slice(0, 1) : waiting;
    const people = [
      ...askNow.map((w) => ({ userId: w.user_id, title: `Review overdue — ${review.title}`, message: `Your decision on "${review.title}" was due by ${review.due}.` })),
      { userId: review.created_by, title: `Your review is overdue — ${review.title}`, message: `"${review.title}" was due by ${review.due}. Still waiting on: ${waiting.map((w) => w.name).join(', ')}.` },
    ];
    for (const p of people) {
      if (!p.userId) continue;
      const [[recent]] = await pool.execute(
        `SELECT id FROM notifications WHERE user_id = ? AND category = 'cm_review_overdue'
            AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.review_id')) = ? AND created_at > DATE_SUB(NOW(), INTERVAL 20 HOUR) LIMIT 1`,
        [p.userId, String(review.id)]);
      if (recent) continue;
      await createNotification(Number(p.userId), {
        category: 'cm_review_overdue', title: p.title, message: p.message,
        linkUrl: '/content?view=reviews', metadata: { review_id: Number(review.id) }, eventKey: 'cm-review-overdue',
      }).catch(() => {});
      sent++;
    }
  }
  return { sent };
}

module.exports = { runCmReviewReminders, runCmReviewOverdue };
