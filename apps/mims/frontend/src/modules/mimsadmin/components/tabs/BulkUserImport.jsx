/**
 * BulkUserImport.jsx — MIMS Admin > System > Security > Bulk Add Users
 * CSS namespace: ma-usr- (shares Users.css)
 *
 * PAUD-4 item 2. Front end for POST /api/admin/users/bulk.
 *
 * The security group and tenants are chosen ONCE for the whole batch rather than
 * per CSV column. Provisioning forty people almost always means forty people in
 * the same role, and asking an administrator to hand-type a group id into a
 * spreadsheet is how the wrong access level gets granted quietly. Anyone needing
 * mixed roles runs one batch per role.
 *
 * The batch is all-or-nothing server side, so this screen never reports partial
 * success — it either created everyone or created nobody and says which rows are
 * at fault.
 */

import { useState, useMemo } from 'react'
import { httpFetch } from '../../../../shared/api/httpFetch.js'

const API = '/api/admin'

const TEMPLATE_HEADERS = ['user_id', 'name', 'email', 'initials', 'department', 'network_user_id']
const REQUIRED = ['user_id', 'name', 'email']
const MAX_ROWS = 500

/** Minimal CSV parse — the importer accepts the same shape the template exports. */
export function parseCsv(text) {
  const lines = String(text || '').split(/\r?\n/).filter(l => l.trim() !== '')
  if (!lines.length) return { headers: [], rows: [] }

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
  const rows = lines.slice(1).map((line, i) => {
    const values = line.split(',').map(v => v.trim())
    const row = { __row: i + 1 }
    headers.forEach((h, idx) => { row[h] = values[idx] ?? '' })
    return row
  })
  return { headers, rows }
}

/**
 * Client-side mirror of the server's batch rules. It exists so an administrator
 * sees the problem before submitting, NOT as the enforcement point — the server
 * validates independently and is the one that decides.
 */
export function validateRows(rows) {
  const errors = []
  const seenIds = new Set()
  const seenEmails = new Set()

  if (!rows.length) errors.push({ row: null, reason: 'No rows found in the file.' })
  if (rows.length > MAX_ROWS) errors.push({ row: null, reason: `A batch may contain at most ${MAX_ROWS} users.` })

  rows.forEach(r => {
    const missing = REQUIRED.filter(f => !String(r[f] || '').trim())
    if (missing.length) {
      errors.push({ row: r.__row, reason: `Missing: ${missing.join(', ')}` })
      return
    }
    const email = String(r.email).trim().toLowerCase()
    if (!email.includes('@')) {
      errors.push({ row: r.__row, reason: `Not a valid email address: ${r.email}` })
      return
    }
    const userId = String(r.user_id).trim()
    if (seenIds.has(userId))   { errors.push({ row: r.__row, reason: `Duplicate user_id in file: ${userId}` }); return }
    if (seenEmails.has(email)) { errors.push({ row: r.__row, reason: `Duplicate email in file: ${email}` });   return }
    seenIds.add(userId)
    seenEmails.add(email)
  })

  return errors
}

export default function BulkUserImport({ groups, orgs, token, onClose, onCreated }) {
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  const [csvText,   setCsvText]   = useState('')
  const [fileName,  setFileName]  = useState('')
  const [groupId,   setGroupId]   = useState('')
  const [tenantIds, setTenantIds] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [serverErrors, setServerErrors] = useState([])
  const [apiErr,    setApiErr]    = useState('')
  const [result,    setResult]    = useState(null)

  const { rows } = useMemo(() => parseCsv(csvText), [csvText])
  const clientErrors = useMemo(() => (csvText.trim() ? validateRows(rows) : []), [csvText, rows])

  const errorsByRow = useMemo(() => {
    const map = new Map()
    ;[...clientErrors, ...serverErrors].forEach(e => {
      if (e.row == null) return
      if (!map.has(e.row)) map.set(e.row, [])
      map.get(e.row).push(e.reason)
    })
    return map
  }, [clientErrors, serverErrors])

  const batchErrors = [...clientErrors, ...serverErrors].filter(e => e.row == null)
  const canSubmit = rows.length > 0 && clientErrors.length === 0 && groupId && tenantIds.length > 0 && !submitting

  function readFile(file) {
    if (!file) return
    setFileName(file.name)
    setServerErrors([]); setResult(null); setApiErr('')
    const reader = new FileReader()
    reader.onload = e => setCsvText(String(e.target.result || ''))
    reader.readAsText(file)
  }

  function downloadTemplate() {
    const csv = `${TEMPLATE_HEADERS.join(',')}\njdoe,Jane Doe,jane.doe@example.com,JD,Medical Information,\n`
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'mims-bulk-users-template.csv'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function toggleTenant(id) {
    setTenantIds(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id])
  }

  async function handleSubmit() {
    setSubmitting(true); setServerErrors([]); setApiErr(''); setResult(null)
    try {
      const users = rows.map(r => ({
        user_id: r.user_id, name: r.name, email: r.email,
        initials: r.initials || '', department: r.department || '',
        network_user_id: r.network_user_id || '',
        security_group_id: Number(groupId),
        tenant_ids: tenantIds,
      }))
      const res = await httpFetch(`${API}/users/bulk`, {
        method: 'POST', headers: H, body: JSON.stringify({ users }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setServerErrors(Array.isArray(data.errors) ? data.errors : [])
        setApiErr(data.error || 'Batch rejected. No users were created.')
        return
      }
      setResult({ created: data.created ?? 0 })
      onCreated?.(data.created ?? 0)
    } catch {
      setApiErr('Network error. No users were created.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="ma-usr-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="ma-usr-modal ma-usr-modal-wide">

        <div className="ma-usr-modal-header">
          <h2 className="ma-usr-modal-title">Bulk Add Users</h2>
          <button className="ma-usr-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="ma-usr-modal-body">
          {result ? (
            <div className="ma-usr-bulk-result">
              <div className="ma-usr-bulk-result-count">{result.created}</div>
              <p>user{result.created === 1 ? '' : 's'} created. Each one must reset their password at first login.</p>
            </div>
          ) : (
            <>
              {/* 1 — the file */}
              <div className="ma-usr-section-title">1 · Users file</div>
              <div className="ma-usr-bulk-filerow">
                <label className="ma-usr-bulk-filebtn">
                  Choose CSV file
                  <input
                    type="file" accept=".csv,text/csv" style={{ display: 'none' }}
                    onChange={e => readFile(e.target.files?.[0])}
                  />
                </label>
                <span className="ma-usr-bulk-filename">{fileName || 'No file chosen'}</span>
                <button type="button" className="ma-usr-bulk-link" onClick={downloadTemplate}>
                  Download template
                </button>
              </div>
              <textarea
                className="ma-usr-bulk-textarea"
                placeholder={`${TEMPLATE_HEADERS.join(',')}\njdoe,Jane Doe,jane.doe@example.com,JD,Medical Information,`}
                value={csvText}
                onChange={e => { setCsvText(e.target.value); setServerErrors([]); setApiErr('') }}
              />
              <span className="ma-usr-bulk-hint">
                Required columns: <strong>user_id, name, email</strong>. Optional: initials, department, network_user_id.
                Or paste rows directly above.
              </span>

              {/* 2 — access, chosen once for the batch */}
              <div className="ma-usr-section-title">2 · Access for everyone in this batch</div>
              <div className="ma-usr-row">
                <div className="ma-usr-field">
                  <label>Security Group<span className="req">*</span></label>
                  <select className="ma-usr-select" value={groupId} onChange={e => setGroupId(e.target.value)}>
                    <option value="">Select a security group…</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
                <div className="ma-usr-field">
                  <label>Tenants<span className="req">*</span></label>
                  <div className="ma-usr-checks ma-usr-bulk-tenants">
                    {orgs.map(o => (
                      <label key={o.id} className="ma-usr-check">
                        <input
                          type="checkbox"
                          checked={tenantIds.includes(o.id)}
                          onChange={() => toggleTenant(o.id)}
                        />
                        {o.name}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* 3 — what will happen */}
              {csvText.trim() && (
                <>
                  <div className="ma-usr-section-title">
                    3 · Preview — {rows.length} row{rows.length === 1 ? '' : 's'}
                    {errorsByRow.size > 0 && (
                      <span className="ma-usr-bulk-badge-err">{errorsByRow.size} with problems</span>
                    )}
                  </div>

                  {batchErrors.length > 0 && (
                    <div className="ma-usr-bulk-batch-err">
                      {batchErrors.map((e, i) => <div key={i}>{e.reason}</div>)}
                    </div>
                  )}

                  <div className="ma-usr-bulk-preview">
                    <table className="ma-usr-table">
                      <thead>
                        <tr>
                          <th style={{ width: 44 }}>#</th>
                          <th>User ID</th><th>Name</th><th>Email</th><th>Problem</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(r => {
                          const problems = errorsByRow.get(r.__row)
                          return (
                            <tr key={r.__row} className={problems ? 'ma-usr-bulk-rowerr' : ''}>
                              <td>{r.__row}</td>
                              <td>{r.user_id || '—'}</td>
                              <td>{r.name || '—'}</td>
                              <td>{r.email || '—'}</td>
                              <td className="ma-usr-bulk-problem">{problems ? problems.join('; ') : ''}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="ma-usr-modal-footer">
          {apiErr && <span className="ma-usr-footer-err">{apiErr}</span>}
          {result ? (
            <button className="ma-usr-btn-save" onClick={onClose}>Done</button>
          ) : (
            <>
              <button className="ma-usr-btn-cancel" onClick={onClose}>Cancel</button>
              <button className="ma-usr-btn-save" onClick={handleSubmit} disabled={!canSubmit}>
                {submitting ? 'Creating…' : `Create ${rows.length || ''} User${rows.length === 1 ? '' : 's'}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
