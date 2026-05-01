import { env } from '../config/env.js';
import { jwtAuth } from './jwtAuth.js';
import { keycloakAuth } from './keycloakAuth.js';

function getBearerToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  const cookieHeader = req.headers.cookie || '';
  const cookie = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('qms_access_token='));
  return cookie ? decodeURIComponent(cookie.slice('qms_access_token='.length)) : null;
}

function readJwtPayloadUnsafe(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const decoded = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

export async function authSelector(req, res, next) {
  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }

  const forcedProvider = req.headers['x-auth-provider'];

  if (forcedProvider === 'jwt') {
    return jwtAuth(req, res, next, token);
  }

  if (forcedProvider === 'keycloak') {
    return keycloakAuth(req, res, next, token);
  }

  const unsafePayload = readJwtPayloadUnsafe(token);
  const looksLikeKeycloak = Boolean(
    unsafePayload?.iss && env.KEYCLOAK_ISSUER && unsafePayload.iss === env.KEYCLOAK_ISSUER
  );

  if (looksLikeKeycloak) {
    return keycloakAuth(req, res, next, token);
  }

  return jwtAuth(req, res, next, token);
}
