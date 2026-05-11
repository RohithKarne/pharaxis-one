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

module.exports = { runCmReviewReminders };
