import { randomInt, createHash } from 'crypto';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { getDbPool } from '../db/pool.js';
import { env } from '../config/env.js';
import { recordLoginAudit, readRequestMeta } from '../services/loginAuditService.js';
import { resolveUserSecurityGroups } from '../services/securityGroupService.js';
import { queueEmailNotification } from '../services/platform/notificationService.js';

const OTP_VALIDITY_SECONDS = 600;

export const authRouter = Router();

function makeToken(payload) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
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

async function validatePassword(client, passwordHash, passwordInput) {
  const { rows } = await client.query('SELECT crypt($2, $1) = $1 AS valid', [passwordHash, passwordInput]);
  return Boolean(rows[0]?.valid);
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
      LIMIT 1
    `,
    [user.id]
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

  const { rows } = await client.query(
    `
      INSERT INTO qms_login_otp_challenges (
        org_id,
        user_id,
        recipient_email,
        otp_code_hash,
        expires_at
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `,
    [user.org_id, user.id, user.email, otpHash, expiresAt.toISOString()]
  );

  await queueEmailNotification(client, {
    orgId: user.org_id,
    recipientEmail: user.email,
    subject: 'Pharaxis QMS Login OTP',
    body: `Your one-time code is ${otp}. It expires in 10 minutes.`
  });

  return {
    challengeId: rows[0].id,
    otp
  };
}

authRouter.get('/providers', (_req, res) => {
  res.json({
    jwt: true,
    keycloak: Boolean(env.KEYCLOAK_JWKS_URI)
  });
});

authRouter.get('/orgs', async (_req, res, next) => {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `
        SELECT org_code, org_name
        FROM qms_orgs
        WHERE is_active = true
        ORDER BY org_name ASC
      `
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

authRouter.post('/login', async (req, res, next) => {
  const pool = getDbPool();
  const client = await pool.connect();

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
          u.email::text AS email,
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
          lower(u.email::text) = lower($1)
          OR split_part(lower(u.email::text), '@', 1) = lower($1)
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

    const validPassword = await validatePassword(client, user.password_hash, password);
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

    return res.json(makeUserAuthResponse(user, securityContext.securityGroups, token));
  } catch (error) {
    return next(error);
  } finally {
    client.release();
  }
});

authRouter.post('/login/verify-otp', async (req, res, next) => {
  const pool = getDbPool();
  const client = await pool.connect();

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
          c.recipient_email::text AS recipient_email,
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
            consumed_at = CASE WHEN $3 THEN now() ELSE consumed_at END
          WHERE id = $1
        `,
        [challenge.id, attempts, consume]
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
        SET consumed_at = now(), attempt_count = attempt_count + 1
        WHERE id = $1
      `,
      [challenge.id]
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
        VALUES ($1, $2, true, false, now(), now())
        ON CONFLICT (user_id)
        DO UPDATE SET
          reset_required = false,
          last_verified_at = now(),
          updated_at = now()
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

    return res.json({
      otpVerified: true,
      ...makeUserAuthResponse(user, securityContext.securityGroups, token)
    });
  } catch (error) {
    return next(error);
  } finally {
    client.release();
  }
});

authRouter.post('/superadmin/login', async (req, res, next) => {
  const pool = getDbPool();
  const client = await pool.connect();

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
          u.email::text AS email,
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
          lower(u.email::text) = lower($1)
          OR split_part(lower(u.email::text), '@', 1) = lower($1)
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

    const validPassword = await validatePassword(client, user.password_hash, password);
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

    return res.json(makeUserAuthResponse(user, securityGroups, token));
  } catch (error) {
    return next(error);
  } finally {
    client.release();
  }
});
