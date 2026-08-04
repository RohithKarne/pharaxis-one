import { Router } from 'express';
import { assertAnyRole } from '../middleware/rbac.js';

export const aiInsightsRouter = Router();

// COUNT(*) is bigint in PostgreSQL, which node-postgres returns as a JS string.
// The queries used to cast ::int (PostgreSQL-only) to get a number back; the
// coercion now happens here so the JSON payload keeps the same shape.
function countRows(rows) {
  return rows.map((row) => ({ ...row, total: Number(row.total || 0) }));
}

function summarizeTop(items, key, limit = 3) {
  return items
    .sort((a, b) => Number(b.total || 0) - Number(a.total || 0))
    .slice(0, limit)
    .map((item) => ({ label: item[key], total: Number(item.total || 0) }));
}

aiInsightsRouter.get('/event-hub', async (req, res, next) => {
  try {
    const summary = await req.withRlsTransaction(async (client) => {
      const orgParams = [req.authContext.orgId];
      const deviationRows = await client.query(`SELECT status, COUNT(*) AS total FROM dv_deviation_records WHERE org_id = $1 GROUP BY status`, orgParams);
      const capaRows = await client.query(`SELECT status, COUNT(*) AS total FROM ca_capa_records WHERE org_id = $1 GROUP BY status`, orgParams);
      const complaintRows = await client.query(`SELECT status, COUNT(*) AS total FROM qc_complaints WHERE org_id = $1 GROUP BY status`, orgParams);
      const ncRows = await client.query(`SELECT status, COUNT(*) AS total FROM qn_nonconformance_records WHERE org_id = $1 GROUP BY status`, orgParams);
      const changeRows = await client.query(`SELECT status, COUNT(*) AS total FROM cc_change_records WHERE org_id = $1 GROUP BY status`, orgParams);
      const auditRows = await client.query(`SELECT status, COUNT(*) AS total FROM au_audits WHERE org_id = $1 GROUP BY status`, orgParams);
      const riskRows = await client.query(`SELECT status, COUNT(*) AS total FROM rm_risk_register WHERE org_id = $1 GROUP BY status`, orgParams);

      return {
        deviations: countRows(deviationRows.rows),
        capas: countRows(capaRows.rows),
        complaints: countRows(complaintRows.rows),
        nonconformances: countRows(ncRows.rows),
        changes: countRows(changeRows.rows),
        audits: countRows(auditRows.rows),
        risks: countRows(riskRows.rows)
      };
    });

    return res.json({ summary });
  } catch (error) {
    return next(error);
  }
});

aiInsightsRouter.get('/quality-insights', async (req, res, next) => {
  try {
    assertAnyRole(req, ['qa_reviewer', 'admin', 'superadmin']);

    const insights = await req.withRlsTransaction(async (client) => {
      const orgParams = [req.authContext.orgId];
      const complaintBySeverity = await client.query(`SELECT severity, COUNT(*) AS total FROM qc_complaints WHERE org_id = $1 GROUP BY severity`, orgParams);
      const ncBySource = await client.query(`SELECT source_type, COUNT(*) AS total FROM qn_nonconformance_records WHERE org_id = $1 GROUP BY source_type`, orgParams);
      const overdueScars = await client.query(`SELECT COUNT(*) AS total FROM sq_scar_records WHERE status <> 'Closed' AND due_date IS NOT NULL AND due_date < CURRENT_DATE AND org_id = $1`, orgParams);
      const highRisk = await client.query(`SELECT COUNT(*) AS total FROM rm_risk_register WHERE risk_band IN ('High', 'Critical') AND status <> 'Closed' AND org_id = $1`, orgParams);
      const trendDeviation = await client.query(
        `
          SELECT DATE_FORMAT(DATE_SUB(DATE(created_at), INTERVAL WEEKDAY(created_at) DAY), '%Y-%m-%d') AS bucket, COUNT(*) AS total
          FROM dv_deviation_records
          WHERE created_at >= CURRENT_TIMESTAMP(3) - INTERVAL 8 WEEK
            AND org_id = $1
          GROUP BY bucket
          ORDER BY bucket
        `,
        orgParams
      );
      const trendCapa = await client.query(
        `
          SELECT DATE_FORMAT(DATE_SUB(DATE(created_at), INTERVAL WEEKDAY(created_at) DAY), '%Y-%m-%d') AS bucket, COUNT(*) AS total
          FROM ca_capa_records
          WHERE created_at >= CURRENT_TIMESTAMP(3) - INTERVAL 8 WEEK
            AND org_id = $1
          GROUP BY bucket
          ORDER BY bucket
        `,
        orgParams
      );
      const trendComplaint = await client.query(
        `
          SELECT DATE_FORMAT(DATE_SUB(DATE(created_at), INTERVAL WEEKDAY(created_at) DAY), '%Y-%m-%d') AS bucket, COUNT(*) AS total
          FROM qc_complaints
          WHERE created_at >= CURRENT_TIMESTAMP(3) - INTERVAL 8 WEEK
            AND org_id = $1
          GROUP BY bucket
          ORDER BY bucket
        `,
        orgParams
      );

      const leadingComplaintSeverity = summarizeTop(complaintBySeverity.rows, 'severity', 3);
      const leadingNcSources = summarizeTop(ncBySource.rows, 'source_type', 3);
      const overdueScarCount = Number(overdueScars.rows[0]?.total || 0);
      const highRiskCount = Number(highRisk.rows[0]?.total || 0);

      const narrative = [
        leadingComplaintSeverity[0]
          ? `Highest complaint load is ${leadingComplaintSeverity[0].label} severity (${leadingComplaintSeverity[0].total}).`
          : 'No complaints recorded yet.',
        leadingNcSources[0]
          ? `Top nonconformance source is ${leadingNcSources[0].label} (${leadingNcSources[0].total}).`
          : 'No nonconformance records yet.',
        overdueScarCount > 0
          ? `${overdueScarCount} supplier corrective actions are overdue and need escalation.`
          : 'No overdue supplier corrective actions.',
        highRiskCount > 0
          ? `${highRiskCount} active high/critical risks require mitigation follow-up.`
          : 'No active high/critical risks.'
      ];

      const payload = {
        generatedAt: new Date().toISOString(),
        highlights: {
          leadingComplaintSeverity,
          leadingNcSources,
          overdueScarCount,
          highRiskCount
        },
        trends: {
          deviationsByWeek: trendDeviation.rows,
          capasByWeek: trendCapa.rows,
          complaintsByWeek: trendComplaint.rows
        },
        narrative
      };

      await client.query(
        `
          INSERT INTO ai_quality_insights_cache (org_id, insight_key, insight_payload, generated_by)
          VALUES ($1, $2, $3, $4) AS new
          ON DUPLICATE KEY UPDATE insight_payload = new.insight_payload, generated_at = CURRENT_TIMESTAMP(3), generated_by = new.generated_by
        `,
        [req.authContext.orgId, 'weekly-quality-insights', JSON.stringify(payload), req.authContext.userId]
      );

      return payload;
    });

    return res.json({ insights });
  } catch (error) {
    return next(error);
  }
});

aiInsightsRouter.get('/quality-insights/cached', async (req, res, next) => {
  try {
    const cached = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          SELECT insight_key, insight_payload, generated_at
          FROM ai_quality_insights_cache
          WHERE org_id = $1
          ORDER BY generated_at DESC
          LIMIT 20
        `,
        [req.authContext.orgId]
      );
      return rows;
    });

    return res.json({ cached });
  } catch (error) {
    return next(error);
  }
});
