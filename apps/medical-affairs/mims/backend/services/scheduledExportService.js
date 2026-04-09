'use strict';

const pool = require('../database/db');
const nodemailer = require('nodemailer');

function escapeCSV(value) {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function parseFilters(filters) {
  if (!filters) return {};
  if (typeof filters === 'object') return filters;
  try {
    return JSON.parse(filters);
  } catch (_) {
    return {};
  }
}

function buildCaseQuery(orgId, filters) {
  const params = [orgId];
  let where = 'c.org_id = ? AND c.is_deleted = 0';

  if (filters.case_type) {
    where += ' AND c.case_type = ?';
    params.push(filters.case_type);
  }

  if (filters.status_id) {
    where += ' AND c.status_id = ?';
    params.push(Number(filters.status_id));
  }

  if (filters.date_range_days) {
    const days = Number(filters.date_range_days);
    if (!Number.isNaN(days) && days > 0) {
      where += ' AND c.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)';
      params.push(days);
    }
  }

  return {
    sql: `SELECT c.case_number, c.case_type, c.priority, c.intake_channel,
                 c.date_received, c.created_at, c.status_id, u.name AS case_owner
          FROM cases c
          LEFT JOIN users u ON c.case_owner_id = u.id
          WHERE ${where}
          ORDER BY c.created_at DESC`,
    params,
  };
}

function buildCSV(rows) {
  const headers = [
    'Case Number',
    'Case Type',
    'Priority',
    'Intake Channel',
    'Date Received',
    'Created At',
    'Status ID',
    'Case Owner',
  ];

  const dataRows = rows.map((row) => [
    row.case_number,
    row.case_type,
    row.priority,
    row.intake_channel,
    row.date_received,
    row.created_at,
    row.status_id,
    row.case_owner,
  ].map(escapeCSV).join(','));

  return [headers.join(','), ...dataRows].join('\n');
}

async function deliverByEmail(config, csvContent) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 0),
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
  });

  if (!config.delivery_target) {
    throw new Error('delivery_target is required for email delivery');
  }

  const fileDate = new Date().toISOString().slice(0, 10);
  const safeName = (config.export_name || 'scheduled_export').replace(/[^a-zA-Z0-9_-]/g, '_');

  await transporter.sendMail({
    from: process.env.SMTP_USER || '',
    to: config.delivery_target,
    subject: `Scheduled export: ${config.export_name}`,
    text: `Attached export for org ${config.org_id}`,
    attachments: [
      {
        filename: `${safeName}_${fileDate}.csv`,
        content: csvContent,
        contentType: 'text/csv',
      },
    ],
  });
}

async function runScheduledExports() {
  const [configs] = await pool.query(
    'SELECT * FROM scheduled_export_configs WHERE is_active = 1 ORDER BY id ASC'
  );

  for (const config of configs) {
    let runStatus = 'success';
    try {
      const filters = parseFilters(config.filters);
      const { sql, params } = buildCaseQuery(config.org_id, filters);
      const [rows] = await pool.query(sql, params);
      const csvContent = buildCSV(rows);

      if (config.delivery_method === 'email') {
        await deliverByEmail(config, csvContent);
      } else {
        console.log(
          `[ScheduledExport] export ran org_id=${config.org_id} rows=${rows.length} delivery_method=${config.delivery_method || 'log'}`
        );
      }
    } catch (err) {
      runStatus = 'failed';
      console.error(
        `[ScheduledExport] export failed id=${config.id} org_id=${config.org_id}: ${err?.message || err}`
      );
    } finally {
      await pool.query(
        'UPDATE scheduled_export_configs SET last_run_at = NOW(), last_run_status = ? WHERE id = ?',
        [runStatus, config.id]
      );
    }
  }
}

async function getExportConfigs(orgId) {
  const [rows] = await pool.query(
    'SELECT * FROM scheduled_export_configs WHERE org_id = ? ORDER BY created_at DESC',
    [orgId]
  );
  return rows;
}

async function createExportConfig(orgId, userId, data) {
  const {
    export_name,
    export_format = 'csv',
    cron_expression = '0 6 * * 1',
    filters = null,
    delivery_method = 'email',
    delivery_target = null,
  } = data;

  const [result] = await pool.query(
    `INSERT INTO scheduled_export_configs
     (org_id, export_name, export_format, cron_expression, filters, delivery_method, delivery_target, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      orgId,
      export_name,
      export_format,
      cron_expression,
      filters ? JSON.stringify(filters) : null,
      delivery_method,
      delivery_target,
      userId,
    ]
  );

  return result.insertId;
}

async function updateExportConfig(id, orgId, data) {
  const [existing] = await pool.query(
    'SELECT id FROM scheduled_export_configs WHERE id = ? AND org_id = ? LIMIT 1',
    [id, orgId]
  );

  if (!existing.length) {
    const err = new Error('Config not found');
    err.statusCode = 404;
    throw err;
  }

  const fields = [];
  const values = [];

  const allowed = [
    'export_name',
    'export_format',
    'cron_expression',
    'filters',
    'delivery_method',
    'delivery_target',
    'is_active',
  ];

  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      fields.push(`${key} = ?`);
      if (key === 'filters') {
        values.push(data[key] ? JSON.stringify(data[key]) : null);
      } else {
        values.push(data[key]);
      }
    }
  }

  if (!fields.length) return;

  values.push(id, orgId);

  await pool.query(
    `UPDATE scheduled_export_configs
     SET ${fields.join(', ')}, updated_at = NOW()
     WHERE id = ? AND org_id = ?`,
    values
  );
}

async function deleteExportConfig(id, orgId) {
  const [result] = await pool.query(
    'DELETE FROM scheduled_export_configs WHERE id = ? AND org_id = ?',
    [id, orgId]
  );

  if (!result.affectedRows) {
    const err = new Error('Config not found');
    err.statusCode = 404;
    throw err;
  }
}

module.exports = {
  runScheduledExports,
  getExportConfigs,
  createExportConfig,
  updateExportConfig,
  deleteExportConfig,
};
