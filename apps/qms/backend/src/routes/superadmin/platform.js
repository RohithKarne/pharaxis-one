import { Router } from 'express';
import { appendAuditEvent } from '../../services/auditTrailService.js';
import { logSuperadminAction } from './_adminActions.js';

export const superadminPlatformRouter = Router();

superadminPlatformRouter.get('/email-config', async (req, res, next) => {
  try {
    const emailConfig = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          SELECT
            id,
            config_key,
            smtp_host,
            smtp_port,
            smtp_username,
            smtp_from_email::text AS smtp_from_email,
            smtp_from_name,
            use_tls,
            is_active,
            updated_at
          FROM sa_platform_email_config
          WHERE config_key = 'default'
          LIMIT 1
        `
      );
      return rows[0] || null;
    });

    return res.json({ emailConfig });
  } catch (error) {
    return next(error);
  }
});

superadminPlatformRouter.put('/email-config', async (req, res, next) => {
  try {
    const {
      smtpHost,
      smtpPort = 587,
      smtpUsername = null,
      smtpPassword = null,
      smtpFromEmail = null,
      smtpFromName = null,
      useTls = true,
      isActive = true
    } = req.body || {};

    if (!smtpHost) {
      return res.status(400).json({ error: 'smtpHost is required' });
    }

    const emailConfig = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          INSERT INTO sa_platform_email_config (
            config_key,
            smtp_host,
            smtp_port,
            smtp_username,
            smtp_password_encrypted,
            smtp_from_email,
            smtp_from_name,
            use_tls,
            is_active,
            updated_by,
            updated_at
          )
          VALUES ('default', $1, $2, $3, $4, $5, $6, $7, $8, $9, now())
          ON CONFLICT (config_key)
          DO UPDATE SET
            smtp_host = EXCLUDED.smtp_host,
            smtp_port = EXCLUDED.smtp_port,
            smtp_username = EXCLUDED.smtp_username,
            smtp_password_encrypted = COALESCE(EXCLUDED.smtp_password_encrypted, sa_platform_email_config.smtp_password_encrypted),
            smtp_from_email = EXCLUDED.smtp_from_email,
            smtp_from_name = EXCLUDED.smtp_from_name,
            use_tls = EXCLUDED.use_tls,
            is_active = EXCLUDED.is_active,
            updated_by = EXCLUDED.updated_by,
            updated_at = now()
          RETURNING
            id,
            config_key,
            smtp_host,
            smtp_port,
            smtp_username,
            smtp_from_email::text AS smtp_from_email,
            smtp_from_name,
            use_tls,
            is_active,
            updated_at
        `,
        [
          smtpHost,
          Number(smtpPort),
          smtpUsername,
          smtpPassword || null,
          smtpFromEmail,
          smtpFromName,
          Boolean(useTls),
          Boolean(isActive),
          req.authContext.userId
        ]
      );

      await logSuperadminAction(client, {
        orgId: req.authContext.orgId,
        actorUserId: req.authContext.userId,
        actionKey: 'superadmin.platform.email_config',
        targetEntityType: 'sa_platform_email_config',
        targetEntityId: rows[0].id,
        detailsJson: { smtpHost, smtpPort: Number(smtpPort), smtpUsername, smtpFromEmail }
      });

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'superadmin',
        entityTable: 'sa_platform_email_config',
        entityId: rows[0].id,
        actionKey: 'upsert',
        actorUserId: req.authContext.userId,
        payloadJson: { smtpHost, smtpPort: Number(smtpPort), smtpFromEmail }
      });

      return rows[0];
    });

    return res.json({ emailConfig });
  } catch (error) {
    return next(error);
  }
});

superadminPlatformRouter.get('/upload-policy/:orgId', async (req, res, next) => {
  try {
    const { orgId } = req.params;
    const uploadPolicy = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          SELECT
            org_id,
            max_upload_mb,
            allowed_extensions,
            viewer_default_can_download,
            viewer_download_requires_watermark,
            updated_at
          FROM sa_org_upload_policies
          WHERE org_id = $1
          LIMIT 1
        `,
        [orgId]
      );
      return rows[0] || null;
    });
    return res.json({ uploadPolicy });
  } catch (error) {
    return next(error);
  }
});

superadminPlatformRouter.put('/upload-policy/:orgId', async (req, res, next) => {
  try {
    const { orgId } = req.params;
    const {
      maxUploadMb = 25,
      allowedExtensions = [],
      viewerDefaultCanDownload = false,
      viewerDownloadRequiresWatermark = true
    } = req.body || {};

    const sanitizedExtensions = Array.isArray(allowedExtensions)
      ? allowedExtensions
          .map((item) => String(item || '').trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 50)
      : [];

    const effectiveExtensions =
      sanitizedExtensions.length > 0
        ? Array.from(new Set(sanitizedExtensions))
        : [
            'pdf',
            'doc',
            'docx',
            'xls',
            'xlsx',
            'ppt',
            'pptx',
            'csv',
            'txt',
            'png',
            'jpg',
            'jpeg',
            'tiff',
            'eml',
            'msg'
          ];

    const uploadPolicy = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          INSERT INTO sa_org_upload_policies (
            org_id,
            max_upload_mb,
            allowed_extensions,
            viewer_default_can_download,
            viewer_download_requires_watermark,
            updated_by,
            updated_at
          )
          VALUES ($1, $2, $3::text[], $4, $5, $6, now())
          ON CONFLICT (org_id)
          DO UPDATE SET
            max_upload_mb = EXCLUDED.max_upload_mb,
            allowed_extensions = EXCLUDED.allowed_extensions,
            viewer_default_can_download = EXCLUDED.viewer_default_can_download,
            viewer_download_requires_watermark = EXCLUDED.viewer_download_requires_watermark,
            updated_by = EXCLUDED.updated_by,
            updated_at = now()
          RETURNING
            org_id,
            max_upload_mb,
            allowed_extensions,
            viewer_default_can_download,
            viewer_download_requires_watermark,
            updated_at
        `,
        [
          orgId,
          Number(maxUploadMb),
          effectiveExtensions,
          Boolean(viewerDefaultCanDownload),
          Boolean(viewerDownloadRequiresWatermark),
          req.authContext.userId
        ]
      );

      await logSuperadminAction(client, {
        orgId: req.authContext.orgId,
        actorUserId: req.authContext.userId,
        actionKey: 'superadmin.platform.upload_policy',
        targetEntityType: 'sa_org_upload_policies',
        targetEntityId: orgId,
        detailsJson: {
          maxUploadMb: Number(maxUploadMb),
          viewerDefaultCanDownload: Boolean(viewerDefaultCanDownload),
          viewerDownloadRequiresWatermark: Boolean(viewerDownloadRequiresWatermark),
          allowedExtensions: effectiveExtensions
        }
      });

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'superadmin',
        entityTable: 'sa_org_upload_policies',
        entityId: orgId,
        actionKey: 'upsert',
        actorUserId: req.authContext.userId,
        payloadJson: {
          maxUploadMb: Number(maxUploadMb),
          viewerDefaultCanDownload: Boolean(viewerDefaultCanDownload),
          viewerDownloadRequiresWatermark: Boolean(viewerDownloadRequiresWatermark)
        }
      });

      return rows[0];
    });

    return res.json({ uploadPolicy });
  } catch (error) {
    return next(error);
  }
});

superadminPlatformRouter.get('/security-policy/:orgId', async (req, res, next) => {
  try {
    const { orgId } = req.params;
    const securityPolicy = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          SELECT
            org_id,
            email_otp_required,
            allow_org_admin_2fa_reset,
            updated_at
          FROM sa_org_security_policies
          WHERE org_id = $1
          LIMIT 1
        `,
        [orgId]
      );
      return rows[0] || null;
    });

    return res.json({ securityPolicy });
  } catch (error) {
    return next(error);
  }
});

superadminPlatformRouter.put('/security-policy/:orgId', async (req, res, next) => {
  try {
    const { orgId } = req.params;
    const {
      emailOtpRequired = true,
      allowOrgAdmin2faReset = true
    } = req.body || {};

    const securityPolicy = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          INSERT INTO sa_org_security_policies (
            org_id,
            email_otp_required,
            allow_org_admin_2fa_reset,
            updated_by,
            updated_at
          )
          VALUES ($1, $2, $3, $4, now())
          ON CONFLICT (org_id)
          DO UPDATE SET
            email_otp_required = EXCLUDED.email_otp_required,
            allow_org_admin_2fa_reset = EXCLUDED.allow_org_admin_2fa_reset,
            updated_by = EXCLUDED.updated_by,
            updated_at = now()
          RETURNING
            org_id,
            email_otp_required,
            allow_org_admin_2fa_reset,
            updated_at
        `,
        [orgId, Boolean(emailOtpRequired), Boolean(allowOrgAdmin2faReset), req.authContext.userId]
      );

      await logSuperadminAction(client, {
        orgId: req.authContext.orgId,
        actorUserId: req.authContext.userId,
        actionKey: 'superadmin.platform.security_policy',
        targetEntityType: 'sa_org_security_policies',
        targetEntityId: orgId,
        detailsJson: {
          emailOtpRequired: Boolean(emailOtpRequired),
          allowOrgAdmin2faReset: Boolean(allowOrgAdmin2faReset)
        }
      });

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'superadmin',
        entityTable: 'sa_org_security_policies',
        entityId: orgId,
        actionKey: 'upsert',
        actorUserId: req.authContext.userId,
        payloadJson: {
          emailOtpRequired: Boolean(emailOtpRequired),
          allowOrgAdmin2faReset: Boolean(allowOrgAdmin2faReset)
        }
      });

      return rows[0];
    });

    return res.json({ securityPolicy });
  } catch (error) {
    return next(error);
  }
});
