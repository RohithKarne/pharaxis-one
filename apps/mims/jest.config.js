'use strict';
/**
 * jest.config.js — MIMS backend test configuration.
 *
 * Added 2026-08-06. Before this there was no jest config at all: no globalSetup,
 * and the default 5s timeout applied to suites that migrate and seed a database.
 * The Unit Tests CI job had never passed since it was added on 2026-07-27.
 */

module.exports = {
  testEnvironment: 'node',

  // Migrate once in the main process. See backend/tests/globalSetup.js for why.
  globalSetup: '<rootDir>/backend/tests/globalSetup.js',

  // 5s is jest's default and it is a UI-test budget, not a database one. These
  // suites connect, seed fixtures and clean up after themselves; on CI hardware
  // against a MySQL service container that is comfortably more than 5s. Raised to
  // a figure that absorbs a slow runner without hiding a genuinely hung test.
  testTimeout: 30000,
};
