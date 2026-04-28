'use strict';
/**
 * caseQA.tests.js — Co-located regression tests for AI QA Engine routes (Sprint 21)
 *
 * Discovered automatically by regressionRunner.js via routes/**\/*.tests.js pattern.
 * Requires: server running, valid REGRESSION_EMAIL / REGRESSION_PASSWORD in .env
 */

module.exports = [
  {
    name: 'QA: GET /api/admin/qa/rules — returns 200 with rules array',
    method: 'GET',
    path: '/api/admin/qa/rules',
    auth: true,
    expect: { status: 200, bodyContains: 'rules' },
  },
  {
    name: 'QA: GET /api/admin/qa/reports — returns 200 with reports array',
    method: 'GET',
    path: '/api/admin/qa/reports',
    auth: true,
    expect: { status: 200, bodyContains: 'reports' },
  },
  {
    name: 'QA: GET /api/admin/qa/overrides — returns 200',
    method: 'GET',
    path: '/api/admin/qa/overrides',
    auth: true,
    expect: { status: 200 },
  },
  {
    name: 'QA: POST /api/admin/qa/reports — validates required fields',
    method: 'POST',
    path: '/api/admin/qa/reports',
    auth: true,
    body: {},
    expect: { status: 400 },
  },
  {
    name: 'QA: PUT /api/admin/qa/rules/reset validation — returns 400 on missing body for rule update',
    method: 'PUT',
    path: '/api/admin/qa/rules/99999',
    auth: true,
    body: {},
    expect: { status: 400 },
  },
  {
    name: 'QA: POST /api/admin/qa/rules/reset — returns 200',
    method: 'POST',
    path: '/api/admin/qa/rules/reset',
    auth: true,
    body: {},
    expect: { status: 200 },
  },
];
