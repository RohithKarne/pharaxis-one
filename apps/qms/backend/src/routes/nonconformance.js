import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { assertAnyRole } from '../middleware/rbac.js';
import { appendAuditEvent } from '../services/auditTrailService.js';
import { appendTraceLink } from '../services/traceabilityService.js';
import { makeEntityCode, asDateString } from '../utils/codegen.js';

export const nonconformanceRouter = Router();

const validSources = new Set(['Manufacturing', 'Supplier', 'Audit', 'IncomingInspection', 'Warehouse', 'Laboratory']);
const validSeverity = new Set(['Low', 'Medium', 'High', 'Critical']);
const validStatus = new Set(['Open', 'Containment', 'Dispositioned', 'CapaLinked', 'Closed']);
const validDisposition = new Set(['UseAsIs', 'Rework', 'Reject', 'ReturnToSupplier', 'Scrap']);

nonconformanceRouter.post('/', async (req, res, next) => {
  try {
    assertAnyRole(req, ['author', 'qa_reviewer', 'admin', 'superadmin']);

    const {
      sourceType,
      summary,
      details = null,
      itemReference = null,
      severity = 'Medium',
      dueDate = null,
      assignedTo = null
    } = req.body || {};

    if (!sourceType || !summary) {
      return res.status(400).json({ error: 'sourceType and summary are required' });
    }
    if (!validSources.has(sourceType)) {
      return res.status(400).json({ error: 'Invalid sourceType' });
    }
    if (!validSeverity.has(severity)) {
      return res.status(400).json({ error: 'Invalid severity' });
    }

    const nonconformance = await req.withRlsTransaction(async (client) => {
      const nonconformanceId = randomUUID();
      await client.query(
        `
          INSERT INTO qn_nonconformance_records (
            org_id,
            nc_code,
            source_type,
            item_reference,
            severity,
            summary,
            details,
            due_date,
            assigned_to,
            created_by,
            id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `,
        [
          req.authContext.orgId,
          makeEntityCode('NC', summary),
          sourceType,
          itemReference,
          severity,
          summary,
          details,
          asDateString(dueDate),
          assignedTo,
          req.authContext.userId,
          nonconformanceId
        ]
      );

      const { rows } = await client.query(
        `SELECT * FROM qn_nonconformance_records WHERE id = $1 AND org_id = $2 LIMIT 1`,
        [nonconformanceId, req.authContext.orgId]
      );

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'nonconformance',
        entityTable: 'qn_nonconformance_records',
        entityId: rows[0].id,
        actionKey: 'create',
        actorUserId: req.authContext.userId,
        payloadJson: { sourceType, severity }
      });

      return rows[0];
    });

    return res.status(201).json({ nonconformance });
  } catch (error) {
    return next(error);
  }
});

nonconformanceRouter.patch('/:recordId', async (req, res, next) => {
  try {
    assertAnyRole(req, ['qa_reviewer', 'admin', 'superadmin']);

    const { recordId } = req.params;
    const {
      summary = null,
      details = null,
      severity = null,
      status = null,
      dueDate = null,
      assignedTo = null,
      disposition = null
    } = req.body || {};

    if (severity && !validSeverity.has(severity)) {
      return res.status(400).json({ error: 'Invalid severity' });
    }
    if (status && !validStatus.has(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    if (disposition && !validDisposition.has(disposition)) {
      return res.status(400).json({ error: 'Invalid disposition' });
    }

    const nonconformance = await req.withRlsTransaction(async (client) => {
      await client.query(
        `
          UPDATE qn_nonconformance_records
          SET
            summary = COALESCE($2, summary),
            details = COALESCE($3, details),
            severity = COALESCE($4, severity),
            status = COALESCE($5, status),
            due_date = COALESCE($6, due_date),
            assigned_to = COALESCE($7, assigned_to),
            disposition = COALESCE($8, disposition),
            closed_at = CASE
              WHEN COALESCE($5, status) = 'Closed' AND closed_at IS NULL THEN CURRENT_TIMESTAMP(3)
              WHEN COALESCE($5, status) <> 'Closed' THEN NULL
              ELSE closed_at
            END,
            closed_by = CASE
              WHEN COALESCE($5, status) = 'Closed' THEN $9
              WHEN COALESCE($5, status) <> 'Closed' THEN NULL
              ELSE closed_by
            END,
            updated_at = CURRENT_TIMESTAMP(3)
          WHERE id = $1
            AND org_id = $10
        `,
        [recordId, summary, details, severity, status, asDateString(dueDate), assignedTo, disposition, req.authContext.userId, req.authContext.orgId]
      );

      const { rows } = await client.query(
        `SELECT * FROM qn_nonconformance_records WHERE id = $1 AND org_id = $2 LIMIT 1`,
        [recordId, req.authContext.orgId]
      );

      if (!rows[0]) {
        const error = new Error('Nonconformance record not found');
        error.statusCode = 404;
        throw error;
      }

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'nonconformance',
        entityTable: 'qn_nonconformance_records',
        entityId: recordId,
        actionKey: 'update',
        actorUserId: req.authContext.userId,
        payloadJson: { severity, status, disposition, dueDate: asDateString(dueDate) }
      });

      return rows[0];
    });

    return res.json({ nonconformance });
  } catch (error) {
    return next(error);
  }
});

nonconformanceRouter.post('/:recordId/link-capa', async (req, res, next) => {
  try {
    assertAnyRole(req, ['qa_reviewer', 'admin', 'superadmin']);

    const { recordId } = req.params;
    const { capaId } = req.body || {};
    if (!capaId) {
      return res.status(400).json({ error: 'capaId is required' });
    }

    const link = await req.withRlsTransaction(async (client) => {
      const { rows: ncRows } = await client.query(
        `SELECT id FROM qn_nonconformance_records WHERE id = $1 AND org_id = $2 LIMIT 1`,
        [recordId, req.authContext.orgId]
      );
      if (!ncRows[0]) {
        const error = new Error('Nonconformance record not found');
        error.statusCode = 404;
        throw error;
      }

      const { rows: capaRows } = await client.query(
        `SELECT id FROM ca_capa_records WHERE id = $1 AND org_id = $2 LIMIT 1`,
        [capaId, req.authContext.orgId]
      );
      if (!capaRows[0]) {
        const error = new Error('CAPA not found');
        error.statusCode = 404;
        throw error;
      }

      await client.query(
        `
          INSERT INTO qn_nonconformance_capa_links (org_id, nonconformance_id, capa_id, linked_by)
          VALUES ($1, $2, $3, $4) AS new
          ON DUPLICATE KEY UPDATE linked_at = CURRENT_TIMESTAMP(3), linked_by = new.linked_by
        `,
        [req.authContext.orgId, recordId, capaId, req.authContext.userId]
      );

      // The upsert may have updated an existing link, so the row is read back by
      // its natural key (nonconformance_id, capa_id) rather than an app-generated id.
      const { rows } = await client.query(
        `
          SELECT * FROM qn_nonconformance_capa_links
          WHERE nonconformance_id = $1 AND capa_id = $2 AND org_id = $3
          LIMIT 1
        `,
        [recordId, capaId, req.authContext.orgId]
      );

      await client.query(
        `UPDATE qn_nonconformance_records SET status = 'CapaLinked', updated_at = CURRENT_TIMESTAMP(3) WHERE id = $1 AND org_id = $2`,
        [recordId, req.authContext.orgId]
      );

      await appendTraceLink(client, {
        orgId: req.authContext.orgId,
        sourceModule: 'nonconformance',
        sourceTable: 'qn_nonconformance_records',
        sourceId: recordId,
        targetModule: 'capa',
        targetTable: 'ca_capa_records',
        targetId: capaId,
        linkType: 'CorrectiveAction',
        createdBy: req.authContext.userId
      });

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'nonconformance',
        entityTable: 'qn_nonconformance_records',
        entityId: recordId,
        actionKey: 'link_capa',
        actorUserId: req.authContext.userId,
        payloadJson: { capaId }
      });

      return rows[0];
    });

    return res.status(201).json({ link });
  } catch (error) {
    return next(error);
  }
});

nonconformanceRouter.get('/:recordId', async (req, res, next) => {
  try {
    const { recordId } = req.params;

    const payload = await req.withRlsTransaction(async (client) => {
      const { rows: recordRows } = await client.query(
        `SELECT * FROM qn_nonconformance_records WHERE id = $1 AND org_id = $2 LIMIT 1`,
        [recordId, req.authContext.orgId]
      );
      if (!recordRows[0]) {
        const error = new Error('Nonconformance record not found');
        error.statusCode = 404;
        throw error;
      }

      const { rows: links } = await client.query(
        `
          SELECT l.*, c.capa_code, c.title AS capa_title
          FROM qn_nonconformance_capa_links l
          JOIN ca_capa_records c ON c.id = l.capa_id
          WHERE l.nonconformance_id = $1
            AND l.org_id = $2
          ORDER BY l.linked_at DESC
        `,
        [recordId, req.authContext.orgId]
      );

      return {
        nonconformance: recordRows[0],
        capaLinks: links
      };
    });

    return res.json(payload);
  } catch (error) {
    return next(error);
  }
});

nonconformanceRouter.get('/', async (req, res, next) => {
  try {
    const { status, severity, limit = 200 } = req.query;
    const filters = [];
    // $1 is always the org scope — it is written into the SQL below, not appended
    // here, so the filter cannot be lost if this clause list is ever refactored.
    const values = [req.authContext.orgId];

    if (status) {
      values.push(status);
      filters.push(`status = $${values.length}`);
    }
    if (severity) {
      values.push(severity);
      filters.push(`severity = $${values.length}`);
    }

    values.push(Math.min(Number(limit) || 200, 500));

    const whereClause = filters.length ? `AND ${filters.join(' AND ')}` : '';

    const nonconformances = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          SELECT *
          FROM qn_nonconformance_records
          WHERE org_id = $1
          ${whereClause}
          ORDER BY updated_at DESC
          LIMIT $${values.length}
        `,
        values
      );
      return rows;
    });

    return res.json({ nonconformances });
  } catch (error) {
    return next(error);
  }
});
