'use strict';

const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { requireActivityPrivilege } = require('../../middleware/accessPolicy');
const accessService = require('../../services/accessConfigurationService');
const { hasGlobalAdminScope, isAdminUser } = require('../../utils/adminScope');

const router = express.Router();

function requireAccessAdmin(req, res, next) {
  if (!isAdminUser(req.user)) {
    return res.status(403).json({ error: 'Admin or platform-admin access required.' });
  }
  return next();
}

function resolveOrgId(req, source = {}) {
  const orgId = accessService.normalizeOrgId(req, source.org_id || source.orgId || req.query.org_id || req.params.orgId);
  if (!orgId) {
    const err = new Error('org_id is required for this access configuration request.');
    err.status = 400;
    throw err;
  }
  return orgId;
}

function handleError(res, err, fallback = 'Server error.') {
  const status = err.status || (/not found/i.test(err.message) ? 404 : 500);
  return res.status(status).json({ error: err.message || fallback });
}

router.get('/access-config/catalog', authenticate, requireAccessAdmin, async (req, res) => {
  try {
    const orgId = hasGlobalAdminScope(req.user)
      ? Number(req.query.org_id || 0) || null
      : req.user.orgId;
    const [privileges, roles] = await Promise.all([
      accessService.getPrivilegeCatalog(orgId),
      accessService.getRolePermissions(),
    ]);
    return res.json({ privileges, roles, modules: accessService.MODULE_CATALOG.map(([key, label]) => ({ key, label })), templates: accessService.GROUP_TEMPLATES });
  } catch (err) {
    return handleError(res, err, 'Failed to load access catalog.');
  }
});

router.get('/access-config/overview', authenticate, requireAccessAdmin, async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    const overview = await accessService.getOverview(orgId);
    return res.json(overview);
  } catch (err) {
    return handleError(res, err, 'Failed to load access overview.');
  }
});

router.post('/access-config/templates/seed', authenticate, requireAccessAdmin, requireActivityPrivilege('admin.access.manage'), async (req, res) => {
  try {
    const orgId = resolveOrgId(req, req.body || {});
    const templates = await accessService.seedAccessTemplates(orgId, req.user.userId);
    return res.status(201).json({ templates });
  } catch (err) {
    return handleError(res, err, 'Failed to seed access templates.');
  }
});

router.get('/access-config/groups/:id/privileges', authenticate, requireAccessAdmin, async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    const result = await accessService.getGroupPrivileges(Number(req.params.id), orgId, hasGlobalAdminScope(req.user));
    if (!result) return res.status(404).json({ error: 'Security group not found.' });
    return res.json(result);
  } catch (err) {
    return handleError(res, err, 'Failed to load group privileges.');
  }
});

router.put('/access-config/groups/:id/privileges', authenticate, requireAccessAdmin, requireActivityPrivilege('admin.access.manage'), async (req, res) => {
  try {
    const orgId = resolveOrgId(req, req.body || {});
    const result = await accessService.setGroupPrivileges({
      groupId: Number(req.params.id),
      privilegeKeys: req.body?.privilege_keys || req.body?.privileges || [],
      userId: req.user.userId,
      orgId,
      allowGlobal: hasGlobalAdminScope(req.user),
      reason: req.body?.reason || null,
    });
    return res.json(result);
  } catch (err) {
    return handleError(res, err, 'Failed to update group privileges.');
  }
});

router.get('/access-config/users/:userId/effective-access', authenticate, requireAccessAdmin, async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    const result = await accessService.resolveEffectivePrivileges(Number(req.params.userId), orgId);
    if (!result) return res.status(404).json({ error: 'User org access not found.' });
    return res.json(result);
  } catch (err) {
    return handleError(res, err, 'Failed to resolve user access.');
  }
});

router.get('/access-config/site-access', authenticate, requireAccessAdmin, async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    const access = await accessService.getSiteAccess(orgId);
    return res.json({ access });
  } catch (err) {
    return handleError(res, err, 'Failed to load site access.');
  }
});

router.post('/access-config/site-access', authenticate, requireAccessAdmin, requireActivityPrivilege('admin.access.manage'), async (req, res) => {
  try {
    const orgId = resolveOrgId(req, req.body || {});
    const row = await accessService.upsertSiteAccess({
      orgId,
      userId: Number(req.body.user_id),
      siteId: Number(req.body.site_id),
      accessLevel: req.body.access_level || 'full',
      isPrimary: !!req.body.is_primary,
      isActive: req.body.is_active !== undefined ? !!req.body.is_active : true,
      actorId: req.user.userId,
      reason: req.body.reason || null,
    });
    return res.status(201).json({ access: row });
  } catch (err) {
    return handleError(res, err, 'Failed to save site access.');
  }
});

router.delete('/access-config/site-access/:id', authenticate, requireAccessAdmin, requireActivityPrivilege('admin.access.manage'), async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    await accessService.deleteSiteAccess(orgId, Number(req.params.id), req.user.userId, req.body?.reason || null);
    return res.json({ success: true });
  } catch (err) {
    return handleError(res, err, 'Failed to deactivate site access.');
  }
});

router.get('/access-config/site-rules', authenticate, requireAccessAdmin, async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    const rules = await accessService.getSiteRules(orgId, req.query.site_id ? Number(req.query.site_id) : null);
    return res.json({ rules });
  } catch (err) {
    return handleError(res, err, 'Failed to load site rules.');
  }
});

router.put('/access-config/site-rules/:siteId', authenticate, requireAccessAdmin, requireActivityPrivilege('admin.access.manage'), async (req, res) => {
  try {
    const orgId = resolveOrgId(req, req.body || {});
    const rules = await accessService.replaceSiteRules({
      orgId,
      siteId: Number(req.params.siteId),
      rules: req.body?.rules || [],
      actorId: req.user.userId,
      reason: req.body?.reason || null,
    });
    return res.json({ rules });
  } catch (err) {
    return handleError(res, err, 'Failed to save site rules.');
  }
});

router.get('/access-config/auth-policy', authenticate, requireAccessAdmin, async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    const policy = await accessService.getAuthPolicy(orgId);
    return res.json(policy);
  } catch (err) {
    return handleError(res, err, 'Failed to load auth policy.');
  }
});

router.put('/access-config/auth-policy', authenticate, requireAccessAdmin, requireActivityPrivilege('admin.access.manage'), async (req, res) => {
  try {
    const orgId = resolveOrgId(req, req.body || {});
    const policy = await accessService.saveAuthPolicy(orgId, req.body || {}, req.user.userId, req.body?.reason || null);
    return res.json(policy);
  } catch (err) {
    return handleError(res, err, 'Failed to save auth policy.');
  }
});

router.get('/access-config/requests', authenticate, requireAccessAdmin, async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    const requests = await accessService.listAccessRequests(orgId, req.query.status || null);
    return res.json({ requests });
  } catch (err) {
    return handleError(res, err, 'Failed to load access requests.');
  }
});

router.post('/access-config/requests', authenticate, requireAccessAdmin, requireActivityPrivilege('admin.access.manage'), async (req, res) => {
  try {
    const orgId = resolveOrgId(req, req.body || {});
    const id = await accessService.createAccessRequest({
      orgId,
      requestedBy: req.user.userId,
      targetType: req.body.target_type,
      targetId: req.body.target_id ? Number(req.body.target_id) : null,
      action: req.body.action,
      payload: req.body.payload || {},
      reason: req.body.reason || null,
      eSignatureRequired: !!req.body.e_signature_required,
    });
    return res.status(201).json({ id });
  } catch (err) {
    return handleError(res, err, 'Failed to create access request.');
  }
});

router.put('/access-config/requests/:id/review', authenticate, requireAccessAdmin, requireActivityPrivilege('admin.access.approve'), async (req, res) => {
  try {
    const orgId = resolveOrgId(req, req.body || {});
    const request = await accessService.reviewAccessRequest({
      orgId,
      requestId: Number(req.params.id),
      reviewerId: req.user.userId,
      status: req.body.status,
      note: req.body.note || null,
    });
    return res.json({ request });
  } catch (err) {
    return handleError(res, err, 'Failed to review access request.');
  }
});

router.get('/access-config/sod-rules', authenticate, requireAccessAdmin, async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    const rules = await accessService.getSodRules(orgId);
    return res.json({ rules });
  } catch (err) {
    return handleError(res, err, 'Failed to load SoD rules.');
  }
});

router.get('/access-config/validate', authenticate, requireAccessAdmin, async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    const validation = await accessService.validateAccessConfiguration(orgId);
    return res.json(validation);
  } catch (err) {
    return handleError(res, err, 'Failed to validate access configuration.');
  }
});

router.get('/access-config/review-snapshots', authenticate, requireAccessAdmin, async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    const snapshots = await accessService.listAccessReviewSnapshots(orgId);
    return res.json({ snapshots });
  } catch (err) {
    return handleError(res, err, 'Failed to load access review snapshots.');
  }
});

router.post('/access-config/review-snapshots', authenticate, requireAccessAdmin, requireActivityPrivilege('admin.access.manage'), async (req, res) => {
  try {
    const orgId = resolveOrgId(req, req.body || {});
    const snapshot = await accessService.createAccessReviewSnapshot(orgId, req.user.userId, req.body?.snapshot_name || null);
    return res.status(201).json(snapshot);
  } catch (err) {
    return handleError(res, err, 'Failed to create access review snapshot.');
  }
});

module.exports = router;
