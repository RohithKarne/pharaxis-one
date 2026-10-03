'use strict';

/**
 * cmAccess.js — MIPM-175.
 *
 * Every Content Management change checked only that the caller was signed in,
 * so an agent — who cannot open Content Management — could create folders,
 * check documents out or start reviews by calling the API. Changes now follow
 * the screen's rules. Reads are unchanged.
 *
 *   view / usage / bookmarks      Browse Content or Content Management module
 *   reviews                       content.review or content.author
 *   approve                       content.approve
 *   publish, archive, bulk        content.publish
 *   anything else                 Content Management module and content.author
 */

const { authenticate } = require('./auth');
const { getUserModules } = require('../utils/userModules');
const { userHasActivityPrivilege } = require('../services/accessConfigurationService');
const { hasGlobalAdminScope } = require('../utils/adminScope');

const CONSUMER = [/^\/content-usage$/, /^\/(documents|faqs)\/\d+\/view$/, /^\/folders\/bookmarks(\/\d+)?$/];

async function allowed(req) {
  if (hasGlobalAdminScope(req.user)) return true;
  const path = req.path;
  const has = (key) => userHasActivityPrivilege(req.user, key);
  if (CONSUMER.some((re) => re.test(path))) {
    const modules = await getUserModules(req.user.userId);
    return modules.includes('browse_content') || modules.includes('content_mgmt');
  }
  if (/^\/reviews\//.test(path)) return (await has('content.review')) || (await has('content.author'));
  if (/\/approve$/.test(path)) return has('content.approve');
  if (/\/(publish|archive)$/.test(path) || /\/bulk$/.test(path)) return has('content.publish');
  const modules = await getUserModules(req.user.userId);
  return modules.includes('content_mgmt') && (await has('content.author'));
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

module.exports = { cmWriteAccess };
