'use strict';
/**
 * utils/buildInfo.js — which build is actually running.
 *
 * PAUD-3 item 1. /api/health reported `process.env.npm_package_version ||
 * '1.0.0'`, which is only populated when the app is started through npm and
 * silently falls back to a hardcoded 1.0.0 otherwise — a version string that is
 * always present and never verified.
 *
 * commit/built_at come from the deploy pipeline and read 'unknown' when unset.
 */

function readPackageVersion() {
  try {
    return require('../package.json').version || 'unknown';
  } catch (_) {
    return 'unknown';
  }
}

const BUILD_INFO = Object.freeze({
  app: 'cp-portal',
  version: readPackageVersion(),
  commit: process.env.BUILD_SHA || 'unknown',
  built_at: process.env.BUILD_TIME || 'unknown',
});

function getBuildInfo() {
  return BUILD_INFO;
}

module.exports = { getBuildInfo };
