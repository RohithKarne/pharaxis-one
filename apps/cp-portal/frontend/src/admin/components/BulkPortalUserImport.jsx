/**
 * BulkPortalUserImport.jsx — CP Portal Admin > Portal Users > Bulk Add
 *
 * PAUD-4 item 2. Front end for POST /api/admin/users/:clientId/bulk-create.
 *
 * Unlike the MIMS equivalent, user_type is a genuine per-person attribute here —
 * an HCP and a patient are not interchangeable — so the CSV carries it per row.
 * The batch-level selector is only a DEFAULT, applied where a row leaves the
 * column blank.
 *
 * Accounts are created all-or-nothing; invitation emails are sent afterwards and
 * reported separately, because an email that has gone out cannot be rolled back.
 */

import { useState, useMemo } from 'react'
import { adminHeaders } from '../context/AdminAuthContext'

const TEMPLATE_HEADERS = ['first_name', 'last_name', 'email', 'user_type', 'specialty', 'country']
const VALID_USER_TYPES = ['hcp', 'physician', 'patient', 'non_hcp', 'other']
const MAX_ROWS = 500

export function parseCsv(text) {
  const lines = String(text || '').split(/\r?\n/).filter(l => l.trim() !== '')
  if (!lines.length) return []

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
  return lines.slice(1).map((line, i) => {
    const values = line.split(',').map(v => v.trim())
    const row = { __row: i + 1 }
    headers.forEach((h, idx) => { row[h] = values[idx] ?? '' })
    return row
  })
}

/**
 * Client-side mirror of the server's batch rules — shown before submitting so an
 * administrator fixes the file once. The server validates independently and is
 * the one that decides.
 */
export function validateRows(rows, defaultType) {
  const errors = []
  const seen = new Set()

  if (!rows.length) errors.push({ row: null, reason: 'No rows found in the file.' })
  if (rows.length > MAX_ROWS) errors.push({ row: null, reason: `A batch may contain at most ${MAX_ROWS} users.` })

  rows.forEach(r => {
    const missing = ['first_name', 'last_name', 'email'].filter(f => !String(r[f] || '').trim())
    if (missing.length) {
      errors.push({ row: r.__row, reason: `Missing: ${missing.join(', ')}` })
      return
    }
    const email = String(r.email).trim().toLowerCase()
    if (!email.includes('@')) {
      errors.push({ row: r.__row, reason: `Not a valid email address: ${r.email}` })
      return
    }
    if (email.length > 254 || String(r.first_name).length > 255 || String(r.last_name).length > 255) {
      errors.push({ row: r.__row, reason: 'Input exceeds maximum length.' })
      return
    }
    const type = String(r.user_type || '').trim().toLowerCase() || defaultType
    if (!VALID_USER_TYPES.includes(type)) {
      errors.push({ row: r.__row, reason: `Invalid user_type: ${r.user_type}` })
      return
    }
    if (seen.has(email)) {
      errors.push({ row: r.__row, reason: `Duplicate email in file: ${email}` })
      return
    }
    seen.add(email)
  })

  return errors
}

export default function BulkPortalUserImport({ clientId, onClose, onCreated }) {
  const [csvText,     setCsvText]     = useState('')
  const [fileName,    setFileName]    = useState('')
  const [defaultType, setDefaultType] = useState('hcp')
  const [submitting,  setSubmitting]  = useState(false)
  const [serverErrors, setServerErrors] = useState([])
  const [apiErr,      setApiErr]      = useState('')
  const [result,      setResult]      = useState(null)

  const rows = useMemo(() => parseCsv(csvText), [csvText])
  const clientErrors = useMemo(
    () => (csvText.trim() ? validateRows(rows, defaultType) : []),
    [csvText, rows, defaultType]
  )

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
  const canSubmit = rows.length > 0 && clientErrors.length === 0 && !submitting

  function readFile(file) {
    if (!file) return
    setFileName(file.name)
    setServerErrors([]); setResult(null); setApiErr('')
    const reader = new FileReader()
    reader.onload = e => setCsvText(String(e.target.result || ''))
    reader.readAsText(file)
  }

  function downloadTemplate() {
    const csv = `${TEMPLATE_HEADERS.join(',')}\nAnita,Sharma,anita.sharma@example.com,hcp,Cardiology,India\n`
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'cp-portal-bulk-users-template.csv'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  async function handleSubmit() {
    setSubmitting(true); setServerErrors([]); setApiErr(''); setResult(null)
    try {
      const users = rows.map(r => ({
        first_name: r.first_name,
        last_name:  r.last_name,
        email:      r.email,
        user_type:  String(r.user_type || '').trim().toLowerCase() || defaultType,
        specialty:  r.specialty || null,
        country:    r.country   || null,
      }))
      const res = await fetch(`/api/admin/users/${clientId}/bulk-create`, {
        method: 'POST', headers: adminHeaders(), body: JSON.stringify({ users }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setServerErrors(Array.isArray(data.errors) ? data.errors : [])
        setApiErr(data.error || 'Batch rejected. No users were created.')
        return
      }
      setResult({ created: data.created ?? 0, inviteFailures: data.invite_failures || [] })
      onCreated?.(data.created ?? 0)
    } catch {
      setApiErr('Network error. No users were created.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="cp-modal-overlay" onClick={onClose}>
      <div className="cp-modal cp-modal-wide" onClick={e => e.stopPropagation()}>

        <div className="cp-modal-header">
          <span>Bulk Add Portal Users</span>
          <button className="cp-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="cp-modal-body">
          {result ? (
            <div className="cp-bulk-result">
              <div className="cp-bulk-result-count">{result.created}</div>
              <p>
                portal user{result.created === 1 ? '' : 's'} created.
                {result.inviteFailures.length === 0
                  ? ' Each has been emailed an invitation to set a password.'
                  : ''}
              </p>
              {result.inviteFailures.length > 0 && (
                <div className="cp-error" style={{ textAlign: 'left', marginTop: 8 }}>
                  <strong>{result.inviteFailures.length} invitation(s) failed to send.</strong>
                  <div style={{ marginTop: 6, fontSize: 12 }}>
                    The accounts exist. Use “Resend invite” for: {result.inviteFailures.map(f => f.email).join(', ')}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="cp-bulk-filerow">
                <label className="cp-btn cp-btn-outline cp-btn-sm" style={{ cursor: 'pointer' }}>
                  Choose CSV file
                  <input type="file" accept=".csv,text/csv" style={{ display: 'none' }}
                    onChange={e => readFile(e.target.files?.[0])} />
                </label>
                <span className="cp-bulk-filename">{fileName || 'No file chosen'}</span>
                <button type="button" className="cp-bulk-link" onClick={downloadTemplate}>Download template</button>
              </div>

              <div className="cp-field">
                <label>Users file</label>
                <textarea
                  className="cp-bulk-textarea"
                  rows={5}
                  placeholder={`${TEMPLATE_HEADERS.join(',')}\nAnita,Sharma,anita.sharma@example.com,hcp,Cardiology,India`}
                  value={csvText}
                  onChange={e => { setCsvText(e.target.value); setServerErrors([]); setApiErr('') }}
                />
                <small>Required: first_name, last_name, email. Optional: user_type, specialty, country.</small>
              </div>

              <div className="cp-field" style={{ maxWidth: 260 }}>
                <label>Default user type</label>
                <select value={defaultType} onChange={e => setDefaultType(e.target.value)}>
                  <option value="hcp">HCP</option>
                  <option value="physician">Physician</option>
                  <option value="patient">Patient</option>
                  <option value="non_hcp">Non-HCP</option>
                  <option value="other">Other</option>
                </select>
                <small>Used only where a row leaves user_type blank.</small>
              </div>

              {csvText.trim() && (
                <>
                  <div className="cp-bulk-previewhead">
                    Preview — {rows.length} row{rows.length === 1 ? '' : 's'}
                    {errorsByRow.size > 0 && (
                      <span className="cp-bulk-badge-err">{errorsByRow.size} with problems</span>
                    )}
                  </div>

                  {batchErrors.length > 0 && (
                    <div className="cp-error">
                      {batchErrors.map((e, i) => <div key={i}>{e.reason}</div>)}
                    </div>
                  )}

                  <div className="cp-bulk-preview">
                    <table className="cp-table">
                      <thead>
                        <tr>
                          <th style={{ width: 40 }}>#</th>
                          <th>Name</th><th>Email</th><th>Type</th><th>Problem</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(r => {
                          const problems = errorsByRow.get(r.__row)
                          return (
                            <tr key={r.__row} className={problems ? 'cp-bulk-rowerr' : ''}>
                              <td>{r.__row}</td>
                              <td>{[r.first_name, r.last_name].filter(Boolean).join(' ') || '—'}</td>
                              <td>{r.email || '—'}</td>
                              <td>
                                <span className="cp-type-badge">
                                  {String(r.user_type || '').trim().toLowerCase() || defaultType}
                                </span>
                              </td>
                              <td className="cp-bulk-problem">{problems ? problems.join('; ') : ''}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {apiErr && <div className="cp-error">{apiErr}</div>}
            </>
          )}
        </div>

        <div className="cp-modal-footer">
          {result ? (
            <button className="cp-btn cp-btn-primary" onClick={onClose}>Done</button>
          ) : (
            <>
              <button className="cp-btn cp-btn-primary" onClick={handleSubmit} disabled={!canSubmit}>
                {submitting ? 'Creating…' : `Create ${rows.length || ''} User${rows.length === 1 ? '' : 's'}`}
              </button>
              <button className="cp-btn cp-btn-outline" onClick={onClose}>Cancel</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
