import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from '../config/env.js';

let jwks;

function getKeycloakJwks() {
  if (!env.KEYCLOAK_JWKS_URI) {
    throw new Error('KEYCLOAK_JWKS_URI is not configured');
  }

  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(env.KEYCLOAK_JWKS_URI));
  }

  return jwks;
}

export async function verifyKeycloakToken(token) {
  const options = {};
  if (env.KEYCLOAK_ISSUER) options.issuer = env.KEYCLOAK_ISSUER;
  if (env.KEYCLOAK_AUDIENCE) options.audience = env.KEYCLOAK_AUDIENCE;

  const { payload } = await jwtVerify(token, getKeycloakJwks(), options);
  return payload;
}

export async function keycloakAuth(req, _res, next, token) {
  try {
    const payload = await verifyKeycloakToken(token);

    if (!payload.sub || !payload.org_id) {
      const error = new Error('Keycloak token missing required claims (sub/org_id)');
      error.statusCode = 401;
      return next(error);
    }

    req.auth = {
      userId: payload.sub,
      orgId: payload.org_id,
      roles: payload.roles || payload.realm_access?.roles || [],
      provider: 'keycloak',
      email: payload.email || null
    };

    return next();
  } catch {
    const error = new Error('Invalid Keycloak token');
    error.statusCode = 401;
    return next(error);
  }
}
