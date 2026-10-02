'use strict';
/**
 * contentVisibility.js — MIPM-89: who may see content that is not live.
 *
 * People who work on content (author, review, approve, publish, manage FAQs or
 * modules) see every status. Everyone else — an agent browsing for an answer to
 * send — sees only Published content that has not expired.
 */
const { userHasActivityPrivilege } = require('./accessConfigurationService');

const CONTENT_WORK_PRIVILEGES = [
  'content.author', 'content.review', 'content.approve', 'content.publish',
  'content.faq.manage', 'content.module.manage',
];

async function seesAllContentStatuses(user) {
  for (const key of CONTENT_WORK_PRIVILEGES) {
    if (await userHasActivityPrivilege(user, key)) return true;
  }
  return false;
}

// SQL for "live": Published and not past its expiry date. `alias` is the table alias.
function liveContentSql(alias) {
  return ` AND ${alias}.status = 'Published' AND (${alias}.expiry_date IS NULL OR ${alias}.expiry_date >= CURDATE())`;
}

function isLiveContent(row) {
  if (!row || row.status !== 'Published') return false;
  if (!row.expiry_date) return true;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return new Date(row.expiry_date) >= today;
}

// Route guard for GET /<content>/:id… — a reader asking for content that is not
// live gets the same 404 as content that does not exist.
const LIVE_TABLES = new Set(['cm_documents', 'cm_faqs', 'cm_modules', 'cm_templates']);
function liveOnlyForReaders(table) {
  if (!LIVE_TABLES.has(table)) throw new Error(`liveOnlyForReaders: unknown table ${table}`);
  return async (req, res, next) => {
    try {
      if (await seesAllContentStatuses(req.user)) return next();
      const pool = require('../database/db');
      const [[row]] = await pool.execute(`SELECT status, expiry_date FROM ${table} WHERE id = ?`, [req.params.id]);
      if (!isLiveContent(row)) return res.status(404).json({ error: 'Not found.' });
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { seesAllContentStatuses, liveContentSql, isLiveContent, liveOnlyForReaders };
