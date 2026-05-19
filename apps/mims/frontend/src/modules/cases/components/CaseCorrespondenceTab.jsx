import { useState, useEffect } from 'react'
import { httpFetch } from '../../../shared/api/httpFetch.js'
import DropzoneUpload from '../../../shared/components/documents/DropzoneUpload'
import AttachmentGallery from '../../../shared/components/documents/AttachmentGallery'
import { useFeatureFlag } from '../../../shared/context/FeatureFlagsContext'

const API = import.meta.env.VITE_API_URL || '/api'

function formatDate(v) {
  if (!v) return '-'
  const dt = new Date(v)
  return Number.isNaN(dt.getTime()) ? v : dt.toLocaleString()
}

function getCorrDirection(item) {
  const source = String(item?.source_tag || '').toLowerCase()
  if (source.includes('reply') || source.includes('forward') || source.includes('sent') || source.includes('transmission')) {
    return 'outbound'
  }
  return 'inbound'
}

function getCorrBox(item) {
  return getCorrDirection(item) === 'outbound' ? 'sent' : 'inbox'
}

function getThreadRootId(item) {
  return item?.original_inquiry_id || item?.id
}

export default function CaseCorrespondenceTab({ id, headers, setSavedMsg, onCountChange }) {
  const [correspondence, setCorrespondence] = useState([])
  const [corrLoading,    setCorrLoading]    = useState(false)
  const [corrError,      setCorrError]      = useState('')
  const [corrFilter,     setCorrFilter]     = useState('all')
  const [corrSearch,     setCorrSearch]     = useState('')
  const [corrFromDate,   setCorrFromDate]   = useState('')
  const [corrToDate,     setCorrToDate]     = useState('')
  const [activeCorrItem, setActiveCorrItem] = useState(null)
  const [corrCompose,    setCorrCompose]    = useState(null)
  const [corrAttachments,setCorrAttachments]= useState([])
  const [corrAttLoading, setCorrAttLoading] = useState(false)

  useEffect(() => { loadCorrespondence() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    async function loadCorrAttachments() {
      if (!activeCorrItem?.id) { setCorrAttachments([]); return }
      setCorrAttLoading(true)
      try {
        const res  = await httpFetch(`${API}/inbox/${activeCorrItem.id}/attachments`, { headers })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load attachments.')
        setCorrAttachments(Array.isArray(data.attachments) ? data.attachments : [])
      } catch { setCorrAttachments([]) }
      finally { setCorrAttLoading(false) }
    }
    loadCorrAttachments()
  }, [activeCorrItem?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadCorrespondence() {
    setCorrLoading(true)
    setCorrError('')
    try {
      const res  = await httpFetch(`${API}/inbox/case/${id}/correspondence`, { headers })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load correspondence.')
      const list = Array.isArray(data.items) ? data.items : []
      setCorrespondence(list)
      onCountChange?.(list.length)
    } catch (err) {
      setCorrespondence([])
      setCorrError(err.message || 'Failed to load correspondence.')
    } finally {
      setCorrLoading(false)
    }
  }

  function openCorrCompose(mode, item) {
    const rawSubject = (item?.subject || '').trim()
    const hasPrefix  = mode === 'reply' ? /^re:/i.test(rawSubject) : /^fwd:/i.test(rawSubject)
    const prefixedSubject = hasPrefix ? rawSubject : `${mode === 'reply' ? 'Re:' : 'Fwd:'} ${rawSubject || '(No Subject)'}`
    const quoted = [
      '', '----- Original Message -----',
      `From: ${item?.sender || '-'}`, `To: ${item?.recipient || '-'}`,
      `Sent: ${formatDate(item?.received_at)}`, `Subject: ${item?.subject || '(No Subject)'}`,
      '', item?.body || '',
    ].join('\n')
    setCorrCompose({ mode, inquiryId: item?.id, to: mode === 'reply' ? (item?.sender || '') : '', subject: prefixedSubject, body: quoted, sending: false, error: '' })
  }

  async function sendCorrCompose() {
    if (!corrCompose || corrCompose.sending) return
    const to      = (corrCompose.to      || '').trim()
    const subject = (corrCompose.subject || '').trim()
    const body    = (corrCompose.body    || '').trim()
    if (!to || !subject || !body) {
      setCorrCompose(prev => ({ ...prev, error: 'To, subject, and body are required.' }))
      return
    }
    setCorrCompose(prev => ({ ...prev, sending: true, error: '' }))
    try {
      const endpoint = corrCompose.mode === 'reply' ? 'reply' : 'forward'
      const res  = await httpFetch(`${API}/inbox/${corrCompose.inquiryId}/${endpoint}`, {
        method: 'POST', headers, body: JSON.stringify({ to, subject, body }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Failed to ${corrCompose.mode}.`)
      await loadCorrespondence()
      setCorrCompose(null)
      setSavedMsg(corrCompose.mode === 'reply' ? 'Reply sent' : 'Forward sent')
      setTimeout(() => setSavedMsg(''), 2500)
    } catch (err) {
      setCorrCompose(prev => ({ ...prev, sending: false, error: err.message || 'Send failed.' }))
    }
  }

  async function downloadCorrAttachment(att) {
    try {
      const r = await httpFetch(`${API}/inbox/attachments/${att.id}/download`, { headers })
      if (!r.ok) return
      const blob = await r.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = att.filename || `attachment-${att.id}`; a.click()
      URL.revokeObjectURL(url)
    } catch { /* no-op */ }
  }

  async function previewCorrAttachment(att) {
    try {
      const r = await httpFetch(`${API}/inbox/attachments/${att.id}/download`, { headers })
      if (!r.ok) return
      const blob = await r.blob()
      const url  = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener,noreferrer')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch { /* no-op */ }
  }

  const filteredCorrespondence = correspondence.filter(item => {
    if (corrFilter !== 'all' && getCorrBox(item) !== corrFilter) return false
    const q = corrSearch.trim().toLowerCase()
    if (q) {
      const haystack = [item.subject, item.body, item.sender, item.recipient, item.source_tag, item.status]
        .filter(Boolean).join(' ').toLowerCase()
      if (!haystack.includes(q)) return false
    }
    if (corrFromDate || corrToDate) {
      const dt = item?.received_at ? new Date(item.received_at) : null
      if (!dt || Number.isNaN(dt.getTime())) return false
      if (corrFromDate && dt < new Date(`${corrFromDate}T00:00:00`)) return false
      if (corrToDate   && dt > new Date(`${corrToDate}T23:59:59`))   return false
    }
    return true
  }).sort((a, b) => {
    const ra = getThreadRootId(a), rb = getThreadRootId(b)
    if (ra !== rb) return ra - rb
    return new Date(a?.received_at || 0).getTime() - new Date(b?.received_at || 0).getTime()
  })

  const t6 = useFeatureFlag('cf.theme6_documents')
  const [uploadKey, setUploadKey] = useState(0)
  return (
    <div id="tab-correspondence" className="cf-tab-pane">
      {t6 && (
        <div style={{
          margin: '0 0 14px', padding: 14, borderRadius: 8,
          background: 'var(--surface,#fff)', border: '1px solid var(--border)',
        }}>
          <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 600 }}>📎 Case Attachments</div>
          <DropzoneUpload entityType="case" entityId={id} onUploaded={() => setUploadKey(k => k + 1)} />
          <div style={{ marginTop: 12 }}>
            <AttachmentGallery entityType="case" entityId={id} reloadKey={uploadKey} />
          </div>
        </div>
      )}
      {corrLoading && <div className="cf-empty-msg">Loading correspondence…</div>}
      {!corrLoading && corrError && <div className="cf-corr-error">{corrError}</div>}
      {!corrLoading && !corrError && correspondence.length === 0 && (
        <div className="cf-empty-msg">No case communication tracked yet. Email/reply/forward linked to this case will appear here.</div>
      )}

      {!corrLoading && !corrError && correspondence.length > 0 && (
        <>
          <div className="cf-corr-filterbar">
            {[
              { key: 'all',   label: `All (${correspondence.length})` },
              { key: 'inbox', label: `Inbox (${correspondence.filter(i => getCorrBox(i) === 'inbox').length})` },
              { key: 'sent',  label: `Sent (${correspondence.filter(i => getCorrBox(i) === 'sent').length})` },
            ].map(opt => (
              <button key={opt.key} className={`cf-corr-filter ${corrFilter === opt.key ? 'active' : ''}`} onClick={() => setCorrFilter(opt.key)}>
                {opt.label}
              </button>
            ))}
          </div>

          <div className="cf-corr-toolbar">
            <input className="cf-corr-search" type="text" placeholder="Search subject/body/sender/recipient..." value={corrSearch} onChange={e => setCorrSearch(e.target.value)} />
            <label className="cf-corr-date-field"><span>From</span><input type="date" value={corrFromDate} onChange={e => setCorrFromDate(e.target.value)} /></label>
            <label className="cf-corr-date-field"><span>To</span><input type="date" value={corrToDate} onChange={e => setCorrToDate(e.target.value)} /></label>
            <button className="cf-cancel-btn" onClick={() => { setCorrSearch(''); setCorrFromDate(''); setCorrToDate('') }}>Clear</button>
          </div>

          {filteredCorrespondence.length === 0 && <div className="cf-empty-msg">No {corrFilter} items in this case yet.</div>}

          <div className="cf-corr-list">
            {filteredCorrespondence.map((item, index) => {
              const dir       = getCorrDirection(item)
              const root      = getThreadRootId(item)
              const prev      = filteredCorrespondence[index - 1]
              const showGroup = !prev || getThreadRootId(prev) !== root
              return (
                <div key={item.id}>
                  {showGroup && <div className="cf-corr-thread-label">Thread #{root}</div>}
                  <div className={`cf-corr-card ${dir}`}>
                    <div className="cf-corr-top">
                      <span className={`cf-corr-dir ${dir}`}>{dir === 'outbound' ? 'Outbound' : 'Inbound'}</span>
                      <span className="cf-corr-source">{item.source_tag || 'Email'}</span>
                      <span className="cf-corr-time">{formatDate(item.received_at)}</span>
                    </div>
                    <div className="cf-corr-subject">{item.subject || '(No subject)'}</div>
                    <div className="cf-corr-meta">
                      <span><strong>From:</strong> {item.sender || '-'}</span>
                      <span><strong>To:</strong> {item.recipient || '-'}</span>
                      <span><strong>Status:</strong> {item.status || '-'}</span>
                      <span><strong>Attachments:</strong> {item.attachments_count || 0}</span>
                      {item.original_inquiry_id ? <span><strong>Thread Root:</strong> #{item.original_inquiry_id}</span> : null}
                    </div>
                    {item.body && <div className="cf-corr-body">{item.body.length > 500 ? `${item.body.slice(0, 500)}…` : item.body}</div>}
                    <div className="cf-corr-actions">
                      <button className="cf-open-btn" onClick={() => setActiveCorrItem(item)}>View Full Message</button>
                      {dir === 'inbound' && (
                        <>
                          <button className="cf-open-btn" onClick={() => openCorrCompose('reply', item)}>Reply</button>
                          <button className="cf-open-btn" onClick={() => openCorrCompose('forward', item)}>Forward</button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* View Full Message Modal */}
      {activeCorrItem && (
        <div className="cf-corr-modal-overlay" onClick={() => setActiveCorrItem(null)}>
          <div className="cf-corr-modal" onClick={e => e.stopPropagation()}>
            <div className="cf-corr-modal-header">
              <div className="cf-corr-modal-title">{activeCorrItem.subject || '(No subject)'}</div>
              <button className="cf-corr-modal-close" onClick={() => setActiveCorrItem(null)}>✕</button>
            </div>
            <div className="cf-corr-modal-meta">
              <span><strong>From:</strong> {activeCorrItem.sender || '-'}</span>
              <span><strong>To:</strong> {activeCorrItem.recipient || '-'}</span>
              <span><strong>Direction:</strong> {getCorrDirection(activeCorrItem)}</span>
              <span><strong>Type:</strong> {activeCorrItem.source_tag || 'Email'}</span>
              <span><strong>Time:</strong> {formatDate(activeCorrItem.received_at)}</span>
              <span><strong>Status:</strong> {activeCorrItem.status || '-'}</span>
            </div>
            <div className="cf-corr-modal-body">{activeCorrItem.body || '(No content)'}</div>
            <div className="cf-corr-attachments">
              <div className="cf-corr-attachments-title">Attachments</div>
              {corrAttLoading && <div className="cf-corr-attachments-empty">Loading attachments…</div>}
              {!corrAttLoading && corrAttachments.length === 0 && <div className="cf-corr-attachments-empty">No attachments</div>}
              {!corrAttLoading && corrAttachments.length > 0 && (
                <div className="cf-corr-attachments-list">
                  {corrAttachments.map(att => (
                    <div key={att.id} className="cf-corr-attachment-item">
                      <span className="cf-corr-attachment-name">{att.filename}</span>
                      <span className="cf-corr-attachment-meta">{att.mime_type || '-'} · {att.size_bytes || 0} bytes</span>
                      <div className="cf-corr-attachment-actions">
                        <button className="cf-open-btn" onClick={() => previewCorrAttachment(att)}>Preview</button>
                        <button className="cf-open-btn" onClick={() => downloadCorrAttachment(att)}>Download</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Compose Modal (Reply / Forward) */}
      {corrCompose && (
        <div className="cf-corr-compose-overlay" onClick={() => !corrCompose.sending && setCorrCompose(null)}>
          <div className="cf-corr-compose-modal" onClick={e => e.stopPropagation()}>
            <div className="cf-corr-compose-header">
              <div className="cf-corr-compose-title">
                {corrCompose.mode === 'reply' ? 'Reply from Case Correspondence' : 'Forward from Case Correspondence'}
              </div>
              <button className="cf-corr-modal-close" onClick={() => !corrCompose.sending && setCorrCompose(null)}>✕</button>
            </div>
            <div className="cf-corr-compose-body">
              <div className="cf-form-field">
                <label>To</label>
                <input type="email" value={corrCompose.to} onChange={e => setCorrCompose(prev => ({ ...prev, to: e.target.value }))} disabled={corrCompose.sending} />
              </div>
              <div className="cf-form-field">
                <label>Subject</label>
                <input type="text" value={corrCompose.subject} onChange={e => setCorrCompose(prev => ({ ...prev, subject: e.target.value }))} disabled={corrCompose.sending} />
              </div>
              <div className="cf-form-field">
                <label>Message</label>
                <textarea rows={14} value={corrCompose.body} onChange={e => setCorrCompose(prev => ({ ...prev, body: e.target.value }))} disabled={corrCompose.sending} />
              </div>
              {corrCompose.error && <div className="cf-corr-error">{corrCompose.error}</div>}
            </div>
            <div className="cf-form-actions" style={{ padding: '12px 14px', marginTop: 0 }}>
              <button className="cf-cancel-btn" onClick={() => !corrCompose.sending && setCorrCompose(null)}>Cancel</button>
              <button className="cf-save-btn" onClick={sendCorrCompose} disabled={corrCompose.sending}>
                {corrCompose.sending ? 'Sending…' : (corrCompose.mode === 'reply' ? 'Send Reply' : 'Send Forward')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
