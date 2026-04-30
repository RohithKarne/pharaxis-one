import { Router } from 'express';
import { assertAnyRole } from '../middleware/rbac.js';

export const aiInsightsRouter = Router();

function summarizeTop(items, key, limit = 3) {
  return items
    .sort((a, b) => Number(b.total || 0) - Number(a.total || 0))
    .slice(0, limit)
    .map((item) => ({ label: item[key], total: Number(item.total || 0) }));
}

aiInsightsRouter.get('/event-hub', async (req, res, next) => {
  try {
    const summary = await req.withRlsTransaction(async (client) => {
      const deviationRows = await client.query(`SELECT status, COUNT(*)::int AS total FROM dv_deviation_records GROUP BY status`);
      const capaRows = await client.query(`SELECT status, COUNT(*)::int AS total FROM ca_capa_records GROUP BY status`);
      const complaintRows = await client.query(`SELECT status, COUNT(*)::int AS total FROM qc_complaints GROUP BY status`);
      const ncRows = await client.query(`SELECT status, COUNT(*)::int AS total FROM qn_nonconformance_records GROUP BY status`);
      const changeRows = await client.query(`SELECT status, COUNT(*)::int AS total FROM cc_change_records GROUP BY status`);
      const auditRows = await client.query(`SELECT status, COUNT(*)::int AS total FROM au_audits GROUP BY status`);
      const riskRows = await client.query(`SELECT status, COUNT(*)::int AS total FROM rm_risk_register GROUP BY status`);

      return {
        deviations: deviationRows.rows,
        capas: capaRows.rows,
        complaints: complaintRows.rows,
        nonconformances: ncRows.rows,
        changes: changeRows.rows,
        audits: auditRows.rows,
        risks: riskRows.rows
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
      const complaintBySeverity = await client.query(`SELECT severity, COUNT(*)::int AS total FROM qc_complaints GROUP BY severity`);
      const ncBySource = await client.query(`SELECT source_type, COUNT(*)::int AS total FROM qn_nonconformance_records GROUP BY source_type`);
      const overdueScars = await client.query(`SELECT COUNT(*)::int AS total FROM sq_scar_records WHERE status <> 'Closed' AND due_date IS NOT NULL AND due_date < CURRENT_DATE`);
      const highRisk = await client.query(`SELECT COUNT(*)::int AS total FROM rm_risk_register WHERE risk_band IN ('High', 'Critical') AND status <> 'Closed'`);
      const trendDeviation = await client.query(
        `
          SELECT to_char(date_trunc('week', created_at), 'YYYY-MM-DD') AS bucket, COUNT(*)::int AS total
          FROM dv_deviation_records
          WHERE created_at >= now() - interval '8 weeks'
          GROUP BY 1
          ORDER BY 1
        `
      );
      const trendCapa = await client.query(
        `
          SELECT to_char(date_trunc('week', created_at), 'YYYY-MM-DD') AS bucket, COUNT(*)::int AS total
          FROM ca_capa_records
          WHERE created_at >= now() - interval '8 weeks'
          GROUP BY 1
          ORDER BY 1
        `
      );
      const trendComplaint = await client.query(
        `
          SELECT to_char(date_trunc('week', created_at), 'YYYY-MM-DD') AS bucket, COUNT(*)::int AS total
          FROM qc_complaints
          WHERE created_at >= now() - interval '8 weeks'
          GROUP BY 1
          ORDER BY 1
        `
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
          VALUES ($1, $2, $3::jsonb, $4)
          ON CONFLICT (org_id, insight_key)
          DO UPDATE SET insight_payload = EXCLUDED.insight_payload, generated_at = now(), generated_by = EXCLUDED.generated_by
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
          ORDER BY generated_at DESC
          LIMIT 20
        `
      );
      return rows;
    });

    return res.json({ cached });
  } catch (error) {
    return next(error);
  }
});
