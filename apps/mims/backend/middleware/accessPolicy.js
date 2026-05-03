'use strict';

const { userHasActivityPrivilege } = require('../services/accessConfigurationService');

function requireActivityPrivilege(privilegeKey) {
  return async (req, res, next) => {
    try {
      const allowed = await userHasActivityPrivilege(req.user, privilegeKey);
      if (!allowed) {
        return res.status(403).json({
          error: 'You do not have the required activity privilege.',
          required_privilege: privilegeKey,
        });
      }
      return next();
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Failed to evaluate access policy.' });
    }
  };
}

module.exports = { requireActivityPrivilege };
