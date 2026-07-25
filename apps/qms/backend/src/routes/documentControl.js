import { Router } from 'express';
import { assertAnyRole } from '../middleware/rbac.js';
import { appendAuditEvent } from '../services/auditTrailService.js';
import {
  assertRoleAllowedForTransition,
  assertTransitionAllowed,
  signatureMeaningForTransition
} from '../services/documentWorkflowService.js';
import { getControlledPreviewPolicy } from '../services/documentAccessService.js';
import { searchDocuments } from '../services/documentSearchService.js';

const validTypes = new Set(['SOP', 'Work Instruction', 'Policy', 'Form', 'Protocol']);
const validCriticality = new Set(['Low', 'Medium', 'High', 'Critical']);

function makeDocumentCode(title) {
  const seed = String(title || 'doc')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 24);
  const suffix = Date.now().toString().slice(-6);
  return `DOC-${seed || 'QMS'}-${suffix}`;
}

function buildNextReviewDate(reviewIntervalDays, anchorDate = null) {
  const days = Number(reviewIntervalDays || 365);
  const dt = anchorDate ? new Date(anchorDate) : new Date();
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
    [params.signatureId, reqContext.orgId, reqContext.userId, params.versionId, requiredMeaning]
  );

  if (!rows[0]) {
    const error = new Error('Required e-signature was not found for this transition');
    error.statusCode = 400;
    throw error;
  }

  return rows[0].id;
}

async function appendDocHistoryEvent(client, {
  orgId,
  documentId,
  versionId,
  fromStatus,
  toStatus,
  actedBy,
  signatureId,
  notes
}) {
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
    [orgId, documentId, versionId, fromStatus || null, toStatus, actedBy, signatureId || null, notes || null]
  );
}

export const documentControlRouter = Router();

documentControlRouter.get('/documents/periodic-reviews/alerts', async (req, res, next) => {
  try {
    const alerts = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          SELECT
            d.id AS document_id,
            d.document_code,
            d.title,
            d.document_type,
            d.next_review_due_date,
            d.owner_user_id,
            u.full_name AS owner_name,
            u.email::text AS owner_email,
            (d.next_review_due_date::date - CURRENT_DATE) AS days_until_due
          FROM dc_documents d
          LEFT JOIN qms_users u ON u.id = d.owner_user_id
          WHERE d.next_review_due_date <= (CURRENT_DATE + INTERVAL '90 days')
          ORDER BY d.next_review_due_date ASC
        `
      );
      return rows;
    });

    return res.json({ alerts });
  } catch (error) {
    return next(error);
  }
});


documentControlRouter.post('/documents', async (req, res, next) => {
  try {
    const {
      documentCode,
      title,
      documentType,
      documentSubtype = null,
      department,
      ownerUserId,
      reviewIntervalDays,
      contentSummary,
      reasonForChange = null,
      siteCode = null,
      criticality = 'Medium',
      trainingRequired = false,
      controlledCopyRequired = true,
      changeControlRefId = null,
      metadataJson = null,
      effectiveTo = null
    } = req.body || {};

    if (!title || !documentType || !department || !ownerUserId) {
      return res.status(400).json({
        error: 'title, documentType, department, and ownerUserId are required'
      });
    }

    if (!validTypes.has(documentType)) {
      return res.status(400).json({ error: 'Invalid documentType' });
    }

    if (!validCriticality.has(criticality)) {
      return res.status(400).json({ error: 'criticality must be Low, Medium, High, or Critical' });
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
            document_subtype,
            department,
            owner_user_id,
            review_interval_days,
            next_review_due_date,
            site_code,
            criticality,
            training_required,
            controlled_copy_required,
            change_control_ref_id,
            metadata_json,
            effective_to,
            created_by
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12, $13, $14, $15, $16, $17
          )
          RETURNING *
        `,
        [
          req.authContext.orgId,
          code,
          title,
          documentType,
          documentSubtype,
          department,
          ownerUserId,
          intervalDays,
          nextReviewDueDate,
          siteCode,
          criticality,
          Boolean(trainingRequired),
          Boolean(controlledCopyRequired),
          changeControlRefId,
          metadataJson || {},
          effectiveTo,
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
            reason_for_change,
            created_by
          ) VALUES ($1, $2, 1, 'Draft', $3, $4, $5)
          RETURNING *
        `,
        [req.authContext.orgId, document.id, contentSummary || null, reasonForChange, req.authContext.userId]
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

      const { rows: reviewRows } = await client.query(
        `
          INSERT INTO dc_document_periodic_reviews (
            org_id,
            document_id,
            due_date,
            status
          ) VALUES ($1, $2, $3, 'Pending')
          RETURNING *
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
            ($1, $2, 'admin', true, true, true),
            ($1, $2, 'qa_reviewer', true, false, false),
            ($1, $2, 'author', true, false, false),
            ($1, $2, 'approver', true, false, false),
            ($1, $2, 'viewer', true, $3, false)
          ON CONFLICT (document_id, role_key) DO NOTHING
        `,
        [req.authContext.orgId, document.id, viewerDefaultCanDownload]
      );

      await client.query(
        `
          INSERT INTO dc_document_distribution_targets (
            org_id,
            document_id,
            target_type,
            target_value,
            acknowledgement_required,
            created_by
          ) VALUES
            ($1, $2, 'User', $3, true, $4),
            ($1, $2, 'Role', 'qa_reviewer', true, $4),
            ($1, $2, 'Role', 'approver', true, $4)
          ON CONFLICT (document_id, target_type, target_value) DO NOTHING
        `,
        [req.authContext.orgId, document.id, ownerUserId, req.authContext.userId]
      );

      await appendDocHistoryEvent(client, {
        orgId: req.authContext.orgId,
        documentId: document.id,
        versionId: version.id,
        fromStatus: null,
        toStatus: 'Draft',
        actedBy: req.authContext.userId,
        notes: 'Document created'
      });

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
          versionNo: 1,
          criticality,
          nextReviewDueDate,
          reviewId: reviewRows[0].id
        }
      });

      return { document, version, periodicReview: reviewRows[0] };
    });

    return res.status(201).json(created);
  } catch (error) {
    return next(error);
  }
});

documentControlRouter.post('/documents/:documentId/revisions', async (req, res, next) => {
  try {
    const { documentId } = req.params;
    const {
      contentSummary,
      reasonForChange = null,
      supersedesVersionId = null
    } = req.body || {};

    const revision = await req.withRlsTransaction(async (client) => {
      const { rows: docs } = await client.query(
        `SELECT id, document_code, active_version_id FROM dc_documents WHERE id = $1 FOR UPDATE`,
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

      const nextSuperseded = supersedesVersionId || docs[0].active_version_id || null;

      const { rows: versions } = await client.query(
        `
          INSERT INTO dc_document_versions (
            org_id,
            document_id,
            version_no,
            status,
            content_summary,
            reason_for_change,
            supersedes_version_id,
            created_by
          ) VALUES ($1, $2, $3, 'Draft', $4, $5, $6, $7)
          RETURNING *
        `,
        [
          req.authContext.orgId,
          documentId,
          nextVersion,
          contentSummary || null,
          reasonForChange,
          nextSuperseded,
          req.authContext.userId
        ]
      );

      await appendDocHistoryEvent(client, {
        orgId: req.authContext.orgId,
        documentId,
        versionId: versions[0].id,
        fromStatus: null,
        toStatus: 'Draft',
        actedBy: req.authContext.userId,
        notes: 'New revision created'
      });

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'document_control',
        entityTable: 'dc_document_versions',
        entityId: versions[0].id,
        actionKey: 'revision_create',
        actorUserId: req.authContext.userId,
        payloadJson: {
          documentId,
          versionNo: nextVersion,
          supersedesVersionId: nextSuperseded,
          reasonForChange
        }
      });

      return versions[0];
    });

    return res.status(201).json({ version: revision });
  } catch (error) {
    return next(error);
  }
});

documentControlRouter.post('/documents/:documentId/versions/:versionId/transition', async (req, res, next) => {
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
          FOR UPDATE
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
            SET status = 'Retired', retired_at = now(), retired_by = $3, updated_at = now()
            WHERE document_id = $1
              AND id <> $2
              AND status = 'Effective'
          `,
          [documentId, versionId, req.authContext.userId]
        );
      }

      const { rows: updatedVersionRows } = await client.query(
        `
          UPDATE dc_document_versions
          SET
            status = $2,
            approved_by = CASE WHEN $2 = 'Approved' THEN $3 ELSE approved_by END,
            approved_at = CASE WHEN $2 = 'Approved' THEN now() ELSE approved_at END,
            effective_by = CASE WHEN $2 = 'Effective' THEN $3 ELSE effective_by END,
            effective_date = CASE WHEN $2 = 'Effective' THEN CURRENT_DATE ELSE effective_date END,
            retired_by = CASE WHEN $2 = 'Retired' THEN $3 ELSE retired_by END,
            retired_at = CASE WHEN $2 = 'Retired' THEN now() ELSE retired_at END,
            updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [versionId, toStatus, req.authContext.userId]
      );

      if (toStatus === 'Effective') {
        const nextReviewDate = buildNextReviewDate(current.review_interval_days);
        await client.query(
          `
            UPDATE dc_documents
            SET
              active_version_id = $2,
              effective_from = CURRENT_DATE,
              next_review_due_date = $3,
              updated_at = now()
            WHERE id = $1
          `,
          [documentId, versionId, nextReviewDate]
        );

        await client.query(
          `
            UPDATE dc_document_periodic_reviews
            SET due_date = $2, status = 'Pending', updated_at = now()
            WHERE document_id = $1
              AND status IN ('Pending', 'Overdue')
          `,
          [documentId, nextReviewDate]
        );
      }

      if (toStatus === 'Retired' && current.active_version_id === versionId) {
        await client.query(
          `
            UPDATE dc_documents
            SET active_version_id = NULL, effective_to = CURRENT_DATE, updated_at = now()
            WHERE id = $1
          `,
          [documentId]
        );
      }

      await appendDocHistoryEvent(client, {
        orgId: req.authContext.orgId,
        documentId,
        versionId,
        fromStatus: current.status,
        toStatus,
        actedBy: req.authContext.userId,
        signatureId: validSignatureId,
        notes
      });

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
});

documentControlRouter.post('/documents/:documentId/versions/:versionId/acknowledge', async (req, res, next) => {
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
});

documentControlRouter.post('/documents/:documentId/versions/:versionId/export', async (req, res, next) => {
  try {
    const { documentId, versionId } = req.params;
    const { exportFormat = 'PDF', binderJobReference = null } = req.body || {};

    const payload = await req.withRlsTransaction(async (client) => {
      const { rows: docs } = await client.query(
        `
          SELECT
            d.id,
            d.document_code,
            d.title,
            d.download_allowed,
            p.viewer_download_requires_watermark
          FROM dc_documents d
          LEFT JOIN sa_org_upload_policies p ON p.org_id = d.org_id
          WHERE d.id = $1
          LIMIT 1
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
          SELECT id, version_no, status
          FROM dc_document_versions
          WHERE id = $1 AND document_id = $2
          LIMIT 1
        `,
        [versionId, documentId]
      );

      if (!versions[0]) {
        const error = new Error('Version not found');
        error.statusCode = 404;
        throw error;
      }

      const { rows: exportRows } = await client.query(
        `
          INSERT INTO dc_document_exports (
            org_id,
            document_id,
            version_id,
            binder_job_reference,
            exported_by,
            export_format
          ) VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `,
        [
          req.authContext.orgId,
          documentId,
          versionId,
          binderJobReference,
          req.authContext.userId,
          String(exportFormat || 'PDF').toUpperCase()
        ]
      );

      const watermarkLabel = docs[0].viewer_download_requires_watermark
        ? 'CONFIDENTIAL - CONTROLLED COPY'
        : 'CONTROLLED COPY';

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'document_control',
        entityTable: 'dc_document_exports',
        entityId: exportRows[0].id,
        actionKey: 'export',
        actorUserId: req.authContext.userId,
        payloadJson: {
          documentId,
          versionId,
          exportFormat: String(exportFormat || 'PDF').toUpperCase()
        }
      });

      return {
        exportRecord: exportRows[0],
        document: {
          id: docs[0].id,
          code: docs[0].document_code,
          title: docs[0].title,
          versionNo: versions[0].version_no,
          status: versions[0].status,
          watermarkLabel
        }
      };
    });

    return res.status(201).json(payload);
  } catch (error) {
    return next(error);
  }
});

documentControlRouter.put('/documents/:documentId/access-policies', async (req, res, next) => {
  try {
    const { documentId } = req.params;
    const { policies } = req.body || {};

    if (!Array.isArray(policies) || policies.length === 0) {
      return res.status(400).json({ error: 'policies array is required' });
    }

    assertAnyRole(req, ['admin', 'superadmin', 'qa_reviewer']);

    const updated = await req.withRlsTransaction(async (client) => {
      const { rows: docs } = await client.query('SELECT id FROM dc_documents WHERE id = $1 LIMIT 1', [
        documentId
      ]);
      if (!docs[0]) {
        const error = new Error('Document not found');
        error.statusCode = 404;
        throw error;
      }

      await client.query('DELETE FROM dc_document_access_policies WHERE document_id = $1', [documentId]);

      const saved = [];
      for (const policy of policies) {
        const roleKey = String(policy.roleKey || '').trim();
        if (!roleKey) continue;

        const { rows } = await client.query(
          `
            INSERT INTO dc_document_access_policies (
              org_id,
              document_id,
              role_key,
              can_view,
              can_download,
              can_print
            ) VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
          `,
          [
            req.authContext.orgId,
            documentId,
            roleKey,
            policy.canView !== false,
            Boolean(policy.canDownload),
            Boolean(policy.canPrint)
          ]
        );
        saved.push(rows[0]);
      }

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'document_control',
        entityTable: 'dc_document_access_policies',
        entityId: documentId,
        actionKey: 'bulk_upsert',
        actorUserId: req.authContext.userId,
        payloadJson: {
          count: saved.length
        }
      });

      return saved;
    });

    return res.json({ policies: updated });
  } catch (error) {
    return next(error);
  }
});

documentControlRouter.get('/documents/:documentId/versions', async (req, res, next) => {
  try {
    const { documentId } = req.params;

    const versions = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          SELECT *
          FROM dc_document_versions
          WHERE document_id = $1
          ORDER BY version_no DESC
        `,
        [documentId]
      );
      return rows;
    });

    return res.json({ versions });
  } catch (error) {
    return next(error);
  }
});

documentControlRouter.get('/documents/:documentId/timeline', async (req, res, next) => {
  try {
    const { documentId } = req.params;

    const timeline = await req.withRlsTransaction(async (client) => {
      const workflowPromise = client.query(
        `
          SELECT
            e.id,
            'workflow'::text AS event_type,
            e.from_status,
            e.to_status,
            e.notes,
            e.acted_at AS event_at,
            u.full_name AS actor_name,
            u.email::text AS actor_email
          FROM dc_document_workflow_events e
          LEFT JOIN qms_users u ON u.id = e.acted_by
          WHERE e.document_id = $1
        `,
        [documentId]
      );

      const reviewPromise = client.query(
        `
          SELECT
            h.id,
            'review'::text AS event_type,
            NULL::text AS from_status,
            h.result::text AS to_status,
            h.notes,
            h.completed_at AS event_at,
            u.full_name AS actor_name,
            u.email::text AS actor_email
          FROM dc_document_review_history h
          LEFT JOIN qms_users u ON u.id = h.completed_by
          WHERE h.document_id = $1
        `,
        [documentId]
      );

      const exportPromise = client.query(
        `
          SELECT
            x.id,
            'export'::text AS event_type,
            NULL::text AS from_status,
            x.export_format::text AS to_status,
            x.binder_job_reference::text AS notes,
            x.exported_at AS event_at,
            u.full_name AS actor_name,
            u.email::text AS actor_email
          FROM dc_document_exports x
          LEFT JOIN qms_users u ON u.id = x.exported_by
          WHERE x.document_id = $1
        `,
        [documentId]
      );

      const [workflow, reviews, exports] = await Promise.all([
        workflowPromise,
        reviewPromise,
        exportPromise
      ]);

      const combined = [...workflow.rows, ...reviews.rows, ...exports.rows].sort(
        (a, b) => new Date(b.event_at).getTime() - new Date(a.event_at).getTime()
      );

      return combined;
    });

    return res.json({ timeline });
  } catch (error) {
    return next(error);
  }
});

documentControlRouter.get('/documents/:documentId/reviews', async (req, res, next) => {
  try {
    const { documentId } = req.params;

    const reviews = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          SELECT *
          FROM dc_document_periodic_reviews
          WHERE document_id = $1
          ORDER BY due_date ASC
        `,
        [documentId]
      );
      return rows;
    });

    return res.json({ reviews });
  } catch (error) {
    return next(error);
  }
});

documentControlRouter.post('/documents/:documentId/reviews/:reviewId/complete', async (req, res, next) => {
  try {
    const { documentId, reviewId } = req.params;
    const { notes = null, result = 'Completed' } = req.body || {};

    assertAnyRole(req, ['qa_reviewer', 'admin', 'superadmin']);

    const payload = await req.withRlsTransaction(async (client) => {
      const { rows: docRows } = await client.query(
        `
          SELECT id, review_interval_days
          FROM dc_documents
          WHERE id = $1
          LIMIT 1
        `,
        [documentId]
      );
      const document = docRows[0];
      if (!document) {
        const error = new Error('Document not found');
        error.statusCode = 404;
        throw error;
      }

      const { rows: reviewRows } = await client.query(
        `
          SELECT *
          FROM dc_document_periodic_reviews
          WHERE id = $1 AND document_id = $2
          FOR UPDATE
        `,
        [reviewId, documentId]
      );
      const currentReview = reviewRows[0];
      if (!currentReview) {
        const error = new Error('Periodic review not found');
        error.statusCode = 404;
        throw error;
      }

      const { rows: completedRows } = await client.query(
        `
          UPDATE dc_document_periodic_reviews
          SET
            status = 'Completed',
            completed_at = now(),
            completed_by = $3,
            completion_notes = $4,
            updated_at = now()
          WHERE id = $1
            AND document_id = $2
          RETURNING *
        `,
        [reviewId, documentId, req.authContext.userId, notes]
      );

      await client.query(
        `
          INSERT INTO dc_document_review_history (
            org_id,
            document_id,
            periodic_review_id,
            due_date,
            completed_by,
            result,
            notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          req.authContext.orgId,
          documentId,
          reviewId,
          currentReview.due_date,
          req.authContext.userId,
          result,
          notes
        ]
      );

      const nextReviewDueDate = buildNextReviewDate(document.review_interval_days);
      const { rows: nextRows } = await client.query(
        `
          INSERT INTO dc_document_periodic_reviews (
            org_id,
            document_id,
            due_date,
            status
          ) VALUES ($1, $2, $3, 'Pending')
          RETURNING *
        `,
        [req.authContext.orgId, documentId, nextReviewDueDate]
      );

      await client.query(
        `
          UPDATE dc_documents
          SET next_review_due_date = $2, updated_at = now()
          WHERE id = $1
        `,
        [documentId, nextReviewDueDate]
      );

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'document_control',
        entityTable: 'dc_document_periodic_reviews',
        entityId: reviewId,
        actionKey: 'complete',
        actorUserId: req.authContext.userId,
        payloadJson: {
          notes,
          nextReviewDueDate
        }
      });

      return {
        completedReview: completedRows[0],
        nextReview: nextRows[0]
      };
    });

    return res.json(payload);
  } catch (error) {
    return next(error);
  }
});

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

documentControlRouter.get('/documents/:documentId/versions/:versionId/controlled-preview', async (req, res, next) => {
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
            d.controlled_copy_required,
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
          : Boolean(docs[0].controlled_copy_required)
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
});

documentControlRouter.get('/documents/:documentId', async (req, res, next) => {
  try {
    const { documentId } = req.params;

    const data = await req.withRlsTransaction(async (client) => {
      const { rows: docs } = await client.query(
        `
          SELECT
            d.*,
            v.id AS active_version_id,
            v.version_no AS active_version_no,
            v.status AS active_status,
            v.effective_date AS active_effective_date
          FROM dc_documents d
          LEFT JOIN dc_document_versions v ON v.id = d.active_version_id
          WHERE d.id = $1
          LIMIT 1
        `,
        [documentId]
      );

      if (!docs[0]) {
        const error = new Error('Document not found');
        error.statusCode = 404;
        throw error;
      }

      const [policiesResult, versionsResult, reviewsResult, distributionResult] = await Promise.all([
        client.query(
          `
            SELECT role_key, can_view, can_download, can_print
            FROM dc_document_access_policies
            WHERE document_id = $1
            ORDER BY role_key ASC
          `,
          [documentId]
        ),
        client.query(
          `
            SELECT *
            FROM dc_document_versions
            WHERE document_id = $1
            ORDER BY version_no DESC
          `,
          [documentId]
        ),
        client.query(
          `
            SELECT *
            FROM dc_document_periodic_reviews
            WHERE document_id = $1
            ORDER BY due_date ASC
          `,
          [documentId]
        ),
        client.query(
          `
            SELECT target_type, target_value, acknowledgement_required
            FROM dc_document_distribution_targets
            WHERE document_id = $1
            ORDER BY target_type ASC, target_value ASC
          `,
          [documentId]
        )
      ]);

      return {
        document: docs[0],
        policies: policiesResult.rows,
        versions: versionsResult.rows,
        reviews: reviewsResult.rows,
        distributionTargets: distributionResult.rows
      };
    });

    return res.json(data);
  } catch (error) {
    return next(error);
  }
});
