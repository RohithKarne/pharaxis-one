import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export function verifyJwtToken(token) {
  return jwt.verify(token, env.JWT_SECRET);
}

export function jwtAuth(req, _res, next, token) {
  try {
    const payload = verifyJwtToken(token);

    if (!payload.sub || !payload.orgId) {
      const error = new Error('JWT token missing required claims');
      error.statusCode = 401;
      return next(error);
    }

    req.auth = {
      userId: payload.sub,
      orgId: payload.orgId,
      roles: payload.roles || [],
      provider: 'jwt',
      email: payload.email || null
    };

    return next();
  } catch {
    const error = new Error('Invalid JWT token');
    error.statusCode = 401;
    return next(error);
  }
}
