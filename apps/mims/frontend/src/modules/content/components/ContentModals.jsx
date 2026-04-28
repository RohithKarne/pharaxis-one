import { useState, useEffect } from 'react'
import toast from '../../../shared/utils/toast'
import { httpFetch } from '../../../shared/api/httpFetch.js'

export function CheckInModal({ item, onClose, onConfirm, loading }) {
  return (
    <div className="cm-modal-overlay">
      <div className="cm-modal">
        <h3 className="cm-modal-title">Check In Document</h3>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
          Check in <strong>"{item?.name || item?.question || item?.title}"</strong>?<br />
          This will move it to <strong>Pending</strong> status.
        </p>
        <div className="cm-modal-footer">
          <button className="cm-btn cm-btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="cm-btn cm-btn-primary" onClick={onConfirm} disabled={loading}>{loading ? 'Checking in…' : 'Confirm'}</button>
        </div>
      </div>
    </div>
  )
}

export function InitiateReviewModal({ doc, token, onClose, onDone }) {
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const [users, setUsers] = useState([])
  const [form, setForm] = useState({ title: '', planned_end_date: '', non_amendable: false, reviewers: [], description: '' })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    httpFetch('/api/admin/users', { headers: authHeaders })
      .then(r => r.ok ? r.json() : [])
      .then(d => setUsers(Array.isArray(d) ? d : d.users || []))
      .catch(() => {})
  }, []) // eslint-disable-line

  function toggleReviewer(id) {
    setForm(p => ({
      ...p,
      reviewers: p.reviewers.includes(id) ? p.reviewers.filter(r => r !== id) : [...p.reviewers, id]
    }))
  }

  async function handleSubmit() {
    if (!form.title.trim()) return toast.warn('Review title is required.')
    if (!form.planned_end_date) return toast.warn('Planned end date is required.')
    if (!form.reviewers.length) return toast.warn('Select at least one reviewer.')
    setLoading(true)
    try {
      const res = await httpFetch(`/api/cm/documents/${doc.id}/initiate-review`, {
        method: 'POST', headers: authHeaders, body: JSON.stringify(form)
      })
      if (res.ok) { onDone(); onClose() }
      else { const d = await res.json(); toast.error(d.error || 'Failed to initiate review.') }
    } catch { toast.error('Network error.') }
    setLoading(false)
  }

  return (
    <div className="cm-modal-overlay">
      <div className="cm-modal" style={{ width: 560 }}>
        <h3 className="cm-modal-title">Initiate Review — {doc.name}</h3>
        <div className="cm-form-group">
          <label className="cm-form-label">Review Title <span className="required">*</span></label>
          <input className="cm-form-input" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
        </div>
        <div className="cm-form-group">
          <label className="cm-form-label">Planned End Date <span className="required">*</span></label>
          <input type="date" className="cm-form-input" value={form.planned_end_date} onChange={e => setForm(p => ({ ...p, planned_end_date: e.target.value }))} />
        </div>
        <div className="cm-form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
            <input type="checkbox" checked={form.non_amendable} onChange={e => setForm(p => ({ ...p, non_amendable: e.target.checked }))} />
            Non-Amendable
          </label>
        </div>
        <div className="cm-form-group">
          <label className="cm-form-label">Reviewers <span className="required">*</span></label>
          <div style={{ border: '1px solid var(--border)', borderRadius: 6, maxHeight: 160, overflowY: 'auto', padding: 8 }}>
            {users.length === 0 ? <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading users…</p> : users.map(u => (
              <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer', fontSize: 14 }}>
                <input type="checkbox" checked={form.reviewers.includes(u.id)} onChange={() => toggleReviewer(u.id)} />
                {u.name} <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>({u.email})</span>
              </label>
            ))}
          </div>
        </div>
        <div className="cm-form-group">
          <label className="cm-form-label">Description</label>
          <textarea className="cm-form-textarea" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={3} />
        </div>
        <div className="cm-modal-footer">
          <button className="cm-btn cm-btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="cm-btn cm-btn-primary" onClick={handleSubmit} disabled={loading}>{loading ? 'Starting…' : 'Start Review'}</button>
        </div>
      </div>
    </div>
  )
}

export function ApproveModal({ doc, user, token, onClose, onDone }) {
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const [form, setForm] = useState({ password: '', reason: '' })
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    if (!form.password) return toast.warn('Password is required.')
    if (!form.reason.trim()) return toast.warn('Reason is required.')
    setLoading(true)
    try {
      const res = await httpFetch(`/api/cm/documents/${doc.id}/approve`, {
        method: 'POST', headers: authHeaders, body: JSON.stringify(form)
      })
      if (res.ok) { onDone(); onClose() }
      else { const d = await res.json(); toast.error(d.error || 'Approval failed.') }
    } catch { toast.error('Network error.') }
    setLoading(false)
  }

  return (
    <div className="cm-modal-overlay">
      <div className="cm-modal">
        <h3 className="cm-modal-title">Approve Document</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>Approving: <strong>{doc.name}</strong></p>
        <div className="cm-form-group">
          <label className="cm-form-label">User ID</label>
          <input className="cm-form-input" value={user?.email || user?.username || ''} readOnly style={{ background: 'var(--bg)' }} />
        </div>
        <div className="cm-form-group">
          <label className="cm-form-label">Password <span className="required">*</span></label>
          <input type="password" className="cm-form-input" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} placeholder="Enter your password" />
        </div>
        <div className="cm-form-group">
          <label className="cm-form-label">Reason for Approval <span className="required">*</span></label>
          <textarea className="cm-form-textarea" value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} rows={3} placeholder="State the reason for approval…" />
        </div>
        <div className="cm-modal-footer">
          <button className="cm-btn cm-btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="cm-btn cm-btn-primary" onClick={handleSubmit} disabled={loading}>{loading ? 'Approving…' : 'Approve'}</button>
        </div>
      </div>
    </div>
  )
}

export function PublishModal({ doc, user, token, onClose, onDone }) {
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const [form, setForm] = useState({ password: '', org_version: '', reason: '' })
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    if (!form.password) return toast.warn('Password is required.')
    if (!form.reason.trim()) return toast.warn('Reason is required.')
    setLoading(true)
    try {
      const res = await httpFetch(`/api/cm/documents/${doc.id}/publish`, {
        method: 'POST', headers: authHeaders, body: JSON.stringify(form)
      })
      if (res.ok) { onDone(); onClose() }
      else { const d = await res.json(); toast.error(d.error || 'Publish failed.') }
    } catch { toast.error('Network error.') }
    setLoading(false)
  }

  return (
    <div className="cm-modal-overlay">
      <div className="cm-modal">
        <h3 className="cm-modal-title">Publish Document</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>Publishing: <strong>{doc.name}</strong></p>
        <div className="cm-form-group">
          <label className="cm-form-label">User ID</label>
          <input className="cm-form-input" value={user?.email || user?.username || ''} readOnly style={{ background: 'var(--bg)' }} />
        </div>
        <div className="cm-form-group">
          <label className="cm-form-label">Password <span className="required">*</span></label>
          <input type="password" className="cm-form-input" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} placeholder="Enter your password" />
        </div>
        <div className="cm-form-group">
          <label className="cm-form-label">System Version</label>
          <input className="cm-form-input" value={doc.version || '1.0'} readOnly style={{ background: 'var(--bg)' }} />
        </div>
        <div className="cm-form-group">
          <label className="cm-form-label">Org Version</label>
          <input className="cm-form-input" value={form.org_version} onChange={e => setForm(p => ({ ...p, org_version: e.target.value }))} placeholder="Optional (e.g. v2.1-CORP)" />
        </div>
        <div className="cm-form-group">
          <label className="cm-form-label">Reason for Publishing <span className="required">*</span></label>
          <textarea className="cm-form-textarea" value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} rows={3} placeholder="State the reason for publishing…" />
        </div>
        <div className="cm-modal-footer">
          <button className="cm-btn cm-btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="cm-btn cm-btn-primary" onClick={handleSubmit} disabled={loading}>{loading ? 'Publishing…' : 'Publish'}</button>
        </div>
      </div>
    </div>
  )
}

export function ReviewStatusModal({ review, token, onClose, onDone }) {
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const [form, setForm] = useState({ status: 'Ongoing', reason: '' })
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    if (!form.reason.trim()) return toast.warn('Reason is required.')
    setLoading(true)
    try {
      const res = await httpFetch(`/api/cm/reviews/${review.id}/reviewer-status`, {
        method: 'PUT', headers: authHeaders, body: JSON.stringify(form)
      })
      if (res.ok) { onDone(); onClose() }
      else { const d = await res.json(); toast.error(d.error || 'Failed to update status.') }
    } catch { toast.error('Network error.') }
    setLoading(false)
  }

  return (
    <div className="cm-modal-overlay">
      <div className="cm-modal">
        <h3 className="cm-modal-title">Update Review Status</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>{review.document_name} — {review.title}</p>
        <div className="cm-form-group">
          <label className="cm-form-label">Status <span className="required">*</span></label>
          <select className="cm-form-select" value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
            <option>Ongoing</option>
            <option>Accepted</option>
            <option>Accepted with Changes</option>
            <option>Declined</option>
            <option>Rejected</option>
          </select>
        </div>
        <div className="cm-form-group">
          <label className="cm-form-label">Reason <span className="required">*</span></label>
          <textarea className="cm-form-textarea" value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} rows={3} placeholder="Provide your reason…" />
        </div>
        <div className="cm-modal-footer">
          <button className="cm-btn cm-btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="cm-btn cm-btn-primary" onClick={handleSubmit} disabled={loading}>{loading ? 'Submitting…' : 'Submit'}</button>
        </div>
      </div>
    </div>
  )
}
