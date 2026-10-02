'use strict';

/**
 * workOwnership.js — who is working an item, for the enquiry list and the content
 * review queue (CPPM-61, round 2 of CPPM-6).
 *
 * The Safety Queue got this first (routes/admin/aeReviewTasks.js). The rules here
 * are the same ones, written once for the lists that came after:
 *
 *   - an open item is held by one staff member at a time, or by nobody;
 *   - taking is one UPDATE that only succeeds while nobody holds the item, so two
 *     people pressing Take together cannot both get it;
 *   - release and hand-over only write if the holder is still the one that was
 *     read, so a move made in between is refused, not overwritten;
 *   - the holder may release or hand over their own item; an admin may do so for
 *     anyone's — that is how work is covered when the holder is away;
 *   - the change and its audit line are one transaction (CPPM-53): both, or neither;
 *   - holding an item is never a condition for working it.
 *
 * Who may hold at all (any role except viewer) is the admin write policy's job
 * (middleware/adminWritePolicy.js); the receiver of a hand-over is checked here.
 *
 * Taking an item must not look like editing it: all three tables stamp updated_at
 * on every UPDATE, and the review queue shows and sorts by it, so each statement
 * here sets updated_at to itself.
 */
const { pool } = require('../database/db');
const { auditWithin } = require('./audit');
const { releaseTasksHeldBy } = require('./aeTaskOwnership');
const log = require('./logger');

const LEAD_ROLES = ['admin', 'superadmin'];
const NOT_RECORDED = 'Nothing was changed, because the action could not be recorded. Please try again.';
const CHANGED_MEANWHILE = 'This changed while you were looking at it. Refresh and try again.';

// One entry per kind of item. `open` is when an item can be held; `t` is the item's table.
const KINDS = {
  submission: {
    table: 'cp_submissions', entity: 'submission', action: 'SUBMISSION', noun: 'enquiry',
    open: "t.status <> 'closed'", goneMsg: 'This enquiry is closed.',
  },
  news: {
    table: 'cp_news_posts', entity: 'news', action: 'CONTENT', noun: 'item',
    open: "t.status IN ('review', 'approved')", goneMsg: 'This item is no longer waiting in the review queue.',
  },
  document: {
    table: 'cp_documents', entity: 'document', action: 'CONTENT', noun: 'item',
    open: "t.status IN ('review', 'approved') AND t.is_active = 1", goneMsg: 'This item is no longer waiting in the review queue.',
  },
};

async function itemWithOwner(kind, clientId, id) {
  const [[item]] = await pool.execute(
    `SELECT t.id, (${kind.open}) AS is_open, t.owner_id, o.name AS owner_name
       FROM ${kind.table} t
  LEFT JOIN cp_admin_users o ON o.id = t.owner_id
      WHERE t.id = ? AND t.client_id = ?`,
    [id, clientId]
  );
  return item || null;
}

// Runs the update and its audit line together. `work` returns nothing on success,
// or { status, body } to refuse (rolled back).
async function together(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const refused = await work(conn);
    if (refused) { await conn.rollback(); return refused; }
    await conn.commit();
    return null;
  } catch (err) {
    await conn.rollback().catch(() => {});
    log.error('admin.workOwnership.not_recorded', { err });
    return { status: 500, body: { error: NOT_RECORDED } };
  } finally {
    conn.release();
  }
}

const refuse = (status, error) => ({ status, body: { error } });

async function take(kindName, clientId, id, admin) {
  const kind = KINDS[kindName];
  const refused = await together(async (conn) => {
    const [result] = await conn.execute(
      `UPDATE ${kind.table} t
          SET t.owner_id = ?, t.owner_since = NOW(), t.updated_at = t.updated_at
        WHERE t.id = ? AND t.client_id = ? AND ${kind.open} AND t.owner_id IS NULL`,
      [admin.adminId, id, clientId]
    );
    if (result.affectedRows === 0) {
      const item = await itemWithOwner(kind, clientId, id);
      if (!item) return refuse(404, 'Not found.');
      if (!item.is_open) return refuse(409, kind.goneMsg);
      return refuse(409, item.owner_id === admin.adminId
        ? `You already hold this ${kind.noun}.`
        : `${item.owner_name || 'Someone else'} is already working on this ${kind.noun}.`);
    }
    await auditWithin(conn, admin, clientId, `${kind.action}_TAKEN`, kind.entity, id, { owner_id: admin.adminId, owner: admin.name });
    return null;
  });
  return refused || { status: 200, body: { message: `You now hold this ${kind.noun}.` } };
}

async function release(kindName, clientId, id, admin) {
  const kind = KINDS[kindName];
  const item = await itemWithOwner(kind, clientId, id);
  if (!item) return refuse(404, 'Not found.');
  if (!item.is_open) return refuse(409, kind.goneMsg);
  if (item.owner_id == null) return refuse(409, `Nobody holds this ${kind.noun}.`);
  if (item.owner_id !== admin.adminId && !LEAD_ROLES.includes(admin.role)) {
    return refuse(403, `Only ${item.owner_name || 'the holder'} or an admin can release this ${kind.noun}.`);
  }
  const refused = await together(async (conn) => {
    const [result] = await conn.execute(
      `UPDATE ${kind.table} t
          SET t.owner_id = NULL, t.owner_since = NULL, t.updated_at = t.updated_at
        WHERE t.id = ? AND t.client_id = ? AND ${kind.open} AND t.owner_id = ?`,
      [id, clientId, item.owner_id]
    );
    if (result.affectedRows === 0) return refuse(409, CHANGED_MEANWHILE);
    await auditWithin(conn, admin, clientId, `${kind.action}_RELEASED`, kind.entity, id, { from_id: item.owner_id, from: item.owner_name });
    return null;
  });
  return refused || { status: 200, body: { message: 'Released. Anyone can take it now.' } };
}

async function hand(kindName, clientId, id, admin, toAdminId) {
  const kind = KINDS[kindName];
  const toId = Number(toAdminId);
  if (!Number.isInteger(toId) || toId <= 0) return refuse(400, 'Choose who to hand this to.');

  const item = await itemWithOwner(kind, clientId, id);
  if (!item) return refuse(404, 'Not found.');
  if (!item.is_open) return refuse(409, kind.goneMsg);
  if (item.owner_id !== admin.adminId && !LEAD_ROLES.includes(admin.role)) {
    return refuse(403, item.owner_id == null
      ? `Take this ${kind.noun} first, or ask an admin to hand it over.`
      : `Only ${item.owner_name || 'the holder'} or an admin can hand this ${kind.noun} over.`);
  }
  if (item.owner_id === toId) return refuse(409, `${item.owner_name || 'That person'} already holds this ${kind.noun}.`);

  // The receiver must be someone who could have taken it themselves.
  const [[to]] = await pool.execute(
    `SELECT id, name FROM cp_admin_users WHERE id = ? AND client_id = ? AND is_active = 1 AND role <> 'viewer'`,
    [toId, clientId]
  );
  if (!to) return refuse(400, 'That person cannot hold work for this client.');

  const refused = await together(async (conn) => {
    // <=> also matches "nobody holds it".
    const [result] = await conn.execute(
      `UPDATE ${kind.table} t
          SET t.owner_id = ?, t.owner_since = NOW(), t.updated_at = t.updated_at
        WHERE t.id = ? AND t.client_id = ? AND ${kind.open} AND t.owner_id <=> ?`,
      [to.id, id, clientId, item.owner_id]
    );
    if (result.affectedRows === 0) return refuse(409, CHANGED_MEANWHILE);
    await auditWithin(conn, admin, clientId, `${kind.action}_HANDED`, kind.entity, id,
      { from_id: item.owner_id, from: item.owner_name || null, to_id: to.id, to: to.name });
    return null;
  });
  return refused || { status: 200, body: { message: `Handed to ${to.name}.` } };
}

// Who an item can be handed to: active staff of this client, not viewers. Names and roles only.
async function staffFor(clientId) {
  const [rows] = await pool.execute(
    `SELECT id, name, role FROM cp_admin_users
      WHERE client_id = ? AND is_active = 1 AND role <> 'viewer'
      ORDER BY name`,
    [clientId]
  );
  return rows;
}

/**
 * Everything a person holds goes back to its list — safety tasks (CPPM-6) and the
 * three kinds here — when their account is switched off or made view-only. Runs on
 * the caller's connection, in the caller's transaction, one audit line per item.
 */
async function releaseWorkHeldBy(conn, actor, user, reason) {
  let released = await releaseTasksHeldBy(conn, actor, user, reason);
  for (const kind of Object.values(KINDS)) {
    const [held] = await conn.execute(
      `SELECT t.id, t.client_id FROM ${kind.table} t WHERE t.owner_id = ? AND ${kind.open} FOR UPDATE`,
      [user.id]
    );
    for (const item of held) {
      await conn.execute(
        `UPDATE ${kind.table} t SET t.owner_id = NULL, t.owner_since = NULL, t.updated_at = t.updated_at WHERE t.id = ? AND t.owner_id = ?`,
        [item.id, user.id]
      );
      await auditWithin(conn, actor, item.client_id, `${kind.action}_RELEASED`, kind.entity, item.id, { from_id: user.id, from: user.name, reason });
    }
    released += held.length;
  }
  return released;
}

module.exports = { take, release, hand, staffFor, releaseWorkHeldBy, KINDS };
