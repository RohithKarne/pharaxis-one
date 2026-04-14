import { Router } from 'express';
import { appendAuditEvent } from '../services/auditTrailService.js';
import {
  assertRoleAllowedForTransition,
  assertTransitionAllowed,
  signatureMeaningForTransition
} from '../services/documentWorkflowService.js';
import { getControlledPreviewPolicy } from '../services/documentAccessService.js';
import { searchDocuments } from '../services/documentSearchService.js';

const validTypes = new Set(['SOP', 'Work Instruction', 'Policy', 'Form', 'Protocol']);

function makeDocumentCode(title) {
  const seed = String(title || 'doc')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 24);
  const suffix = Date.now().toString().slice(-6);
  return `DOC-${seed || 'QMS'}-${suffix}`;
}

function buildNextReviewDate(reviewIntervalDays) {
  const days = Number(reviewIntervalDays || 365);
  const dt = new Date();
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

async function validateSignatureIfRequired(client, reqContext, params) {
  const requiredMeaning = signatureMeaningForTransition(params.toStatus);
  if (!requiredMeaning) return null;

  if (!params.signatureId) {
    const error = new Error(
      `Transition to ${params.toStatus} requires signatureId with meaning "${requiredMeaning}"`
    );
    error.statusCode = 400;
    throw error;
  }

  const { rows } = await client.query(
    `
      SELECT id
      FROM qms_e_signatures
      WHERE id = $1
        AND org_id = $2
        AND user_id = $3
        AND entity_table = 'dc_document_versions'
        AND entity_id = $4
        AND signature_meaning = $5
      LIMIT 1
    `,
    [
      params.signatureId,
      reqContext.orgId,
      reqContext.userId,
      params.versionId,
      requiredMeaning
    ]
  );

  if (!rows[0]) {
    const error = new Error('Required e-signature was not found for this transition');
    error.statusCode = 400;
    throw error;
  }

  return rows[0].id;
}

export const documentControlRouter = Router();

documentControlRouter.post('/documents', async (req, res, next) => {
  try {
    const {
      documentCode,
      title,
      documentType,
      department,
      ownerUserId,
      reviewIntervalDays,
      contentSummary
    } = req.body || {};

    if (!title || !documentType || !department || !ownerUserId) {
      return res.status(400).json({
        error: 'title, documentType, department, and ownerUserId are required'
      });
    }

    if (!validTypes.has(documentType)) {
      return res.status(400).json({ error: 'Invalid documentType' });
    }

    const created = await req.withRlsTransaction(async (client) => {
      const code = documentCode || makeDocumentCode(title);
      const nextReviewDueDate = buildNextReviewDate(reviewIntervalDays);
      const intervalDays = Number(reviewIntervalDays || 365);
      const { rows: uploadPolicyRows } = await client.query(
        `
          SELECT viewer_default_can_download
          FROM sa_org_upload_policies
          WHERE org_id = $1
          LIMIT 1
        `,
        [req.authContext.orgId]
      );
      const viewerDefaultCanDownload = Boolean(uploadPolicyRows[0]?.viewer_default_can_download);

      const { rows: docs } = await client.query(
        `
          INSERT INTO dc_documents (
            org_id,
            document_code,
            title,
            document_type,
            department,
            owner_user_id,
            review_interval_days,
            next_review_due_date,
            created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING *
        `,
        [
          req.authContext.orgId,
          code,
          title,
          documentType,
          department,
          ownerUserId,
          intervalDays,
          nextReviewDueDate,
          req.authContext.userId
        ]
      );

      const document = docs[0];

      const { rows: versions } = await client.query(
        `
          INSERT INTO dc_document_versions (
            org_id,
            document_id,
            version_no,
            status,
            content_summary,
            created_by
          ) VALUES ($1, $2, 1, 'Draft', $3, $4)
          RETURNING *
        `,
        [req.authContext.orgId, document.id, contentSummary || null, req.authContext.userId]
      );

      const version = versions[0];

      await client.query(
        `
          UPDATE dc_documents
          SET active_version_id = $2, updated_at = now()
          WHERE id = $1
        `,
        [document.id, version.id]
      );
      document.active_version_id = version.id;

      await client.query(
        `
          INSERT INTO dc_document_periodic_reviews (
            org_id,
            document_id,
            due_date
          ) VALUES ($1, $2, $3)
        `,
        [req.authContext.orgId, document.id, nextReviewDueDate]
      );

      await client.query(
        `
          INSERT INTO dc_document_access_policies (
            org_id,
            document_id,
            role_key,
            can_view,
            can_download,
            can_print
          ) VALUES
            ($1, $2, 'superadmin', true, true, true),
            ($1, $2, 'viewer', true, $3, false)
          ON CONFLICT (document_id, role_key) DO NOTHING
        `,
        [req.authContext.orgId, document.id, viewerDefaultCanDownload]
      );

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'document_control',
        entityTable: 'dc_documents',
        entityId: document.id,
        actionKey: 'create',
        actorUserId: req.authContext.userId,
        payloadJson: {
          documentCode: document.document_code,
          documentType: document.document_type,
          department: document.department,
          versionNo: 1
        }
      });

      return { document, version };
    });

    return res.status(201).json(created);
  } catch (error) {
    return next(error);
  }
});

documentControlRouter.post('/documents/:documentId/revisions', async (req, res, next) => {
  try {
    const { documentId } = req.params;
    const { contentSummary } = req.body || {};

    const revision = await req.withRlsTransaction(async (client) => {
      const { rows: docs } = await client.query(
        `SELECT id, document_code FROM dc_documents WHERE id = $1`,
        [documentId]
      );
      if (!docs[0]) {
        const error = new Error('Document not found');
        error.statusCode = 404;
        throw error;
      }

      const { rows: seqRows } = await client.query(
        `
          SELECT coalesce(max(version_no), 0) + 1 AS next_version
          FROM dc_document_versions
          WHERE document_id = $1
        `,
        [documentId]
      );
      const nextVersion = Number(seqRows[0].next_version);

      const { rows: versions } = await client.query(
        `
          INSERT INTO dc_document_versions (
            org_id,
            document_id,
            version_no,
            status,
            content_summary,
            created_by
          ) VALUES ($1, $2, $3, 'Draft', $4, $5)
          RETURNING *
        `,
        [req.authContext.orgId, documentId, nextVersion, contentSummary || null, req.authContext.userId]
      );

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'document_control',
        entityTable: 'dc_document_versions',
        entityId: versions[0].id,
        actionKey: 'revision_create',
        actorUserId: req.authContext.userId,
        payloadJson: { documentId, versionNo: nextVersion }
      });

      return versions[0];
    });

    return res.status(201).json({ version: revision });
  } catch (error) {
    return next(error);
  }
});

documentControlRouter.post(
  '/documents/:documentId/versions/:versionId/transition',
  async (req, res, next) => {
    try {
      const { documentId, versionId } = req.params;
      const { toStatus, signatureId, notes } = req.body || {};

      if (!toStatus) {
        return res.status(400).json({ error: 'toStatus is required' });
      }

      const transitioned = await req.withRlsTransaction(async (client) => {
        const { rows: versions } = await client.query(
          `
            SELECT
              v.id,
              v.document_id,
              v.version_no,
              v.status,
              d.review_interval_days,
              d.active_version_id,
              d.created_by AS document_created_by
            FROM dc_document_versions v
            JOIN dc_documents d ON d.id = v.document_id
            WHERE v.id = $1
              AND v.document_id = $2
          `,
          [versionId, documentId]
        );

        const current = versions[0];
        if (!current) {
          const error = new Error('Document version not found');
          error.statusCode = 404;
          throw error;
        }

        assertTransitionAllowed(current.status, toStatus);
        assertRoleAllowedForTransition(toStatus, req.authContext.roles);

        if (toStatus === 'Effective' && current.document_created_by === req.authContext.userId) {
          const error = new Error(
            'Segregation rule violation: the document creator cannot perform final approval'
          );
          error.statusCode = 403;
          throw error;
        }

        const validSignatureId = await validateSignatureIfRequired(client, req.authContext, {
          toStatus,
          signatureId,
          versionId
        });

        if (toStatus === 'Effective') {
          await client.query(
            `
              UPDATE dc_document_versions
              SET status = 'Retired', retired_at = now(), updated_at = now()
              WHERE document_id = $1
                AND id <> $2
                AND status = 'Effective'
            `,
            [documentId, versionId]
          );
        }

        const { rows: updatedVersionRows } = await client.query(
          `
            UPDATE dc_document_versions
            SET
              status = $2,
              effective_date = CASE WHEN $2 = 'Effective' THEN CURRENT_DATE ELSE effective_date END,
              retired_at = CASE WHEN $2 = 'Retired' THEN now() ELSE retired_at END,
              updated_at = now()
            WHERE id = $1
            RETURNING *
          `,
          [versionId, toStatus]
        );

        if (toStatus === 'Effective') {
          const nextReviewDate = buildNextReviewDate(current.review_interval_days);
          await client.query(
            `
              UPDATE dc_documents
              SET active_version_id = $2, next_review_due_date = $3, updated_at = now()
              WHERE id = $1
            `,
            [documentId, versionId, nextReviewDate]
          );

          await client.query(
            `
              UPDATE dc_document_periodic_reviews
              SET due_date = $2, updated_at = now()
              WHERE document_id = $1
            `,
            [documentId, nextReviewDate]
          );
        }

        if (toStatus === 'Retired' && current.active_version_id === versionId) {
          await client.query(
            `
              UPDATE dc_documents
              SET active_version_id = NULL, updated_at = now()
              WHERE id = $1
            `,
            [documentId]
          );
        }

        await client.query(
          `
            INSERT INTO dc_document_workflow_events (
              org_id,
              document_id,
              version_id,
              from_status,
              to_status,
              acted_by,
              signature_id,
              notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `,
          [
            req.authContext.orgId,
            documentId,
            versionId,
            current.status,
            toStatus,
            req.authContext.userId,
            validSignatureId,
            notes || null
          ]
        );

        await appendAuditEvent(client, {
          orgId: req.authContext.orgId,
          moduleKey: 'document_control',
          entityTable: 'dc_document_versions',
          entityId: versionId,
          actionKey: 'status_transition',
          actorUserId: req.authContext.userId,
          payloadJson: {
            fromStatus: current.status,
            toStatus,
            signatureId: validSignatureId || null
          }
        });

        return updatedVersionRows[0];
      });

      return res.json({ version: transitioned });
    } catch (error) {
      return next(error);
    }
  }
);

documentControlRouter.post(
  '/documents/:documentId/versions/:versionId/acknowledge',
  async (req, res, next) => {
    try {
      const { documentId, versionId } = req.params;

      const ack = await req.withRlsTransaction(async (client) => {
        const { rows } = await client.query(
          `
            INSERT INTO dc_document_acknowledgements (
              org_id,
              document_id,
              version_id,
              user_id
            ) VALUES ($1, $2, $3, $4)
            ON CONFLICT (version_id, user_id)
            DO UPDATE SET acknowledged_at = now()
            RETURNING *
          `,
          [req.authContext.orgId, documentId, versionId, req.authContext.userId]
        );

        await appendAuditEvent(client, {
          orgId: req.authContext.orgId,
          moduleKey: 'document_control',
          entityTable: 'dc_document_acknowledgements',
          entityId: rows[0].id,
          actionKey: 'acknowledge',
          actorUserId: req.authContext.userId,
          payloadJson: { documentId, versionId }
        });

        return rows[0];
      });

      return res.status(201).json({ acknowledgement: ack });
    } catch (error) {
      return next(error);
    }
  }
);

documentControlRouter.get('/documents', async (req, res, next) => {
  try {
    const filters = {
      title: req.query.title,
      documentType: req.query.documentType,
      department: req.query.department,
      ownerUserId: req.query.ownerUserId,
      status: req.query.status,
      versionNo: req.query.versionNo,
      limit: req.query.limit
    };

    const rows = await req.withRlsTransaction(async (client) =>
      searchDocuments(client, req.authContext.orgId, filters)
    );

    return res.json({ documents: rows });
  } catch (error) {
    return next(error);
  }
});

documentControlRouter.get('/documents/:documentId', async (req, res, next) => {
  try {
    const { documentId } = req.params;

    const data = await req.withRlsTransaction(async (client) => {
      const { rows: docs } = await client.query(
        `
          SELECT
            d.*,
            v.version_no AS active_version_no,
            v.status AS active_status,
            v.effective_date AS active_effective_date
          FROM dc_documents d
          LEFT JOIN dc_document_versions v ON v.id = d.active_version_id
          WHERE d.id = $1
        `,
        [documentId]
      );

      if (!docs[0]) {
        const error = new Error('Document not found');
        error.statusCode = 404;
        throw error;
      }

      const { rows: policies } = await client.query(
        `
          SELECT role_key, can_view, can_download, can_print
          FROM dc_document_access_policies
          WHERE document_id = $1
          ORDER BY role_key ASC
        `,
        [documentId]
      );

      return { document: docs[0], policies };
    });

    return res.json(data);
  } catch (error) {
    return next(error);
  }
});

documentControlRouter.get(
  '/documents/:documentId/versions/:versionId/controlled-preview',
  async (req, res, next) => {
    try {
      const { documentId, versionId } = req.params;

      const response = await req.withRlsTransaction(async (client) => {
        const { rows: docs } = await client.query(
          `
            SELECT
              d.id,
              d.controlled_preview_enabled,
              d.download_allowed,
              d.print_allowed,
              p.viewer_default_can_download,
              p.viewer_download_requires_watermark
            FROM dc_documents d
            LEFT JOIN sa_org_upload_policies p ON p.org_id = d.org_id
            WHERE d.id = $1
          `,
          [documentId]
        );

        if (!docs[0]) {
          const error = new Error('Document not found');
          error.statusCode = 404;
          throw error;
        }

        const { rows: versions } = await client.query(
          `
            SELECT id, status, version_no
            FROM dc_document_versions
            WHERE id = $1 AND document_id = $2
          `,
          [versionId, documentId]
        );

        if (!versions[0]) {
          const error = new Error('Version not found');
          error.statusCode = 404;
          throw error;
        }

        const { rows: ackRows } = await client.query(
          `
            SELECT id
            FROM dc_document_acknowledgements
            WHERE version_id = $1 AND user_id = $2
            LIMIT 1
          `,
          [versionId, req.authContext.userId]
        );

        const userRoles = Array.isArray(req.authContext.roles) ? req.authContext.roles : [];
        const hasViewerRole = userRoles.includes('viewer');
        const hasElevatedRole = userRoles.some((role) =>
          ['admin', 'author', 'qa_reviewer', 'approver', 'superadmin'].includes(role)
        );

        const viewerOnlyContext = hasViewerRole && !hasElevatedRole;
        const policy = getControlledPreviewPolicy(docs[0], {
          alreadyAcknowledged: Boolean(ackRows[0]),
          downloadAllowed: viewerOnlyContext
            ? Boolean(docs[0].viewer_default_can_download)
            : Boolean(docs[0].download_allowed),
          requiresConfidentialWatermark: viewerOnlyContext
            ? Boolean(docs[0].viewer_download_requires_watermark)
            : false
        });

        return {
          documentId,
          versionId,
          versionNo: versions[0].version_no,
          status: versions[0].status,
          policy
        };
      });

      return res.json(response);
    } catch (error) {
      return next(error);
    }
  }
);
