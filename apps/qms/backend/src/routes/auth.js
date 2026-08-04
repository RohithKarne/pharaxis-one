import { randomInt, createHash, randomUUID } from 'crypto';
import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { getMysqlClient } from '../db/mysql/pool.js';
import { env } from '../config/env.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { recordLoginAudit, readRequestMeta } from '../services/loginAuditService.js';
import { resolveUserSecurityGroups } from '../services/securityGroupService.js';
import { queueEmailNotification } from '../services/platform/notificationService.js';

const OTP_VALIDITY_SECONDS = 600;

export const authRouter = Router();

const authEndpointLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: Number(process.env.QMS_AUTH_RATE_LIMIT || 30),
  keyFn: (req) => {
    const email = String(req.body?.email || req.body?.userId || '').trim().toLowerCase();
    return `${req.ip}:${email}`;
  },
  message: 'Too many authentication attempts. Please retry after 10 minutes.'
});

const orgDiscoveryLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: Number(process.env.QMS_ORG_DISCOVERY_RATE_LIMIT || 20),
  keyFn: (req) => req.ip,
  message: 'Too many org discovery attempts. Please retry shortly.'
});

const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.NODE_ENV === 'production',
  maxAge: 8 * 60 * 60 * 1000
};

function makeToken(payload) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
}

function sendAuthResponse(req, res, payload) {
  res.cookie('qms_access_token', payload.accessToken, AUTH_COOKIE_OPTIONS);
  const includeRawToken = req.query?.include_token === 'true' || req.headers['x-include-token'] === 'true' || env.NODE_ENV === 'test';
  const responseData = { ...payload };
  if (!includeRawToken) {
    delete responseData.accessToken;
    responseData.tokenType = 'Cookie';
  }
  return res.json(responseData);
}

function hashOtp(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function generateOtp() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

function makeUserAuthResponse(user, securityGroups, token) {
  return {
    tokenType: 'Bearer',
    accessToken: token,
    expiresIn: env.JWT_EXPIRES_IN,
    user: {
      id: user.id,
      orgId: user.org_id,
      orgCode: user.org_code,
      orgName: user.org_name,
      email: user.email,
      fullName: user.full_name,
      securityGroups
    }
  };
}

/*
 * applyAuthRouteRlsContext / resetAuthRouteRlsContext are gone.
 *
 * They existed only to set the Postgres RLS session variables
 * (`app.is_superadmin`, `app.current_org_id`) that the 0002/0005 policies read.
 * MySQL has no set_config and no row-level security, and the MySQL migrations
 * dropped the policies outright, so there is nothing for them to talk to.
 *
 * The scoping they used to buy is not lost: Phase 0 put the tenant predicate in
 * every query, so each statement below carries its own `org_id = $n` (or, for
 * the two pre-auth lookups, a documented cross-org exemption). The RLS context
 * was the second lock on a door that is still locked.
 */

/**
 * Verify a password against its stored hash.
 *
 * Previously this ran `SELECT crypt($2, $1) = $1` — pgcrypto, which MySQL does
 * not have, so every login would have failed at cutover. bcrypt reads the cost
 * factor out of the hash itself, so the existing `$2a$06$` hashes written by
 * `crypt(pw, gen_salt('bf'))` verify unchanged: no password resets, no
 * migration step. Confirmed against real stored hashes before this change.
 *
 * Two incidental improvements: the plaintext password no longer travels to the
 * database as a query parameter (where it could surface in query logs), and
 * login no longer needs a database round-trip to check the password.
 */
async function validatePassword(passwordHash, passwordInput) {
  if (!passwordHash || !passwordInput) return false;
  return bcrypt.compare(String(passwordInput), String(passwordHash));
}

async function getUserSecurityContext(client, user) {
  const securityGroups = await resolveUserSecurityGroups(client, {
    orgId: user.org_id,
    userId: user.id,
    fallbackRoleKey: user.role_key
  });

  const { rows: policyRows } = await client.query(
    `
      SELECT email_otp_required
      FROM sa_org_security_policies
      WHERE org_id = $1
      LIMIT 1
    `,
    [user.org_id]
  );
  const orgPolicy = policyRows[0] || { email_otp_required: true };

  const { rows: user2faRows } = await client.query(
    `
      SELECT email_otp_enabled, reset_required
      FROM qms_user_2fa_settings
      WHERE user_id = $1
        AND org_id = $2
      LIMIT 1
    `,
    [user.id, user.org_id]
  );
  const user2fa = user2faRows[0] || { email_otp_enabled: true, reset_required: false };

  const requiresEmailOtp =
    (Boolean(orgPolicy.email_otp_required) && user2fa.email_otp_enabled !== false) ||
    Boolean(user2fa.reset_required);

  return {
    securityGroups,
    requiresEmailOtp
  };
}

async function issueOtpChallenge(client, user) {
  const otp = generateOtp();
  const otpHash = hashOtp(otp);
  const expiresAt = new Date(Date.now() + OTP_VALIDITY_SECONDS * 1000);

  // The challenge id is generated here rather than read back with RETURNING
  // (which MySQL does not support). It is also the bearer secret handed to the
  // client for step 2, so it must be unguessable — randomUUID() is a CSPRNG,
  // the same source gen_random_uuid() used.
  const challengeId = randomUUID();

  await client.query(
    `
      INSERT INTO qms_login_otp_challenges (
        id,
        org_id,
        user_id,
        recipient_email,
        otp_code_hash,
        expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    // expiresAt is passed as a Date, not expiresAt.toISOString(). Postgres
    // accepted the ISO-8601 string; MySQL rejects the trailing 'Z' outright —
    // ER_TRUNCATED_WRONG_VALUE, so every OTP login would have 500'd at cutover.
    // mysql2 serialises a Date itself, and the pool pins timezone 'Z' plus
    // `SET time_zone = '+00:00'` per connection, so it still lands as UTC.
    [challengeId, user.org_id, user.id, user.email, otpHash, expiresAt]
  );

  await queueEmailNotification(client, {
    orgId: user.org_id,
    recipientEmail: user.email,
    subject: 'Pharaxis QMS Login OTP',
    body: `Your one-time code is ${otp}. It expires in 10 minutes.`
  });

  return {
    challengeId,
    otp
  };
}

authRouter.get('/providers', (_req, res) => {
  res.json({
    jwt: true,
    keycloak: Boolean(env.KEYCLOAK_JWKS_URI)
  });
});

authRouter.get('/orgs', orgDiscoveryLimiter, async (req, res, next) => {
  const client = await getMysqlClient();
  try {
    const query = String(req.query.q || '').trim();
    const searchPattern = query.length >= 2 ? `%${query}%` : '%';
    const { rows } = await client.query(
      `
        SELECT org_code, org_name
        FROM qms_orgs
        WHERE is_active = true
          AND (
            lower(org_code) LIKE lower($1)
            OR lower(org_name) LIKE lower($1)
          )
        ORDER BY org_name ASC
        LIMIT 10
      `,
      [searchPattern]
    );
    return res.json({
      orgs: rows.map((row) => ({
        orgCode: row.org_code,
        orgName: row.org_name
      }))
    });
  } catch (error) {
    return next(error);
  } finally {
    client.release();
  }
});

authRouter.post('/login', authEndpointLimiter, async (req, res, next) => {
  const client = await getMysqlClient();

  try {
    const { userId, email, password, orgCode } = req.body || {};
    const loginIdentifier = String(userId || email || '').trim();
    if (!loginIdentifier || !password || !orgCode) {
      return res.status(400).json({
        error: 'userId, password, and orgCode are required'
      });
    }

    const { ipAddress, userAgent } = readRequestMeta(req);

    const { rows: candidates } = await client.query(
      `
        SELECT
          u.id,
          u.org_id,
          u.email,
          u.full_name,
          u.role_key,
          u.password_hash,
          u.is_active AS user_is_active,
          o.org_code,
          o.org_name,
          o.is_active AS org_is_active
        FROM qms_users u
        JOIN qms_orgs o ON o.id = u.org_id
        WHERE (
          LOWER(u.email) = LOWER($1)
          OR SUBSTRING_INDEX(LOWER(u.email), '@', 1) = LOWER($1)
        )
          AND o.org_code = $2
        LIMIT 1
      `,
      [loginIdentifier, orgCode]
    );

    const user = candidates[0];
    if (!user) {
      await recordLoginAudit(client, {
        orgId: null,
        email: loginIdentifier,
        loginSurface: 'user',
        outcome: 'Failed',
        reason: 'User or organization not found',
        ipAddress,
        userAgent
      });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.org_is_active) {
      await recordLoginAudit(client, {
        orgId: user.org_id,
        email: user.email,
        loginSurface: 'user',
        outcome: 'Failed',
        reason: 'Organization is inactive',
        ipAddress,
        userAgent
      });
      return res.status(403).json({ error: 'Organization is inactive' });
    }

    if (!user.user_is_active) {
      await recordLoginAudit(client, {
        orgId: user.org_id,
        email: user.email,
        loginSurface: 'user',
        outcome: 'Failed',
        reason: 'User is inactive',
        ipAddress,
        userAgent
      });
      return res.status(403).json({ error: 'User is inactive' });
    }

    const validPassword = await validatePassword(user.password_hash, password);
    if (!validPassword) {
      await recordLoginAudit(client, {
        orgId: user.org_id,
        email: user.email,
        loginSurface: 'user',
        outcome: 'Failed',
        reason: 'Invalid password',
        ipAddress,
        userAgent
      });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const securityContext = await getUserSecurityContext(client, user);
    if (securityContext.securityGroups.includes('superadmin')) {
      await recordLoginAudit(client, {
        orgId: user.org_id,
        email: user.email,
        loginSurface: 'user',
        outcome: 'Failed',
        reason: 'Superadmin must use dedicated login',
        ipAddress,
        userAgent
      });
      return res.status(403).json({ error: 'Use superadmin login URL for this account' });
    }

    if (securityContext.requiresEmailOtp) {
      const challenge = await issueOtpChallenge(client, user);
      await recordLoginAudit(client, {
        orgId: user.org_id,
        email: user.email,
        loginSurface: 'user',
        outcome: 'Failed',
        reason: 'OTP challenge issued',
        ipAddress,
        userAgent
      });

      if (env.NODE_ENV !== 'production') {
        console.log(`\n[DEV OTP] ✉  ${user.email}  →  ${challenge.otp}  (challengeId: ${challenge.challengeId})\n`);
      }

      return res.status(202).json({
        otpRequired: true,
        challengeId: challenge.challengeId,
        expiresInSeconds: OTP_VALIDITY_SECONDS,
        ...(env.NODE_ENV !== 'production' ? { devOtp: challenge.otp } : {})
      });
    }

    const token = makeToken({
      sub: user.id,
      orgId: user.org_id,
      roles: securityContext.securityGroups,
      email: user.email,
      name: user.full_name
    });

    await recordLoginAudit(client, {
      orgId: user.org_id,
      email: user.email,
      loginSurface: 'user',
      outcome: 'Success',
      reason: 'User login success',
      ipAddress,
      userAgent
    });

    return sendAuthResponse(req, res, makeUserAuthResponse(user, securityContext.securityGroups, token));
  } catch (error) {
    return next(error);
  } finally {
    client.release();
  }
});

authRouter.post('/login/verify-otp', authEndpointLimiter, async (req, res, next) => {
  const client = await getMysqlClient();

  try {
    const { challengeId, otp } = req.body || {};
    if (!challengeId || !otp) {
      return res.status(400).json({ error: 'challengeId and otp are required' });
    }

    const { ipAddress, userAgent } = readRequestMeta(req);

    const { rows: challengeRows } = await client.query(
      `
        SELECT
          c.id,
          c.org_id,
          c.user_id,
          c.recipient_email,
          c.otp_code_hash,
          c.expires_at,
          c.attempt_count,
          c.max_attempts,
          c.consumed_at,
          u.full_name,
          u.role_key,
          u.is_active AS user_is_active,
          o.org_code,
          o.org_name,
          o.is_active AS org_is_active
        -- tenant-scope-audit: cross-org — pre-auth. The challenge id is itself
        -- the bearer secret issued at step 1; the caller has no session and no
        -- org context yet. The org is derived FROM this row (c.org_id) and every
        -- write that follows is scoped to it.
        FROM qms_login_otp_challenges c
        JOIN qms_users u ON u.id = c.user_id
        JOIN qms_orgs o ON o.id = c.org_id
        WHERE c.id = $1
        LIMIT 1
      `,
      [challengeId]
    );

    const challenge = challengeRows[0];
    if (!challenge) {
      return res.status(404).json({ error: 'OTP challenge not found' });
    }

    const now = new Date();
    if (challenge.consumed_at) {
      return res.status(400).json({ error: 'OTP challenge already used' });
    }
    if (new Date(challenge.expires_at) < now) {
      return res.status(400).json({ error: 'OTP challenge expired' });
    }
    if (!challenge.org_is_active || !challenge.user_is_active) {
      return res.status(403).json({ error: 'User or organization is inactive' });
    }

    const hashed = hashOtp(otp);
    if (hashed !== challenge.otp_code_hash) {
      const attempts = Number(challenge.attempt_count || 0) + 1;
      const consume = attempts >= Number(challenge.max_attempts || 5);
      await client.query(
        `
          UPDATE qms_login_otp_challenges
          SET
            attempt_count = $2,
            consumed_at = CASE WHEN $3 THEN CURRENT_TIMESTAMP(3) ELSE consumed_at END
          WHERE id = $1
            AND org_id = $4
        `,
        [challenge.id, attempts, consume, challenge.org_id]
      );

      await recordLoginAudit(client, {
        orgId: challenge.org_id,
        email: challenge.recipient_email,
        loginSurface: 'user',
        outcome: 'Failed',
        reason: 'Invalid OTP',
        ipAddress,
        userAgent
      });

      return res.status(401).json({ error: 'Invalid OTP' });
    }

    await client.query(
      `
        UPDATE qms_login_otp_challenges
        SET consumed_at = CURRENT_TIMESTAMP(3), attempt_count = attempt_count + 1
        WHERE id = $1
          AND org_id = $2
      `,
      [challenge.id, challenge.org_id]
    );

    await client.query(
      `
        INSERT INTO qms_user_2fa_settings (
          org_id,
          user_id,
          email_otp_enabled,
          reset_required,
          last_verified_at,
          updated_at
        )
        VALUES ($1, $2, true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
        ON DUPLICATE KEY UPDATE
          reset_required = false,
          last_verified_at = CURRENT_TIMESTAMP(3),
          updated_at = CURRENT_TIMESTAMP(3)
      `,
      [challenge.org_id, challenge.user_id]
    );

    const user = {
      id: challenge.user_id,
      org_id: challenge.org_id,
      email: challenge.recipient_email,
      full_name: challenge.full_name,
      role_key: challenge.role_key,
      org_code: challenge.org_code,
      org_name: challenge.org_name
    };

    const securityContext = await getUserSecurityContext(client, user);
    const token = makeToken({
      sub: user.id,
      orgId: user.org_id,
      roles: securityContext.securityGroups,
      email: user.email,
      name: user.full_name
    });

    await recordLoginAudit(client, {
      orgId: user.org_id,
      email: user.email,
      loginSurface: 'user',
      outcome: 'Success',
      reason: 'User login success via OTP',
      ipAddress,
      userAgent
    });

    return sendAuthResponse(req, res, {
      otpVerified: true,
      ...makeUserAuthResponse(user, securityContext.securityGroups, token)
    });
  } catch (error) {
    return next(error);
  } finally {
    client.release();
  }
});

authRouter.post('/superadmin/login', authEndpointLimiter, async (req, res, next) => {
  const client = await getMysqlClient();

  try {
    const { userId, email, password } = req.body || {};
    const loginIdentifier = String(userId || email || '').trim();
    if (!loginIdentifier || !password) {
      return res.status(400).json({
        error: 'userId and password are required'
      });
    }

    const { ipAddress, userAgent } = readRequestMeta(req);

    const { rows: candidates } = await client.query(
      `
        SELECT
          u.id,
          u.org_id,
          u.email,
          u.full_name,
          u.role_key,
          u.password_hash,
          u.is_active AS user_is_active,
          o.org_code,
          o.org_name,
          o.is_active AS org_is_active
        -- tenant-scope-audit: cross-org — superadmin login surface. A superadmin
        -- is not bound to an org and supplies no orgCode, so there is no tenant
        -- to scope to. Narrowed instead by role_key = 'superadmin'.
        FROM qms_users u
        JOIN qms_orgs o ON o.id = u.org_id
        WHERE (
          LOWER(u.email) = LOWER($1)
          OR SUBSTRING_INDEX(LOWER(u.email), '@', 1) = LOWER($1)
        )
          AND u.role_key = 'superadmin'
        ORDER BY u.created_at ASC
        LIMIT 1
      `,
      [loginIdentifier]
    );

    const user = candidates[0];
    if (!user) {
      await recordLoginAudit(client, {
        orgId: null,
        email: loginIdentifier,
        loginSurface: 'superadmin',
        outcome: 'Failed',
        reason: 'Superadmin user not found',
        ipAddress,
        userAgent
      });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.org_is_active) {
      await recordLoginAudit(client, {
        orgId: user.org_id,
        email: user.email,
        loginSurface: 'superadmin',
        outcome: 'Failed',
        reason: 'Organization is inactive',
        ipAddress,
        userAgent
      });
      return res.status(403).json({ error: 'Organization is inactive' });
    }

    if (!user.user_is_active) {
      await recordLoginAudit(client, {
        orgId: user.org_id,
        email: user.email,
        loginSurface: 'superadmin',
        outcome: 'Failed',
        reason: 'User is inactive',
        ipAddress,
        userAgent
      });
      return res.status(403).json({ error: 'User is inactive' });
    }

    const validPassword = await validatePassword(user.password_hash, password);
    if (!validPassword) {
      await recordLoginAudit(client, {
        orgId: user.org_id,
        email: user.email,
        loginSurface: 'superadmin',
        outcome: 'Failed',
        reason: 'Invalid password',
        ipAddress,
        userAgent
      });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const securityGroups = await resolveUserSecurityGroups(client, {
      orgId: user.org_id,
      userId: user.id,
      fallbackRoleKey: user.role_key
    });
    if (!securityGroups.includes('superadmin')) {
      securityGroups.push('superadmin');
    }

    const token = makeToken({
      sub: user.id,
      orgId: user.org_id,
      roles: securityGroups,
      email: user.email,
      name: user.full_name
    });

    await recordLoginAudit(client, {
      orgId: user.org_id,
      email: user.email,
      loginSurface: 'superadmin',
      outcome: 'Success',
      reason: 'Superadmin login success',
      ipAddress,
      userAgent
    });

    return sendAuthResponse(req, res, makeUserAuthResponse(user, securityGroups, token));
  } catch (error) {
    return next(error);
  } finally {
    client.release();
  }
});
