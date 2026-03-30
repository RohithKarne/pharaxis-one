/**
 * AdminConsolePage.jsx — Full Admin Console
 * Sprint 3 complete implementation covering all IMP, AUD, ACC items.
 */

import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../../shared/context/AuthContext'
import MIMSLayout from '../../../shared/components/MIMSLayout'
import * as XLSX from 'xlsx'

const SLUG_MAP = {
  // legacy URL aliases (keep for bookmarks)
  'sites-setup':             'sites',
  'workflow-setup':          'workflow',
  'product-dictionary':      'products',
  'user-security-groups':    'user-security',
  'user-configuration':      'user-config',
  'admin-audit-trail':       'audit-admin',
  'login-audit-trail':       'audit-login',
  'contact-master':          'case-contacts',
  'company-representatives': 'company-reps',
  // current sidebar keys (pass-through — kept for explicitness)
  'email-accounts':   'email-accounts',
  'sites':            'sites',
  'workflow':         'workflow',
  'source-types':     'source-types',
  'picklists':        'picklists',
  'case-numbering':   'case-numbering',
  'products':         'products',
  'field-setup':      'field-setup',
  'case-form-def':    'case-form-def',
  'user-security':    'user-security',
  'user-config':      'user-config',
  'case-contacts':    'contact-master',
  'company-reps':     'contact-master',
  'audit-admin':      'audit-admin',
  'audit-login':      'audit-login',
  'service-log':      'service-log',
  'system-activity':  'system-activity',
}

const SECTION_LABELS = {
  'email-accounts':   'Email Accounts',
  'sites':            'Sites Setup',
  'workflow':         'Workflow Setup',
  'source-types':     'Source Types',
  'picklists':        'Picklists Management',
  'case-numbering':   'Case Numbering Setup',
  'products':         'Product Dictionary',
  'field-setup':      'Field Setup',
  'case-form-def':    'Case Form Definition',
  'user-security':    'User Security Groups',
  'user-config':      'User Configuration',
  'case-contacts':    'Case Contacts Repository',
  'company-reps':     'Company Representatives',
  'audit-admin':      'Admin Audit Trail',
  'audit-login':      'Login Audit Trail',
  'service-log':      'Service Log',
  'system-activity':  'System Activity',
  // legacy aliases
  'sites-setup':          'Sites Setup',
  'workflow-setup':       'Workflow Setup',
  'product-dictionary':   'Product Dictionary',
  'user-security-groups': 'User Security Groups',
  'user-configuration':   'User Configuration',
  'admin-audit-trail':    'Admin Audit Trail',
  'login-audit-trail':    'Login Audit Trail',
  'contact-master':       'Case Contacts Repository',
  'company-representatives': 'Company Representatives',
}

const STATUS_COLORS = {
  success: { bg: '#e6f4ee', color: '#007a5a', label: 'Success' },
  failed:  { bg: '#fde8ef', color: '#e01e5a', label: 'Failed'  },
  warning: { bg: '#fdf3d0', color: '#b8860b', label: 'Warning' },
}

function parseUtcDate(s) {
  if (!s) return null
  const str = String(s).trim()
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(str)) {
    const [date, time] = str.split(' ')
    const [y, m, d] = date.split('-').map(Number)
    const [hh, mm, ss] = time.split(':').map(Number)
    return new Date(Date.UTC(y, m - 1, d, hh, mm, ss))
  }
  const d = new Date(str)
  return isNaN(d) ? null : d
}

function fmtDateIST(s) {
  const d = parseUtcDate(s)
  if (!d) return s || '—'
  // Manual IST formatting to avoid browser timezone support inconsistencies
  const istMs = d.getTime() + 330 * 60 * 1000
  const ist = new Date(istMs)
  const pad = n => String(n).padStart(2, '0')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const day = pad(ist.getUTCDate())
  const mon = months[ist.getUTCMonth()]
  const year = ist.getUTCFullYear()
  const hour = pad(ist.getUTCHours())
  const min = pad(ist.getUTCMinutes())
  const sec = pad(ist.getUTCSeconds())
  return `${day} ${mon} ${year}, ${hour}:${min}:${sec} IST`
}

function ServiceLogTab({ logs, sources, filter, onFilterChange, onRefine, page, pageSize, total, totalPages, loading, onPageChange, onPageSizeChange }) {

  const pages = []
  const start = Math.max(1, page - 2)
  const end   = Math.min(totalPages, page + 2)
  for (let i = start; i <= end; i++) pages.push(i)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Filter bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', background: 'var(--surface)' }}>
        <select
          value={filter.source}
          onChange={e => onFilterChange({ source: e.target.value })}
          style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--text-primary)', background: 'var(--surface)', minWidth: 160 }}
        >
          <option value="">All Sources</option>
          {sources.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <select
          value={filter.status}
          onChange={e => onFilterChange({ status: e.target.value })}
          style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--text-primary)', background: 'var(--surface)' }}
        >
          <option value="">All Statuses</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
          <option value="warning">Warning</option>
        </select>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
          <span>From</span>
          <input
            type="date"
            value={filter.date_from}
            onChange={e => onFilterChange({ date_from: e.target.value })}
            style={{ padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--text-primary)', background: 'var(--surface)' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
          <span>To</span>
          <input
            type="date"
            value={filter.date_to}
            onChange={e => onFilterChange({ date_to: e.target.value })}
            style={{ padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--text-primary)', background: 'var(--surface)' }}
          />
        </div>

        <button
          onClick={onRefine}
          style={{ padding: '6px 18px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          Refine
        </button>

        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
          {total} record{total !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-muted)', fontSize: 14 }}>
            Loading...
          </div>
        ) : logs.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-muted)', gap: 8 }}>
            <div style={{ fontSize: 28 }}>📋</div>
            <div style={{ fontSize: 14 }}>No service log entries yet.</div>
            <div style={{ fontSize: 12 }}>Entries will appear here once services run.</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                {['Source', 'Service Type', 'Description', 'Status', 'Date'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((row, i) => {
                const sc = STATUS_COLORS[row.status] || STATUS_COLORS.warning
                return (
                  <tr key={row.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--surface)' : 'var(--bg)' }}>
                    <td style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{row.source}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{row.service_type}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-primary)', maxWidth: 420 }}>{row.description}</td>
                    <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                      <span style={{ background: sc.bg, color: sc.color, padding: '2px 10px', borderRadius: 12, fontWeight: 600, fontSize: 11 }}>
                        {sc.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDateIST(row.created_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!loading && total > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--border)', background: 'var(--surface)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 4 }}>Rows per page:</span>
          {[10, 20, 50].map(ps => (
            <button key={ps} onClick={() => onPageSizeChange(ps)}
              style={{ padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, cursor: 'pointer', background: pageSize === ps ? 'var(--primary)' : 'var(--surface)', color: pageSize === ps ? '#fff' : 'var(--text-primary)', fontWeight: pageSize === ps ? 700 : 400 }}>
              {ps}
            </button>
          ))}

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={() => onPageChange(1)} disabled={page === 1}
              style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, cursor: page === 1 ? 'default' : 'pointer', opacity: page === 1 ? 0.4 : 1, background: 'var(--surface)' }}>«</button>
            <button onClick={() => onPageChange(page - 1)} disabled={page === 1}
              style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, cursor: page === 1 ? 'default' : 'pointer', opacity: page === 1 ? 0.4 : 1, background: 'var(--surface)' }}>‹</button>
            {pages.map(p => (
              <button key={p} onClick={() => onPageChange(p)}
                style={{ padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, cursor: 'pointer', background: p === page ? 'var(--primary)' : 'var(--surface)', color: p === page ? '#fff' : 'var(--text-primary)', fontWeight: p === page ? 700 : 400 }}>
                {p}
              </button>
            ))}
            <button onClick={() => onPageChange(page + 1)} disabled={page === totalPages}
              style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, cursor: page === totalPages ? 'default' : 'pointer', opacity: page === totalPages ? 0.4 : 1, background: 'var(--surface)' }}>›</button>
            <button onClick={() => onPageChange(totalPages)} disabled={page === totalPages}
              style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, cursor: page === totalPages ? 'default' : 'pointer', opacity: page === totalPages ? 0.4 : 1, background: 'var(--surface)' }}>»</button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 6 }}>Page {page} of {totalPages}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function SystemActivityTab({
  rows,
  summary,
  filter,
  onFilterChange,
  onRefine,
  onRefresh,
  page,
  pageSize,
  total,
  totalPages,
  loading,
  onPageChange,
  onPageSizeChange
}) {
  const pages = []
  const start = Math.max(1, page - 2)
  const end   = Math.min(totalPages, page + 2)
  for (let i = start; i <= end; i++) pages.push(i)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header + Filters */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={onRefresh}
            style={{ padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', fontSize: 12, cursor: 'pointer' }}
          >
            ⟳ Refresh
          </button>

          <select
            value={filter.task}
            onChange={e => onFilterChange({ task: e.target.value })}
            style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--text-primary)', background: 'var(--surface)', minWidth: 160 }}
          >
            <option value="Email Import">Email Import</option>
          </select>

          <select
            value={filter.status}
            onChange={e => onFilterChange({ status: e.target.value })}
            style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--text-primary)', background: 'var(--surface)' }}
          >
            <option value="">All Statuses</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
            <option value="warning">Warning</option>
          </select>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
            <span>From</span>
            <input
              type="date"
              value={filter.date_from}
              onChange={e => onFilterChange({ date_from: e.target.value })}
              style={{ padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--text-primary)', background: 'var(--surface)' }}
            />
          </div>

          <button
            onClick={onRefine}
            style={{ padding: '6px 18px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            Refine
          </button>

          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
            {total} record{total !== 1 ? 's' : ''}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {[
            { label: 'Total',   value: summary.total },
            { label: 'Success', value: summary.success },
            { label: 'Failed',  value: summary.failed },
            { label: 'Warning', value: summary.warning },
          ].map(card => (
            <div key={card.label} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', background: 'var(--bg)', minWidth: 120 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{card.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{card.value ?? 0}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-muted)', fontSize: 14 }}>
            Loading...
          </div>
        ) : rows.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-muted)', gap: 8 }}>
            <div style={{ fontSize: 28 }}>🧾</div>
            <div style={{ fontSize: 14 }}>No system activity entries yet.</div>
            <div style={{ fontSize: 12 }}>Email import runs will appear here once the service runs.</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                {[
                  'Task Name', 'Status', 'Start Date', 'End Date',
                  'Total Count', 'Error Count', 'Warning Count', 'Current Count',
                  'Last Activity Date', 'Last Poll Date'
                ].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const sc = STATUS_COLORS[row.status] || STATUS_COLORS.warning
                return (
                  <tr key={row.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--surface)' : 'var(--bg)' }}>
                    <td style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{row.task_name || 'Email Import'}</td>
                    <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                      <span style={{ background: sc.bg, color: sc.color, padding: '2px 10px', borderRadius: 12, fontWeight: 600, fontSize: 11 }}>
                        {sc.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDateIST(row.start_at)}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDateIST(row.end_at)}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{row.total_count ?? '—'}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{row.error_count ?? '—'}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{row.warning_count ?? '—'}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{row.current_count ?? '—'}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDateIST(row.last_activity_at)}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDateIST(row.last_poll_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!loading && total > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--border)', background: 'var(--surface)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 4 }}>Rows per page:</span>
          {[10, 20, 50].map(ps => (
            <button key={ps} onClick={() => onPageSizeChange(ps)}
              style={{ padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, cursor: 'pointer', background: pageSize === ps ? 'var(--primary)' : 'var(--surface)', color: pageSize === ps ? '#fff' : 'var(--text-primary)', fontWeight: pageSize === ps ? 700 : 400 }}>
              {ps}
            </button>
          ))}

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={() => onPageChange(1)} disabled={page === 1}
              style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, cursor: page === 1 ? 'default' : 'pointer', opacity: page === 1 ? 0.4 : 1, background: 'var(--surface)' }}>«</button>
            <button onClick={() => onPageChange(page - 1)} disabled={page === 1}
              style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, cursor: page === 1 ? 'default' : 'pointer', opacity: page === 1 ? 0.4 : 1, background: 'var(--surface)' }}>‹</button>
            {pages.map(p => (
              <button key={p} onClick={() => onPageChange(p)}
                style={{ padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, cursor: 'pointer', background: p === page ? 'var(--primary)' : 'var(--surface)', color: p === page ? '#fff' : 'var(--text-primary)', fontWeight: p === page ? 700 : 400 }}>
                {p}
              </button>
            ))}
            <button onClick={() => onPageChange(page + 1)} disabled={page === totalPages}
              style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, cursor: page === totalPages ? 'default' : 'pointer', opacity: page === totalPages ? 0.4 : 1, background: 'var(--surface)' }}>›</button>
            <button onClick={() => onPageChange(totalPages)} disabled={page === totalPages}
              style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, cursor: page === totalPages ? 'default' : 'pointer', opacity: page === totalPages ? 0.4 : 1, background: 'var(--surface)' }}>»</button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 6 }}>Page {page} of {totalPages}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function SkeletonTab({ label }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: 'var(--text-muted)' }}>
      <div style={{ fontSize: 36 }}>🚧</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</div>
      <div style={{ fontSize: 13 }}>This section is under construction.</div>
    </div>
  )
}

const ADMIN_SECTIONS = [
  { group: 'General', items: [
    { key: 'sites',             label: 'Sites Setup',                     active: true  },
    { key: 'workflow',          label: 'Workflow Setup',                   active: true  },
    { key: 'source-types',      label: 'Source Types',                    active: true  },
    { key: 'picklists',         label: 'Picklists',                       active: true  },
    { key: 'email-accounts',    label: 'Email Accounts',                  active: true  },
    { key: 'case-numbering',    label: 'Case Numbering',                  active: true  },
    { key: 'data-protection',   label: 'Data Protection & Privacy Rules', active: false },
    { key: 'transmission-rules',label: 'Transmission Rules',              active: false },
    { key: 'other-configs',     label: 'Other Configurations',            active: false },
    { key: 'case-reporting',    label: 'Case Reporting',                  active: false },
    { key: 'help-system',       label: 'Help System',                     active: false },
    { key: 'ssp-setup',         label: 'SSP Setup',                       active: false },
  ]},
  { group: 'Product Setup', items: [
    { key: 'products',          label: 'Product Dictionary',              active: true  },
    { key: 'product-groups',    label: 'Product Groups',                  active: false },
  ]},
  { group: 'Form Configurations', items: [
    { key: 'field-setup',       label: 'Field Setup',                     active: true  },
    { key: 'case-form-def',     label: 'Case Form Definition',            active: true  },
    { key: 'custom-forms',      label: 'Custom Forms',                    active: false },
  ]},
  { group: 'Access Configurations', items: [
    { key: 'user-security',     label: 'User Security Groups',            active: true  },
    { key: 'user-config',       label: 'User Configuration',              active: true  },
  ]},
  { group: 'Contact Master', items: [
    { key: 'case-contacts',     label: 'Case Contacts Repository',        active: true  },
    { key: 'company-reps',      label: 'Company Representatives',         active: true  },
    { key: 'org-address-book',  label: 'Organisation Address Book',       active: false },
  ]},
  { group: 'Analytics', items: [
    { key: 'analytics-url',     label: 'Analytics URL',                   active: false },
    { key: 'analytics-reports', label: 'Analytics Master Reports',        active: false },
  ]},
  { group: 'Integration Setup', items: [
    { key: 'contacts-int',      label: 'Contacts Integration',            active: false },
    { key: 'mir-int',           label: 'MIR Integration',                 active: false },
    { key: 'crm-int',           label: 'CRM Integration Notification',    active: false },
    { key: 'content-int',       label: 'Content Integration',             active: false },
    { key: 'transmission-setup',label: 'Transmission Setup',              active: false },
  ]},
  { group: 'Audit Trail', items: [
    { key: 'audit-admin',       label: 'Admin Audit Trail',               active: true  },
    { key: 'audit-login',       label: 'Login Audit Trail',               active: true  },
  ]},
  { group: 'System', items: [
    { key: 'service-log',       label: 'Service Log',                     active: true  },
    { key: 'system-activity',   label: 'System Activity',                 active: true  },
  ]},
]

const MODULES = [
  { key: 'mims_core',     label: 'MIMS Core' },
  { key: 'inbox',          label: 'Inbox' },
  { key: 'case_mgmt',      label: 'Case Management' },
  { key: 'case_query',     label: 'Case Query' },
  { key: 'utilities',      label: 'Utilities' },
  { key: 'transmissions',  label: 'Transmissions' },
  { key: 'browse_content', label: 'Browse Content' },
  { key: 'analytics',      label: 'Analytics' },
  { key: 'user_mgmt',      label: 'User Management' },
  { key: 'admin_console',  label: 'Admin Console' },
  { key: 'content_mgmt',   label: 'Content Management' },
  { key: 'data_visualization', label: 'Data Visualization' },
]

const ROLES = ['admin', 'agent', 'reviewer', 'content_manager']
const ROLE_LABELS = { admin: 'Administrator', agent: 'MI Agent', reviewer: 'Reviewer', content_manager: 'Content Manager' }

export default function AdminConsolePage() {
  const { section: urlSection } = useParams()
  const navigate = useNavigate()
  const { token, user, orgId, orgName } = useAuth()
  const isSuperadmin = user?.role === 'superadmin'
  const [theme] = useState(() => localStorage.getItem('mims_theme') || 'light')

  const activeSection = SLUG_MAP[urlSection] || urlSection || ''
  const sectionLabel  = SECTION_LABELS[urlSection] || urlSection || 'Admin Console'

  // Data
  const [orgs, setOrgs] = useState([])
  const [sites, setSites] = useState({}) // keyed by org_id
  const [expandedOrg, setExpandedOrg] = useState(null)
  const [workflowStates, setWorkflowStates] = useState([])
  const [sourceTypes, setSourceTypes] = useState([])
  const [products, setProducts] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [loginAudit, setLoginAudit] = useState([])
  const [permissions, setPermissions] = useState([])
  const [users, setUsers] = useState([])

  // Service Log
  const [svcLogs, setSvcLogs] = useState([])
  const [svcSources, setSvcSources] = useState([])
  const [svcFilter, setSvcFilter] = useState({ source: '', status: '', date_from: '', date_to: '' })
  const [svcPage, setSvcPage] = useState(1)
  const [svcPageSize, setSvcPageSize] = useState(20)
  const [svcTotal, setSvcTotal] = useState(0)
  const [svcTotalPages, setSvcTotalPages] = useState(1)
  const [svcLoading, setSvcLoading] = useState(false)

  const [sysRows, setSysRows] = useState([])
  const [sysSummary, setSysSummary] = useState({ total: 0, success: 0, failed: 0, warning: 0 })
  const [sysFilter, setSysFilter] = useState({ task: 'Email Import', status: '', date_from: '' })
  const [sysPage, setSysPage] = useState(1)
  const [sysPageSize, setSysPageSize] = useState(20)
  const [sysTotal, setSysTotal] = useState(0)
  const [sysTotalPages, setSysTotalPages] = useState(1)
  const [sysLoading, setSysLoading] = useState(false)

  // Forms
  const [orgForm, setOrgForm] = useState({ name: '' })
  const [wfForm, setWfForm] = useState({ name: '' })
  const [srcForm, setSrcForm] = useState({ name: '' })
  const [productForm, setProductForm] = useState({ trade_name: '', org_id: '' })
  const [userForm, setUserForm] = useState({ name: '', email: '', password: '', role: 'agent', org_id: '' })
  const [esigAction, setEsigAction] = useState(null)
  const [esigForm, setEsigForm] = useState({ password: '', reason: '' })
  const [esigError, setEsigError] = useState('')
  const [auditFilter, setAuditFilter] = useState({ from: '', to: '', user: '', action: '', entity: '', entity_id: '' })
  const [loginFilter, setLoginFilter] = useState({ from: '', to: '', user: '' })
  const [msg, setMsg] = useState({ text: '', type: '' })

  // Email Accounts
  const [emailAccounts, setEmailAccounts] = useState([])
  const [emailModal, setEmailModal] = useState(null)
  const [emailEditTarget, setEmailEditTarget] = useState(null)
  const [emailForm, setEmailForm] = useState({
    org_id: '', account_name: '', provider: 'Generic', direction: 'Both',
    is_active: true, mailbox_email: '', from_email: '', display_name: '',
    is_default_outbound: false,
    imap_host: '', imap_port: '', imap_encryption: 'SSL/TLS',
    imap_username: '', imap_password: '',
    smtp_host: '', smtp_port: '', smtp_encryption: 'SSL/TLS',
    smtp_username: '', smtp_password: '',
    polling_interval_min: 5, initial_fetch_days: 7,
    mailbox_folder: 'INBOX', ingest_attachments: false, max_attachment_mb: 10
  })
  const [emailTestingId, setEmailTestingId] = useState(null)
  const [sendTestModalId, setSendTestModalId] = useState(null)
  const [sendTestRecipient, setSendTestRecipient] = useState('')
  const [smtpErrorModal, setSmtpErrorModal] = useState(null) // { account_name, error, tested_at }

  // ─── Picklists state ───────────────────────────────────────
  const [picklists, setPicklists] = useState([])
  const [picklistTotal, setPicklistTotal] = useState(0)
  const [picklistPage, setPicklistPage] = useState(1)
  const [picklistTotalPages, setPicklistTotalPages] = useState(1)
  const [picklistFilter, setPicklistFilter] = useState({ search: '', field_type: '', category: '', status: 'All' })
  const [picklistLoading, setPicklistLoading] = useState(false)
  const [picklistModal, setPicklistModal] = useState(null) // null | 'add' | 'edit'
  const [picklistEditTarget, setPicklistEditTarget] = useState(null)
  const [picklistForm, setPicklistForm] = useState({ name: '', category: 'General', field_type: '', value: '', description: '', status: 'Active' })
  const picklistUploadRef = useRef(null)

  // ─── Field Setup state ─────────────────────────────────────
  const [fieldSections, setFieldSections] = useState([]) // [{ section, fields: [...] }]
  const [activeFieldSection, setActiveFieldSection] = useState(null)
  const [fieldSetupLoading, setFieldSetupLoading] = useState(false)
  const [fieldSetupSaving, setFieldSetupSaving] = useState(false)
  const [showAddFlexField, setShowAddFlexField] = useState(false)
  const [flexFieldForm, setFlexFieldForm] = useState({ name: '', type: 'text', picklist_type: '' })

  // ─── Security Groups state ─────────────────────────────────
  const [secGroups, setSecGroups] = useState([])
  const [secGroupUsers, setSecGroupUsers] = useState([]) // users in selected group
  const [selectedSecGroup, setSelectedSecGroup] = useState(null)
  const [secGroupTab, setSecGroupTab] = useState('menu')
  const [secGroupLoading, setSecGroupLoading] = useState(false)
  const [secGroupForm, setSecGroupForm] = useState({ name: '', description: '', permissions: {} })
  const [secGroupAddUserVal, setSecGroupAddUserVal] = useState('')
  const [secGroupSaving, setSecGroupSaving] = useState(false)

  // ─── Case Numbering state (F-01) ──────────────────────────
  const [caseNumConfigs, setCaseNumConfigs] = useState([])
  const [caseNumLoading, setCaseNumLoading] = useState(false)
  const [caseNumSaving, setCaseNumSaving] = useState(false)
  const [caseNumOrgId, setCaseNumOrgId] = useState('')
  const [caseNumForm, setCaseNumForm] = useState({ case_type: 'ALL', prefix: 'CASE', separator: '-', include_year: true, include_month: false, seq_length: 5 })
  const [caseNumPreview, setCaseNumPreview] = useState('CASE-2026-00001')

  // ─── Case Form Definition state (F-02) ────────────────────
  const [caseFormDefCaseType, setCaseFormDefCaseType] = useState('MI')
  const [caseFormDefOrgId, setCaseFormDefOrgId] = useState('')
  const [caseFormDefSections, setCaseFormDefSections] = useState([])
  const [caseFormDefLoading, setCaseFormDefLoading] = useState(false)
  const [caseFormDefSaving, setCaseFormDefSaving] = useState(false)

  // ─── Site Detail Tab state (F-05) ─────────────────────────
  const [selectedSiteDetail, setSelectedSiteDetail] = useState(null) // { id, name, org_name }
  const [siteDetailTab, setSiteDetailTab] = useState('email')
  const [siteEmailAccounts, setSiteEmailAccounts] = useState([])
  const [siteEmailForm, setSiteEmailForm] = useState({ email: '', label: '', case_types: 'ALL' })
  const [siteResponseTemplate, setSiteResponseTemplate] = useState({ subject: '', body_html: '' })
  const [siteRetentionRules, setSiteRetentionRules] = useState([])
  const [siteRetentionForm, setSiteRetentionForm] = useState({ retention_days: 2555, regulation: 'GDPR', auto_delete_enabled: false, notes: '' })
  const [siteAlerts, setSiteAlerts] = useState([])
  const [siteAlertForm, setSiteAlertForm] = useState({ alert_type: 'Case Volume Spike', threshold_value: 10, notify_emails: '' })
  const [siteTabLoading, setSiteTabLoading] = useState(false)

  // ─── Sprint 7 Sites Setup redesign state ──────────────────
  const [sitesList, setSitesList]           = useState([])
  const [sitesLoading, setSitesLoading]     = useState(false)
  const [sitesSearch, setSitesSearch]       = useState('')
  const [showNewSiteForm, setShowNewSiteForm] = useState(false)
  const [newSiteForm, setNewSiteForm]       = useState({ org_id: '', name: '', abbreviation: '', country: '', is_primary: false })
  const [newSiteSaving, setNewSiteSaving]   = useState(false)
  const [selectedSite, setSelectedSite]     = useState(null)
  const [siteMainTab, setSiteMainTab]       = useState('general')
  const [siteEmailPurposes, setSiteEmailPurposes] = useState({ response: [], transmissions: [], correspondence: [], fax: [] })
  const [siteEmailPurposeSaving, setSiteEmailPurposeSaving] = useState(false)
  const [siteGeneralSaving, setSiteGeneralSaving] = useState(false)
  const [siteGeneralForm, setSiteGeneralForm] = useState({ name: '', abbreviation: '', country: '', is_primary: false, is_active: true })

  // ─── Contact Master state ──────────────────────────────────
  const [contactTab, setContactTab] = useState('contacts') // 'contacts' | 'reps'
  const [contacts, setContacts] = useState([])
  const [contactsLoading, setContactsLoading] = useState(false)
  const [contactSearch, setContactSearch] = useState('')
  const [contactTypeFilter, setContactTypeFilter] = useState('')
  const [contactModal, setContactModal] = useState(null)
  const [contactEditTarget, setContactEditTarget] = useState(null)
  const [contactForm, setContactForm] = useState({ first_name: '', last_name: '', specialty: '', institution: '', email: '', phone: '', type: 'HCP', organization: '', notes: '', address: '', do_not_update_master: false })
  const [companyReps, setCompanyReps] = useState([])
  const [repsLoading, setRepsLoading] = useState(false)
  const [repSearch, setRepSearch] = useState('')
  const [repModal, setRepModal] = useState(null)
  const [repEditTarget, setRepEditTarget] = useState(null)
  const [repForm, setRepForm] = useState({ name: '', title: '', territory: '', email: '', phone: '', organization: '' })

  // F-07: Product Dictionary sub-tabs
  const [productTab, setProductTab] = useState('products')
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [productApprovals, setProductApprovals] = useState([])
  const [productCountryAuths, setProductCountryAuths] = useState([])
  const [approvalForm, setApprovalForm] = useState({ approval_number: '', regulatory_body: '', approval_date: '', expiry_date: '', status: 'Active' })
  const [approvalModal, setApprovalModal] = useState(null)
  const [approvalEditTarget, setApprovalEditTarget] = useState(null)
  const [countryAuthForm, setCountryAuthForm] = useState({ country: '', auth_number: '', auth_date: '', status: 'Active' })
  const [countryAuthModal, setCountryAuthModal] = useState(null)
  const [countryAuthEditTarget, setCountryAuthEditTarget] = useState(null)

  // F-12: Workflow Activity Triggers sub-tabs
  const [wfTab, setWfTab] = useState('states')
  const [wfActivities, setWfActivities] = useState([])
  const [wfTriggers, setWfTriggers] = useState([])
  const [triggersLoading, setTriggersLoading] = useState(false)
  const [triggerForm, setTriggerForm] = useState({ activity_id: '', trigger_type: 'change_state', target_state_id: '', alert_rule: '', assign_to: '' })
  const [triggerModal, setTriggerModal] = useState(null)
  const [triggerEditTarget, setTriggerEditTarget] = useState(null)

  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('mims_theme', theme)
  }, [theme])

  useEffect(() => { loadAll() }, [])

  useEffect(() => {
    if (activeSection === 'audit-login')        loadLoginAudit()
    if (activeSection === 'audit-admin')        loadAuditLogs()
    if (activeSection === 'email-accounts')     loadEmailAccounts()
    if (activeSection === 'sites')              { loadAllSites(); loadEmailAccounts() }
    if (activeSection === 'service-log')        loadServiceLogs()
    if (activeSection === 'system-activity')    loadSystemActivity()
    if (activeSection === 'picklists')          loadPicklists()
    if (activeSection === 'field-setup')        loadFieldSetup()
    if (activeSection === 'user-security-groups') loadSecGroups()
    if (activeSection === 'contact-master')     { loadContacts(); loadCompanyReps() }
    if (activeSection === 'workflow')           { loadWfActivities(); loadWfTriggers() }
    if (activeSection === 'case-numbering')     loadCaseNumConfigs()
    if (activeSection === 'case-form-def')      loadCaseFormDef(caseFormDefCaseType, caseFormDefOrgId)
  }, [activeSection])

  async function loadAll() {
    try {
      const [o, wf, src, p, a, perm, u] = await Promise.all([
        fetch('/api/admin/orgs', { headers: H }).then(r => r.json()).catch(() => ({ orgs: [] })),
        fetch('/api/admin/workflow-states', { headers: H }).then(r => r.json()).catch(() => ({ states: [] })),
        fetch('/api/admin/source-types', { headers: H }).then(r => r.json()).catch(() => ({ sources: [] })),
        fetch('/api/admin/products', { headers: H }).then(r => r.json()).catch(() => ({ products: [] })),
        fetch('/api/admin/audit-logs', { headers: H }).then(r => r.json()).catch(() => ({ logs: [] })),
        fetch('/api/admin/permissions', { headers: H }).then(r => r.json()).catch(() => ({ permissions: [] })),
        fetch('/api/admin/users', { headers: H }).then(r => r.json()).catch(() => ({ users: [] })),
      ])
      setOrgs(o.orgs || [])
      setWorkflowStates(wf.states || [])
      setSourceTypes(src.sources || [])
      setProducts(p.products || [])
      setAuditLogs(a.logs || [])
      setPermissions(perm.permissions || [])
      setUsers(u.users || [])
    } catch (err) {
      flash('Failed to load admin data. Please refresh.', 'error')
    }
  }

  // ── F-01 Case Number Config ────────────────────────────────
  async function loadCaseNumConfigs() {
    setCaseNumLoading(true)
    try {
      const d = await fetch('/api/admin/case-number-config', { headers: H }).then(r => r.json())
      setCaseNumConfigs(d.configs || [])
    } catch { flash('Failed to load case number configs.', 'error') }
    finally { setCaseNumLoading(false) }
  }

  async function saveCaseNumConfig(e) {
    e.preventDefault()
    setCaseNumSaving(true)
    try {
      const payload = { ...caseNumForm, org_id: caseNumOrgId || null }
      const res = await fetch('/api/admin/case-number-config', { method: 'POST', headers: H, body: JSON.stringify(payload) })
      const d = await res.json()
      if (!res.ok) return flash(d.error, 'error')
      flash('Case number config saved.', 'success')
      loadCaseNumConfigs()
    } catch { flash('Save failed.', 'error') }
    finally { setCaseNumSaving(false) }
  }

  async function refreshCaseNumPreview() {
    const { prefix, separator, include_year, include_month, seq_length } = caseNumForm
    const params = new URLSearchParams({ prefix, separator, include_year: include_year ? 1 : 0, include_month: include_month ? 1 : 0, seq_length })
    try {
      const d = await fetch(`/api/admin/case-number-config/preview?${params}`, { headers: H }).then(r => r.json())
      setCaseNumPreview(d.preview || '')
    } catch { /* silent */ }
  }

  async function deleteCaseNumConfig(id) {
    if (!window.confirm('Delete this configuration?')) return
    const res = await fetch(`/api/admin/case-number-config/${id}`, { method: 'DELETE', headers: H })
    if (res.ok) { flash('Deleted.', 'success'); loadCaseNumConfigs() }
    else { const d = await res.json(); flash(d.error, 'error') }
  }

  // ── F-02 Case Form Definition ─────────────────────────────
  async function loadCaseFormDef(caseType, orgId) {
    setCaseFormDefLoading(true)
    try {
      const params = new URLSearchParams({ case_type: caseType, ...(orgId ? { org_id: orgId } : {}) })
      const d = await fetch(`/api/admin/case-form-definition?${params}`, { headers: H }).then(r => r.json())
      setCaseFormDefSections(d.sections || [])
    } catch { flash('Failed to load form definition.', 'error') }
    finally { setCaseFormDefLoading(false) }
  }

  async function saveCaseFormDef() {
    setCaseFormDefSaving(true)
    try {
      const res = await fetch('/api/admin/case-form-definition', {
        method: 'POST', headers: H,
        body: JSON.stringify({ case_type: caseFormDefCaseType, org_id: caseFormDefOrgId || null, sections: caseFormDefSections })
      })
      const d = await res.json()
      if (!res.ok) return flash(d.error, 'error')
      flash(`Saved ${d.saved} sections.`, 'success')
    } catch { flash('Save failed.', 'error') }
    finally { setCaseFormDefSaving(false) }
  }

  // ── F-05 Site Detail Tabs ─────────────────────────────────
  async function openSiteDetail(site) {
    setSelectedSiteDetail(site)
    setSiteDetailTab('email')
    loadSiteTab('email', site.id)
  }

  async function loadSiteTab(tab, siteId) {
    setSiteTabLoading(true)
    try {
      if (tab === 'email') {
        const d = await fetch(`/api/admin/sites/${siteId}/email-accounts`, { headers: H }).then(r => r.json())
        setSiteEmailAccounts(d.emailAccounts || [])
      } else if (tab === 'response') {
        const d = await fetch(`/api/admin/sites/${siteId}/response-template`, { headers: H }).then(r => r.json())
        setSiteResponseTemplate(d.template || { subject: '', body_html: '' })
      } else if (tab === 'retention') {
        const d = await fetch(`/api/admin/sites/${siteId}/data-retention`, { headers: H }).then(r => r.json())
        setSiteRetentionRules(d.rules || [])
      } else if (tab === 'alerts') {
        const d = await fetch(`/api/admin/sites/${siteId}/alerts`, { headers: H }).then(r => r.json())
        setSiteAlerts(d.alerts || [])
      }
    } catch { /* silent */ }
    finally { setSiteTabLoading(false) }
  }

  function switchSiteTab(tab) {
    setSiteDetailTab(tab)
    if (selectedSiteDetail) loadSiteTab(tab, selectedSiteDetail.id)
  }

  async function addSiteEmailAccount(e) {
    e.preventDefault()
    const res = await fetch(`/api/admin/sites/${selectedSiteDetail.id}/email-accounts`, { method: 'POST', headers: H, body: JSON.stringify(siteEmailForm) })
    const d = await res.json()
    if (!res.ok) return flash(d.error, 'error')
    setSiteEmailAccounts(prev => [...prev, d.emailAccount])
    setSiteEmailForm({ email: '', label: '', case_types: 'ALL' })
    flash('Email account added.', 'success')
  }

  async function deleteSiteEmailAccount(accountId) {
    if (!window.confirm('Delete this site email account?')) return
    const res = await fetch(`/api/admin/sites/${selectedSiteDetail.id}/email-accounts/${accountId}`, { method: 'DELETE', headers: H })
    if (res.ok) { setSiteEmailAccounts(prev => prev.filter(a => a.id !== accountId)); flash('Removed.', 'success') }
  }

  async function saveSiteResponseTemplate(e) {
    e.preventDefault()
    const res = await fetch(`/api/admin/sites/${selectedSiteDetail.id}/response-template`, { method: 'PUT', headers: H, body: JSON.stringify(siteResponseTemplate) })
    const d = await res.json()
    if (!res.ok) return flash(d.error, 'error')
    setSiteResponseTemplate(d.template)
    flash('Response template saved.', 'success')
  }

  async function saveSiteRetention(e) {
    e.preventDefault()
    const res = await fetch(`/api/admin/sites/${selectedSiteDetail.id}/data-retention`, { method: 'PUT', headers: H, body: JSON.stringify(siteRetentionForm) })
    const d = await res.json()
    if (!res.ok) return flash(d.error, 'error')
    setSiteRetentionRules(d.rules)
    flash('Data retention rule saved.', 'success')
  }

  async function addSiteAlert(e) {
    e.preventDefault()
    const res = await fetch(`/api/admin/sites/${selectedSiteDetail.id}/alerts`, { method: 'POST', headers: H, body: JSON.stringify(siteAlertForm) })
    const d = await res.json()
    if (!res.ok) return flash(d.error, 'error')
    setSiteAlerts(prev => [...prev, d.alert])
    setSiteAlertForm({ alert_type: 'Case Volume Spike', threshold_value: 10, notify_emails: '' })
    flash('Alert added.', 'success')
  }

  async function deleteSiteAlert(alertId) {
    if (!window.confirm('Delete this site alert?')) return
    const res = await fetch(`/api/admin/sites/${selectedSiteDetail.id}/alerts/${alertId}`, { method: 'DELETE', headers: H })
    if (res.ok) { setSiteAlerts(prev => prev.filter(a => a.id !== alertId)); flash('Deleted.', 'success') }
  }

  async function loadServiceLogs(overrides = {}) {
    setSvcLoading(true)
    try {
      const params = new URLSearchParams({
        ...svcFilter,
        page: overrides.page ?? svcPage,
        page_size: overrides.page_size ?? svcPageSize,
      })
      // strip empty values so API doesn't filter on them
      for (const [k, v] of [...params.entries()]) { if (!v) params.delete(k) }
      const d = await fetch(`/api/admin/service-logs?${params}`, { headers: H }).then(r => r.json())
      setSvcLogs(d.data || [])
      setSvcSources(d.sources || [])
      setSvcTotal(d.total || 0)
      setSvcTotalPages(d.total_pages || 1)
    } catch {
      /* silent — table might not exist yet on fresh DB before restart */
    } finally {
      setSvcLoading(false)
    }
  }

  async function loadSystemActivity(overrides = {}) {
    setSysLoading(true)
    try {
      const params = new URLSearchParams({
        ...sysFilter,
        page: overrides.page ?? sysPage,
        page_size: overrides.page_size ?? sysPageSize,
      })
      for (const [k, v] of [...params.entries()]) { if (!v) params.delete(k) }
      const d = await fetch(`/api/admin/system-activity?${params}`, { headers: H }).then(r => r.json())
      setSysRows(d.data || [])
      setSysSummary(d.summary || { total: 0, success: 0, failed: 0, warning: 0 })
      setSysTotal(d.total || 0)
      setSysTotalPages(d.total_pages || 1)
    } catch {
      /* silent — table might not exist yet on fresh DB before restart */
    } finally {
      setSysLoading(false)
    }
  }

  async function loadSites(orgId) {
    const d = await fetch(`/api/admin/orgs/${orgId}/sites`, { headers: H }).then(r => r.json())
    setSites(prev => ({ ...prev, [orgId]: d.sites || [] }))
  }

  // ── Sprint 7 Sites Setup ────────────────────────────────────
  async function loadAllSites() {
    setSitesLoading(true)
    try {
      const d = await fetch('/api/admin/sites', { headers: H }).then(r => r.json())
      setSitesList(d.sites || [])
    } catch { flash('Failed to load sites.', 'error') }
    finally { setSitesLoading(false) }
  }

  async function createNewSite(e) {
    e.preventDefault()
    setNewSiteSaving(true)
    try {
      const res = await fetch('/api/admin/sites', { method: 'POST', headers: H, body: JSON.stringify(newSiteForm) })
      const d = await res.json()
      if (!res.ok) return flash(d.error || 'Create failed.', 'error')
      flash('Site created.', 'success')
      setShowNewSiteForm(false)
      setNewSiteForm({ org_id: '', name: '', abbreviation: '', country: '', is_primary: false })
      await loadAllSites()
    } catch { flash('Save failed.', 'error') }
    finally { setNewSiteSaving(false) }
  }

  async function selectSiteForConfig(site) {
    setSelectedSite(site)
    setSiteMainTab('general')
    setSiteGeneralForm({
      name: site.name || '',
      abbreviation: site.abbreviation || '',
      country: site.country || '',
      is_primary: !!site.is_primary,
      is_active: site.is_active !== undefined ? !!site.is_active : true,
    })
    await loadSiteEmailPurposes(site.id)
    // load response template + retention + alerts for other tabs when switched
    loadSiteTab('response', site.id)
    loadSiteTab('retention', site.id)
    loadSiteTab('alerts', site.id)
  }

  async function loadSiteEmailPurposes(siteId) {
    try {
      const d = await fetch(`/api/admin/sites/${siteId}/email-purpose`, { headers: H }).then(r => r.json())
      const map = { response: [], transmissions: [], correspondence: [], fax: [] }
      for (const row of (d.purposes || [])) {
        if (map[row.purpose] !== undefined) map[row.purpose].push(row.email_account_id)
      }
      setSiteEmailPurposes(map)
    } catch { /* silent */ }
  }

  async function saveSiteEmailPurposes() {
    if (!selectedSite) return
    setSiteEmailPurposeSaving(true)
    try {
      const assignments = Object.entries(siteEmailPurposes).map(([purpose, ids]) => ({
        purpose,
        email_account_ids: ids,
      }))
      const res = await fetch(`/api/admin/sites/${selectedSite.id}/email-purpose`, {
        method: 'PUT', headers: H, body: JSON.stringify({ assignments }),
      })
      const d = await res.json()
      if (!res.ok) return flash(d.error || 'Save failed.', 'error')
      flash('Email account assignments saved.', 'success')
    } catch { flash('Save failed.', 'error') }
    finally { setSiteEmailPurposeSaving(false) }
  }

  async function saveSiteGeneral(e) {
    e.preventDefault()
    if (!selectedSite) return
    setSiteGeneralSaving(true)
    try {
      const res = await fetch(`/api/admin/sites/${selectedSite.id}`, {
        method: 'PUT', headers: H, body: JSON.stringify(siteGeneralForm),
      })
      const d = await res.json()
      if (!res.ok) return flash(d.error || 'Save failed.', 'error')
      flash('Site updated.', 'success')
      await loadAllSites()
      setSelectedSite(prev => ({ ...prev, ...siteGeneralForm }))
    } catch { flash('Save failed.', 'error') }
    finally { setSiteGeneralSaving(false) }
  }

  async function loadAuditLogs() {
    const params = new URLSearchParams(auditFilter).toString()
    const d = await fetch(`/api/admin/audit-logs?${params}`, { headers: H }).then(r => r.json())
    setAuditLogs(d.logs || [])
  }

  async function loadLoginAudit() {
    const params = new URLSearchParams(loginFilter).toString()
    const d = await fetch(`/api/admin/login-audit?${params}`, { headers: H }).then(r => r.json())
    setLoginAudit(d.logs || [])
  }

  // ─── Picklists loaders ─────────────────────────────────────

  async function loadPicklists(overrides = {}) {
    setPicklistLoading(true)
    try {
      const params = new URLSearchParams({
        status: overrides.status ?? picklistFilter.status ?? 'All',
        page: overrides.page ?? picklistPage,
        limit: 20,
        search: overrides.search ?? picklistFilter.search ?? '',
        field_type: overrides.field_type ?? picklistFilter.field_type ?? '',
      })
      const res = await fetch(`/api/admin/picklists?${params}`, { headers: H })
      const d = await res.json()
      setPicklists(d.data || d.picklists || [])
      setPicklistTotal(d.total || 0)
      setPicklistTotalPages(d.total_pages || 1)
    } catch { /* silent */ } finally { setPicklistLoading(false) }
  }

  async function savePicklist(e) {
    e.preventDefault()
    const isEdit = picklistModal === 'edit'
    const url = isEdit ? `/api/admin/picklists/${picklistEditTarget.id}` : '/api/admin/picklists'
    const res = await fetch(url, { method: isEdit ? 'PUT' : 'POST', headers: H, body: JSON.stringify(picklistForm) })
    const d = await res.json()
    if (!res.ok) return flash(d.error || 'Save failed.', 'error')
    await loadPicklists()
    setPicklistModal(null)
    flash(isEdit ? 'Picklist updated.' : 'Picklist created.')
  }

  async function deletePicklist(row) {
    if (!window.confirm(`Delete picklist "${row.name}"?`)) return
    const res = await fetch(`/api/admin/picklists/${row.id}`, { method: 'DELETE', headers: H })
    const d = await res.json()
    if (!res.ok) return flash(d.error || 'Delete failed.', 'error')
    await loadPicklists()
    flash('Picklist deactivated.')
  }

  async function exportPicklistsXlsx() {
    try {
      const res = await fetch('/api/admin/picklists/export', { headers: H })
      const data = await res.json()
      const rows = data.data || data || []
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.json_to_sheet(rows)
      XLSX.utils.book_append_sheet(wb, ws, 'Picklists')
      XLSX.writeFile(wb, 'picklists_export.xlsx')
    } catch { flash('Export failed.', 'error') }
  }

  async function uploadPicklistsXlsx(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async ev => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws)
        const res = await fetch('/api/admin/picklists/bulk', { method: 'POST', headers: H, body: JSON.stringify(rows) })
        const d = await res.json()
        if (!res.ok) return flash(d.error || 'Upload failed.', 'error')
        await loadPicklists()
        flash(`Uploaded ${rows.length} picklist rows.`)
      } catch { flash('Failed to parse file.', 'error') }
    }
    reader.readAsBinaryString(file)
    e.target.value = ''
  }

  // ─── Field Setup loaders ───────────────────────────────────

  async function loadFieldSetup() {
    setFieldSetupLoading(true)
    try {
      const res = await fetch('/api/admin/field-setup', { headers: H })
      const d = await res.json()
      const grouped = d.grouped || {}
      const sections = Object.entries(grouped).map(([section, fields]) => ({ section, fields }))
      setFieldSections(sections)
      if (sections.length > 0 && !activeFieldSection) setActiveFieldSection(sections[0].section)
    } catch { /* silent */ } finally { setFieldSetupLoading(false) }
  }

  async function saveFieldSetup() {
    setFieldSetupSaving(true)
    try {
      const allFields = fieldSections.flatMap(s => s.fields)
      const res = await fetch('/api/admin/field-setup', { method: 'PUT', headers: H, body: JSON.stringify({ fields: allFields }) })
      const d = await res.json()
      if (!res.ok) return flash(d.error || 'Save failed.', 'error')
      flash('Field setup saved.')
    } catch { flash('Save failed.', 'error') } finally { setFieldSetupSaving(false) }
  }

  function updateFieldProp(sectionName, fieldId, prop, value) {
    setFieldSections(prev => prev.map(s => {
      if (s.section !== sectionName) return s
      return { ...s, fields: s.fields.map(f => f.id === fieldId ? { ...f, [prop]: value } : f) }
    }))
  }

  function addFlexField() {
    if (!flexFieldForm.name) return flash('Field name required.', 'error')
    setFieldSections(prev => prev.map(s => {
      if (s.section !== activeFieldSection) return s
      const newField = { id: `flex_${Date.now()}`, field_name: flexFieldForm.name, field_type: flexFieldForm.type, picklist_type: flexFieldForm.picklist_type, is_required: 0, is_hidden: 0, is_disabled: 0, custom_label: '', is_flex: true }
      return { ...s, fields: [...s.fields, newField] }
    }))
    setFlexFieldForm({ name: '', type: 'text', picklist_type: '' })
    setShowAddFlexField(false)
  }

  // ─── Security Groups loaders ───────────────────────────────

  async function loadSecGroups() {
    setSecGroupLoading(true)
    try {
      const res = await fetch('/api/admin/security-groups', { headers: H })
      const d = await res.json()
      setSecGroups(d.groups || [])
    } catch { /* silent */ } finally { setSecGroupLoading(false) }
  }

  async function selectSecGroup(grp) {
    setSelectedSecGroup(grp)
    setSecGroupTab('menu')
    setSecGroupForm({ name: grp.name, description: grp.description || '', permissions: grp.privileges || {} })
    try {
      const res = await fetch(`/api/admin/security-groups/${grp.id}`, { headers: H })
      const d = await res.json()
      setSecGroupUsers(d.members || [])
    } catch { setSecGroupUsers([]) }
  }

  async function createSecGroup() {
    const res = await fetch('/api/admin/security-groups', { method: 'POST', headers: H, body: JSON.stringify({ name: 'New Group', description: '' }) })
    const d = await res.json()
    if (!res.ok) return flash(d.error || 'Create failed.', 'error')
    await loadSecGroups()
    flash('Group created.')
  }

  async function saveSecGroup() {
    if (!selectedSecGroup) return
    setSecGroupSaving(true)
    try {
      const res = await fetch(`/api/admin/security-groups/${selectedSecGroup.id}`, { method: 'PUT', headers: H, body: JSON.stringify({ name: secGroupForm.name, description: secGroupForm.description, privileges: secGroupForm.permissions }) })
      const d = await res.json()
      if (!res.ok) return flash(d.error || 'Save failed.', 'error')
      await loadSecGroups()
      flash('Group saved.')
    } catch { flash('Save failed.', 'error') } finally { setSecGroupSaving(false) }
  }

  async function deleteSecGroup() {
    if (!selectedSecGroup) return
    if (!window.confirm(`Delete security group "${selectedSecGroup.name}"?`)) return
    const res = await fetch(`/api/admin/security-groups/${selectedSecGroup.id}`, { method: 'DELETE', headers: H })
    const d = await res.json()
    if (!res.ok) return flash(d.error || 'Delete failed.', 'error')
    setSelectedSecGroup(null)
    setSecGroupUsers([])
    await loadSecGroups()
    flash('Group deleted.')
  }

  async function addUserToSecGroup() {
    if (!secGroupAddUserVal || !selectedSecGroup) return
    const res = await fetch(`/api/admin/security-groups/${selectedSecGroup.id}/users`, { method: 'POST', headers: H, body: JSON.stringify({ user_id: secGroupAddUserVal }) })
    const d = await res.json()
    if (!res.ok) return flash(d.error || 'Failed to add user.', 'error')
    const added = users.find(u => String(u.id) === String(secGroupAddUserVal))
    if (added) setSecGroupUsers(prev => [...prev, added])
    setSecGroupAddUserVal('')
    flash('User added to group.')
  }

  async function removeUserFromSecGroup(userId) {
    if (!selectedSecGroup) return
    if (!window.confirm('Remove this user from selected security group?')) return
    const res = await fetch(`/api/admin/security-groups/${selectedSecGroup.id}/users/${userId}`, { method: 'DELETE', headers: H })
    const d = await res.json()
    if (!res.ok) return flash(d.error || 'Failed to remove user.', 'error')
    setSecGroupUsers(prev => prev.filter(u => u.id !== userId))
    flash('User removed from group.')
  }

  function toggleSecGroupPerm(key) {
    setSecGroupForm(f => ({ ...f, permissions: { ...f.permissions, [key]: !f.permissions[key] } }))
  }

  // ─── Contact Master loaders ────────────────────────────────

  async function loadContacts(search = contactSearch, type = contactTypeFilter) {
    setContactsLoading(true)
    try {
      const params = new URLSearchParams({ search, type })
      const res = await fetch(`/api/admin/contacts?${params}`, { headers: H })
      const d = await res.json()
      setContacts(d.contacts || [])
    } catch { /* silent */ } finally { setContactsLoading(false) }
  }

  async function saveContact(e) {
    e.preventDefault()
    const isEdit = contactModal === 'edit'
    const url = isEdit ? `/api/admin/contacts/${contactEditTarget.id}` : '/api/admin/contacts'
    const res = await fetch(url, { method: isEdit ? 'PUT' : 'POST', headers: H, body: JSON.stringify(contactForm) })
    const d = await res.json()
    if (!res.ok) return flash(d.error || 'Save failed.', 'error')
    await loadContacts()
    setContactModal(null)
    flash(isEdit ? 'Contact updated.' : 'Contact created.')
  }

  async function deleteContact(c) {
    const contactName = `${c.first_name || ''} ${c.last_name || ''}`.trim() || `#${c.id}`
    if (!window.confirm(`Delete contact "${contactName}"?`)) return
    const res = await fetch(`/api/admin/contacts/${c.id}`, { method: 'DELETE', headers: H })
    const d = await res.json()
    if (!res.ok) return flash(d.error || 'Delete failed.', 'error')
    setContacts(prev => prev.filter(x => x.id !== c.id))
    flash('Contact deleted.')
  }

  async function loadCompanyReps(search = repSearch) {
    setRepsLoading(true)
    try {
      const params = new URLSearchParams({ search })
      const res = await fetch(`/api/admin/company-reps?${params}`, { headers: H })
      const d = await res.json()
      setCompanyReps(d.reps || [])
    } catch { /* silent */ } finally { setRepsLoading(false) }
  }

  async function saveRep(e) {
    e.preventDefault()
    const isEdit = repModal === 'edit'
    const url = isEdit ? `/api/admin/company-reps/${repEditTarget.id}` : '/api/admin/company-reps'
    const res = await fetch(url, { method: isEdit ? 'PUT' : 'POST', headers: H, body: JSON.stringify(repForm) })
    const d = await res.json()
    if (!res.ok) return flash(d.error || 'Save failed.', 'error')
    await loadCompanyReps()
    setRepModal(null)
    flash(isEdit ? 'Rep updated.' : 'Rep created.')
  }

  async function deleteRep(r) {
    if (!window.confirm(`Delete representative "${r.name}"?`)) return
    const res = await fetch(`/api/admin/company-reps/${r.id}`, { method: 'DELETE', headers: H })
    const d = await res.json()
    if (!res.ok) return flash(d.error || 'Delete failed.', 'error')
    setCompanyReps(prev => prev.filter(x => x.id !== r.id))
    flash('Rep deleted.')
  }

  function flash(text, type = 'success') {
    setMsg({ text, type })
    setTimeout(() => setMsg({ text: '', type: '' }), 5000) // Fix: extended to 5s
  }

  // ESIG-01: Trigger electronic signature modal for critical actions
  function esigConfirm(msg, entity, entityId, onConfirm) {
    setEsigForm({ password: '', reason: '' })
    setEsigError('')
    setEsigAction({ msg, entity, entityId, onConfirm })
  }

  // ─── Email Account Handlers ────────────────────────────────

  async function readJson(res) {
    // Avoid crashing on HTML/empty responses (e.g. proxy/backend down).
    const text = await res.text()
    try { return JSON.parse(text) } catch { return { error: text || `HTTP ${res.status}` } }
  }

  function getDefaultEmailForm(overrides = {}) {
    return {
      org_id: isSuperadmin ? '' : String(orgId || ''),
      account_name: '',
      provider: 'Generic',
      direction: 'Both',
      is_active: true,
      mailbox_email: '',
      from_email: '',
      display_name: '',
      is_default_outbound: false,
      imap_host: '',
      imap_port: '',
      imap_encryption: 'SSL/TLS',
      imap_username: '',
      imap_password: '',
      smtp_host: '',
      smtp_port: '',
      smtp_encryption: 'SSL/TLS',
      smtp_username: '',
      smtp_password: '',
      polling_interval_min: 5,
      initial_fetch_days: 7,
      mailbox_folder: 'INBOX',
      ingest_attachments: false,
      max_attachment_mb: 10,
      ...overrides,
    }
  }

  async function loadEmailAccounts() {
    try {
      const res = await fetch('/api/admin/email-accounts', { headers: H })
      const d = await readJson(res)
      if (!res.ok) { setEmailAccounts([]); return }
      setEmailAccounts(d.accounts || [])
    } catch {
      setEmailAccounts([])
    }
  }

  function applyProviderPreset(provider) {
    const presets = {
      Gmail: { imap_host: 'imap.gmail.com', imap_port: 993, imap_encryption: 'SSL/TLS', smtp_host: 'smtp.gmail.com', smtp_port: 465, smtp_encryption: 'SSL/TLS' },
      Microsoft365: { imap_host: 'outlook.office365.com', imap_port: 993, imap_encryption: 'SSL/TLS', smtp_host: 'smtp.office365.com', smtp_port: 587, smtp_encryption: 'STARTTLS' },
      Generic: {}
    }
    setEmailForm(f => ({ ...f, provider, ...(presets[provider] || {}) }))
  }

  function openAddEmailModal() {
    setEmailEditTarget(null)
    setEmailForm(getDefaultEmailForm())
    setEmailModal('add')
  }

  function openEditEmailModal(account) {
    setEmailEditTarget(account)
    setEmailForm(getDefaultEmailForm({
      ...account,
      org_id: String(account.org_id || orgId || ''),
      imap_password: '',
      smtp_password: '',
    }))
    setEmailModal('edit')
  }

  async function saveEmailAccount(e) {
    e.preventDefault()
    const isEdit = emailModal === 'edit'
    const url = isEdit ? `/api/admin/email-accounts/${emailEditTarget.id}` : '/api/admin/email-accounts'
    const res = await fetch(url, { method: isEdit ? 'PUT' : 'POST', headers: H, body: JSON.stringify(emailForm) })
    const d = await readJson(res)
    if (!res.ok) return flash(d.error || 'Request failed. Is the backend running on :3000?', 'error')
    await loadEmailAccounts()
    setEmailModal(null)
    flash(isEdit ? 'Email account updated.' : 'Email account created.')
  }

  async function toggleEmailAccount(account) {
    const res = await fetch(`/api/admin/email-accounts/${account.id}/toggle`, { method: 'PATCH', headers: H })
    const d = await readJson(res)
    if (!res.ok) return flash(d.error || 'Status update failed.', 'error')
    await loadEmailAccounts()
    flash(d.message || 'Email account status updated.')
  }

  async function deleteEmailAccount(account) {
    esigConfirm(`Delete email account "${account.account_name}"? This will remove credentials from storage.`, 'email_account', account.id, async () => {
      const res = await fetch(`/api/admin/email-accounts/${account.id}`, { method: 'DELETE', headers: H })
      const d = await readJson(res)
      if (!res.ok) return flash(d.error || 'Delete failed.', 'error')
      await loadEmailAccounts()
      flash(d.message || 'Email account deleted.')
    })
  }

  async function runEmailAction(account, action) {
    const actionLabel = action === 'fetch-now'
      ? 'fetch emails now'
      : action === 'test-imap'
        ? 'run IMAP test'
        : action === 'test-smtp'
          ? 'run SMTP test'
          : `run ${action}`
    if (!window.confirm(`Confirm to ${actionLabel} for "${account.account_name}"?`)) return
    const key = `${action}-${account.id}`
    setEmailTestingId(key)
    try {
      const res = await fetch(`/api/admin/email-accounts/${account.id}/${action}`, { method: 'POST', headers: H })
      const d = await readJson(res)
      if (!res.ok) {
        if (action === 'test-smtp') {
          setSmtpErrorModal({ account_name: account.account_name, error: d.error || 'SMTP test failed.', tested_at: 'Just now' })
        }
        return flash(d.error || 'Request failed.', 'error')
      }
      await loadEmailAccounts()
      if (action === 'fetch-now') {
        flash(`Fetch complete. ${d.ingested ?? 0} email(s) ingested.`)
      } else if (d.status === 'fail') {
        if (action === 'test-smtp') {
          setSmtpErrorModal({ account_name: account.account_name, error: d.error || 'SMTP test failed.', tested_at: d.tested_at || 'Just now' })
        }
        flash(`${action === 'test-imap' ? 'IMAP' : 'SMTP'} test failed.`, 'error')
      } else {
        flash(
          action === 'test-imap'
            ? 'IMAP test passed.'
            : action === 'test-smtp'
              ? 'SMTP test passed.'
              : 'Action completed.'
        )
      }
    } finally {
      setEmailTestingId(null)
    }
  }

  async function submitSendTest(e) {
    e.preventDefault()
    if (!sendTestModalId) return
    setEmailTestingId(`send-${sendTestModalId}`)
    try {
      const res = await fetch(`/api/admin/email-accounts/${sendTestModalId}/send-test`, {
        method: 'POST',
        headers: H,
        body: JSON.stringify({ recipient: sendTestRecipient }),
      })
      const d = await readJson(res)
      if (!res.ok || d.status === 'fail') {
        const account = emailAccounts.find(a => a.id === sendTestModalId)
        setSmtpErrorModal({
          account_name: account?.account_name || 'Email account',
          error: d.error || 'Send test failed.',
          tested_at: d.tested_at || 'Just now',
        })
        return flash(d.error || 'Send test failed.', 'error')
      }
      await loadEmailAccounts()
      setSendTestModalId(null)
      setSendTestRecipient('')
      flash('Test email sent successfully.')
    } finally {
      setEmailTestingId(null)
    }
  }


  // ─── CRUD Handlers ─────────────────────────────────────────

  async function createOrg(e) {
    e.preventDefault()
    const res = await fetch('/api/admin/orgs', { method: 'POST', headers: H, body: JSON.stringify(orgForm) })
    const d = await res.json()
    if (!res.ok) return flash(d.error, 'error')
    setOrgs(prev => [...prev, d])
    setOrgForm({ name: '' })
    flash('Organisation created.')
  }

  async function toggleExpandOrg(orgId) {
    if (expandedOrg === orgId) { setExpandedOrg(null); return }
    setExpandedOrg(orgId)
    if (!sites[orgId]) await loadSites(orgId)
  }

  async function createWf(e) {
    e.preventDefault()
    const res = await fetch('/api/admin/workflow-states', { method: 'POST', headers: H, body: JSON.stringify(wfForm) })
    const d = await res.json()
    if (!res.ok) return flash(d.error, 'error')
    setWorkflowStates(prev => [...prev, d])
    setWfForm({ name: '' })
    flash('Workflow state created.')
  }

  async function toggleWf(wf) {
    esigConfirm(`${wf.is_active ? 'Deactivate' : 'Activate'} workflow state "${wf.name}"`, 'workflow_state', wf.id, async () => {
      await fetch(`/api/admin/workflow-states/${wf.id}`, { method: 'PUT', headers: H, body: JSON.stringify({ name: wf.name, is_active: !wf.is_active }) })
      setWorkflowStates(prev => prev.map(w => w.id === wf.id ? { ...w, is_active: w.is_active ? 0 : 1 } : w))
      flash('Status updated.')
    })
  }

  async function createSrc(e) {
    e.preventDefault()
    const res = await fetch('/api/admin/source-types', { method: 'POST', headers: H, body: JSON.stringify(srcForm) })
    const d = await res.json()
    if (!res.ok) return flash(d.error, 'error')
    setSourceTypes(prev => [...prev, d])
    setSrcForm({ name: '' })
    flash('Source type created.')
  }

  async function toggleSrc(src) {
    esigConfirm(`${src.is_active ? 'Deactivate' : 'Activate'} source type "${src.name}"`, 'source_type', src.id, async () => {
      await fetch(`/api/admin/source-types/${src.id}`, { method: 'PUT', headers: H, body: JSON.stringify({ name: src.name, is_active: !src.is_active }) })
      setSourceTypes(prev => prev.map(s => s.id === src.id ? { ...s, is_active: s.is_active ? 0 : 1 } : s))
      flash('Status updated.')
    })
  }

  async function createProduct(e) {
    e.preventDefault()
    const res = await fetch('/api/admin/products', { method: 'POST', headers: H, body: JSON.stringify(productForm) })
    const d = await res.json()
    if (!res.ok) return flash(d.error, 'error')
    setProducts(prev => [...prev, d])
    setProductForm({ trade_name: '', org_id: '' })
    flash('Product created.')
  }

  // ─── F-07: Product Approvals handlers ────────────────────────────────────

  async function loadProductApprovals(productId) {
    try {
      const res = await fetch(`/api/admin/products/${productId}/approvals`, { headers: H })
      const d = await res.json()
      setProductApprovals(d.approvals || [])
    } catch { /* silent */ }
  }

  async function loadProductCountryAuths(productId) {
    try {
      const res = await fetch(`/api/admin/products/${productId}/country-authorizations`, { headers: H })
      const d = await res.json()
      setProductCountryAuths(d.authorizations || [])
    } catch { /* silent */ }
  }

  function selectProductForDetail(p) {
    setSelectedProduct(p)
    setProductTab('approvals')
    loadProductApprovals(p.id)
    loadProductCountryAuths(p.id)
  }

  async function saveApproval(e) {
    e.preventDefault()
    const isEdit = approvalModal === 'edit'
    const url = isEdit
      ? `/api/admin/products/approvals/${approvalEditTarget.id}`
      : `/api/admin/products/${selectedProduct.id}/approvals`
    const res = await fetch(url, { method: isEdit ? 'PUT' : 'POST', headers: H, body: JSON.stringify(approvalForm) })
    const d = await res.json()
    if (!res.ok) return flash(d.error || 'Save failed.', 'error')
    await loadProductApprovals(selectedProduct.id)
    setApprovalModal(null)
    flash(isEdit ? 'Approval updated.' : 'Approval created.')
  }

  async function deleteApproval(a) {
    if (!window.confirm(`Delete approval "${a.approval_number}"?`)) return
    await fetch(`/api/admin/products/approvals/${a.id}`, { method: 'DELETE', headers: H })
    await loadProductApprovals(selectedProduct.id)
    flash('Approval deleted.')
  }

  async function saveCountryAuth(e) {
    e.preventDefault()
    const isEdit = countryAuthModal === 'edit'
    const url = isEdit
      ? `/api/admin/products/country-authorizations/${countryAuthEditTarget.id}`
      : `/api/admin/products/${selectedProduct.id}/country-authorizations`
    const res = await fetch(url, { method: isEdit ? 'PUT' : 'POST', headers: H, body: JSON.stringify(countryAuthForm) })
    const d = await res.json()
    if (!res.ok) return flash(d.error || 'Save failed.', 'error')
    await loadProductCountryAuths(selectedProduct.id)
    setCountryAuthModal(null)
    flash(isEdit ? 'Authorization updated.' : 'Authorization created.')
  }

  async function deleteCountryAuth(a) {
    if (!window.confirm(`Delete authorization for "${a.country}"?`)) return
    await fetch(`/api/admin/products/country-authorizations/${a.id}`, { method: 'DELETE', headers: H })
    await loadProductCountryAuths(selectedProduct.id)
    flash('Authorization deleted.')
  }

  // ─── F-12: Workflow Activity Triggers handlers ────────────────────────────

  async function loadWfActivities() {
    try {
      const res = await fetch('/api/admin/workflow-activities', { headers: H })
      const d = await res.json()
      setWfActivities(d.activities || [])
    } catch { /* silent */ }
  }

  async function loadWfTriggers() {
    setTriggersLoading(true)
    try {
      const res = await fetch('/api/admin/workflow-activity-triggers', { headers: H })
      const d = await res.json()
      setWfTriggers(d.triggers || [])
    } catch { /* silent */ } finally { setTriggersLoading(false) }
  }

  async function saveTrigger(e) {
    e.preventDefault()
    const isEdit = triggerModal === 'edit'
    const url = isEdit ? `/api/admin/workflow-activity-triggers/${triggerEditTarget.id}` : '/api/admin/workflow-activity-triggers'
    const res = await fetch(url, { method: isEdit ? 'PUT' : 'POST', headers: H, body: JSON.stringify(triggerForm) })
    const d = await res.json()
    if (!res.ok) return flash(d.error || 'Save failed.', 'error')
    await loadWfTriggers()
    setTriggerModal(null)
    flash(isEdit ? 'Trigger updated.' : 'Trigger created.')
  }

  async function deleteTrigger(t) {
    if (!window.confirm(`Delete trigger for "${t.activity_name}" → ${t.trigger_type}?`)) return
    await fetch(`/api/admin/workflow-activity-triggers/${t.id}`, { method: 'DELETE', headers: H })
    await loadWfTriggers()
    flash('Trigger deleted.')
  }

  async function toggleWfActivity(act) {
    await fetch(`/api/admin/workflow-activities/${act.id}`, {
      method: 'PUT', headers: H,
      body: JSON.stringify({ name: act.name, description: act.description, is_active: act.is_active ? 0 : 1 })
    })
    await loadWfActivities()
    flash('Activity updated.')
  }

  function getPermission(role, mod) {
    const p = permissions.find(p => p.role === role && p.module === mod)
    return p ? p.can_access : 0
  }

  // Fix: Parse raw JSON audit details into human-readable text
  function parseAuditDetails(detailsStr, action, entity) {
    try {
      const d = JSON.parse(detailsStr)
      if (!d) return '—'
      const entries = Object.entries(d)
        .filter(([k]) => action === 'UPDATE' ? !['id'].includes(k) : !['is_active', 'id'].includes(k))
        .map(([k, v]) => {
          if (k === 'is_active') return v ? 'status: activated' : 'status: deactivated'
          return `${k.replace(/_/g, ' ')}: ${v}`
        })
        .join(', ')
      const entityLabel = entity?.replace(/_/g, ' ')
      if (action === 'CREATE') return `Created ${entityLabel} — ${entries}`
      if (action === 'UPDATE') return `Updated ${entityLabel} — ${entries}`
      return entries || detailsStr
    } catch { return detailsStr || '—' }
  }

  function exportCSV(data, filename) {
    if (!data.length) return
    const keys = Object.keys(data[0])
    const csv = [keys.join(','), ...data.map(row => keys.map(k => `"${String(row[k] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click()
  }



  // ─── Shared UI Components ──────────────────────────────────

  function SectionHeader({ title, desc, onExport, exportData, exportFile }) {
    return (
      <div className="admin-section-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2>{title}</h2>
            {desc && <p>{desc}</p>}
          </div>
          {onExport && <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={() => exportCSV(exportData, exportFile)}>⬇ Export CSV</button>}
        </div>
        {msg.text && <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`} style={{ display: 'block', marginTop: 8 }}>{msg.text}</div>}
      </div>
    )
  }

  function StatusPill({ active }) {
    return <span className={`status-pill ${active ? 'active' : 'inactive'}`}>{active ? 'Active' : 'Inactive'}</span>
  }

  function InlineForm({ placeholder, value, onChange, onSubmit, btnLabel = '+ Add' }) {
    return (
      <form onSubmit={onSubmit} style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <input className="form-control" placeholder={placeholder} value={value} onChange={onChange} required />
        <button className="btn btn-primary" type="submit" style={{ whiteSpace: 'nowrap' }}>{btnLabel}</button>
      </form>
    )
  }

  function ComingSoon({ label }) {
    return (
      <div className="admin-coming-soon">
        <div className="icon">🚧</div>
        <h3>Coming Soon</h3>
        <p><strong>{label}</strong> is under development and will be available in a future release.</p>
      </div>
    )
  }

  // ─── Section Renderers ─────────────────────────────────────

  function renderContent() {
    switch (activeSection) {

      case 'overview':
        return (
          <>
            <SectionHeader title="Admin Console" desc="System configuration and management overview." />
            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
              {[
                { label: 'Organisations', value: orgs.filter(o => o.is_active).length, color: 'accent' },
                { label: 'Workflow States', value: workflowStates.filter(w => w.is_active).length, color: '' },
                { label: 'Source Types', value: sourceTypes.filter(s => s.is_active).length, color: 'warning' },
                { label: 'Products', value: products.filter(p => p.is_active).length, color: 'success' },
                { label: 'Users', value: users.length, color: '' },
                { label: 'Audit Entries', value: auditLogs.length, color: 'danger' },
              ].map(s => (
                <div key={s.label} className={`stat-card ${s.color}`}>
                  <div className="stat-label">{s.label}</div>
                  <div className="stat-value">{s.value}</div>
                  <div className="stat-sub">Active</div>
                </div>
              ))}
            </div>
          </>
        )

      case 'sites': {
        const filteredSites = sitesList.filter(s =>
          !sitesSearch ||
          s.name?.toLowerCase().includes(sitesSearch.toLowerCase()) ||
          (s.abbreviation || '').toLowerCase().includes(sitesSearch.toLowerCase())
        )
        const SITE_TABS = [
          { key: 'general',      label: 'General' },
          { key: 'email',        label: 'Email Accounts' },
          { key: 'response',     label: 'Response' },
          { key: 'rtf',          label: 'Right To Forget' },
          { key: 'alerts',       label: 'Alerts Configuration' },
        ]
        const EMAIL_PURPOSES = [
          { key: 'response',      label: 'Response Emails',     required: true  },
          { key: 'transmissions', label: 'Transmissions',        required: true  },
          { key: 'correspondence',label: 'Correspondence',       required: true  },
          { key: 'fax',           label: 'Fax',                 required: false },
        ]
        return (
          <>
            {/* ── Toolbar ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Admin Console &rsaquo; <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Sites Setup</span>
              </div>
              <div style={{ flex: 1 }} />
              <input
                className="form-control"
                placeholder="Search by site name or abbreviation…"
                value={sitesSearch}
                onChange={e => setSitesSearch(e.target.value)}
                style={{ maxWidth: 260, fontSize: 13 }}
              />
              <button
                className="btn btn-primary"
                style={{ fontSize: 13 }}
                onClick={() => { setShowNewSiteForm(v => !v); setSelectedSite(null) }}
              >
                + Add New
              </button>
            </div>

            {/* ── New Site Inline Form ── */}
            {showNewSiteForm && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-header"><h3>New Site</h3></div>
                <div className="card-body">
                  <form onSubmit={createNewSite}>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div className="form-group" style={{ margin: 0, minWidth: 180 }}>
                        <label>Organisation *</label>
                        <select className="form-control" required value={newSiteForm.org_id}
                          onChange={e => setNewSiteForm(f => ({ ...f, org_id: e.target.value }))}>
                          <option value="">— Select Org —</option>
                          {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                      </div>
                      <div className="form-group" style={{ margin: 0, minWidth: 200 }}>
                        <label>Site Name *</label>
                        <input className="form-control" required placeholder="e.g. North America"
                          value={newSiteForm.name}
                          onChange={e => setNewSiteForm(f => ({ ...f, name: e.target.value }))} />
                      </div>
                      <div className="form-group" style={{ margin: 0, minWidth: 120 }}>
                        <label>Abbreviation</label>
                        <input className="form-control" placeholder="e.g. NA"
                          value={newSiteForm.abbreviation}
                          onChange={e => setNewSiteForm(f => ({ ...f, abbreviation: e.target.value }))} />
                      </div>
                      <div className="form-group" style={{ margin: 0, minWidth: 160 }}>
                        <label>Country</label>
                        <input className="form-control" placeholder="e.g. United States"
                          value={newSiteForm.country}
                          onChange={e => setNewSiteForm(f => ({ ...f, country: e.target.value }))} />
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, paddingBottom: 2 }}>
                        <input type="checkbox" checked={newSiteForm.is_primary}
                          onChange={e => setNewSiteForm(f => ({ ...f, is_primary: e.target.checked }))} />
                        Primary Site
                      </label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="submit" className="btn btn-primary" style={{ fontSize: 13 }} disabled={newSiteSaving}>
                          {newSiteSaving ? 'Saving…' : 'Save Site'}
                        </button>
                        <button type="button" className="btn btn-outline" style={{ fontSize: 13 }}
                          onClick={() => setShowNewSiteForm(false)}>Cancel</button>
                      </div>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* ── Sites List ── */}
            <div className="card" style={{ marginBottom: selectedSite ? 16 : 0 }}>
              <div className="card-body" style={{ padding: 0 }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Site Name</th>
                      <th>Organisation</th>
                      <th>Abbreviation</th>
                      <th>Country</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sitesLoading && (
                      <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>Loading…</td></tr>
                    )}
                    {!sitesLoading && filteredSites.length === 0 && (
                      <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>
                        {sitesSearch ? 'No sites match your search.' : 'No sites configured yet. Click + Add New to create one.'}
                      </td></tr>
                    )}
                    {filteredSites.map(s => (
                      <tr key={s.id}
                        style={{ cursor: 'pointer', background: selectedSite?.id === s.id ? 'var(--primary-light, #e8f0fe)' : undefined }}
                        onClick={() => {
                          if (selectedSite?.id === s.id) { setSelectedSite(null); return }
                          selectSiteForConfig(s)
                          setShowNewSiteForm(false)
                        }}
                      >
                        <td>
                          <span style={{ fontWeight: 600, color: selectedSite?.id === s.id ? 'var(--primary)' : undefined }}>
                            {s.name}
                          </span>
                          {s.is_primary ? <span className="badge badge-new" style={{ marginLeft: 6, fontSize: 10 }}>Primary</span> : null}
                        </td>
                        <td style={{ color: 'var(--text-muted)' }}>{s.org_name || '—'}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{s.abbreviation || '—'}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{s.country || '—'}</td>
                        <td><StatusPill active={s.is_active} /></td>
                        <td style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: 11, color: 'var(--primary)' }}>
                            {selectedSite?.id === s.id ? '▲ Close' : 'Configure ▼'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Site Configuration Panel ── */}
            {selectedSite && (
              <div className="card" style={{ border: '1px solid var(--primary)' }}>
                {/* Panel header */}
                <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{selectedSite.name}</div>
                  {selectedSite.abbreviation && <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>({selectedSite.abbreviation})</span>}
                  {selectedSite.org_name && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>— {selectedSite.org_name}</span>}
                  <button className="btn btn-outline" style={{ marginLeft: 'auto', fontSize: 11, padding: '3px 12px' }}
                    onClick={() => setSelectedSite(null)}>✕ Close</button>
                </div>

                {/* 5 Tabs */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                  {SITE_TABS.map(tab => (
                    <button key={tab.key} type="button"
                      style={{
                        padding: '10px 20px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13,
                        fontWeight: siteMainTab === tab.key ? 700 : 400,
                        color: siteMainTab === tab.key ? 'var(--primary)' : 'var(--text-muted)',
                        borderBottom: siteMainTab === tab.key ? '2px solid var(--primary)' : '2px solid transparent',
                        transition: 'all 0.15s',
                      }}
                      onClick={() => {
                        setSiteMainTab(tab.key)
                        if (tab.key === 'email') loadSiteEmailPurposes(selectedSite.id)
                        else if (tab.key === 'response') loadSiteTab('response', selectedSite.id)
                        else if (tab.key === 'rtf') loadSiteTab('retention', selectedSite.id)
                        else if (tab.key === 'alerts') loadSiteTab('alerts', selectedSite.id)
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Tab Content */}
                <div style={{ padding: 24 }}>

                  {/* ── General Tab ── */}
                  {siteMainTab === 'general' && (
                    <form onSubmit={saveSiteGeneral}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 20 }}>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label>Site Name *</label>
                          <input className="form-control" required value={siteGeneralForm.name}
                            onChange={e => setSiteGeneralForm(f => ({ ...f, name: e.target.value }))} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label>Abbreviation</label>
                          <input className="form-control" value={siteGeneralForm.abbreviation}
                            onChange={e => setSiteGeneralForm(f => ({ ...f, abbreviation: e.target.value }))} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label>Country</label>
                          <input className="form-control" value={siteGeneralForm.country}
                            onChange={e => setSiteGeneralForm(f => ({ ...f, country: e.target.value }))} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label>Status</label>
                          <select className="form-control" value={siteGeneralForm.is_active ? 'active' : 'inactive'}
                            onChange={e => setSiteGeneralForm(f => ({ ...f, is_active: e.target.value === 'active' }))}>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                          </select>
                        </div>
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 20, cursor: 'pointer', width: 'fit-content' }}>
                        <input type="checkbox" checked={siteGeneralForm.is_primary}
                          onChange={e => setSiteGeneralForm(f => ({ ...f, is_primary: e.target.checked }))} />
                        Mark as Primary Site for this Organisation
                      </label>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button type="submit" className="btn btn-primary" disabled={siteGeneralSaving}>
                          {siteGeneralSaving ? 'Saving…' : 'Save Changes'}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* ── Email Accounts Tab ── */}
                  {siteMainTab === 'email' && (
                    <>
                      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
                        Assign email accounts to each communication purpose for this site. Select from email accounts configured in Email Accounts setup.
                      </div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 20 }}>
                        <thead>
                          <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                            <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, width: 200 }}>Purpose</th>
                            <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, width: 100 }}>Required</th>
                            <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Email Accounts</th>
                          </tr>
                        </thead>
                        <tbody>
                          {EMAIL_PURPOSES.map((p, i) => (
                            <tr key={p.key} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--surface)' : 'var(--bg)' }}>
                              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-primary)' }}>{p.label}</td>
                              <td style={{ padding: '12px 16px' }}>
                                {p.required
                                  ? <span style={{ background: '#e8f5e9', color: '#2e7d32', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>Mandatory</span>
                                  : <span style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)', padding: '2px 8px', borderRadius: 12, fontSize: 11 }}>Optional</span>
                                }
                              </td>
                              <td style={{ padding: '12px 16px' }}>
                                {emailAccounts.length === 0
                                  ? <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No email accounts found. Configure them in Email Accounts setup first.</span>
                                  : (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                      {emailAccounts.map(ea => {
                                        const checked = (siteEmailPurposes[p.key] || []).includes(ea.id)
                                        return (
                                          <label key={ea.id} style={{
                                            display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
                                            padding: '5px 10px', border: `1px solid ${checked ? 'var(--primary)' : 'var(--border)'}`,
                                            borderRadius: 6, cursor: 'pointer',
                                            background: checked ? 'var(--primary-light, #e8f0fe)' : 'var(--surface)',
                                            color: checked ? 'var(--primary)' : 'var(--text-primary)',
                                            userSelect: 'none',
                                          }}>
                                            <input type="checkbox" checked={checked} style={{ display: 'none' }}
                                              onChange={ev => {
                                                setSiteEmailPurposes(prev => ({
                                                  ...prev,
                                                  [p.key]: ev.target.checked
                                                    ? [...(prev[p.key] || []), ea.id]
                                                    : (prev[p.key] || []).filter(id => id !== ea.id)
                                                }))
                                              }} />
                                            <span style={{ width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${checked ? 'var(--primary)' : 'var(--border)'}`, background: checked ? 'var(--primary)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                              {checked && <span style={{ color: '#fff', fontSize: 10, lineHeight: 1 }}>✓</span>}
                                            </span>
                                            <span>{ea.account_name || ea.mailbox_email}</span>
                                            {ea.mailbox_email && ea.account_name && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({ea.mailbox_email})</span>}
                                          </label>
                                        )
                                      })}
                                    </div>
                                  )
                                }
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button className="btn btn-primary" onClick={saveSiteEmailPurposes} disabled={siteEmailPurposeSaving}>
                          {siteEmailPurposeSaving ? 'Saving…' : 'Save Email Assignments'}
                        </button>
                      </div>
                    </>
                  )}

                  {/* ── Response Tab ── */}
                  {siteMainTab === 'response' && (
                    <form onSubmit={saveSiteResponseTemplate}>
                      {siteTabLoading && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div>}
                      {!siteTabLoading && (
                        <>
                          <div className="form-group">
                            <label>Email Subject</label>
                            <input className="form-control" placeholder="e.g. Thank you for your inquiry — {{case_number}}"
                              value={siteResponseTemplate?.subject || ''}
                              onChange={e => setSiteResponseTemplate(t => ({ ...t, subject: e.target.value }))} />
                          </div>
                          <div className="form-group">
                            <label>Email Body <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(HTML supported)</span></label>
                            <textarea className="form-control" rows={8}
                              placeholder="Your inquiry has been received. Case number: {{case_number}}"
                              value={siteResponseTemplate?.body_html || ''}
                              onChange={e => setSiteResponseTemplate(t => ({ ...t, body_html: e.target.value }))} />
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button type="submit" className="btn btn-primary">Save Template</button>
                          </div>
                        </>
                      )}
                    </form>
                  )}

                  {/* ── Right To Forget Tab ── */}
                  {siteMainTab === 'rtf' && (
                    <>
                      {siteTabLoading && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div>}
                      {!siteTabLoading && (
                        <>
                          <form onSubmit={saveSiteRetention} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
                            <div className="form-group" style={{ margin: 0 }}>
                              <label>Regulation</label>
                              <select className="form-control" value={siteRetentionForm.regulation}
                                onChange={e => setSiteRetentionForm(f => ({ ...f, regulation: e.target.value }))}>
                                <option value="GDPR">GDPR</option>
                                <option value="HIPAA">HIPAA</option>
                                <option value="LOCAL">Local</option>
                              </select>
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                              <label>Retention (days)</label>
                              <input className="form-control" type="number" min={30}
                                value={siteRetentionForm.retention_days}
                                onChange={e => setSiteRetentionForm(f => ({ ...f, retention_days: parseInt(e.target.value, 10) }))}
                                style={{ maxWidth: 120 }} />
                            </div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, paddingBottom: 2 }}>
                              <input type="checkbox" checked={siteRetentionForm.auto_delete_enabled}
                                onChange={e => setSiteRetentionForm(f => ({ ...f, auto_delete_enabled: e.target.checked }))} />
                              Auto-Delete Enabled
                            </label>
                            <button type="submit" className="btn btn-primary">Save Rule</button>
                          </form>
                          {siteRetentionRules.length === 0
                            ? <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No retention rules configured for this site.</div>
                            : (
                              <table className="admin-table">
                                <thead><tr><th>Regulation</th><th>Retention (days)</th><th>Auto-Delete</th></tr></thead>
                                <tbody>
                                  {siteRetentionRules.map(r => (
                                    <tr key={r.id}>
                                      <td style={{ fontWeight: 600 }}>{r.regulation}</td>
                                      <td>{r.retention_days}</td>
                                      <td>{r.auto_delete_enabled
                                        ? <span style={{ background: '#fde8ef', color: '#c0392b', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>ON</span>
                                        : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Off</span>}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )
                          }
                        </>
                      )}
                    </>
                  )}

                  {/* ── Alerts Configuration Tab ── */}
                  {siteMainTab === 'alerts' && (
                    <>
                      {siteTabLoading && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div>}
                      {!siteTabLoading && (
                        <>
                          <form onSubmit={addSiteAlert} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
                            <div className="form-group" style={{ margin: 0 }}>
                              <label>Alert Type</label>
                              <select className="form-control" value={siteAlertForm.alert_type}
                                onChange={e => setSiteAlertForm(f => ({ ...f, alert_type: e.target.value }))}>
                                <option>Case Volume Spike</option>
                                <option>SLA Breach</option>
                                <option>AE Serious Flag</option>
                                <option>Overdue Cases</option>
                              </select>
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                              <label>Threshold</label>
                              <input className="form-control" type="number" min={1}
                                value={siteAlertForm.threshold_value}
                                onChange={e => setSiteAlertForm(f => ({ ...f, threshold_value: parseInt(e.target.value, 10) }))}
                                style={{ maxWidth: 100 }} />
                            </div>
                            <div className="form-group" style={{ margin: 0, minWidth: 200 }}>
                              <label>Notify Emails</label>
                              <input className="form-control" placeholder="a@b.com, c@d.com"
                                value={siteAlertForm.notify_emails}
                                onChange={e => setSiteAlertForm(f => ({ ...f, notify_emails: e.target.value }))} />
                            </div>
                            <button type="submit" className="btn btn-accent">+ Add Alert</button>
                          </form>
                          {siteAlerts.length === 0
                            ? <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No alerts configured for this site.</div>
                            : (
                              <table className="admin-table">
                                <thead><tr><th>Alert Type</th><th>Threshold</th><th>Notify Emails</th><th>Status</th><th></th></tr></thead>
                                <tbody>
                                  {siteAlerts.map(a => (
                                    <tr key={a.id}>
                                      <td style={{ fontWeight: 600 }}>{a.alert_type}</td>
                                      <td>{a.threshold_value}</td>
                                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{a.notify_emails || '—'}</td>
                                      <td><StatusPill active={a.is_active} /></td>
                                      <td>
                                        <button className="btn btn-outline" style={{ fontSize: 11, padding: '2px 8px', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                                          onClick={() => deleteSiteAlert(a.id)}>Remove</button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )
                          }
                        </>
                      )}
                    </>
                  )}

                </div>
              </div>
            )}
          </>
        )
      }

      case 'workflow':
        return (
          <>
            <SectionHeader title="Workflow Setup" desc="View case workflow states and activity triggers. Changes are managed by SuperAdmin." />
            <div style={{ padding: '8px 14px', marginBottom: 12, background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 6, fontSize: 12, color: '#7a5c00' }}>
              Workflow configuration is controlled by SuperAdmin only. Contact your platform admin to add or modify workflow states and triggers.
            </div>

            {/* Sub-tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
              {[{ key: 'states', label: 'Workflow States' }, { key: 'triggers', label: 'Activity Triggers' }].map(t => (
                <button key={t.key} onClick={() => setWfTab(t.key)}
                  style={{ padding: '10px 20px', border: 'none', borderBottom: wfTab === t.key ? '2px solid var(--primary)' : '2px solid transparent', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: wfTab === t.key ? 700 : 400, color: wfTab === t.key ? 'var(--primary)' : 'var(--text-secondary)' }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── Workflow States ── */}
            {wfTab === 'states' && (
              <>
                <div className="card">
                  <div className="card-header"><h3>Workflow States ({workflowStates.length})</h3></div>
                  <div className="card-body" style={{ padding: 0 }}>
                    <table className="admin-table">
                      <thead><tr><th>State Name</th><th>Status</th></tr></thead>
                      <tbody>
                        {workflowStates.length === 0 && <tr><td colSpan={2} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No states configured.</td></tr>}
                        {workflowStates.map(w => (
                          <tr key={w.id}>
                            <td>{w.name}</td>
                            <td><StatusPill active={w.is_active} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* ── Activity Triggers ── */}
            {wfTab === 'triggers' && (
              <>
                {/* Activities legend */}
                <div className="card" style={{ marginBottom: 16 }}>
                  <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3>Case Activities ({wfActivities.length})</h3>
                  </div>
                  <div className="card-body" style={{ padding: 0 }}>
                    <table className="admin-table">
                      <thead><tr><th>Activity</th><th>Description</th><th>Status</th><th>Action</th></tr></thead>
                      <tbody>
                        {wfActivities.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No activities defined.</td></tr>}
                        {wfActivities.map(a => (
                          <tr key={a.id}>
                            <td><strong>{a.name}</strong></td>
                            <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{a.description || '—'}</td>
                            <td><StatusPill active={a.is_active} /></td>
                            <td><button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => toggleWfActivity(a)}>{a.is_active ? 'Deactivate' : 'Activate'}</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Trigger rules */}
                <div className="card">
                  <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3>Trigger Rules ({wfTriggers.length})</h3>
                    <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => { setTriggerForm({ activity_id: '', trigger_type: 'change_state', target_state_id: '', alert_rule: '', assign_to: '' }); setTriggerEditTarget(null); setTriggerModal('add') }}>+ Add Trigger</button>
                  </div>
                  <div className="card-body" style={{ padding: 0 }}>
                    <table className="admin-table">
                      <thead><tr><th>If Activity</th><th>Then</th><th>Target State / Rule</th><th>Status</th><th>Actions</th></tr></thead>
                      <tbody>
                        {triggersLoading && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>Loading…</td></tr>}
                        {!triggersLoading && wfTriggers.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No trigger rules yet.</td></tr>}
                        {!triggersLoading && wfTriggers.map(t => (
                          <tr key={t.id}>
                            <td><strong>{t.activity_name || '—'}</strong></td>
                            <td><span className="badge badge-new" style={{ fontSize: 11 }}>{t.trigger_type === 'change_state' ? 'Change State' : t.trigger_type === 'send_alert' ? 'Send Alert' : 'Assign To'}</span></td>
                            <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{t.target_state_name || t.alert_rule || t.assign_to || '—'}</td>
                            <td><StatusPill active={t.is_active} /></td>
                            <td>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => {
                                  setTriggerEditTarget(t)
                                  setTriggerForm({ activity_id: t.activity_id, trigger_type: t.trigger_type, target_state_id: t.target_state_id || '', alert_rule: t.alert_rule || '', assign_to: t.assign_to || '' })
                                  setTriggerModal('edit')
                                }}>✏ Edit</button>
                                <button className="btn btn-danger" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => deleteTrigger(t)}>🗑</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Trigger Add/Edit Modal */}
                {triggerModal && (
                  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                    <div style={{ background: 'var(--surface)', borderRadius: 10, width: '100%', maxWidth: 480, padding: 28, boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                        <h3 style={{ margin: 0 }}>{triggerModal === 'add' ? 'Add Trigger Rule' : 'Edit Trigger Rule'}</h3>
                        <button onClick={() => setTriggerModal(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
                      </div>
                      <form onSubmit={saveTrigger}>
                        <div style={{ display: 'grid', gap: 12 }}>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>If Activity *</label>
                            <select className="form-control" value={triggerForm.activity_id} onChange={e => setTriggerForm(f => ({ ...f, activity_id: e.target.value }))} required>
                              <option value="">— Select activity —</option>
                              {wfActivities.filter(a => a.is_active).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Then *</label>
                            <select className="form-control" value={triggerForm.trigger_type} onChange={e => setTriggerForm(f => ({ ...f, trigger_type: e.target.value }))}>
                              <option value="change_state">Change State</option>
                              <option value="send_alert">Send Alert</option>
                              <option value="assign_to">Assign To</option>
                            </select>
                          </div>
                          {triggerForm.trigger_type === 'change_state' && (
                            <div>
                              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Target State</label>
                              <select className="form-control" value={triggerForm.target_state_id} onChange={e => setTriggerForm(f => ({ ...f, target_state_id: e.target.value }))}>
                                <option value="">— Select state —</option>
                                {workflowStates.filter(s => s.is_active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                              </select>
                            </div>
                          )}
                          {triggerForm.trigger_type === 'send_alert' && (
                            <div>
                              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Alert Rule</label>
                              <input className="form-control" placeholder="e.g. Notify compliance team" value={triggerForm.alert_rule} onChange={e => setTriggerForm(f => ({ ...f, alert_rule: e.target.value }))} />
                            </div>
                          )}
                          {triggerForm.trigger_type === 'assign_to' && (
                            <div>
                              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Assign To</label>
                              <input className="form-control" placeholder="e.g. QA Reviewer" value={triggerForm.assign_to} onChange={e => setTriggerForm(f => ({ ...f, assign_to: e.target.value }))} />
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                          <button type="button" className="btn btn-outline" onClick={() => setTriggerModal(null)}>Cancel</button>
                          <button type="submit" className="btn btn-primary">Save</button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )

      case 'source-types':
        return (
          <>
            <SectionHeader title="Source Types" desc="Define how inquiries arrive (Email, Phone, Fax, CP Portal etc.)." />
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header"><h3>Add Source Type</h3></div>
              <div className="card-body">
                <InlineForm placeholder="e.g. Email, Phone, Fax, CP Portal" value={srcForm.name}
                  onChange={e => setSrcForm({ name: e.target.value })} onSubmit={createSrc} />
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h3>Source Types ({sourceTypes.length})</h3></div>
              <div className="card-body" style={{ padding: 0 }}>
                <table className="admin-table">
                  <thead><tr><th>Source Name</th><th>Status</th><th>Action</th></tr></thead>
                  <tbody>
                    {sourceTypes.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No source types yet.</td></tr>}
                    {sourceTypes.map(s => (
                      <tr key={s.id}>
                        <td>{s.name}</td>
                        <td><StatusPill active={s.is_active} /></td>
                        <td><button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => toggleSrc(s)}>{s.is_active ? 'Deactivate' : 'Activate'}</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )

      case 'products':
        return (
          <>
            <SectionHeader title="Product Dictionary" desc="Manage drug/trade names, regulatory approvals, and country authorizations." />

            {/* Sub-tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
              {[
                { key: 'products', label: 'Products' },
                { key: 'approvals', label: selectedProduct ? `Approvals — ${selectedProduct.trade_name}` : 'Approvals' },
                { key: 'country-auth', label: selectedProduct ? `Country Auth — ${selectedProduct.trade_name}` : 'Country Auth' },
              ].map(t => (
                <button key={t.key} onClick={() => { if (t.key !== 'products' && !selectedProduct) return; setProductTab(t.key) }}
                  style={{ padding: '10px 20px', border: 'none', borderBottom: productTab === t.key ? '2px solid var(--primary)' : '2px solid transparent', background: 'none', cursor: (t.key !== 'products' && !selectedProduct) ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: productTab === t.key ? 700 : 400, color: productTab === t.key ? 'var(--primary)' : (t.key !== 'products' && !selectedProduct) ? 'var(--text-muted)' : 'var(--text-secondary)', opacity: (t.key !== 'products' && !selectedProduct) ? 0.5 : 1 }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── Products list ── */}
            {productTab === 'products' && (
              <>
                <div className="card" style={{ marginBottom: 16 }}>
                  <div className="card-header"><h3>Add Product</h3></div>
                  <div className="card-body">
                    <form onSubmit={createProduct} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <input className="form-control" placeholder="Trade name" value={productForm.trade_name} onChange={e => setProductForm(f => ({ ...f, trade_name: e.target.value }))} required style={{ flex: 1 }} />
                      <select className="form-control" value={productForm.org_id} onChange={e => setProductForm(f => ({ ...f, org_id: e.target.value }))} style={{ flex: 1 }}>
                        <option value="">Organisation (optional)</option>
                        {orgs.filter(o => o.is_active).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                      <button className="btn btn-primary" type="submit" style={{ whiteSpace: 'nowrap' }}>+ Add</button>
                    </form>
                  </div>
                </div>
                <div className="card">
                  <div className="card-header"><h3>Products ({products.length})</h3></div>
                  <div className="card-body" style={{ padding: 0 }}>
                    <table className="admin-table">
                      <thead><tr><th>Trade Name</th><th>Organisation</th><th>Status</th><th>Actions</th></tr></thead>
                      <tbody>
                        {products.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No products yet.</td></tr>}
                        {products.map(p => (
                          <tr key={p.id}>
                            <td><strong>{p.trade_name}</strong></td>
                            <td style={{ color: 'var(--text-muted)' }}>{p.org_name || '—'}</td>
                            <td><StatusPill active={p.is_active} /></td>
                            <td>
                              <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => selectProductForDetail(p)}>
                                Approvals / Auth →
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* ── Product Approvals ── */}
            {productTab === 'approvals' && selectedProduct && (
              <>
                <div className="card">
                  <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3>Regulatory Approvals — {selectedProduct.trade_name} ({productApprovals.length})</h3>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={() => { setSelectedProduct(null); setProductTab('products') }}>← Back</button>
                      <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => { setApprovalForm({ approval_number: '', regulatory_body: '', approval_date: '', expiry_date: '', status: 'Active' }); setApprovalEditTarget(null); setApprovalModal('add') }}>+ Add Approval</button>
                    </div>
                  </div>
                  <div className="card-body" style={{ padding: 0 }}>
                    <table className="admin-table">
                      <thead><tr><th>Approval Number</th><th>Regulatory Body</th><th>Approval Date</th><th>Expiry Date</th><th>Status</th><th>Actions</th></tr></thead>
                      <tbody>
                        {productApprovals.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No approvals yet.</td></tr>}
                        {productApprovals.map(a => (
                          <tr key={a.id}>
                            <td><strong>{a.approval_number}</strong></td>
                            <td style={{ color: 'var(--text-muted)' }}>{a.regulatory_body || '—'}</td>
                            <td style={{ color: 'var(--text-muted)' }}>{a.approval_date ? a.approval_date.slice(0, 10) : '—'}</td>
                            <td style={{ color: 'var(--text-muted)' }}>{a.expiry_date ? a.expiry_date.slice(0, 10) : '—'}</td>
                            <td><span className={`status-pill ${a.status === 'Active' ? 'active' : 'inactive'}`}>{a.status}</span></td>
                            <td>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => { setApprovalEditTarget(a); setApprovalForm({ approval_number: a.approval_number, regulatory_body: a.regulatory_body || '', approval_date: a.approval_date ? a.approval_date.slice(0,10) : '', expiry_date: a.expiry_date ? a.expiry_date.slice(0,10) : '', status: a.status }); setApprovalModal('edit') }}>✏ Edit</button>
                                <button className="btn btn-danger" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => deleteApproval(a)}>🗑</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Approval Add/Edit Modal */}
                {approvalModal && (
                  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                    <div style={{ background: 'var(--surface)', borderRadius: 10, width: '100%', maxWidth: 480, padding: 28, boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                        <h3 style={{ margin: 0 }}>{approvalModal === 'add' ? 'Add Approval' : 'Edit Approval'}</h3>
                        <button onClick={() => setApprovalModal(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
                      </div>
                      <form onSubmit={saveApproval}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                          <div style={{ gridColumn: '1 / -1' }}>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Approval Number *</label>
                            <input className="form-control" value={approvalForm.approval_number} onChange={e => setApprovalForm(f => ({ ...f, approval_number: e.target.value }))} required />
                          </div>
                          <div style={{ gridColumn: '1 / -1' }}>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Regulatory Body</label>
                            <input className="form-control" placeholder="e.g. FDA, EMA, CDSCO" value={approvalForm.regulatory_body} onChange={e => setApprovalForm(f => ({ ...f, regulatory_body: e.target.value }))} />
                          </div>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Approval Date</label>
                            <input className="form-control" type="date" value={approvalForm.approval_date} onChange={e => setApprovalForm(f => ({ ...f, approval_date: e.target.value }))} />
                          </div>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Expiry Date</label>
                            <input className="form-control" type="date" value={approvalForm.expiry_date} onChange={e => setApprovalForm(f => ({ ...f, expiry_date: e.target.value }))} />
                          </div>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Status</label>
                            <select className="form-control" value={approvalForm.status} onChange={e => setApprovalForm(f => ({ ...f, status: e.target.value }))}>
                              <option value="Active">Active</option>
                              <option value="Expired">Expired</option>
                              <option value="Suspended">Suspended</option>
                            </select>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                          <button type="button" className="btn btn-outline" onClick={() => setApprovalModal(null)}>Cancel</button>
                          <button type="submit" className="btn btn-primary">Save</button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── Country Authorizations ── */}
            {productTab === 'country-auth' && selectedProduct && (
              <>
                <div className="card">
                  <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3>Country Authorizations — {selectedProduct.trade_name} ({productCountryAuths.length})</h3>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={() => { setSelectedProduct(null); setProductTab('products') }}>← Back</button>
                      <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => { setCountryAuthForm({ country: '', auth_number: '', auth_date: '', status: 'Active' }); setCountryAuthEditTarget(null); setCountryAuthModal('add') }}>+ Add Authorization</button>
                    </div>
                  </div>
                  <div className="card-body" style={{ padding: 0 }}>
                    <table className="admin-table">
                      <thead><tr><th>Country</th><th>Authorization Number</th><th>Authorization Date</th><th>Status</th><th>Actions</th></tr></thead>
                      <tbody>
                        {productCountryAuths.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No authorizations yet.</td></tr>}
                        {productCountryAuths.map(a => (
                          <tr key={a.id}>
                            <td><strong>{a.country}</strong></td>
                            <td style={{ color: 'var(--text-muted)' }}>{a.auth_number || '—'}</td>
                            <td style={{ color: 'var(--text-muted)' }}>{a.auth_date ? a.auth_date.slice(0, 10) : '—'}</td>
                            <td><span className={`status-pill ${a.status === 'Active' ? 'active' : 'inactive'}`}>{a.status}</span></td>
                            <td>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => { setCountryAuthEditTarget(a); setCountryAuthForm({ country: a.country, auth_number: a.auth_number || '', auth_date: a.auth_date ? a.auth_date.slice(0,10) : '', status: a.status }); setCountryAuthModal('edit') }}>✏ Edit</button>
                                <button className="btn btn-danger" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => deleteCountryAuth(a)}>🗑</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Country Auth Add/Edit Modal */}
                {countryAuthModal && (
                  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                    <div style={{ background: 'var(--surface)', borderRadius: 10, width: '100%', maxWidth: 440, padding: 28, boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                        <h3 style={{ margin: 0 }}>{countryAuthModal === 'add' ? 'Add Authorization' : 'Edit Authorization'}</h3>
                        <button onClick={() => setCountryAuthModal(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
                      </div>
                      <form onSubmit={saveCountryAuth}>
                        <div style={{ display: 'grid', gap: 12 }}>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Country *</label>
                            <input className="form-control" placeholder="e.g. United States" value={countryAuthForm.country} onChange={e => setCountryAuthForm(f => ({ ...f, country: e.target.value }))} required />
                          </div>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Authorization Number</label>
                            <input className="form-control" value={countryAuthForm.auth_number} onChange={e => setCountryAuthForm(f => ({ ...f, auth_number: e.target.value }))} />
                          </div>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Authorization Date</label>
                            <input className="form-control" type="date" value={countryAuthForm.auth_date} onChange={e => setCountryAuthForm(f => ({ ...f, auth_date: e.target.value }))} />
                          </div>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Status</label>
                            <select className="form-control" value={countryAuthForm.status} onChange={e => setCountryAuthForm(f => ({ ...f, status: e.target.value }))}>
                              <option value="Active">Active</option>
                              <option value="Revoked">Revoked</option>
                              <option value="Suspended">Suspended</option>
                            </select>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                          <button type="button" className="btn btn-outline" onClick={() => setCountryAuthModal(null)}>Cancel</button>
                          <button type="submit" className="btn btn-primary">Save</button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )

      case 'user-security':
        return (
          <>
            <SectionHeader title="User Security Groups" desc="View role-to-module permissions. Changes are managed by SuperAdmin." />
            <div style={{ padding: '8px 14px', marginBottom: 12, background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 6, fontSize: 12, color: '#7a5c00' }}>
              Security group permissions are controlled by SuperAdmin only. Contact your platform admin to modify role access.
            </div>
            <div className="card">
              <div className="card-header"><h3>Role Permission Matrix</h3></div>
              <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Module</th>
                      {ROLES.map(r => <th key={r}>{ROLE_LABELS[r]}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {MODULES.map(mod => (
                      <tr key={mod.key}>
                        <td><strong>{mod.label}</strong></td>
                        {ROLES.map(role => {
                          const allowed = getPermission(role, mod.key)
                          return (
                            <td key={role} style={{ textAlign: 'center' }}>
                              <span style={{ fontSize: 16 }} title={allowed ? 'Allowed' : 'Not allowed'}>
                                {allowed ? '✅' : '🔒'}
                              </span>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ padding: 12, fontSize: 12, color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
                  Click ✅ to revoke access &nbsp;|&nbsp; Click 🔒 to grant access
                  <br />
                  <span style={{ color: 'var(--warning)', fontWeight: 500 }}>⚠️ Admin → Admin Console</span> is permanently locked ON and cannot be changed.
                  This is a system safety rule — at least one role must always have admin access to prevent lockout.
                </div>
              </div>
            </div>
          </>
        )

      case 'user-config':
        return (
          <>
            <SectionHeader title="User Configuration" desc="View system users and their organisation assignments. Changes are managed by SuperAdmin." />
            <div style={{ padding: '8px 14px', marginBottom: 12, background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 6, fontSize: 12, color: '#7a5c00' }}>
              User creation and role changes are controlled by SuperAdmin only. Contact your platform admin to add or modify users.
            </div>
            <div className="card">
              <div className="card-header"><h3>All Users ({users.length})</h3></div>
              <div className="card-body" style={{ padding: 0 }}>
                <table className="admin-table">
                  <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th></tr></thead>
                  <tbody>
                    {users.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No users yet.</td></tr>}
                    {users.map(u => (
                      <tr key={u.id}>
                        <td>{u.name}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{u.email}</td>
                        <td><span className="badge badge-new">{ROLE_LABELS[u.role] || u.role}</span></td>
                        <td><StatusPill active={u.is_active} /></td>
                        <td style={{ color: 'var(--text-muted)' }}>{new Date(u.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )

      case 'audit-admin':
        return (
          <>
            <SectionHeader title="Admin Audit Trail" desc="21 CFR Part 11 — all system changes are logged here. Read-only." onExport exportData={auditLogs} exportFile="admin-audit.csv" />
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header"><h3>Filter</h3></div>
              <div className="card-body">
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <input className="form-control" type="date" placeholder="From" value={auditFilter.from} onChange={e => setAuditFilter(f => ({ ...f, from: e.target.value }))} style={{ maxWidth: 160 }} />
                  <input className="form-control" type="date" placeholder="To" value={auditFilter.to} onChange={e => setAuditFilter(f => ({ ...f, to: e.target.value }))} style={{ maxWidth: 160 }} />
                  <input className="form-control" placeholder="User name" value={auditFilter.user} onChange={e => setAuditFilter(f => ({ ...f, user: e.target.value }))} style={{ maxWidth: 160 }} />
                  <input className="form-control" placeholder="Entity (e.g., inquiry)" value={auditFilter.entity} onChange={e => setAuditFilter(f => ({ ...f, entity: e.target.value }))} style={{ maxWidth: 160 }} />
                  <input className="form-control" placeholder="Entity ID" value={auditFilter.entity_id} onChange={e => setAuditFilter(f => ({ ...f, entity_id: e.target.value }))} style={{ maxWidth: 120 }} />
                  <select className="form-control" value={auditFilter.action} onChange={e => setAuditFilter(f => ({ ...f, action: e.target.value }))} style={{ maxWidth: 140 }}>
                    <option value="">All Actions</option>
                    <option value="CREATE">CREATE</option>
                    <option value="UPDATE">UPDATE</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                  <button className="btn btn-primary" onClick={loadAuditLogs} style={{ fontSize: 12 }}>Search</button>
                  <button className="btn btn-outline" onClick={() => { setAuditFilter({ from: '', to: '', user: '', action: '', entity: '', entity_id: '' }); loadAll() }} style={{ fontSize: 12 }}>Clear</button>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h3>Audit Log ({auditLogs.length} entries)</h3></div>
              <div className="card-body" style={{ padding: 0 }}>
                <table className="admin-table">
                  <thead><tr><th>Timestamp (UTC)</th><th>User</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
                  <tbody>
                    {auditLogs.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No audit entries yet. All admin actions will appear here.</td></tr>}
                    {auditLogs.map(l => (
                      <tr key={l.id}>
                        <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: 11 }}>{l.created_at} UTC</td>
                        <td>{l.user_name}</td>
                        <td><span className="badge badge-new">{l.action}</span></td>
                        <td style={{ fontSize: 12 }}>{l.entity} #{l.entity_id}</td>
                        <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>{parseAuditDetails(l.details, l.action, l.entity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )

      case 'audit-login':
        return (
          <>
            <SectionHeader title="Login Audit Trail" desc="21 CFR Part 11 — all login and logout events. Read-only." onExport exportData={loginAudit} exportFile="login-audit.csv" />
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header"><h3>Filter</h3></div>
              <div className="card-body">
                <div style={{ display: 'flex', gap: 10 }}>
                  <input className="form-control" type="date" value={loginFilter.from} onChange={e => setLoginFilter(f => ({ ...f, from: e.target.value }))} style={{ maxWidth: 160 }} />
                  <input className="form-control" type="date" value={loginFilter.to} onChange={e => setLoginFilter(f => ({ ...f, to: e.target.value }))} style={{ maxWidth: 160 }} />
                  <input className="form-control" placeholder="User" value={loginFilter.user} onChange={e => setLoginFilter(f => ({ ...f, user: e.target.value }))} style={{ maxWidth: 160 }} />
                  <button className="btn btn-primary" onClick={loadLoginAudit} style={{ fontSize: 12 }}>Search</button>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h3>Login History ({loginAudit.length} entries)</h3></div>
              <div className="card-body" style={{ padding: 0 }}>
                <table className="admin-table">
                  <thead><tr><th>User</th><th>Role</th><th>Login Time</th><th>Logout Time</th><th>Status</th><th>Reason</th></tr></thead>
                  <tbody>
                    {loginAudit.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No login records yet. Click Search to load.</td></tr>}
                    {loginAudit.map(l => (
                      <tr key={l.id}>
                        <td>{l.user_name}</td>
                        <td style={{ fontSize: 11 }}>{l.role}</td>
                        <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l.login_time}</td>
                        <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l.logout_time || '—'}</td>
                        <td><span className={`status-pill ${l.status === 'success' ? 'active' : 'inactive'}`}>{l.status}</span></td>
                        <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l.fail_reason || l.auth_event || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )

      case 'email-accounts':
        return (
          <>
            <SectionHeader
              title="Email Accounts"
              desc={isSuperadmin
                ? 'Manage email accounts across organisations.'
                : `Manage email accounts for ${orgName || 'your active organisation'}. These accounts remain isolated per organisation.`}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
              <div style={{ padding: '8px 14px', background: '#eef7ff', border: '1px solid #cfe8ff', borderRadius: 6, fontSize: 12, color: '#0b5394' }}>
                {isSuperadmin
                  ? 'SuperAdmin can manage email accounts across orgs. Org admins will only see and manage accounts for their active organisation.'
                  : 'Email account setup is managed inside MIMS and stays isolated to your active organisation.'}
              </div>
              <button className="btn btn-primary" onClick={openAddEmailModal}>+ Add Email Account</button>
            </div>
            <div className="card">
              <div className="card-header"><h3>Email Accounts ({emailAccounts.length})</h3></div>
              <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Org</th>
                      <th>Account Name</th>
                      <th>Provider</th>
                      <th>Direction</th>
                      <th>Mailbox Email</th>
                      <th>From Email</th>
                      <th>Active</th>
                      <th>Last IMAP Test</th>
                      <th>Last SMTP Test</th>
                      <th>Last Ingest</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {emailAccounts.length === 0 && (
                      <tr><td colSpan={11} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
                        No email accounts configured yet. Add one for the active organisation to enable inbound or outbound email flows.
                      </td></tr>
                    )}
                    {emailAccounts.map(account => (
                      <tr key={account.id}>
                        <td>{account.org_name}</td>
                        <td>
                          <strong>{account.account_name}</strong>
                          {!!account.is_default_outbound && <span style={{ marginLeft: 6, fontSize: 9, background: 'var(--primary)', color: '#fff', borderRadius: 3, padding: '1px 5px' }}>Default Out</span>}
                        </td>
                        <td>{account.provider}</td>
                        <td>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: account.direction === 'Inbound' ? '#2471a3' : account.direction === 'Outbound' ? '#17a589' : '#8e44ad', color: '#fff' }}>
                            {account.direction}
                          </span>
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{account.mailbox_email || '—'}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{account.from_email || '—'}</td>
                        <td><StatusPill active={account.is_active} /></td>
                        <td style={{ fontSize: 11 }}>
                          {account.last_imap_test_at
                            ? <span style={{ color: account.last_imap_test_status === 'pass' ? 'var(--success)' : 'var(--danger)' }}>
                                {account.last_imap_test_status} · {account.last_imap_test_at}
                              </span>
                            : '—'}
                        </td>
                        <td style={{ fontSize: 11 }}>
                          {account.last_smtp_test_at
                            ? <span style={{ color: account.last_smtp_test_status === 'pass' ? 'var(--success)' : 'var(--danger)' }}>
                                {account.last_smtp_test_status} · {account.last_smtp_test_at}
                              </span>
                            : '—'}
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{account.last_ingest_at || '—'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button className="btn btn-outline" style={{ fontSize: 11 }} onClick={() => openEditEmailModal(account)}>Edit</button>
                            <button className="btn btn-outline" style={{ fontSize: 11 }} onClick={() => toggleEmailAccount(account)}>
                              {account.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                            {['Inbound', 'Both'].includes(account.direction) && (
                              <>
                                <button
                                  className="btn btn-outline"
                                  style={{ fontSize: 11 }}
                                  onClick={() => runEmailAction(account, 'test-imap')}
                                  disabled={emailTestingId === `test-imap-${account.id}`}
                                >
                                  {emailTestingId === `test-imap-${account.id}` ? 'Testing...' : 'Test IMAP'}
                                </button>
                                <button
                                  className="btn btn-outline"
                                  style={{ fontSize: 11 }}
                                  onClick={() => runEmailAction(account, 'fetch-now')}
                                  disabled={emailTestingId === `fetch-now-${account.id}`}
                                >
                                  {emailTestingId === `fetch-now-${account.id}` ? 'Fetching...' : 'Fetch Now'}
                                </button>
                              </>
                            )}
                            {['Outbound', 'Both'].includes(account.direction) && (
                              <>
                                <button
                                  className="btn btn-outline"
                                  style={{ fontSize: 11 }}
                                  onClick={() => runEmailAction(account, 'test-smtp')}
                                  disabled={emailTestingId === `test-smtp-${account.id}`}
                                >
                                  {emailTestingId === `test-smtp-${account.id}` ? 'Testing...' : 'Test SMTP'}
                                </button>
                                <button className="btn btn-outline" style={{ fontSize: 11 }} onClick={() => { setSendTestModalId(account.id); setSendTestRecipient('') }}>
                                  Send Test
                                </button>
                              </>
                            )}
                            <button className="btn btn-outline" style={{ fontSize: 11, color: 'var(--danger)' }} onClick={() => deleteEmailAccount(account)}>
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )

      // ─── Picklists ──────────────────────────────────────────
      case 'picklists': {
        const plPages = []
        const plStart = Math.max(1, picklistPage - 2)
        const plEnd   = Math.min(picklistTotalPages, picklistPage + 2)
        for (let i = plStart; i <= plEnd; i++) plPages.push(i)

        return (
          <>
            <SectionHeader title="Picklists Management" desc="Define dropdown values used across case forms and reports." />

            {/* Toolbar */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
              <input
                className="form-control" placeholder="Search name / value…"
                value={picklistFilter.search}
                onChange={e => setPicklistFilter(f => ({ ...f, search: e.target.value }))}
                style={{ maxWidth: 220 }}
              />
              <select
                className="form-control"
                value={picklistFilter.category}
                onChange={e => setPicklistFilter(f => ({ ...f, category: e.target.value }))}
                style={{ maxWidth: 200 }}
              >
                <option value="">All Categories</option>
                <option value="General">General</option>
                <option value="Company Product Dictionary">Company Product Dictionary</option>
                <option value="Case Contact / Reporter">Case Contact / Reporter</option>
                <option value="Case Form — MI">Case Form — MI</option>
                <option value="Case Form — AE">Case Form — AE</option>
                <option value="Case Form — PC">Case Form — PC</option>
              </select>
              <input
                className="form-control" placeholder="Field type…"
                value={picklistFilter.field_type}
                onChange={e => setPicklistFilter(f => ({ ...f, field_type: e.target.value }))}
                style={{ maxWidth: 140 }}
              />
              <select
                className="form-control"
                value={picklistFilter.status}
                onChange={e => setPicklistFilter(f => ({ ...f, status: e.target.value }))}
                style={{ maxWidth: 120 }}
              >
                <option value="All">All</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
              <button className="btn btn-primary" onClick={() => { setPicklistPage(1); loadPicklists({ page: 1, ...picklistFilter }) }}>Search</button>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={() => { setPicklistForm({ name: '', category: 'General', field_type: '', value: '', description: '', status: 'Active' }); setPicklistEditTarget(null); setPicklistModal('add') }}>+ Add New</button>
                <button className="btn btn-outline" onClick={exportPicklistsXlsx}>⬇ Download</button>
                <button className="btn btn-outline" onClick={() => picklistUploadRef.current?.click()}>⬆ Upload</button>
                <input ref={picklistUploadRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={uploadPicklistsXlsx} />
              </div>
            </div>

            {/* Table */}
            <div className="card">
              <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      {['#', 'Name', 'Category', 'Field Type', 'Value', 'Description', 'Status', 'Last Modified', 'Actions'].map(h => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {picklistLoading && (
                      <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>Loading…</td></tr>
                    )}
                    {!picklistLoading && picklists.length === 0 && (
                      <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No picklists found.</td></tr>
                    )}
                    {!picklistLoading && picklists.map((row, i) => (
                      <tr key={row.id}>
                        <td style={{ color: 'var(--text-muted)', width: 40 }}>{(picklistPage - 1) * 20 + i + 1}</td>
                        <td><strong>{row.name}</strong></td>
                        <td style={{ fontSize: 11 }}><span style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px', whiteSpace: 'nowrap' }}>{row.category || 'General'}</span></td>
                        <td style={{ color: 'var(--text-muted)' }}>{row.field_type}</td>
                        <td>{row.value}</td>
                        <td style={{ color: 'var(--text-muted)', maxWidth: 260 }}>{row.description || '—'}</td>
                        <td><span className={`status-pill ${row.status === 'Active' ? 'active' : 'inactive'}`}>{row.status}</span></td>
                        <td style={{ color: 'var(--text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>{row.updated_at ? new Date(row.updated_at).toLocaleDateString() : '—'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => {
                              setPicklistEditTarget(row)
                              setPicklistForm({ name: row.name, category: row.category || 'General', field_type: row.field_type, value: row.value, description: row.description || '', status: row.status })
                              setPicklistModal('edit')
                            }}>✏ Edit</button>
                            <button className="btn btn-danger" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => deletePicklist(row)}>🗑 Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            {!picklistLoading && picklistTotal > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{picklistTotal} record{picklistTotal !== 1 ? 's' : ''}</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                  <button className="btn btn-outline" style={{ fontSize: 12, padding: '4px 8px' }} disabled={picklistPage === 1} onClick={() => { setPicklistPage(p => p - 1); loadPicklists({ page: picklistPage - 1 }) }}>‹ Prev</button>
                  {plPages.map(p => (
                    <button key={p} style={{ padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, cursor: 'pointer', background: p === picklistPage ? 'var(--primary)' : 'var(--surface)', color: p === picklistPage ? '#fff' : 'var(--text-primary)', fontWeight: p === picklistPage ? 700 : 400 }}
                      onClick={() => { setPicklistPage(p); loadPicklists({ page: p }) }}>{p}</button>
                  ))}
                  <button className="btn btn-outline" style={{ fontSize: 12, padding: '4px 8px' }} disabled={picklistPage === picklistTotalPages} onClick={() => { setPicklistPage(p => p + 1); loadPicklists({ page: picklistPage + 1 }) }}>Next ›</button>
                </div>
              </div>
            )}

            {/* Add/Edit Modal */}
            {picklistModal && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                <div style={{ background: 'var(--surface)', borderRadius: 10, width: '100%', maxWidth: 480, padding: 28, boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <h3 style={{ margin: 0 }}>{picklistModal === 'add' ? 'Add Picklist' : 'Edit Picklist'}</h3>
                    <button onClick={() => setPicklistModal(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
                  </div>
                  <form onSubmit={savePicklist}>
                    <div style={{ display: 'grid', gap: 12 }}>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Name *</label>
                        <input className="form-control" value={picklistForm.name} onChange={e => setPicklistForm(f => ({ ...f, name: e.target.value }))} required />
                      </div>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Category *</label>
                        <select className="form-control" value={picklistForm.category} onChange={e => setPicklistForm(f => ({ ...f, category: e.target.value }))} required>
                          <option value="General">General</option>
                          <option value="Company Product Dictionary">Company Product Dictionary</option>
                          <option value="Case Contact / Reporter">Case Contact / Reporter</option>
                          <option value="Case Form — MI">Case Form — MI</option>
                          <option value="Case Form — AE">Case Form — AE</option>
                          <option value="Case Form — PC">Case Form — PC</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Field Type *</label>
                        <input className="form-control" placeholder="e.g. Country, Gender, Report Type" value={picklistForm.field_type} onChange={e => setPicklistForm(f => ({ ...f, field_type: e.target.value }))} required />
                      </div>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Value *</label>
                        <input className="form-control" value={picklistForm.value} onChange={e => setPicklistForm(f => ({ ...f, value: e.target.value }))} required />
                      </div>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Description</label>
                        <input className="form-control" value={picklistForm.description} onChange={e => setPicklistForm(f => ({ ...f, description: e.target.value }))} />
                      </div>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Status</label>
                        <select className="form-control" value={picklistForm.status} onChange={e => setPicklistForm(f => ({ ...f, status: e.target.value }))}>
                          <option value="Active">Active</option>
                          <option value="Inactive">Inactive</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                      <button type="button" className="btn btn-outline" onClick={() => setPicklistModal(null)}>Cancel</button>
                      <button type="submit" className="btn btn-primary">Save</button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </>
        )
      }

      // ─── Field Setup ─────────────────────────────────────────
      case 'field-setup': {
        const activeSec = fieldSections.find(s => s.section === activeFieldSection)
        return (
          <>
            <SectionHeader title="Field Setup" desc="Configure visibility, requirements, and custom labels for case form fields." />
            {fieldSetupLoading ? (
              <div className="ac-loading">Loading…</div>
            ) : (
              <div style={{ display: 'flex', gap: 0, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--surface)', minHeight: 400 }}>

                {/* Left pane — section list */}
                <div style={{ width: 220, borderRight: '1px solid var(--border)', background: 'var(--bg)', flexShrink: 0 }}>
                  <div style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.5px', borderBottom: '1px solid var(--border)' }}>Sections</div>
                  {fieldSections.map(s => (
                    <div
                      key={s.section}
                      onClick={() => setActiveFieldSection(s.section)}
                      style={{ padding: '11px 16px', fontSize: 13, cursor: 'pointer', borderBottom: '1px solid var(--border)', background: s.section === activeFieldSection ? 'var(--primary)' : 'transparent', color: s.section === activeFieldSection ? '#fff' : 'var(--text-primary)', fontWeight: s.section === activeFieldSection ? 600 : 400, transition: 'background 0.15s' }}
                    >
                      {s.section}
                    </div>
                  ))}
                  {fieldSections.length === 0 && (
                    <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)' }}>No sections configured.</div>
                  )}
                </div>

                {/* Right pane — field table */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      Fields for: <span style={{ color: 'var(--primary)' }}>{activeFieldSection || '—'}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={() => setShowAddFlexField(v => !v)}>+ Add Flex Field</button>
                      <button className="btn btn-primary" style={{ fontSize: 12 }} disabled={fieldSetupSaving} onClick={saveFieldSetup}>
                        {fieldSetupSaving ? 'Saving…' : 'Save Changes'}
                      </button>
                    </div>
                  </div>

                  {/* Add flex field inline form */}
                  {showAddFlexField && (
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 3 }}>Field Name *</label>
                        <input className="form-control" style={{ maxWidth: 180 }} value={flexFieldForm.name} onChange={e => setFlexFieldForm(f => ({ ...f, name: e.target.value }))} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 3 }}>Type</label>
                        <select className="form-control" style={{ maxWidth: 130 }} value={flexFieldForm.type} onChange={e => setFlexFieldForm(f => ({ ...f, type: e.target.value }))}>
                          <option value="text">Text</option>
                          <option value="dropdown">Dropdown</option>
                          <option value="date">Date</option>
                          <option value="number">Number</option>
                          <option value="textarea">Textarea</option>
                        </select>
                      </div>
                      {flexFieldForm.type === 'dropdown' && (
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 3 }}>Picklist Type</label>
                          <input className="form-control" style={{ maxWidth: 160 }} placeholder="e.g. Country" value={flexFieldForm.picklist_type} onChange={e => setFlexFieldForm(f => ({ ...f, picklist_type: e.target.value }))} />
                        </div>
                      )}
                      <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={addFlexField}>Add</button>
                      <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={() => setShowAddFlexField(false)}>Cancel</button>
                    </div>
                  )}

                  <div style={{ flex: 1, overflow: 'auto' }}>
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Field Name</th>
                          <th>Type</th>
                          <th style={{ textAlign: 'center' }}>Required</th>
                          <th style={{ textAlign: 'center' }}>Hidden</th>
                          <th style={{ textAlign: 'center' }}>Disabled</th>
                          <th>Custom Label</th>
                        </tr>
                      </thead>
                      <tbody>
                        {!activeSec || activeSec.fields.length === 0 ? (
                          <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No fields in this section.</td></tr>
                        ) : activeSec.fields.map(field => (
                          <tr key={field.id}>
                            <td>
                              <span>{field.field_name}</span>
                              {field.is_flex && <span style={{ marginLeft: 6, fontSize: 10, background: 'var(--accent)', color: '#fff', borderRadius: 3, padding: '1px 5px' }}>Flex</span>}
                            </td>
                            <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{field.field_type || 'text'}</td>
                            <td style={{ textAlign: 'center' }}>
                              <input type="checkbox" checked={!!field.is_required} onChange={e => updateFieldProp(activeFieldSection, field.id, 'is_required', e.target.checked ? 1 : 0)} />
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <input type="checkbox" checked={!!field.is_hidden} onChange={e => updateFieldProp(activeFieldSection, field.id, 'is_hidden', e.target.checked ? 1 : 0)} />
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <input type="checkbox" checked={!!field.is_disabled} onChange={e => updateFieldProp(activeFieldSection, field.id, 'is_disabled', e.target.checked ? 1 : 0)} />
                            </td>
                            <td>
                              <input className="form-control" style={{ fontSize: 12, padding: '4px 8px' }} placeholder="Custom label…" value={field.custom_label || ''} onChange={e => updateFieldProp(activeFieldSection, field.id, 'custom_label', e.target.value)} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )
      }

      // ─── Security Groups ─────────────────────────────────────
      case 'user-security-groups': {
        const SEC_TABS = [
          { key: 'menu',    label: 'Menu Access' },
          { key: 'cm',      label: 'CM Menu Access' },
          { key: 'case',    label: 'Case Activities' },
          { key: 'casemgmt',label: 'Case Management' },
          { key: 'cmact',   label: 'CM Activities' },
          { key: 'mobile',  label: 'Mobile Activities' },
        ]
        const SEC_PERMS = {
          menu:    [{ key: 'admin_console', label: 'Admin Console' }, { key: 'content_mgmt', label: 'Content Mgmt' }, { key: 'inbox', label: 'Inbox' }, { key: 'case_mgmt', label: 'Case Management' }, { key: 'analytics', label: 'Analytics' }, { key: 'data_viz', label: 'Data Visualization' }],
          cm:      [{ key: 'cm_documents', label: 'Documents' }, { key: 'cm_faqs', label: 'FAQs' }, { key: 'cm_merge_reports', label: 'Merge Reports' }, { key: 'cm_templates', label: 'Templates' }, { key: 'cm_folders', label: 'Folders' }],
          case:    [{ key: 'case_create', label: 'Create Case' }, { key: 'case_update', label: 'Update Case' }, { key: 'case_review', label: 'Review Case' }, { key: 'case_fulfill', label: 'Fulfill' }, { key: 'case_transmit', label: 'Transmit' }, { key: 'case_correspond', label: 'Correspond' }, { key: 'case_close', label: 'Close Case' }, { key: 'case_reopen', label: 'Reopen Case' }],
          casemgmt:[{ key: 'case_mi_create', label: 'MI — Create/Edit' }, { key: 'case_ae_create', label: 'AE — Create/Edit' }, { key: 'case_pc_create', label: 'PC — Create/Edit' }, { key: 'case_ae_seriousness', label: 'AE — Edit Seriousness' }, { key: 'case_version_create', label: 'Create New Version' }, { key: 'case_doc_upload', label: 'Upload Documents' }, { key: 'case_export', label: 'Export Cases' }, { key: 'case_bulk_ops', label: 'Bulk Operations' }],
          cmact:   [{ key: 'cmact_author', label: 'Author' }, { key: 'cmact_review', label: 'Review' }, { key: 'cmact_approve', label: 'Approve' }, { key: 'cmact_publish', label: 'Publish' }, { key: 'cmact_archive', label: 'Archive' }, { key: 'cmact_folder_mgmt', label: 'Folder Mgmt' }],
          mobile:  [{ key: 'mobile_view', label: 'View' }, { key: 'mobile_create', label: 'Create' }, { key: 'mobile_update', label: 'Update' }],
        }
        const availableToAdd = users.filter(u => !secGroupUsers.find(su => su.id === u.id))

        return (
          <>
            <SectionHeader title="User Security Groups" desc="Define named security groups with granular access controls and assign users." />
            <div style={{ display: 'flex', gap: 0, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--surface)', minHeight: 480 }}>

              {/* Left panel — group list */}
              <div style={{ width: 210, borderRight: '1px solid var(--border)', background: 'var(--bg)', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                  <button className="btn btn-primary" style={{ width: '100%', fontSize: 12 }} onClick={createSecGroup}>+ New Group</button>
                </div>
                <div style={{ flex: 1, overflow: 'auto' }}>
                  {secGroupLoading && <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)' }}>Loading…</div>}
                  {!secGroupLoading && secGroups.length === 0 && <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)' }}>No groups yet.</div>}
                  {secGroups.map(grp => (
                    <div
                      key={grp.id}
                      onClick={() => selectSecGroup(grp)}
                      style={{ padding: '11px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', background: selectedSecGroup?.id === grp.id ? 'var(--primary)' : 'transparent', color: selectedSecGroup?.id === grp.id ? '#fff' : 'var(--text-primary)', transition: 'background 0.15s' }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{grp.name}</div>
                      <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{grp.user_count ?? 0} user{(grp.user_count ?? 0) !== 1 ? 's' : ''}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right panel — group detail */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {!selectedSecGroup ? (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
                    Select a security group from the left to view and edit its settings.
                  </div>
                ) : (
                  <>
                    {/* Group name / description */}
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>Group Name</label>
                        <input className="form-control" value={secGroupForm.name} onChange={e => setSecGroupForm(f => ({ ...f, name: e.target.value }))} />
                      </div>
                      <div style={{ flex: 2, minWidth: 200 }}>
                        <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>Description</label>
                        <input className="form-control" value={secGroupForm.description} onChange={e => setSecGroupForm(f => ({ ...f, description: e.target.value }))} />
                      </div>
                    </div>

                    {/* Permission tabs */}
                    <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg)', flexShrink: 0 }}>
                      {SEC_TABS.map(t => (
                        <button
                          key={t.key}
                          onClick={() => setSecGroupTab(t.key)}
                          style={{ padding: '10px 16px', border: 'none', borderBottom: secGroupTab === t.key ? '2px solid var(--primary)' : '2px solid transparent', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: secGroupTab === t.key ? 700 : 400, color: secGroupTab === t.key ? 'var(--primary)' : 'var(--text-secondary)', transition: 'color 0.15s' }}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>

                    {/* Permission checkboxes */}
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 28px' }}>
                        {(SEC_PERMS[secGroupTab] || []).map(p => (
                          <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                            <input
                              type="checkbox"
                              checked={!!secGroupForm.permissions[p.key]}
                              onChange={() => toggleSecGroupPerm(p.key)}
                            />
                            {p.label}
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Users in group */}
                    <div style={{ padding: '14px 20px', flex: 1, overflow: 'auto' }}>
                      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Users in Group</div>
                      {secGroupUsers.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>No users assigned.</div>}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                        {secGroupUsers.map(u => (
                          <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 20, padding: '4px 12px', fontSize: 12 }}>
                            <span>{u.name}</span>
                            <button onClick={() => removeUserFromSecGroup(u.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <select className="form-control" style={{ maxWidth: 220 }} value={secGroupAddUserVal} onChange={e => setSecGroupAddUserVal(e.target.value)}>
                          <option value="">— Add user —</option>
                          {availableToAdd.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
                        </select>
                        <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={addUserToSecGroup} disabled={!secGroupAddUserVal}>+ Add</button>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                      <button className="btn btn-danger" style={{ fontSize: 12 }} onClick={deleteSecGroup}>Delete Group</button>
                      <button className="btn btn-primary" style={{ fontSize: 12 }} disabled={secGroupSaving} onClick={saveSecGroup}>
                        {secGroupSaving ? 'Saving…' : 'Save Group'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        )
      }

      // ─── Contact Master ──────────────────────────────────────
      case 'contact-master': {
        return (
          <>
            <SectionHeader title="Contact Master" desc="Manage case contacts and company representatives." />

            {/* Sub-tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
              {[{ key: 'contacts', label: 'Case Contacts' }, { key: 'reps', label: 'Company Representatives' }].map(t => (
                <button
                  key={t.key}
                  onClick={() => setContactTab(t.key)}
                  style={{ padding: '10px 20px', border: 'none', borderBottom: contactTab === t.key ? '2px solid var(--primary)' : '2px solid transparent', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: contactTab === t.key ? 700 : 400, color: contactTab === t.key ? 'var(--primary)' : 'var(--text-secondary)' }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── Case Contacts ── */}
            {contactTab === 'contacts' && (
              <>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
                  <input className="form-control" placeholder="Search name / email…" value={contactSearch} onChange={e => setContactSearch(e.target.value)} style={{ maxWidth: 240 }} />
                  <select className="form-control" value={contactTypeFilter} onChange={e => setContactTypeFilter(e.target.value)} style={{ maxWidth: 140 }}>
                    <option value="">All Types</option>
                    <option value="HCP">HCP</option>
                    <option value="Patient">Patient</option>
                    <option value="Other">Other</option>
                  </select>
                  <button className="btn btn-primary" onClick={() => loadContacts(contactSearch, contactTypeFilter)}>Search</button>
                  <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => { setContactForm({ first_name: '', last_name: '', specialty: '', institution: '', email: '', phone: '', type: 'HCP', organization: '', notes: '', address: '', do_not_update_master: false }); setContactEditTarget(null); setContactModal('add') }}>+ Add Contact</button>
                </div>

                <div className="card">
                  <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
                    <table className="admin-table">
                      <thead>
                        <tr>{['Name', 'Email', 'Phone', 'Type', 'Organization', 'Status', 'Actions'].map(h => <th key={h}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {contactsLoading && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>Loading…</td></tr>}
                        {!contactsLoading && contacts.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No contacts found.</td></tr>}
                        {!contactsLoading && contacts.map(c => (
                          <tr key={c.id}>
                            <td><strong>{[c.first_name, c.last_name].filter(Boolean).join(' ') || c.name || '—'}</strong></td>
                            <td style={{ color: 'var(--text-muted)' }}>{c.email || '—'}</td>
                            <td style={{ color: 'var(--text-muted)' }}>{c.phone || '—'}</td>
                            <td><span className="badge badge-new">{c.type}</span></td>
                            <td style={{ color: 'var(--text-muted)' }}>{c.organization || '—'}</td>
                            <td><span className={`status-pill ${c.is_active !== false ? 'active' : 'inactive'}`}>{c.is_active !== false ? 'Active' : 'Inactive'}</span></td>
                            <td>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => {
                                  setContactEditTarget(c)
                                  setContactForm({ first_name: c.first_name || '', last_name: c.last_name || '', specialty: c.specialty || '', institution: c.institution || '', email: c.email || '', phone: c.phone || '', type: c.type || 'HCP', organization: c.organization || '', notes: c.notes || '', address: c.address || '', do_not_update_master: !!c.do_not_update_master })
                                  setContactModal('edit')
                                }}>✏ Edit</button>
                                <button className="btn btn-danger" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => deleteContact(c)}>🗑</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Contact Add/Edit Modal */}
                {contactModal && (
                  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                    <div style={{ background: 'var(--surface)', borderRadius: 10, width: '100%', maxWidth: 520, padding: 28, boxShadow: '0 8px 32px rgba(0,0,0,0.25)', maxHeight: '90vh', overflowY: 'auto' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                        <h3 style={{ margin: 0 }}>{contactModal === 'add' ? 'Add Contact' : 'Edit Contact'}</h3>
                        <button onClick={() => setContactModal(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
                      </div>
                      <form onSubmit={saveContact}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>First Name *</label>
                            <input className="form-control" value={contactForm.first_name} onChange={e => setContactForm(f => ({ ...f, first_name: e.target.value }))} required />
                          </div>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Last Name</label>
                            <input className="form-control" value={contactForm.last_name} onChange={e => setContactForm(f => ({ ...f, last_name: e.target.value }))} />
                          </div>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Type</label>
                            <select className="form-control" value={contactForm.type} onChange={e => setContactForm(f => ({ ...f, type: e.target.value }))}>
                              <option value="HCP">HCP</option>
                              <option value="Patient">Patient</option>
                              <option value="Reporter">Reporter</option>
                              <option value="Other">Other</option>
                            </select>
                          </div>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Specialty</label>
                            <input className="form-control" placeholder="e.g. Oncology, Cardiology" value={contactForm.specialty} onChange={e => setContactForm(f => ({ ...f, specialty: e.target.value }))} />
                          </div>
                          <div style={{ gridColumn: '1 / -1' }}>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Institution</label>
                            <input className="form-control" placeholder="Hospital or clinic name" value={contactForm.institution} onChange={e => setContactForm(f => ({ ...f, institution: e.target.value }))} />
                          </div>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Email</label>
                            <input className="form-control" type="email" value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} />
                          </div>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Phone</label>
                            <input className="form-control" value={contactForm.phone} onChange={e => setContactForm(f => ({ ...f, phone: e.target.value }))} />
                          </div>
                          <div style={{ gridColumn: '1 / -1' }}>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Address</label>
                            <textarea className="form-control" rows={2} style={{ resize: 'vertical' }} value={contactForm.address} onChange={e => setContactForm(f => ({ ...f, address: e.target.value }))} />
                          </div>
                          <div style={{ gridColumn: '1 / -1' }}>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Notes</label>
                            <textarea className="form-control" rows={2} style={{ resize: 'vertical' }} value={contactForm.notes} onChange={e => setContactForm(f => ({ ...f, notes: e.target.value }))} />
                          </div>
                          <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input type="checkbox" id="dnumd" checked={!!contactForm.do_not_update_master} onChange={e => setContactForm(f => ({ ...f, do_not_update_master: e.target.checked }))} />
                            <label htmlFor="dnumd" style={{ fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Do Not Update Master Data</label>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                          <button type="button" className="btn btn-outline" onClick={() => setContactModal(null)}>Cancel</button>
                          <button type="submit" className="btn btn-primary">Save</button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── Company Representatives ── */}
            {contactTab === 'reps' && (
              <>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
                  <input className="form-control" placeholder="Search name…" value={repSearch} onChange={e => setRepSearch(e.target.value)} style={{ maxWidth: 240 }} />
                  <button className="btn btn-primary" onClick={() => loadCompanyReps(repSearch)}>Search</button>
                  <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => { setRepForm({ name: '', title: '', territory: '', email: '', phone: '', organization: '' }); setRepEditTarget(null); setRepModal('add') }}>+ Add Rep</button>
                </div>

                <div className="card">
                  <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
                    <table className="admin-table">
                      <thead>
                        <tr>{['Name', 'Title', 'Territory', 'Email', 'Phone', 'Organization', 'Status', 'Actions'].map(h => <th key={h}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {repsLoading && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>Loading…</td></tr>}
                        {!repsLoading && companyReps.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No representatives found.</td></tr>}
                        {!repsLoading && companyReps.map(r => (
                          <tr key={r.id}>
                            <td><strong>{r.name}</strong></td>
                            <td style={{ color: 'var(--text-muted)' }}>{r.title || '—'}</td>
                            <td style={{ color: 'var(--text-muted)' }}>{r.territory || '—'}</td>
                            <td style={{ color: 'var(--text-muted)' }}>{r.email || '—'}</td>
                            <td style={{ color: 'var(--text-muted)' }}>{r.phone || '—'}</td>
                            <td style={{ color: 'var(--text-muted)' }}>{r.organization || '—'}</td>
                            <td><span className={`status-pill ${r.is_active !== false ? 'active' : 'inactive'}`}>{r.is_active !== false ? 'Active' : 'Inactive'}</span></td>
                            <td>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => {
                                  setRepEditTarget(r)
                                  setRepForm({ name: r.name || '', title: r.title || '', territory: r.territory || '', email: r.email || '', phone: r.phone || '', organization: r.organization || '' })
                                  setRepModal('edit')
                                }}>✏ Edit</button>
                                <button className="btn btn-danger" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => deleteRep(r)}>🗑</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Rep Add/Edit Modal */}
                {repModal && (
                  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                    <div style={{ background: 'var(--surface)', borderRadius: 10, width: '100%', maxWidth: 480, padding: 28, boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                        <h3 style={{ margin: 0 }}>{repModal === 'add' ? 'Add Representative' : 'Edit Representative'}</h3>
                        <button onClick={() => setRepModal(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
                      </div>
                      <form onSubmit={saveRep}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                          <div style={{ gridColumn: '1 / -1' }}>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Name *</label>
                            <input className="form-control" value={repForm.name} onChange={e => setRepForm(f => ({ ...f, name: e.target.value }))} required />
                          </div>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Title</label>
                            <input className="form-control" value={repForm.title} onChange={e => setRepForm(f => ({ ...f, title: e.target.value }))} />
                          </div>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Territory</label>
                            <input className="form-control" placeholder="e.g. North India, APAC" value={repForm.territory} onChange={e => setRepForm(f => ({ ...f, territory: e.target.value }))} />
                          </div>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Email</label>
                            <input className="form-control" type="email" value={repForm.email} onChange={e => setRepForm(f => ({ ...f, email: e.target.value }))} />
                          </div>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Phone</label>
                            <input className="form-control" value={repForm.phone} onChange={e => setRepForm(f => ({ ...f, phone: e.target.value }))} />
                          </div>
                          <div style={{ gridColumn: '1 / -1' }}>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Organization</label>
                            <select className="form-control" value={repForm.organization} onChange={e => setRepForm(f => ({ ...f, organization: e.target.value }))}>
                              <option value="">— Select org —</option>
                              {orgs.filter(o => o.is_active).map(o => <option key={o.id} value={o.name}>{o.name}</option>)}
                            </select>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                          <button type="button" className="btn btn-outline" onClick={() => setRepModal(null)}>Cancel</button>
                          <button type="submit" className="btn btn-primary">Save</button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )
      }

      // ─── Case Numbering (F-01) ───────────────────────────────
      case 'case-numbering': {
        const CASE_TYPES = ['ALL', 'MI', 'AE', 'PC']
        return (
          <>
            <SectionHeader title="Case Numbering Setup" desc="Configure auto-generated case number formats per organisation and case type." />
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {/* Config form */}
              <div className="card" style={{ flex: '0 0 400px', maxWidth: 440 }}>
                <div className="card-header"><h3>Configure Format</h3></div>
                <div className="card-body">
                  <form onSubmit={saveCaseNumConfig}>
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Organisation (leave blank for global default)</label>
                      <select className="form-control" value={caseNumOrgId} onChange={e => setCaseNumOrgId(e.target.value)}>
                        <option value="">— Global Default —</option>
                        {orgs.filter(o => o.is_active).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Case Type</label>
                      <select className="form-control" value={caseNumForm.case_type} onChange={e => setCaseNumForm(f => ({ ...f, case_type: e.target.value }))}>
                        {CASE_TYPES.map(t => <option key={t} value={t}>{t === 'ALL' ? 'All Case Types (Unified)' : t}</option>)}
                      </select>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Prefix *</label>
                        <input className="form-control" placeholder="e.g. CASE, MI, AE" value={caseNumForm.prefix} required
                          onChange={e => setCaseNumForm(f => ({ ...f, prefix: e.target.value.toUpperCase() }))}
                          onBlur={refreshCaseNumPreview} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Separator</label>
                        <select className="form-control" value={caseNumForm.separator}
                          onChange={e => { setCaseNumForm(f => ({ ...f, separator: e.target.value })); setTimeout(refreshCaseNumPreview, 50) }}>
                          <option value="-">Hyphen (-)</option>
                          <option value="/">Slash (/)</option>
                          <option value=".">Dot (.)</option>
                          <option value="none">None</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Sequence Length</label>
                        <input className="form-control" type="number" min={3} max={10} value={caseNumForm.seq_length}
                          onChange={e => setCaseNumForm(f => ({ ...f, seq_length: parseInt(e.target.value, 10) }))}
                          onBlur={refreshCaseNumPreview} />
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 20 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                          <input type="checkbox" checked={caseNumForm.include_year}
                            onChange={e => { setCaseNumForm(f => ({ ...f, include_year: e.target.checked })); setTimeout(refreshCaseNumPreview, 50) }} />
                          Include Year
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                          <input type="checkbox" checked={caseNumForm.include_month}
                            onChange={e => { setCaseNumForm(f => ({ ...f, include_month: e.target.checked })); setTimeout(refreshCaseNumPreview, 50) }} />
                          Include Month
                        </label>
                      </div>
                    </div>
                    {/* Live preview */}
                    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Preview:</span>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 15, color: 'var(--primary)', letterSpacing: 1 }}>{caseNumPreview || '—'}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button type="button" className="btn btn-outline" onClick={refreshCaseNumPreview}>Refresh Preview</button>
                      <button type="submit" className="btn btn-primary" disabled={caseNumSaving}>{caseNumSaving ? 'Saving…' : 'Save Configuration'}</button>
                    </div>
                  </form>
                </div>
              </div>

              {/* Saved configs */}
              <div className="card" style={{ flex: 1, minWidth: 280 }}>
                <div className="card-header"><h3>Saved Configurations ({caseNumConfigs.length})</h3></div>
                <div className="card-body" style={{ padding: 0 }}>
                  {caseNumLoading && <div style={{ padding: 16, fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div>}
                  {!caseNumLoading && caseNumConfigs.length === 0 && (
                    <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                      No configurations yet. Global default will auto-generate as <code>CASE-YYYYMMDD-NNNNN</code>.
                    </div>
                  )}
                  <table className="admin-table">
                    <tbody>
                      {caseNumConfigs.map(c => (
                        <tr key={c.id}>
                          <td>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{c.org_name || 'Global Default'}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Case Type: {c.case_type}</div>
                          </td>
                          <td>
                            <code style={{ fontSize: 13, color: 'var(--primary)' }}>{c.preview}</code>
                          </td>
                          <td style={{ width: 80 }}>
                            {c.is_locked
                              ? <span className="badge" style={{ background: 'var(--warning-light)', color: 'var(--warning)', fontSize: 10 }}>Locked</span>
                              : <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 10px', color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => deleteCaseNumConfig(c.id)}>Delete</button>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )
      }

      // ─── Case Form Definition (F-02) ────────────────────────
      case 'case-form-def': {
        const CASE_TYPE_LABELS = { MI: 'Medical Information (MI)', AE: 'Adverse Event (AE)', PC: 'Product Complaint (PC)' }
        return (
          <>
            <SectionHeader title="Case Form Definition" desc="Configure which sections are visible on the Case Form per case type and organisation." />
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <select className="form-control" style={{ maxWidth: 220 }} value={caseFormDefOrgId}
                onChange={e => { setCaseFormDefOrgId(e.target.value); loadCaseFormDef(caseFormDefCaseType, e.target.value) }}>
                <option value="">— Global Default —</option>
                {orgs.filter(o => o.is_active).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <div style={{ display: 'flex', gap: 0, border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                {['MI', 'AE', 'PC'].map(ct => (
                  <button key={ct} type="button"
                    style={{ padding: '7px 20px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: caseFormDefCaseType === ct ? 'var(--primary)' : 'var(--surface)', color: caseFormDefCaseType === ct ? '#fff' : 'var(--text-primary)', transition: 'all 0.15s' }}
                    onClick={() => { setCaseFormDefCaseType(ct); loadCaseFormDef(ct, caseFormDefOrgId) }}>
                    {ct}
                  </button>
                ))}
              </div>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{CASE_TYPE_LABELS[caseFormDefCaseType]}</span>
            </div>

            <div className="card">
              <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3>Sections — {caseFormDefCaseType} Form</h3>
                <button className="btn btn-primary" style={{ fontSize: 12 }} disabled={caseFormDefSaving || caseFormDefLoading} onClick={saveCaseFormDef}>
                  {caseFormDefSaving ? 'Saving…' : 'Save Definition'}
                </button>
              </div>
              <div className="card-body" style={{ padding: 0 }}>
                {caseFormDefLoading && <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div>}
                {!caseFormDefLoading && (
                  <table className="admin-table">
                    <thead><tr><th style={{ width: 60 }}>Visible</th><th>Section Name</th><th style={{ width: 100 }}>Status</th></tr></thead>
                    <tbody>
                      {caseFormDefSections.length === 0 && (
                        <tr><td colSpan={3} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>No sections loaded. Select a case type above.</td></tr>
                      )}
                      {caseFormDefSections.map((s, idx) => (
                        <tr key={s.section_name} style={{ background: s.is_visible ? 'transparent' : 'var(--bg)' }}>
                          <td style={{ textAlign: 'center' }}>
                            <input type="checkbox" checked={!!s.is_visible}
                              onChange={e => setCaseFormDefSections(prev => prev.map((sec, i) => i === idx ? { ...sec, is_visible: e.target.checked ? 1 : 0 } : sec))} />
                          </td>
                          <td style={{ fontWeight: 500, fontSize: 13, color: s.is_visible ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                            {s.section_name}
                            {['Contact / Requestor', 'Case Information'].includes(s.section_name) && (
                              <span style={{ marginLeft: 8, fontSize: 10, background: 'var(--primary)', color: '#fff', borderRadius: 4, padding: '1px 6px' }}>Required</span>
                            )}
                          </td>
                          <td>
                            <span style={{ fontSize: 11, fontWeight: 600, color: s.is_visible ? 'var(--success)' : 'var(--text-muted)' }}>
                              {s.is_visible ? '● Visible' : '○ Hidden'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
              Changes take effect on the next new case opened. Existing open cases are not affected. Contact / Requestor and Case Information sections cannot be hidden.
            </p>
          </>
        )
      }

      default:
        const found = ADMIN_SECTIONS.flatMap(s => s.items).find(i => i.key === activeSection)
        return <ComingSoon label={found?.label || activeSection} />
    }
  }

  return (
    <MIMSLayout showStatStrip={false}>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Persistent left sidebar — SciMax prototype layout */}
        <div className="ac-sidebar">
          <div className="ac-sidebar-title">Admin Console</div>
          {ADMIN_SECTIONS.map(grp => (
            <div key={grp.group} className="ac-sidebar-group">
              <div className="ac-sidebar-group-label">{grp.group}</div>
              {grp.items.map(item => {
                const isActive = urlSection === item.key
                return (
                  <button
                    key={item.key}
                    className={`ac-sidebar-item${isActive ? ' active' : ''}${!item.active ? ' soon' : ''}`}
                    onClick={() => item.active && navigate(`/admin-console/${item.key}`)}
                    disabled={!item.active}
                  >
                    {item.label}
                    {!item.active && <span className="ac-soon-tag">Soon</span>}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
        {/* Right content area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="ac-breadcrumb">
            <span className="ac-breadcrumb-root">Admin Console</span>
            <span className="ac-breadcrumb-sep"> › </span>
            <span className="ac-breadcrumb-current">{sectionLabel}</span>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {activeSection === 'service-log' ? (
            <ServiceLogTab
              logs={svcLogs}
              sources={svcSources}
              filter={svcFilter}
              onFilterChange={f => setSvcFilter(prev => ({ ...prev, ...f }))}
              onRefine={() => { setSvcPage(1); loadServiceLogs({ page: 1 }) }}
              page={svcPage}
              pageSize={svcPageSize}
              total={svcTotal}
              totalPages={svcTotalPages}
              loading={svcLoading}
              onPageChange={p => { setSvcPage(p); loadServiceLogs({ page: p }) }}
              onPageSizeChange={ps => { setSvcPage(1); setSvcPageSize(ps); loadServiceLogs({ page: 1, page_size: ps }) }}
            />
          ) : activeSection === 'system-activity' ? (
            <SystemActivityTab
              rows={sysRows}
              summary={sysSummary}
              filter={sysFilter}
              onFilterChange={f => setSysFilter(prev => ({ ...prev, ...f }))}
              onRefine={() => { setSysPage(1); loadSystemActivity({ page: 1 }) }}
              onRefresh={() => loadSystemActivity({ page: sysPage })}
              page={sysPage}
              pageSize={sysPageSize}
              total={sysTotal}
              totalPages={sysTotalPages}
              loading={sysLoading}
              onPageChange={p => { setSysPage(p); loadSystemActivity({ page: p }) }}
              onPageSizeChange={ps => { setSysPage(1); setSysPageSize(ps); loadSystemActivity({ page: 1, page_size: ps }) }}
            />
          ) : (
            <div className="page-content" style={{ padding: 0, flex: 1, overflow: 'auto' }}>
              {renderContent()}
            </div>
          )}
          </div>
        </div>
      </div>

      {/* ESIG Modal — Electronic Signature (21 CFR Part 11 ESIG-01, ESIG-02) */}
      {esigAction && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 8, padding: 28, maxWidth: 420, width: '90%', boxShadow: 'var(--shadow-md)' }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Electronic Signature Required</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16 }}>21 CFR Part 11 — This action requires your electronic signature to proceed.</div>
            <div style={{ background: 'var(--bg)', borderRadius: 6, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--text-secondary)', borderLeft: '3px solid var(--warning)' }}>
              {esigAction.msg}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              <input className="form-control" type="password" placeholder="Enter your password to confirm identity"
                value={esigForm.password} onChange={e => setEsigForm(f => ({ ...f, password: e.target.value }))} />
              <textarea className="form-control" placeholder="Reason / justification for this change (required)" rows={2}
                style={{ resize: 'none' }} value={esigForm.reason}
                onChange={e => setEsigForm(f => ({ ...f, reason: e.target.value }))} />
              {esigError && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{esigError}</div>}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setEsigAction(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={async () => {
                if (!esigForm.password || !esigForm.reason) { setEsigError('Both password and reason are required.'); return }
                try {
                  const r = await fetch('/api/admin/esig-verify', {
                    method: 'POST', headers: H,
                    body: JSON.stringify({ password: esigForm.password, reason: esigForm.reason, action: esigAction.msg, entity: esigAction.entity, entity_id: esigAction.entityId })
                  })
                  const d = await r.json()
                  if (!r.ok) { setEsigError(d.error || 'Signature rejected.'); return }
                  await esigAction.onConfirm()
                  setEsigAction(null)
                  setEsigForm({ password: '', reason: '' })
                  setEsigError('')
                } catch { setEsigError('Server unreachable. Please restart the backend and try again.') }
              }}>Sign & Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Email Account Add/Edit Modal ─────────────────────── */}
      {emailModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 10, width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto', padding: 28, boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0 }}>{emailModal === 'add' ? 'Add Email Account' : 'Edit Email Account'}</h3>
              <button onClick={() => setEmailModal(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>
            <form onSubmit={saveEmailAccount}>
              {/* Section 1 — Identity */}
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>Identity</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Organisation *</label>
                    {isSuperadmin ? (
                      <select className="form-control" value={emailForm.org_id} onChange={e => setEmailForm(f => ({ ...f, org_id: e.target.value }))} required>
                        <option value="">— Select Org —</option>
                        {orgs.filter(o => o.is_active).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                    ) : (
                      <input className="form-control" value={orgName || 'Active Organisation'} disabled />
                    )}
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Account Name *</label>
                    <input className="form-control" value={emailForm.account_name} onChange={e => setEmailForm(f => ({ ...f, account_name: e.target.value }))} required />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Provider *</label>
                    <select className="form-control" value={emailForm.provider} onChange={e => applyProviderPreset(e.target.value)} required>
                      <option>Gmail</option>
                      <option>Microsoft365</option>
                      <option>Generic</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Direction *</label>
                    <select className="form-control" value={emailForm.direction} onChange={e => setEmailForm(f => ({ ...f, direction: e.target.value }))} required>
                      <option>Inbound</option>
                      <option>Outbound</option>
                      <option>Both</option>
                    </select>
                  </div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginTop: 10, cursor: 'pointer' }}>
                  <input type="checkbox" checked={emailForm.is_active} onChange={e => setEmailForm(f => ({ ...f, is_active: e.target.checked }))} />
                  Active
                </label>
              </div>

              {/* Section 2 — Address Fields */}
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>Address</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {['Inbound', 'Both'].includes(emailForm.direction) && (
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Mailbox Email *</label>
                      <input className="form-control" type="email" value={emailForm.mailbox_email} onChange={e => setEmailForm(f => ({ ...f, mailbox_email: e.target.value }))} required />
                    </div>
                  )}
                  {['Outbound', 'Both'].includes(emailForm.direction) && (
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>From Email *</label>
                      <input className="form-control" type="email" value={emailForm.from_email} onChange={e => setEmailForm(f => ({ ...f, from_email: e.target.value }))} required />
                    </div>
                  )}
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Display Name</label>
                    <input className="form-control" value={emailForm.display_name} onChange={e => setEmailForm(f => ({ ...f, display_name: e.target.value }))} />
                  </div>
                </div>
                {['Outbound', 'Both'].includes(emailForm.direction) && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginTop: 10, cursor: 'pointer' }}>
                    <input type="checkbox" checked={emailForm.is_default_outbound} onChange={e => setEmailForm(f => ({ ...f, is_default_outbound: e.target.checked }))} />
                    Default Outbound for this Org
                  </label>
                )}
              </div>

              {/* Section 3 — IMAP (inbound only) */}
              {['Inbound', 'Both'].includes(emailForm.direction) && (
                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>Inbound (IMAP)</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>IMAP Host *</label>
                      <input className="form-control" value={emailForm.imap_host} onChange={e => setEmailForm(f => ({ ...f, imap_host: e.target.value }))} required />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>IMAP Port *</label>
                      <input className="form-control" type="number" value={emailForm.imap_port} onChange={e => setEmailForm(f => ({ ...f, imap_port: e.target.value }))} required />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Encryption *</label>
                      <select className="form-control" value={emailForm.imap_encryption} onChange={e => setEmailForm(f => ({ ...f, imap_encryption: e.target.value }))}>
                        <option>SSL/TLS</option><option>STARTTLS</option><option>None</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Username *</label>
                      <input className="form-control" value={emailForm.imap_username} onChange={e => setEmailForm(f => ({ ...f, imap_username: e.target.value }))} required />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Password {emailModal === 'edit' ? '(leave blank to keep existing)' : '*'}</label>
                      <input className="form-control" type="password" value={emailForm.imap_password} onChange={e => setEmailForm(f => ({ ...f, imap_password: e.target.value }))} required={emailModal === 'add'} />
                    </div>
                  </div>
                </div>
              )}

              {/* Section 4 — SMTP (outbound only) */}
              {['Outbound', 'Both'].includes(emailForm.direction) && (
                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>Outbound (SMTP)</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>SMTP Host *</label>
                      <input className="form-control" value={emailForm.smtp_host} onChange={e => setEmailForm(f => ({ ...f, smtp_host: e.target.value }))} required />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>SMTP Port *</label>
                      <input className="form-control" type="number" value={emailForm.smtp_port} onChange={e => setEmailForm(f => ({ ...f, smtp_port: e.target.value }))} required />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Encryption *</label>
                      <select className="form-control" value={emailForm.smtp_encryption} onChange={e => setEmailForm(f => ({ ...f, smtp_encryption: e.target.value }))}>
                        <option>SSL/TLS</option><option>STARTTLS</option><option>None</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Username *</label>
                      <input className="form-control" value={emailForm.smtp_username} onChange={e => setEmailForm(f => ({ ...f, smtp_username: e.target.value }))} required />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Password {emailModal === 'edit' ? '(leave blank to keep existing)' : '*'}</label>
                      <input className="form-control" type="password" value={emailForm.smtp_password} onChange={e => setEmailForm(f => ({ ...f, smtp_password: e.target.value }))} required={emailModal === 'add'} />
                    </div>
                  </div>
                </div>
              )}

              {/* Section 5 — Ingestion Controls (inbound only) */}
              {['Inbound', 'Both'].includes(emailForm.direction) && (
                <div style={{ marginBottom: 20 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>Ingestion Controls</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Polling Interval (min)</label>
                      <input className="form-control" type="number" min={1} value={emailForm.polling_interval_min} onChange={e => setEmailForm(f => ({ ...f, polling_interval_min: Number(e.target.value) }))} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Initial Fetch Window (days)</label>
                      <input className="form-control" type="number" min={1} value={emailForm.initial_fetch_days} onChange={e => setEmailForm(f => ({ ...f, initial_fetch_days: Number(e.target.value) }))} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Mailbox Folder</label>
                      <input className="form-control" value={emailForm.mailbox_folder} onChange={e => setEmailForm(f => ({ ...f, mailbox_folder: e.target.value }))} />
                    </div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginTop: 10, cursor: 'pointer' }}>
                    <input type="checkbox" checked={emailForm.ingest_attachments} onChange={e => setEmailForm(f => ({ ...f, ingest_attachments: e.target.checked }))} />
                    Ingest Attachments
                  </label>
                  {emailForm.ingest_attachments && (
                    <div style={{ marginTop: 10, maxWidth: 200 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Max Attachment Size (MB)</label>
                      <input className="form-control" type="number" min={1} value={emailForm.max_attachment_mb} onChange={e => setEmailForm(f => ({ ...f, max_attachment_mb: Number(e.target.value) }))} />
                    </div>
                  )}
                </div>
              )}

              {/* Footer */}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                <button type="button" className="btn btn-outline" onClick={() => setEmailModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{emailModal === 'add' ? 'Create Account' : 'Save Changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── SMTP Error Detail Modal ──────────────────────────── */}
      {smtpErrorModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 10, width: '100%', maxWidth: 480, padding: 28, boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}>
            <h3 style={{ margin: '0 0 4px', color: 'var(--danger)' }}>SMTP Test Failed</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              Account: <strong>{smtpErrorModal.account_name}</strong> &nbsp;·&nbsp; {smtpErrorModal.tested_at}
            </p>
            <pre style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 14, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--danger)', margin: '0 0 20px' }}>
              {smtpErrorModal.error}
            </pre>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setSmtpErrorModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Send Test Email Mini-Modal ───────────────────────── */}
      {sendTestModalId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 10, width: '100%', maxWidth: 400, padding: 28, boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}>
            <h3 style={{ margin: '0 0 8px' }}>Send Test Email</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              Account: <strong>{emailAccounts.find(a => a.id === sendTestModalId)?.account_name}</strong>
            </p>
            <form onSubmit={submitSendTest}>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Recipient Email *</label>
              <input className="form-control" type="email" placeholder="test@example.com" value={sendTestRecipient} onChange={e => setSendTestRecipient(e.target.value)} required style={{ marginBottom: 16 }} />
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setSendTestModalId(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={emailTestingId === `send-${sendTestModalId}`}>
                  {emailTestingId === `send-${sendTestModalId}` ? 'Sending...' : 'Send Test Email'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </MIMSLayout>
  )
}
