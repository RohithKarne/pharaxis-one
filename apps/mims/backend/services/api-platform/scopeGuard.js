'use strict';

function scopeGuard(scope) {
  return (req, res, next) => {
    const scopes = req.apiClient?.scopes || [];
    if (scopes.includes('*') || scopes.includes(scope)) return next();
    return res.status(403).json({ error: `Missing required scope: ${scope}` });
  };
}

module.exports = { scopeGuard };
