export function superadminAuth(req, res, next) {
  if (!req.authContext?.isSuperadmin) {
    return res.status(403).json({ error: 'Superadmin role required' });
  }
  return next();
}

