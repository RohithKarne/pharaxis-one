'use strict';

/**
 * cmAccess.js — MIPM-175.
 *
 * Every Content Management change checked only that the caller was signed in,
 * so an agent — who cannot open Content Management — could create folders,
 * check documents out or start reviews by calling the API. Changes now follow
 * the screen's rules. Reads follow cmReadAccess below.
 *
 *   view / usage / bookmarks      Browse Content or Content Management module
 *   reviews                       content.review or content.author
 *   approve                       content.approve
 *   publish, archive, bulk        content.publish
 *   folders and their permissions content.folder.configure
 *   anything else                 Content Management module and content.author
 */

const { authenticate } = require('./auth');
const { getUserModules } = require('../utils/userModules');
const { userHasActivityPrivilege } = require('../services/accessConfigurationService');
const { hasGlobalAdminScope } = require('../utils/adminScope');
const pool = require('../database/db');
const { canUseFolder } = require('../services/cmFolderAccess');
const { gatePath } = require('../utils/gatePath');

const CONSUMER = [/^\/content-usage$/, /^\/(documents|faqs)\/\d+\/view$/, /^\/folders\/bookmarks(\/\d+)?$/];

async function allowed(req) {
  if (hasGlobalAdminScope(req.user)) return true;
  const path = gatePath(req);
  const has = (key) => userHasActivityPrivilege(req.user, key);
  if (CONSUMER.some((re) => re.test(path))) {
    const modules = await getUserModules(req.user.userId);
    return modules.includes('browse_content') || modules.includes('content_mgmt');
  }
  if (/^\/reviews\//.test(path)) return (await has('content.review')) || (await has('content.author'));
  if (/\/approve$/.test(path)) return has('content.approve');
  // Setting up folders and who may use them: Configure folders (admins by
  // default). The privilege existed but nothing checked it.
  if (/^\/folders(\/\d+(\/.*)?)?$/.test(path)) {
    const modules = await getUserModules(req.user.userId);
    return modules.includes('content_mgmt') && (await has('content.folder.configure'));
  }
  if (/\/(publish|archive)$/.test(path) || /\/bulk$/.test(path)) return has('content.publish');
  const modules = await getUserModules(req.user.userId);
  return modules.includes('content_mgmt') && (await has('content.author'));
}

// People without Content Management (agents) read only published content
// (MIPM-184 for documents; MIPM-210 extends it to modules, FAQs and templates).
async function publishedOnly(req) {
  if (hasGlobalAdminScope(req.user)) return false;
  const modules = await getUserModules(req.user.userId);
  return !modules.includes('content_mgmt');
}

function cmWriteAccess(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  return authenticate(req, res, async () => {
    try {
      if (await allowed(req)) return next();
      return res.status(403).json({ error: 'You do not have permission to change content.' });
    } catch (err) {
      return next(err);
    }
  });
}

// Reading (access review, 2026-10-14). Reads checked only sign-in, so someone
// who may only browse published content read draft versions, reviews, the
// dashboard counts, sites and mailboxes. Content Management can read it all;
// Browse Content reads only what the Browse screen shows (published items are
// filtered in each route); anyone else reads nothing.
const BROWSE_READS = [
  /^\/(documents|modules|faqs)$/,
  /^\/(documents|modules|faqs)\/\d+$/,
  /^\/documents\/\d+\/(file|download)$/,
  /^\/folders$/,
  /^\/folders\/bookmarks$/,
  /^\/picklists$/,
  /^\/products$/,
];

function cmReadAccess(req, res, next) {
  if (!['GET', 'HEAD'].includes(req.method)) return next();
  return authenticate(req, res, async () => {
    try {
      if (hasGlobalAdminScope(req.user)) return next();
      const modules = await getUserModules(req.user.userId);
      if (modules.includes('content_mgmt')) return next();
      if (modules.includes('browse_content') && BROWSE_READS.some((re) => re.test(gatePath(req)))) return next();
      return res.status(403).json({ error: 'You do not have access to Content Management.', error_code: 'MODULE_FORBIDDEN', should_logout: false });
    } catch (err) {
      return next(err);
    }
  });
}

// Folder permissions (content review, 2026-10-14). Opening an item needs Read
// on its folder; changing it needs Write; changing the folder itself, or its
// permissions, needs Manage. Approving, publishing and recording a view need
// only Read: the approver's own privilege already governs those. Lists hide
// restricted folders in each route (folderFilterSql).
const ITEM_TABLE = { documents: 'cm_documents', modules: 'cm_modules', faqs: 'cm_faqs', templates: 'cm_templates' };
const READ_ACTIONS = /\/(view|approve|publish|render|generate|alert-subs(\/\d+)?)$/;

async function foldersToCheck(req) {
  const read = ['GET', 'HEAD'].includes(req.method);
  const path = gatePath(req);
  const checks = [];
  const item = path.match(/^\/(documents|modules|faqs|templates)\/(\d+)(\/|$)/);
  if (item) {
    const [[row]] = await pool.execute(`SELECT folder_id FROM ${ITEM_TABLE[item[1]]} WHERE id = ?`, [Number(item[2])]);
    if (row?.folder_id) checks.push([row.folder_id, read || READ_ACTIONS.test(path) ? 'read' : 'write']);
  }
  const usage = path.match(/^\/content-usage\/(document|module|faq)\/(\d+)$/);
  if (usage) {
    const [[row]] = await pool.execute(`SELECT folder_id FROM ${ITEM_TABLE[`${usage[1]}s`]} WHERE id = ?`, [Number(usage[2])]);
    if (row?.folder_id) checks.push([row.folder_id, 'read']);
  }
  const folder = path.match(/^\/folders\/(\d+)(\/|$)/);
  if (folder) checks.push([Number(folder[1]), read ? 'read' : 'manage']);
  if (!read && req.body?.folder_id) checks.push([Number(req.body.folder_id), 'write']);
  if (!read && /^\/(documents\/bulk|faqs\/bulk-tags)$/.test(path) && Array.isArray(req.body?.ids)) {
    const ids = req.body.ids.map(Number).filter(Boolean);
    if (ids.length) {
      const table = path.startsWith('/documents') ? 'cm_documents' : 'cm_faqs';
      const [rows] = await pool.execute(`SELECT DISTINCT folder_id FROM ${table} WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
      for (const r of rows) if (r.folder_id) checks.push([r.folder_id, req.body.action === 'publish' ? 'read' : 'write']);
    }
  }
  return checks;
}

function cmFolderAccess(req, res, next) {
  if (req.method === 'OPTIONS') return next();
  return authenticate(req, res, async () => {
    try {
      const target = ['GET', 'HEAD'].includes(req.method) ? null : Number(req.body?.folder_id) || null;
      if (target && !/^\/folders\//.test(gatePath(req))) {
        const [[f]] = await pool.execute('SELECT status FROM cm_folders WHERE id = ?', [target]);
        if (f && f.status !== 'Active') return res.status(400).json({ error: 'That folder is inactive. Choose an active folder.' });
      }
      for (const [folderId, level] of await foldersToCheck(req)) {
        if (!(await canUseFolder(req.user, folderId, level))) {
          return res.status(403).json({ error: level === 'read'
            ? 'This folder is restricted to named groups, and you are not in one of them.'
            : `You need ${level} permission on this folder to make this change.` });
        }
      }
      return next();
    } catch (err) {
      return next(err);
    }
  });
}

module.exports = { cmReadAccess, cmWriteAccess, cmFolderAccess, publishedOnly };
