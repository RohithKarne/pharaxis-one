import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { assertAnyRole } from '../middleware/rbac.js';
import { appendAuditEvent } from '../services/auditTrailService.js';
import { appendTraceLink } from '../services/traceabilityService.js';
import { makeEntityCode, asDateString } from '../utils/codegen.js';

export const complaintsRouter = Router();

const validSources = new Set(['Customer', 'Regulatory', 'Internal', 'Partner']);
const validSeverity = new Set(['Low', 'Medium', 'High', 'Critical']);
const validStatus = new Set(['Open', 'Investigation', 'CapaLinked', 'Closed', 'Escalated']);

complaintsRouter.post('/', async (req, res, next) => {
  try {
    assertAnyRole(req, ['author', 'qa_reviewer', 'admin', 'superadmin']);

    const {
      sourceChannel,
      summary,
      details = null,
      customerName = null,
      productName = null,
      batchLotNo = null,
      severity = 'Medium',
      dueDate = null,
      assignedTo = null
    } = req.body || {};

    if (!sourceChannel || !summary) {
      return res.status(400).json({ error: 'sourceChannel and summary are required' });
    }
    if (!validSources.has(sourceChannel)) {
      return res.status(400).json({ error: 'Invalid sourceChannel' });
    }
    if (!validSeverity.has(severity)) {
      return res.status(400).json({ error: 'Invalid severity' });
    }

    const complaint = await req.withRlsTransaction(async (client) => {
      const complaintId = randomUUID();
      await client.query(
        `
          INSERT INTO qc_complaints (
            org_id,
            complaint_code,
            source_channel,
            customer_name,
            product_name,
            batch_lot_no,
            severity,
            summary,
            details,
            due_date,
            assigned_to,
            created_by,
            id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `,
        [
          req.authContext.orgId,
          makeEntityCode('CMP', summary),
          sourceChannel,
          customerName,
          productName,
          batchLotNo,
          severity,
          summary,
          details,
          asDateString(dueDate),
          assignedTo,
          req.authContext.userId,
          complaintId
        ]
      );

      const { rows } = await client.query(
        `SELECT * FROM qc_complaints WHERE id = $1 AND org_id = $2 LIMIT 1`,
        [complaintId, req.authContext.orgId]
      );

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'complaint',
        entityTable: 'qc_complaints',
        entityId: rows[0].id,
        actionKey: 'create',
        actorUserId: req.authContext.userId,
        payloadJson: { sourceChannel, severity }
      });

      return rows[0];
    });

    return res.status(201).json({ complaint });
  } catch (error) {
    return next(error);
  }
});

complaintsRouter.patch('/:complaintId', async (req, res, next) => {
  try {
    assertAnyRole(req, ['qa_reviewer', 'admin', 'superadmin']);

    const { complaintId } = req.params;
    const {
      summary = null,
      details = null,
      severity = null,
      status = null,
      dueDate = null,
      assignedTo = null
    } = req.body || {};

    if (severity && !validSeverity.has(severity)) {
      return res.status(400).json({ error: 'Invalid severity' });
    }
    if (status && !validStatus.has(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const complaint = await req.withRlsTransaction(async (client) => {
      await client.query(
        `
          UPDATE qc_complaints
          SET
            summary = COALESCE($2, summary),
            details = COALESCE($3, details),
            severity = COALESCE($4, severity),
            status = COALESCE($5, status),
            due_date = COALESCE($6, due_date),
            assigned_to = COALESCE($7, assigned_to),
            closed_at = CASE
              WHEN COALESCE($5, status) = 'Closed' AND closed_at IS NULL THEN CURRENT_TIMESTAMP(3)
              WHEN COALESCE($5, status) <> 'Closed' THEN NULL
              ELSE closed_at
            END,
            closed_by = CASE
              WHEN COALESCE($5, status) = 'Closed' THEN $8
              WHEN COALESCE($5, status) <> 'Closed' THEN NULL
              ELSE closed_by
            END,
            updated_at = CURRENT_TIMESTAMP(3)
          WHERE id = $1
            AND org_id = $9
        `,
        [
          complaintId,
          summary,
          details,
          severity,
          status,
          asDateString(dueDate),
          assignedTo,
          req.authContext.userId,
          req.authContext.orgId
        ]
      );

      const { rows } = await client.query(
        `SELECT * FROM qc_complaints WHERE id = $1 AND org_id = $2 LIMIT 1`,
        [complaintId, req.authContext.orgId]
      );

      if (!rows[0]) {
        const error = new Error('Complaint not found');
        error.statusCode = 404;
        throw error;
      }

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'complaint',
        entityTable: 'qc_complaints',
        entityId: complaintId,
        actionKey: 'update',
        actorUserId: req.authContext.userId,
        payloadJson: { severity, status, dueDate: asDateString(dueDate) }
      });

      return rows[0];
    });

    return res.json({ complaint });
  } catch (error) {
    return next(error);
  }
});

complaintsRouter.post('/:complaintId/link-capa', async (req, res, next) => {
  try {
    assertAnyRole(req, ['qa_reviewer', 'admin', 'superadmin']);

    const { complaintId } = req.params;
    const { capaId } = req.body || {};
    if (!capaId) {
      return res.status(400).json({ error: 'capaId is required' });
    }

    const link = await req.withRlsTransaction(async (client) => {
      const { rows: complaintRows } = await client.query(
        `SELECT id FROM qc_complaints WHERE id = $1 AND org_id = $2 LIMIT 1`,
        [complaintId, req.authContext.orgId]
      );
      if (!complaintRows[0]) {
        const error = new Error('Complaint not found');
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
          INSERT INTO qc_complaint_capa_links (org_id, complaint_id, capa_id, linked_by)
          VALUES ($1, $2, $3, $4) AS new
          ON DUPLICATE KEY UPDATE linked_at = CURRENT_TIMESTAMP(3), linked_by = new.linked_by
        `,
        [req.authContext.orgId, complaintId, capaId, req.authContext.userId]
      );

      // The upsert may have updated an existing link, so the row is read back by
      // its natural key (complaint_id, capa_id) rather than an app-generated id.
      const { rows } = await client.query(
        `
          SELECT * FROM qc_complaint_capa_links
          WHERE complaint_id = $1 AND capa_id = $2 AND org_id = $3
          LIMIT 1
        `,
        [complaintId, capaId, req.authContext.orgId]
      );

      await client.query(
        `
          UPDATE qc_complaints
          SET status = 'CapaLinked', updated_at = CURRENT_TIMESTAMP(3)
          WHERE id = $1
            AND org_id = $2
        `,
        [complaintId, req.authContext.orgId]
      );

      await appendTraceLink(client, {
        orgId: req.authContext.orgId,
        sourceModule: 'complaint',
        sourceTable: 'qc_complaints',
        sourceId: complaintId,
        targetModule: 'capa',
        targetTable: 'ca_capa_records',
        targetId: capaId,
        linkType: 'CorrectiveAction',
        createdBy: req.authContext.userId
      });

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'complaint',
        entityTable: 'qc_complaints',
        entityId: complaintId,
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

complaintsRouter.get('/:complaintId', async (req, res, next) => {
  try {
    const { complaintId } = req.params;

    const payload = await req.withRlsTransaction(async (client) => {
      const { rows: complaintRows } = await client.query(
        `SELECT * FROM qc_complaints WHERE id = $1 AND org_id = $2 LIMIT 1`,
        [complaintId, req.authContext.orgId]
      );
      if (!complaintRows[0]) {
        const error = new Error('Complaint not found');
        error.statusCode = 404;
        throw error;
      }

      const { rows: links } = await client.query(
        `
          SELECT l.*, c.capa_code, c.title AS capa_title
          FROM qc_complaint_capa_links l
          JOIN ca_capa_records c ON c.id = l.capa_id
          WHERE l.complaint_id = $1
            AND l.org_id = $2
          ORDER BY l.linked_at DESC
        `,
        [complaintId, req.authContext.orgId]
      );

      return {
        complaint: complaintRows[0],
        capaLinks: links
      };
    });

    return res.json(payload);
  } catch (error) {
    return next(error);
  }
});

complaintsRouter.get('/', async (req, res, next) => {
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

    const complaints = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          SELECT *
          FROM qc_complaints
          WHERE org_id = $1
          ${whereClause}
          ORDER BY updated_at DESC
          LIMIT $${values.length}
        `,
        values
      );
      return rows;
    });

    return res.json({ complaints });
  } catch (error) {
    return next(error);
  }
});
