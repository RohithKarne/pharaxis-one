'use strict';

/**
 * adminWritePolicy.js — who may change what in the Admin Panel (CPPM-60).
 *
 * The Admin Users screen describes five roles, and until now only a few areas
 * enforced them. Of 32 admin route files, 19 accepted changes without looking at
 * the role, so a "Viewer — Read-only access" account could add an FAQ item,
 * deactivate an integration or change sign-on settings.
 *
 * This is the one table. It is keyed by the first part of the path after
 * /api/admin/ and says which roles may make a change (any request that is not a
 * read) in that area. It follows the role descriptions shown on that screen:
 *
 *   Admin            full access to this client
 *   Content Manager  create and edit content; submit for review
 *   Reviewer         approve or reject content in the review queue
 *   Safety Reviewer  record clinical outcomes on the Safety Queue; read chat records
 *   Viewer           read-only access
 *
 * Areas marked STAFF keep their own finer rules inside the route (who may approve,
 * publish, send an answer or record a clinical outcome); here they only shut out
 * the viewer. An area that is not listed is ADMIN only — a new area is closed until
 * somebody decides who may change it.
 *
 * Reads are not covered here: every staff role can open every screen, as before.
 */
const { authenticateAdmin } = require('./auth');

const ADMIN   = ['superadmin', 'admin'];
const CONTENT = [...ADMIN, 'content_manager'];
const STAFF   = [...ADMIN, 'content_manager', 'reviewer', 'safety_reviewer']; // anyone but a viewer

const WRITE_ROLES = {
  // Settings and people
  clients: ADMIN, branding: ADMIN, features: ADMIN, forms: ADMIN, gate: ADMIN,
  compliance: ADMIN, integration: ADMIN, sso: ADMIN, 'email-config': ADMIN,
  templates: ADMIN, chatbox: ADMIN, language: ADMIN, users: ADMIN,
  'data-requests': ADMIN, 'admin-users': ADMIN, scanner: ADMIN, audit: ADMIN, analytics: ADMIN,
  // Content
  content: CONTENT, faq: CONTENT, msls: CONTENT, trials: CONTENT, training: CONTENT, safety: CONTENT,
  // Work queues — finer rules live in the routes
  news: STAFF, documents: STAFF, 'ae-review': STAFF, submissions: STAFF,
  'chat-records': STAFF, feedback: STAFF, 'review-queue': STAFF,
};

const AREA_NAMES = {
  users: 'portal users', 'admin-users': 'staff accounts', 'email-config': 'email settings',
  'data-requests': 'data requests', 'ae-review': 'the Safety Queue', submissions: 'enquiries',
  sso: 'single sign-on settings', gate: 'the user gate', msls: 'the MSL directory', faq: 'the FAQ',
  safety: 'safety alerts', 'chat-records': 'chat records', 'review-queue': 'the review queue',
};

const READS = new Set(['GET', 'HEAD', 'OPTIONS']);

function adminWritePolicy(req, res, next) {
  if (READS.has(req.method)) return next();
  const area = req.path.split('/').filter(Boolean)[0] || '';
  if (area === 'auth') return next(); // signing in and out, and changing your own password

  // Find out who this is first. authenticateAdmin answers 401 itself when there is
  // nobody, and reads the role from the account, not from the sign-in token.
  authenticateAdmin(req, res, () => {
    const allowed = WRITE_ROLES[area] || ADMIN;
    if (allowed.includes(req.admin.role)) return next();
    const what = AREA_NAMES[area] || area.replace(/-/g, ' ');
    const error = req.admin.role === 'viewer'
      ? 'Your role is view-only, so nothing was changed. Ask an admin if you need to make changes.'
      : `Your role cannot change ${what}, so nothing was changed. Ask an admin.`;
    return res.status(403).json({ error });
  });
}

// CPPM-60: what a role may change, area by area, so the screens can hide controls
// the server would refuse. The screens ask; this table stays the only copy.
function canChangeByArea(role) {
  return Object.fromEntries(Object.entries(WRITE_ROLES).map(([area, roles]) => [area, roles.includes(role)]));
}

module.exports = { adminWritePolicy, WRITE_ROLES, canChangeByArea };
