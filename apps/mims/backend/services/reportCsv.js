'use strict';

/**
 * reportCsv.js — one CSV writer and one set of column names for reports
 * (reports review, 2026-10-14).
 *
 * The screen built its own CSV in the browser and the scheduler built another:
 * headers were raw keys (case_number), the scheduler wrote the hidden
 * __drill_route columns, and a cell starting with = + - or @ opened in Excel as
 * a formula. Both now use this file.
 */

// Names that the generic "snake_case to Title Case" rule gets wrong or vague.
const COLUMN_LABELS = Object.freeze({
  case_id: 'Case ID',
  case_number: 'Case',
  case_type: 'Type',
  intake_channel: 'Channel',
  status_name: 'Status',
  case_owner: 'Owner',
  report_date: 'Date',
  date_from: 'From',
  date_to: 'To',
  mi_category: 'Category',
  is_off_label: 'Off-label',
  sla_status: 'SLA status',
  inquiry_id: 'Inquiry ID',
  first_touch_sla_status: 'First-touch SLA',
  response_sla_status: 'Response SLA',
  first_touch_due_at: 'First touch due',
  response_due_at: 'Response due',
  age_hours: 'Age (hours)',
  icsr_status: 'ICSR status',
  modules: 'Screens',
});

function columnLabel(key) {
  if (COLUMN_LABELS[key]) return COLUMN_LABELS[key];
  const text = String(key || '').replace(/_/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function columnLabels(columns = []) {
  return Object.fromEntries(columns.map((column) => [column, columnLabel(column)]));
}

function cellText(value) {
  if (value == null) return '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString().replace('T00:00:00.000Z', '');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// A text cell that Excel or Sheets would read as a formula is written with a
// leading apostrophe, so it shows as text (OWASP CSV injection guidance).
function csvCell(value) {
  let text = cellText(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// Columns starting with "__" are screen-only (drill-down links) and never written.
function buildReportCsv(columns = [], rows = []) {
  const visible = columns.filter((column) => !String(column).startsWith('__'));
  const lines = [visible.map((column) => csvCell(columnLabel(column))).join(',')];
  rows.forEach((row) => lines.push(visible.map((column) => csvCell(row?.[column])).join(',')));
  return lines.join('\r\n');
}

module.exports = { columnLabel, columnLabels, csvCell, buildReportCsv };
