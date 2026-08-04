import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { assertAnyRole } from '../middleware/rbac.js';
import { appendAuditEvent } from '../services/auditTrailService.js';
import { makeEntityCode, asDateString } from '../utils/codegen.js';

export const supplierQualityRouter = Router();

const validSupplierTypes = new Set(['RawMaterial', 'ContractManufacturer', 'ServiceProvider', 'Laboratory', 'Distributor']);
const validQualification = new Set(['Pending', 'Qualified', 'Conditional', 'Disqualified']);
const validRisk = new Set(['Low', 'Medium', 'High', 'Critical']);
const validAuditType = new Set(['Onsite', 'Remote', 'DocumentReview']);
const validAuditOutcome = new Set(['Pass', 'Conditional', 'Fail', 'InProgress']);
const validScarStatus = new Set(['Open', 'SupplierResponse', 'Implementation', 'Effectiveness', 'Closed']);

supplierQualityRouter.post('/suppliers', async (req, res, next) => {
  try {
    assertAnyRole(req, ['admin', 'superadmin', 'qa_reviewer']);

    const {
      supplierName,
      supplierType,
      contactEmail = null,
      riskLevel = 'Medium',
      qualificationStatus = 'Pending'
    } = req.body || {};

    if (!supplierName || !supplierType) {
      return res.status(400).json({ error: 'supplierName and supplierType are required' });
    }
    if (!validSupplierTypes.has(supplierType)) {
      return res.status(400).json({ error: 'Invalid supplierType' });
    }
    if (!validQualification.has(qualificationStatus)) {
      return res.status(400).json({ error: 'Invalid qualificationStatus' });
    }
    if (!validRisk.has(riskLevel)) {
      return res.status(400).json({ error: 'Invalid riskLevel' });
    }

    const supplier = await req.withRlsTransaction(async (client) => {
      const newSupplierId = randomUUID();
      await client.query(
        `
          INSERT INTO sq_suppliers (
            org_id,
            supplier_code,
            supplier_name,
            supplier_type,
            contact_email,
            qualification_status,
            risk_level,
            created_by,
            id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `,
        [
          req.authContext.orgId,
          makeEntityCode('SUP', supplierName),
          supplierName,
          supplierType,
          contactEmail,
          qualificationStatus,
          riskLevel,
          req.authContext.userId,
          newSupplierId
        ]
      );

      const { rows } = await client.query(
        `SELECT * FROM sq_suppliers WHERE id = $1 AND org_id = $2 LIMIT 1`,
        [newSupplierId, req.authContext.orgId]
      );

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'supplier_quality',
        entityTable: 'sq_suppliers',
        entityId: rows[0].id,
        actionKey: 'create_supplier',
        actorUserId: req.authContext.userId,
        payloadJson: { supplierType, qualificationStatus, riskLevel }
      });

      return rows[0];
    });

    return res.status(201).json({ supplier });
  } catch (error) {
    return next(error);
  }
});

supplierQualityRouter.patch('/suppliers/:supplierId', async (req, res, next) => {
  try {
    assertAnyRole(req, ['admin', 'superadmin', 'qa_reviewer']);

    const { supplierId } = req.params;
    const {
      supplierName = null,
      contactEmail = null,
      qualificationStatus = null,
      riskLevel = null,
      scorecardRating = null
    } = req.body || {};

    if (qualificationStatus && !validQualification.has(qualificationStatus)) {
      return res.status(400).json({ error: 'Invalid qualificationStatus' });
    }
    if (riskLevel && !validRisk.has(riskLevel)) {
      return res.status(400).json({ error: 'Invalid riskLevel' });
    }

    const supplier = await req.withRlsTransaction(async (client) => {
      await client.query(
        `
          UPDATE sq_suppliers
          SET
            supplier_name = COALESCE($2, supplier_name),
            contact_email = COALESCE($3, contact_email),
            qualification_status = COALESCE($4, qualification_status),
            risk_level = COALESCE($5, risk_level),
            scorecard_rating = COALESCE($6, scorecard_rating),
            approved_at = CASE WHEN COALESCE($4, qualification_status) = 'Qualified' THEN COALESCE(approved_at, CURRENT_TIMESTAMP(3)) ELSE approved_at END,
            updated_at = CURRENT_TIMESTAMP(3)
          WHERE id = $1
            AND org_id = $7
        `,
        [supplierId, supplierName, contactEmail, qualificationStatus, riskLevel, scorecardRating, req.authContext.orgId]
      );

      const { rows } = await client.query(
        `SELECT * FROM sq_suppliers WHERE id = $1 AND org_id = $2 LIMIT 1`,
        [supplierId, req.authContext.orgId]
      );

      if (!rows[0]) {
        const error = new Error('Supplier not found');
        error.statusCode = 404;
        throw error;
      }

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'supplier_quality',
        entityTable: 'sq_suppliers',
        entityId: supplierId,
        actionKey: 'update_supplier',
        actorUserId: req.authContext.userId,
        payloadJson: { qualificationStatus, riskLevel, scorecardRating }
      });

      return rows[0];
    });

    return res.json({ supplier });
  } catch (error) {
    return next(error);
  }
});

supplierQualityRouter.post('/suppliers/:supplierId/audits', async (req, res, next) => {
  try {
    assertAnyRole(req, ['qa_reviewer', 'admin', 'superadmin']);

    const { supplierId } = req.params;
    const { auditType, plannedDate = null, outcome = 'InProgress', findingsCount = 0, summary = null } = req.body || {};

    if (!auditType) {
      return res.status(400).json({ error: 'auditType is required' });
    }
    if (!validAuditType.has(auditType)) {
      return res.status(400).json({ error: 'Invalid auditType' });
    }
    if (!validAuditOutcome.has(outcome)) {
      return res.status(400).json({ error: 'Invalid outcome' });
    }

    const audit = await req.withRlsTransaction(async (client) => {
      const { rows: supplierRows } = await client.query(`SELECT id, supplier_name FROM sq_suppliers WHERE id = $1 AND org_id = $2 LIMIT 1`, [supplierId, req.authContext.orgId]);
      if (!supplierRows[0]) {
        const error = new Error('Supplier not found');
        error.statusCode = 404;
        throw error;
      }

      const supplierAuditId = randomUUID();
      await client.query(
        `
          INSERT INTO sq_supplier_audits (
            org_id,
            supplier_id,
            audit_code,
            audit_type,
            planned_date,
            outcome,
            findings_count,
            summary,
            created_by,
            id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `,
        [
          req.authContext.orgId,
          supplierId,
          makeEntityCode('SAUD', supplierRows[0].supplier_name),
          auditType,
          asDateString(plannedDate),
          outcome,
          Number(findingsCount || 0),
          summary,
          req.authContext.userId,
          supplierAuditId
        ]
      );

      const { rows } = await client.query(
        `SELECT * FROM sq_supplier_audits WHERE id = $1 AND org_id = $2 LIMIT 1`,
        [supplierAuditId, req.authContext.orgId]
      );

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'supplier_quality',
        entityTable: 'sq_supplier_audits',
        entityId: rows[0].id,
        actionKey: 'create_supplier_audit',
        actorUserId: req.authContext.userId,
        payloadJson: { supplierId, outcome, findingsCount: Number(findingsCount || 0) }
      });

      return rows[0];
    });

    return res.status(201).json({ audit });
  } catch (error) {
    return next(error);
  }
});

supplierQualityRouter.post('/suppliers/:supplierId/scars', async (req, res, next) => {
  try {
    assertAnyRole(req, ['qa_reviewer', 'admin', 'superadmin']);

    const { supplierId } = req.params;
    const { issueSummary, dueDate = null } = req.body || {};
    if (!issueSummary) {
      return res.status(400).json({ error: 'issueSummary is required' });
    }

    const scar = await req.withRlsTransaction(async (client) => {
      const { rows: supplierRows } = await client.query(`SELECT id, supplier_name FROM sq_suppliers WHERE id = $1 AND org_id = $2 LIMIT 1`, [supplierId, req.authContext.orgId]);
      if (!supplierRows[0]) {
        const error = new Error('Supplier not found');
        error.statusCode = 404;
        throw error;
      }

      const newScarId = randomUUID();
      await client.query(
        `
          INSERT INTO sq_scar_records (
            org_id,
            supplier_id,
            scar_code,
            issue_summary,
            due_date,
            created_by,
            id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          req.authContext.orgId,
          supplierId,
          makeEntityCode('SCAR', supplierRows[0].supplier_name),
          issueSummary,
          asDateString(dueDate),
          req.authContext.userId,
          newScarId
        ]
      );

      const { rows } = await client.query(
        `SELECT * FROM sq_scar_records WHERE id = $1 AND org_id = $2 LIMIT 1`,
        [newScarId, req.authContext.orgId]
      );

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'supplier_quality',
        entityTable: 'sq_scar_records',
        entityId: rows[0].id,
        actionKey: 'create_scar',
        actorUserId: req.authContext.userId,
        payloadJson: { supplierId, dueDate: asDateString(dueDate) }
      });

      return rows[0];
    });

    return res.status(201).json({ scar });
  } catch (error) {
    return next(error);
  }
});

supplierQualityRouter.patch('/scars/:scarId', async (req, res, next) => {
  try {
    assertAnyRole(req, ['qa_reviewer', 'admin', 'superadmin']);

    const { scarId } = req.params;
    const { status = null, dueDate = null, effectivenessResult = null } = req.body || {};

    if (status && !validScarStatus.has(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const scar = await req.withRlsTransaction(async (client) => {
      await client.query(
        `
          UPDATE sq_scar_records
          SET
            status = COALESCE($2, status),
            due_date = COALESCE($3, due_date),
            effectiveness_result = COALESCE($4, effectiveness_result),
            closed_at = CASE
              WHEN COALESCE($2, status) = 'Closed' AND closed_at IS NULL THEN CURRENT_TIMESTAMP(3)
              WHEN COALESCE($2, status) <> 'Closed' THEN NULL
              ELSE closed_at
            END,
            closed_by = CASE
              WHEN COALESCE($2, status) = 'Closed' THEN $5
              WHEN COALESCE($2, status) <> 'Closed' THEN NULL
              ELSE closed_by
            END,
            updated_at = CURRENT_TIMESTAMP(3)
          WHERE id = $1
            AND org_id = $6
        `,
        [scarId, status, asDateString(dueDate), effectivenessResult, req.authContext.userId, req.authContext.orgId]
      );

      const { rows } = await client.query(
        `SELECT * FROM sq_scar_records WHERE id = $1 AND org_id = $2 LIMIT 1`,
        [scarId, req.authContext.orgId]
      );

      if (!rows[0]) {
        const error = new Error('SCAR record not found');
        error.statusCode = 404;
        throw error;
      }

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'supplier_quality',
        entityTable: 'sq_scar_records',
        entityId: scarId,
        actionKey: 'update_scar',
        actorUserId: req.authContext.userId,
        payloadJson: { status, dueDate: asDateString(dueDate), effectivenessResult }
      });

      return rows[0];
    });

    return res.json({ scar });
  } catch (error) {
    return next(error);
  }
});

supplierQualityRouter.get('/suppliers/:supplierId', async (req, res, next) => {
  try {
    const { supplierId } = req.params;
    const data = await req.withRlsTransaction(async (client) => {
      const { rows: supplierRows } = await client.query(
        `SELECT * FROM sq_suppliers WHERE id = $1 AND org_id = $2 LIMIT 1`,
        [supplierId, req.authContext.orgId]
      );
      if (!supplierRows[0]) {
        const error = new Error('Supplier not found');
        error.statusCode = 404;
        throw error;
      }
      const { rows: auditRows } = await client.query(
        `SELECT * FROM sq_supplier_audits WHERE supplier_id = $1 AND org_id = $2 ORDER BY updated_at DESC`,
        [supplierId, req.authContext.orgId]
      );
      const { rows: scarRows } = await client.query(
        `SELECT * FROM sq_scar_records WHERE supplier_id = $1 AND org_id = $2 ORDER BY updated_at DESC`,
        [supplierId, req.authContext.orgId]
      );
      return { supplier: supplierRows[0], supplierAudits: auditRows, scars: scarRows };
    });
    return res.json(data);
  } catch (error) {
    return next(error);
  }
});

supplierQualityRouter.get('/', async (req, res, next) => {
  try {
    const snapshot = await req.withRlsTransaction(async (client) => {
      const supplierRows = await client.query(`SELECT * FROM sq_suppliers WHERE org_id = $1 ORDER BY updated_at DESC LIMIT 300`, [
        req.authContext.orgId
      ]);
      const auditRows = await client.query(
        `
          SELECT a.*, s.supplier_name
          FROM sq_supplier_audits a
          JOIN sq_suppliers s ON s.id = a.supplier_id AND s.org_id = a.org_id
          WHERE a.org_id = $1
          ORDER BY a.updated_at DESC
          LIMIT 300
        `,
        [req.authContext.orgId]
      );
      const scarRows = await client.query(
        `
          SELECT r.*, s.supplier_name
          FROM sq_scar_records r
          JOIN sq_suppliers s ON s.id = r.supplier_id AND s.org_id = r.org_id
          WHERE r.org_id = $1
          ORDER BY r.updated_at DESC
          LIMIT 300
        `,
        [req.authContext.orgId]
      );

      return {
        suppliers: supplierRows.rows,
        supplierAudits: auditRows.rows,
        scars: scarRows.rows
      };
    });

    return res.json(snapshot);
  } catch (error) {
    return next(error);
  }
});
