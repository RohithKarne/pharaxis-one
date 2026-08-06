'use strict';
/**
 * services/buildInfo.js — which build is actually running.
 *
 * PAUD-3 item 1. /api/v1/version reports the API *contract* version, which does
 * not change when we ship. A client asking "does this release make us
 * revalidate?" needs the build, not the contract — so this is a separate
 * endpoint rather than a change to the existing one, which clients may depend on.
 *
 * commit/built_at come from the deploy pipeline. They read 'unknown' when the
 * app is started by hand, which is honest — better than reporting a value that
 * is never true.
 */

function readPackageVersion() {
  try {
    return require('../../package.json').version || 'unknown';
  } catch (_) {
    return 'unknown';
  }
}

const BUILD_INFO = Object.freeze({
  app: 'mims',
  version: readPackageVersion(),
  commit: process.env.BUILD_SHA || 'unknown',
  built_at: process.env.BUILD_TIME || 'unknown',
});

function getBuildInfo() {
  return BUILD_INFO;
}

module.exports = { getBuildInfo };
