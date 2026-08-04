import { Router } from 'express';
import { appendAuditEvent, verifyAuditChain } from '../services/auditTrailService.js';

export const securityRouter = Router();

function hasRole(roles, roleKey) {
  return Array.isArray(roles) && roles.includes(roleKey);
}

securityRouter.get('/me', async (req, res, next) => {
  try {
    const data = await req.withRlsTransaction(async (client) => {
      const { rows: policyRows } = await client.query(
        `
          SELECT email_otp_required, allow_org_admin_2fa_reset, updated_at
          FROM sa_org_security_policies
          WHERE org_id = $1
          LIMIT 1
        `,
        [req.authContext.orgId]
      );

      const { rows: userRows } = await client.query(
        `
          SELECT email_otp_enabled, reset_required, last_verified_at, updated_at
          FROM qms_user_2fa_settings
          WHERE user_id = $1
            AND org_id = $2
          LIMIT 1
        `,
        [req.authContext.userId, req.authContext.orgId]
      );

      return {
        policy: policyRows[0] || null,
        user2fa: userRows[0] || null
      };
    });

    return res.json(data);
  } catch (error) {
    return next(error);
  }
});

securityRouter.post('/users/:userId/2fa-reset', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const isSuperadmin = hasRole(req.authContext.roles, 'superadmin');
    const isOrgAdmin = hasRole(req.authContext.roles, 'admin');
    if (!isSuperadmin && !isOrgAdmin) {
      return res.status(403).json({ error: 'Admin or superadmin role required' });
    }

    const response = await req.withRlsTransaction(async (client) => {
      const { rows: policyRows } = await client.query(
        `
          SELECT email_otp_required, allow_org_admin_2fa_reset
          FROM sa_org_security_policies
          WHERE org_id = $1
          LIMIT 1
        `,
        [req.authContext.orgId]
      );
      const policy = policyRows[0] || {
        email_otp_required: true,
        allow_org_admin_2fa_reset: true
      };

      if (!isSuperadmin && !policy.allow_org_admin_2fa_reset) {
        const error = new Error('Org admin reset is disabled for this organization');
        error.statusCode = 403;
        throw error;
      }

      const { rows: userRows } = await client.query(
        `
          SELECT id, org_id, email
          FROM qms_users
          WHERE id = $1
            AND ($2 OR org_id = $3)
          LIMIT 1
        `,
        [userId, isSuperadmin, req.authContext.orgId]
      );

      if (!userRows[0]) {
        const error = new Error('User not found');
        error.statusCode = 404;
        throw error;
      }

      await client.query(
        `
          INSERT INTO qms_user_2fa_settings (
            org_id,
            user_id,
            email_otp_enabled,
            reset_required,
            reset_by,
            updated_at
          )
          VALUES ($1, $2, true, true, $3, CURRENT_TIMESTAMP(3)) AS new
          ON DUPLICATE KEY UPDATE
            email_otp_enabled = true,
            reset_required = true,
            reset_by = new.reset_by,
            updated_at = CURRENT_TIMESTAMP(3)
        `,
        [userRows[0].org_id, userId, req.authContext.userId]
      );

      const { rows: settingsRows } = await client.query(
        `
          SELECT user_id, email_otp_enabled, reset_required, updated_at
          FROM qms_user_2fa_settings
          WHERE user_id = $1
            AND org_id = $2
          LIMIT 1
        `,
        [userId, userRows[0].org_id]
      );

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'security',
        entityTable: 'qms_user_2fa_settings',
        entityId: settingsRows[0].user_id,
        actionKey: '2fa_reset',
        actorUserId: req.authContext.userId,
        payloadJson: {
          targetUserId: userId,
          targetEmail: userRows[0].email,
          actorIsSuperadmin: isSuperadmin
        }
      });

      return {
        policy,
        setting: settingsRows[0]
      };
    });

    return res.json(response);
  } catch (error) {
    return next(error);
  }
});

securityRouter.get('/audit-chain/verify', async (req, res, next) => {
  try {
    const isSuperadmin = hasRole(req.authContext.roles, 'superadmin');
    const isOrgAdmin = hasRole(req.authContext.roles, 'admin');
    const isQaReviewer = hasRole(req.authContext.roles, 'qareviewer');
    if (!isSuperadmin && !isOrgAdmin && !isQaReviewer) {
      return res.status(403).json({ error: 'Admin, QA Reviewer, or Superadmin role required' });
    }

    // Both verifiers run, because they answer different questions.
    //
    // verifyAuditHashChain (utils/auditVerify.js) checks CHAIN LINKAGE: each
    // row's prev_hash equals the previous row's curr_hash. It detects a deleted
    // or reordered event. It does NOT recompute the digest, so on its own it
    // would pass a row whose payload had been edited in place.
    //
    // verifyAuditChain (services/auditTrailService.js) recomputes the SHA-256
    // over the row's actual contents, so it detects tampering with the payload,
    // actor, action or timestamp. This is the 21 CFR Part 11 property; until now
    // it was dead code and the endpoint reported linkage only.
    const verificationResult = await req.withRlsTransaction(async (client) => {
      const { verifyAuditHashChain } = await import('../utils/auditVerify.js');
      const [linkage, digest] = await Promise.all([
        verifyAuditHashChain(client, req.authContext.orgId),
        verifyAuditChain(client, req.authContext.orgId)
      ]);

      return {
        ...linkage,
        // Events written before the PostgreSQL -> MySQL cutover hashed the
        // Postgres text rendering of their timestamp, which cannot be
        // reproduced. They stay link-verified but their digests cannot be
        // recomputed. Reported explicitly rather than counted as corruption,
        // so the boundary is visible to an auditor instead of looking either
        // like a clean bill of health or like tampering.
        digestVerifiedCount: digest.digestVerified ?? 0,
        digestUnverifiableCount: digest.unverifiableDigestCount ?? 0,
        digestUnverifiableReason:
          (digest.unverifiableDigestCount ?? 0) > 0
            ? 'Written before the MySQL cutover; hashed with the PostgreSQL timestamp rendering. Chain linkage is verified; the digest cannot be recomputed.'
            : null
      };
    });

    return res.json(verificationResult);
  } catch (error) {
    return next(error);
  }
});

