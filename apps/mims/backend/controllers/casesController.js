'use strict';

/**
 * casesController.js — Controller Layer for Case Management API
 * 
 * Handles request validation, error formatting, and calls casesService.
 */

const casesService = require('../services/casesService');
const { isAdminUser } = require('../utils/adminScope');

async function handleGetSavedViews(req, res) {
  try {
    if (!req.user || !req.user.orgId) return res.json({ views: [] });
    const views = await casesService.getSavedViews(req.user.orgId, req.user.userId);
    return res.json({ views });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function handleCreateSavedView(req, res) {
  try {
    if (!req.user || !req.user.orgId) {
      return res.status(400).json({ error: 'Organisation context required.' });
    }
    const name = String(req.body?.name || '').trim();
    const filters = req.body?.filters && typeof req.body.filters === 'object' ? req.body.filters : {};
    const isShared = !!req.body?.is_shared;

    if (!name) return res.status(400).json({ error: 'name is required.' });
    if (isShared && !isAdminUser(req.user)) {
      return res.status(403).json({ error: 'Only admin roles can create shared views.' });
    }

    const viewId = await casesService.createSavedView(req.user.orgId, req.user.userId, {
      name,
      filters,
      isShared,
    });

    return res.status(201).json({ id: viewId, message: 'Saved view created successfully.' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function handleGetCaseMetrics(req, res) {
  try {
    if (!req.user || !req.user.orgId) return res.json({ metrics: {} });
    const metrics = await casesService.getCaseMetrics(req.user.orgId);
    return res.json({ metrics });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = {
  handleGetSavedViews,
  handleCreateSavedView,
  handleGetCaseMetrics,
};
