import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { CanChange, ReadOnlyUnless } from '../components/RoleGate'
import { adminHeaders, useAdminAuth } from '../context/AdminAuthContext'
import { label } from '../../shared/utils/labels'

// CP ease-of-use plan, phase 3 row 21: the same shape as News and Documents (a list,
// "+ New trial", a form), and a trial goes live only after review (Rohith, 10 Oct
// 2026). Draft → Needs review → Live in portal; whoever sent it for review cannot
// publish it. The server enforces both.
const EMPTY = { nct_id: '', title: '', phase: 'Phase III', indication: '', status: 'Recruiting', site_location: '', pi: '' }
const STATUS_STYLE = {
  draft:     { background: '#F3F4F6', color: '#4B5563' },
  review:    { background: '#FEF3C7', color: '#92400E' },
  published: { background: '#DCFCE7', color: '#166534' },
}

export default function TrialsAdminPage() {
  const { clientId } = useParams()
  const { admin, canPublish, canChange } = useAdminAuth()
  const canEdit = canChange('trials')
  const [trials, setTrials]       = useState([])
  const [loading, setLoading]     = useState(true)
  const [form, setForm]           = useState(EMPTY)
  const [showForm, setShowForm]   = useState(false)
  const [editingId, setEditingId] = useState(null)   // CPPM-33: correcting an existing entry
  const [msg, setMsg]             = useState(null)   // { type, text }
  const [busy, setBusy]           = useState(false)

  async function load() {
    try {
      const d = await fetch(`/api/admin/trials/${clientId}`, { headers: adminHeaders() }).then(r => r.json())
      setTrials(d.trials || [])
    } catch { setMsg({ type: 'error', text: 'Could not load the trials. Reload the page.' }) }
    setLoading(false)
  }
  useEffect(() => { load() }, [clientId])

  function openNew()   { setEditingId(null); setForm(EMPTY); setShowForm(true); setMsg(null) }
  function openEdit(t) { setEditingId(t.id); setForm(Object.fromEntries(Object.keys(EMPTY).map(k => [k, t[k] ?? EMPTY[k]]))); setShowForm(true); setMsg(null) }

  // sendForReview: a new trial goes straight to "Needs review" instead of "Draft".
  async function save(e, sendForReview) {
    e?.preventDefault()
    const formEl = document.getElementById('trial-form')
    if (formEl && !formEl.reportValidity()) return
    setBusy(true); setMsg(null)
    try {
      const res = await fetch(editingId ? `/api/admin/trials/${clientId}/${editingId}` : `/api/admin/trials/${clientId}`, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', ...adminHeaders() },
        body: JSON.stringify(editingId ? form : { ...form, publish_status: sendForReview ? 'review' : 'draft' }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg({ type: 'error', text: d.error || 'The trial could not be saved.' }); return }
      setShowForm(false)
      setMsg({ type: 'success', text: editingId ? 'Changes saved.' : sendForReview ? 'Saved and sent for review. Someone else publishes it.' : 'Saved as a draft. Doctors cannot see it.' })
      if (sendForReview) window.dispatchEvent(new Event('cp:badges-changed'))
      load()
    } catch { setMsg({ type: 'error', text: 'Network error. Please try again.' }) } finally { setBusy(false) }
  }

  async function move(t, to) {
    if (to === 'draft' && t.publish_status === 'published' && !confirm(`Take "${t.title}" off the portal? Doctors will no longer see it.`)) return
    setBusy(true); setMsg(null)
    try {
      const res = await fetch(`/api/admin/trials/${clientId}/${t.id}/publishing`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...adminHeaders() }, body: JSON.stringify({ to }),
      })
      const d = await res.json().catch(() => ({}))
      setMsg(res.ok ? { type: 'success', text: d.message } : { type: 'error', text: d.error || 'That did not work. Reload and try again.' })
      window.dispatchEvent(new Event('cp:badges-changed'))
      load()
    } catch { setMsg({ type: 'error', text: 'Network error. Please try again.' }) } finally { setBusy(false) }
  }

  async function handleDelete(t) {
    if (!confirm(`Delete "${t.title}"? This cannot be undone.`)) return
    try {
      const res = await fetch(`/api/admin/trials/${clientId}/${t.id}`, { method: 'DELETE', headers: adminHeaders() })
      // 404: someone else removed it already
      if (!res.ok && res.status !== 404) { const d = await res.json().catch(() => ({})); setMsg({ type: 'error', text: d.error || `Could not delete (error ${res.status}).` }); return }
      setTrials(prev => prev.filter(x => x.id !== t.id))
    } catch { setMsg({ type: 'error', text: 'Network error. Please try again.' }) }
  }

  const field = (key, text, props = {}) => (
    <div className="cp-field">
      <label htmlFor={`trial-${key}`}>{text}</label>
      <input id={`trial-${key}`} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} {...props} />
    </div>
  )
  const waiting = trials.filter(t => t.publish_status === 'review').length

  return (
    <AdminLayout title="Clinical Trials">
      <div className="cp-section-header">
        <h2>Clinical Trials</h2>
        {canEdit && <button className="cp-btn cp-btn-primary" onClick={openNew}>+ New trial</button>}
      </div>
      <p className="cp-page-desc">
        Doctors see a trial only once it is live in portal. A new trial is saved as a draft or sent for review,
        and someone other than the person who sent it publishes it.{waiting > 0 && ` ${waiting} waiting for review.`}
      </p>

      {msg && <div className={msg.type === 'error' ? 'cp-error' : 'cp-success'} role="status" style={{ marginBottom: 12 }}>{msg.text}</div>}

      {showForm && (
        <div className="cp-modal-overlay" onClick={() => !busy && setShowForm(false)}>
          <div className="cp-modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()} role="dialog" aria-label={editingId ? 'Edit trial' : 'New trial'}>
            <div className="cp-modal-header">
              <span>{editingId ? 'Edit trial' : 'New trial'}</span>
              <button className="cp-modal-close" onClick={() => setShowForm(false)} aria-label="Close">✕</button>
            </div>
            <ReadOnlyUnless area="trials" what="the trial listings">
            <form id="trial-form" onSubmit={e => save(e, false)} className="cp-modal-body">
              <div className="cp-field-row">
                {field('nct_id', 'NCT ID *', { required: true, placeholder: 'e.g. NCT04829100' })}
                <div className="cp-field">
                  <label htmlFor="trial-phase">Phase</label>
                  <select id="trial-phase" value={form.phase} onChange={e => setForm(f => ({ ...f, phase: e.target.value }))}>
                    {['Phase I', 'Phase II', 'Phase III', 'Phase IV'].map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              {field('title', 'Trial title *', { required: true, placeholder: 'Study title' })}
              {field('indication', 'Indication *', { required: true, placeholder: 'Target disease' })}
              <div className="cp-field-row">
                {field('site_location', 'Site location', { placeholder: 'Hospital, city' })}
                {field('pi', 'Principal investigator', { placeholder: 'Dr. …' })}
              </div>
              <div className="cp-field">
                <label htmlFor="trial-status">Recruitment</label>
                <select id="trial-status" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  {['Recruiting', 'Active, not recruiting', 'Completed', 'Suspended', 'Terminated'].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="cp-modal-footer">
                {editingId ? (
                  <button type="submit" className="cp-btn cp-btn-primary" disabled={busy}>Save changes</button>
                ) : <>
                  <button type="button" className="cp-btn cp-btn-primary" disabled={busy} onClick={e => save(e, true)}>Save and send for review</button>
                  <button type="submit" className="cp-btn cp-btn-outline" disabled={busy}>Save draft</button>
                </>}
                <button type="button" className="cp-btn cp-btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </form>
            </ReadOnlyUnless>
          </div>
        </div>
      )}

      {loading ? <div className="cp-loading">Loading…</div> : trials.length === 0 ? (
        <div className="cp-empty"><p>No trials yet. The portal's trials page stays hidden until one is live.</p></div>
      ) : (
        <div className="cp-card cp-table-card" style={{ padding: 0 }}>
          <table className="cp-table">
            <thead>
              <tr>
                <th>NCT ID</th>
                <th>Title</th>
                <th>Phase</th>
                <th>Recruitment</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {trials.map(t => {
                const sentByMe = t.submitted_by != null && t.submitted_by === admin?.id
                return (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 600 }}>{t.nct_id}</td>
                    <td>{t.title}</td>
                    <td>{t.phase}</td>
                    <td>{t.status}</td>
                    <td><span className="cp-status-badge" style={STATUS_STYLE[t.publish_status] || {}}>{label('contentStatus', t.publish_status)}</span></td>
                    <td>
                      <CanChange area="trials">
                        <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                          <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => openEdit(t)}>Edit</button>
                          {t.publish_status === 'draft' && (
                            <button className="cp-btn cp-btn-sm cp-btn-outline" disabled={busy} onClick={() => move(t, 'review')}>Send for review</button>
                          )}
                          {t.publish_status === 'review' && canPublish && (
                            <button className="cp-btn cp-btn-sm cp-btn-primary" disabled={busy || sentByMe} onClick={() => move(t, 'published')}
                              title={sentByMe ? 'You sent this for review, so someone else must publish it.' : 'Doctors see it as soon as it is published'}>
                              Publish
                            </button>
                          )}
                          {t.publish_status === 'review' && (canPublish || sentByMe) && (
                            <button className="cp-btn cp-btn-sm cp-btn-outline" disabled={busy} onClick={() => move(t, 'draft')}>
                              {sentByMe ? 'Take back' : 'Send back'}
                            </button>
                          )}
                          {t.publish_status === 'published' && canPublish && (
                            <button className="cp-btn cp-btn-sm cp-btn-outline" disabled={busy} onClick={() => move(t, 'draft')}>Take off portal</button>
                          )}
                          <button className="cp-btn cp-btn-sm cp-btn-outline" style={{ color: '#B91C1C' }} onClick={() => handleDelete(t)}>Delete</button>
                        </span>
                      </CanChange>
                      {t.publish_status === 'review' && sentByMe && canPublish && (
                        <div style={{ fontSize: 11, color: '#4B5563', marginTop: 4 }}>You sent this, so someone else publishes it.</div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  )
}
