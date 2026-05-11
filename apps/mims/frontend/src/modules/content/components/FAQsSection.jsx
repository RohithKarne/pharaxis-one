import { useState, useEffect, useCallback } from 'react'
import toast from '../../../shared/utils/toast'
import StatusBadge from './StatusBadge'
import RichTextEditor from './RichTextEditor'
import { CheckInModal } from './ContentModals'
import { httpFetch } from '../../../shared/api/httpFetch.js'

function FAQDrawer({ faq, folders, token, onClose, onSaved }) {
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const isEdit = !!faq?.id
  const [form, setForm] = useState({
    folder_id: faq?.folder_id || '',
    category: faq?.category || '',
    approval_required: faq?.approval_required !== false,
    question: faq?.question || '',
    answer: faq?.answer || '',
  })
  const [saving, setSaving] = useState(false)

  async function handleSave(checkIn = false) {
    if (!form.folder_id) return toast.warn('Folder is required.')
    if (!form.question.trim()) return toast.warn('Question is required.')
    if (!form.answer || form.answer === '<p></p>') return toast.warn('Answer is required.')
    setSaving(true)
    try {
      const url = isEdit ? `/api/cm/faqs/${faq.id}` : '/api/cm/faqs'
      const method = isEdit ? 'PUT' : 'POST'
      const res = await httpFetch(url, { method, headers: authHeaders, body: JSON.stringify({ ...form, check_in: checkIn }) })
      if (res.ok) { onSaved(); onClose() }
      else { const d = await res.json(); toast.error(d.error || 'Save failed.') }
    } catch { toast.error('Network error.') }
    setSaving(false)
  }

  return (
    <>
      <div className="cm-drawer-overlay" onClick={onClose} />
      <div className="cm-drawer">
        <div className="cm-drawer-header">
          <span className="cm-drawer-title">{isEdit ? `Edit: ${faq.question?.slice(0, 40)}…` : 'New FAQ'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-secondary)' }}>×</button>
        </div>
        <div className="cm-drawer-body">
          <div className="cm-form-group">
            <label className="cm-form-label">Folder <span className="required">*</span></label>
            <select className="cm-form-select" value={form.folder_id} onChange={e => setForm(p => ({ ...p, folder_id: e.target.value }))}>
              <option value="">— Select Folder —</option>
              {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div className="cm-form-group">
            <label className="cm-form-label">Category</label>
            <input className="cm-form-input" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} placeholder="e.g. Dosage, Side Effects…" />
          </div>
          <div className="cm-form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
              <input type="checkbox" checked={form.approval_required} onChange={e => setForm(p => ({ ...p, approval_required: e.target.checked }))} />
              Approval Required
            </label>
            {!form.approval_required && (
              <p style={{ fontSize: 12, color: 'var(--info)', marginTop: 6, padding: '6px 10px', background: '#e8f0fb', borderRadius: 4 }}>
                Note: This FAQ will be published immediately on Check-In.
              </p>
            )}
          </div>
          <div className="cm-form-group">
            <label className="cm-form-label">Question <span className="required">*</span></label>
            <textarea className="cm-form-textarea" value={form.question} onChange={e => setForm(p => ({ ...p, question: e.target.value }))} rows={3} placeholder="Enter the question…" />
          </div>
          <div className="cm-form-group">
            <label className="cm-form-label">Answer <span className="required">*</span></label>
            <RichTextEditor value={form.answer} onChange={v => setForm(p => ({ ...p, answer: v }))} />
          </div>
        </div>
        <div className="cm-drawer-footer">
          <button className="cm-btn cm-btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="cm-btn cm-btn-secondary" onClick={() => handleSave(false)} disabled={saving}>{saving ? 'Saving…' : 'Save Draft'}</button>
          <button className="cm-btn cm-btn-primary" onClick={() => handleSave(true)} disabled={saving}>{saving ? 'Saving…' : 'Save & Check-In'}</button>
        </div>
      </div>
    </>
  )
}

export default function FAQsSection({ token, user }) {
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const [faqs, setFaqs] = useState([])
  const [folders, setFolders] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ folder_id: '', status: '', category: '', search: '' })
  const [showDrawer, setShowDrawer] = useState(false)
  const [editFaq, setEditFaq] = useState(null)
  const [checkInFaq, setCheckInFaq] = useState(null)
  const [checkInLoading, setCheckInLoading] = useState(false)
  const [selectedFaqIds, setSelectedFaqIds] = useState([])
  const [bulkTagInput, setBulkTagInput] = useState('')
  const [showBulkTag, setShowBulkTag] = useState(false)
  const [faqEsign, setFaqEsign] = useState({ open: false, faq: null, action: null })
  const [faqEsignPw, setFaqEsignPw] = useState('')
  const [faqEsignReason, setFaqEsignReason] = useState('')
  const [faqEsignErr, setFaqEsignErr] = useState('')
  const [faqEsignLoading, setFaqEsignLoading] = useState(false)

  const loadFaqs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, v]) => v)))
      const [fRes, folRes] = await Promise.all([
        httpFetch(`/api/cm/faqs?${params}`, { headers: authHeaders }),
        httpFetch('/api/cm/folders', { headers: authHeaders }),
      ])
      if (fRes.ok) setFaqs((await fRes.json()).faqs || [])
      if (folRes.ok) setFolders((await folRes.json()).folders || [])
    } catch { /* silent */ }
    setLoading(false)
  }, [token, filters]) // eslint-disable-line

  useEffect(() => { loadFaqs() }, [loadFaqs])

  async function handleCheckOut(faq) {
    try {
      const res = await httpFetch(`/api/cm/faqs/${faq.id}/checkout`, { method: 'POST', headers: authHeaders })
      if (res.ok) loadFaqs()
      else { const d = await res.json(); toast.error(d.error || 'Check out failed.') }
    } catch { toast.error('Network error.') }
  }

  async function handleCheckIn() {
    setCheckInLoading(true)
    try {
      const res = await httpFetch(`/api/cm/faqs/${checkInFaq.id}/checkin`, { method: 'POST', headers: authHeaders })
      if (res.ok) { setCheckInFaq(null); loadFaqs() }
      else { const d = await res.json(); toast.error(d.error || 'Check in failed.') }
    } catch { toast.error('Network error.') }
    setCheckInLoading(false)
  }

  function handleApprove(faq) {
    setFaqEsign({ open: true, faq, action: 'approve' })
    setFaqEsignPw(''); setFaqEsignReason(''); setFaqEsignErr('')
  }

  function handlePublish(faq) {
    setFaqEsign({ open: true, faq, action: 'publish' })
    setFaqEsignPw(''); setFaqEsignReason(''); setFaqEsignErr('')
  }

  async function submitFaqEsign() {
    if (!faqEsignPw || !faqEsignReason) { setFaqEsignErr('Password and reason are required.'); return }
    setFaqEsignLoading(true); setFaqEsignErr('')
    try {
      const endpoint = faqEsign.action === 'approve' ? 'approve' : 'publish'
      const res = await httpFetch(`/api/cm/faqs/${faqEsign.faq.id}/${endpoint}`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ password: faqEsignPw, reason: faqEsignReason }),
      })
      const d = await res.json()
      if (res.ok) { setFaqEsign({ open: false, faq: null, action: null }); loadFaqs() }
      else setFaqEsignErr(d.error || `${endpoint} failed.`)
    } catch { setFaqEsignErr('Network error.') }
    setFaqEsignLoading(false)
  }

  async function handleClone(faq) {
    try {
      const res = await httpFetch(`/api/cm/faqs/${faq.id}/clone`, { method: 'POST', headers: authHeaders })
      if (res.ok) { toast.success('FAQ cloned as Draft.'); loadFaqs() }
      else { const d = await res.json(); toast.error(d.error || 'Clone failed.') }
    } catch { toast.error('Network error.') }
  }

  function getFaqActions(faq) {
    const s = faq.status
    const btns = []
    if (s === 'Draft') {
      btns.push(<button key="e" className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => { setEditFaq(faq); setShowDrawer(true) }}>Edit</button>)
      btns.push(<button key="co" className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => handleCheckOut(faq)}>Check Out</button>)
      btns.push(<button key="ci" className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => setCheckInFaq(faq)}>Check In</button>)
    } else if (s === 'Pending') {
      btns.push(<button key="v" className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => { setEditFaq(faq); setShowDrawer(true) }}>View</button>)
      btns.push(<button key="ap" className="cm-btn cm-btn-primary cm-btn-sm" onClick={() => handleApprove(faq)}>Approve</button>)
    } else if (s === 'Approved') {
      btns.push(<button key="v" className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => { setEditFaq(faq); setShowDrawer(true) }}>View</button>)
      btns.push(<button key="pub" className="cm-btn cm-btn-primary cm-btn-sm" onClick={() => handlePublish(faq)}>Publish</button>)
    } else {
      btns.push(<button key="v" className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => { setEditFaq(faq); setShowDrawer(true) }}>View</button>)
    }
    if (s !== 'Archived') {
      btns.push(<button key="clone" className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => handleClone(faq)}>Clone</button>)
    }
    return <div className="cm-action-btns">{btns}</div>
  }

  return (
    <div>
      <div className="cm-section-header">
        <h2 className="cm-section-title">FAQs</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {selectedFaqIds.length > 0 && (
            <button className="cm-btn cm-btn-secondary" onClick={() => setShowBulkTag(true)}>
              🏷 Bulk Tag ({selectedFaqIds.length})
            </button>
          )}
          <button className="cm-btn cm-btn-primary" onClick={() => { setEditFaq(null); setShowDrawer(true) }}>+ New FAQ</button>
        </div>
      </div>
      {showBulkTag && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--surface)', borderRadius: 10, padding: 28, maxWidth: 420, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 16px' }}>Bulk Tag — {selectedFaqIds.length} FAQs</h3>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Tags (comma-separated)</label>
            <input className="cm-form-input" value={bulkTagInput} onChange={e => setBulkTagInput(e.target.value)} placeholder="e.g. safety, dosage, oncology" />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="cm-btn cm-btn-secondary" onClick={() => { setShowBulkTag(false); setBulkTagInput('') }}>Cancel</button>
              <button className="cm-btn cm-btn-primary" onClick={async () => {
                const tags = bulkTagInput.split(',').map(t => t.trim()).filter(Boolean)
                const res = await httpFetch('/api/cm/faqs/bulk-tags', { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ ids: selectedFaqIds, tags }) })
                if (res.ok) { loadFaqs(); setSelectedFaqIds([]); setShowBulkTag(false); setBulkTagInput('') }
                else toast.error('Bulk tag failed.')
              }}>Apply Tags</button>
            </div>
          </div>
        </div>
      )}
      <div className="cm-filters">
        <select className="cm-form-select" style={{ width: 160 }} value={filters.folder_id} onChange={e => setFilters(p => ({ ...p, folder_id: e.target.value }))}>
          <option value="">All Folders</option>
          {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <select className="cm-form-select" style={{ width: 160 }} value={filters.status} onChange={e => setFilters(p => ({ ...p, status: e.target.value }))}>
          <option value="">All Statuses</option>
          <option>Draft</option><option>Pending</option><option>Approved</option><option>Published</option><option>Archived</option>
        </select>
        <input className="cm-form-input" style={{ width: 160 }} placeholder="Category…" value={filters.category} onChange={e => setFilters(p => ({ ...p, category: e.target.value }))} />
        <input className="cm-form-input" style={{ width: 200 }} placeholder="Search FAQs…" value={filters.search} onChange={e => setFilters(p => ({ ...p, search: e.target.value }))} />
        <button className="cm-btn cm-btn-secondary" onClick={loadFaqs}>Filter</button>
      </div>
      {loading ? (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Loading FAQs…</p>
      ) : faqs.length === 0 ? (
        <div className="cm-empty"><div className="cm-empty-icon">❓</div><p>No FAQs found. Create your first one!</p></div>
      ) : (
        <table className="cm-table">
          <thead>
            <tr>
              <th><input type="checkbox" checked={faqs.length > 0 && faqs.every(f => selectedFaqIds.includes(f.id))} onChange={e => setSelectedFaqIds(e.target.checked ? faqs.map(f => f.id) : [])} /></th>
              <th>Question</th>
              <th>Category</th>
              <th>Folder</th>
              <th>Views</th>
              <th>Version</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {faqs.map((f) => (
              <tr key={f.id}>
                <td><input type="checkbox" checked={selectedFaqIds.includes(f.id)} onChange={e => setSelectedFaqIds(prev => e.target.checked ? [...new Set([...prev, f.id])] : prev.filter(id => id !== f.id))} /></td>
                <td style={{ maxWidth: 300 }} onClick={() => httpFetch(`/api/cm/faqs/${f.id}/view`, { method: 'POST', headers: authHeaders }).catch(() => {})}>
                  {f.question?.length > 60 ? f.question.slice(0, 60) + '…' : f.question}
                </td>
                <td>{f.category || '—'}</td>
                <td>{f.folder_name || '—'}</td>
                <td style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>{f.view_count || 0}</td>
                <td style={{ textAlign: 'center' }}>{f.version || '1.0'}</td>
                <td><StatusBadge status={f.status} /></td>
                <td>{getFaqActions(f)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {showDrawer && (
        <FAQDrawer faq={editFaq} folders={folders} token={token} onClose={() => { setShowDrawer(false); setEditFaq(null) }} onSaved={loadFaqs} />
      )}
      {checkInFaq && (
        <CheckInModal item={checkInFaq} onClose={() => setCheckInFaq(null)} onConfirm={handleCheckIn} loading={checkInLoading} />
      )}
      {faqEsign.open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--surface)', borderRadius: 10, padding: 28, maxWidth: 420, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 4px' }}>{faqEsign.action === 'approve' ? 'Approve FAQ' : 'Publish FAQ'}</h3>
            <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--text-muted)' }}>Electronic signature required — 21 CFR Part 11</p>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Your Password</label>
            <input type="password" className="cm-form-input" style={{ marginBottom: 12 }} value={faqEsignPw} onChange={e => setFaqEsignPw(e.target.value)} placeholder="Enter your password" />
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Reason</label>
            <input className="cm-form-input" style={{ marginBottom: 16 }} value={faqEsignReason} onChange={e => setFaqEsignReason(e.target.value)} placeholder="Reason for this action" />
            {faqEsignErr && <p style={{ color: '#dc2626', fontSize: 13, margin: '0 0 12px' }}>{faqEsignErr}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="cm-btn cm-btn-secondary" onClick={() => setFaqEsign({ open: false, faq: null, action: null })} disabled={faqEsignLoading}>Cancel</button>
              <button className="cm-btn cm-btn-primary" onClick={submitFaqEsign} disabled={faqEsignLoading}>
                {faqEsignLoading ? 'Submitting…' : faqEsign.action === 'approve' ? 'Approve' : 'Publish'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
