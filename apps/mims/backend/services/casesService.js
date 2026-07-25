'use strict';

/**
 * casesService.js — Core Business & Data Access Service for Case Management
 * 
 * Handles query execution, data mapping, saved views logic, and transactional writes for cases.
 */

const pool = require('../database/db');
const { parseStoredJson, parseJsonSafe, isAdminUser } = require('../utils/adminScope');

/**
 * Fetch saved case views for an organization and user
 */
async function getSavedViews(orgId, userId) {
  if (!orgId) return [];
  const [rows] = await pool.execute(
    `SELECT id, org_id, user_id, name, scope, filters_json, is_shared, created_at, updated_at
     FROM case_saved_views
     WHERE org_id = ? AND (user_id = ? OR is_shared = 1)
     ORDER BY is_shared DESC, updated_at DESC, id DESC`,
    [orgId, userId]
  );
  return rows.map((row) => ({
    ...row,
    filters: parseStoredJson(row.filters_json, {}),
  }));
}

/**
 * Save or update a case view configuration
 */
async function createSavedView(orgId, userId, { name, filters, isShared }) {
  const [result] = await pool.execute(
    `INSERT INTO case_saved_views (org_id, user_id, name, scope, filters_json, is_shared)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      orgId,
      userId,
      name,
      'cases',
      JSON.stringify(filters || {}),
      isShared ? 1 : 0,
    ]
  );
  return result.insertId;
}

/**
 * Get case count metrics by status for dashboard
 */
async function getCaseMetrics(orgId) {
  if (!orgId) return {};
  const [rows] = await pool.execute(
    `SELECT status, COUNT(*) as count
     FROM cases
     WHERE org_id = ? AND is_deleted = 0
     GROUP BY status`,
    [orgId]
  );
  const metrics = {};
  for (const row of rows) {
    metrics[row.status] = row.count;
  }
  return metrics;
}

module.exports = {
  getSavedViews,
  createSavedView,
  getCaseMetrics,
};
