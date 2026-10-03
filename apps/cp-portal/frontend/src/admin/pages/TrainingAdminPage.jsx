import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { CanChange, ReadOnlyUnless } from '../components/RoleGate'
import { adminHeaders } from '../context/AdminAuthContext'

const input = { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #CBD5E1' }
const label = { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }
const card  = { padding: 20, background: '#fff', borderRadius: 8, border: '1px solid #E2E8F0' }
const link  = { border: 'none', background: 'none', cursor: 'pointer', fontWeight: 600, marginRight: 8 }

// CPPM-15: new modules start as Coming soon — they can be made Available once they
// have a document and at least one question. Credits are left blank unless the
// client has them to state.
const EMPTY = { title: '', type: 'CME Accredited', duration: '30 mins', credits: '', pass_score: 80, status: 'Coming soon', document_id: '' }
const EMPTY_Q = { question: '', options: ['', ''], correct_index: 0 }

async function call(url, method, body) {
  const res = await fetch(url, { method, headers: adminHeaders(), body: body ? JSON.stringify(body) : undefined })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(d.error || 'Request failed.')
  return d
}

export default function TrainingAdminPage() {
  const { clientId } = useParams()
  const api = `/api/admin/training/${clientId}`
  const [modules, setModules]     = useState([])
  const [documents, setDocuments] = useState([])
  const [loading, setLoading]     = useState(true)
  const [form, setForm]           = useState(EMPTY)
  const [msg, setMsg]             = useState('')
  const [editingId, setEditingId] = useState(null)   // CPPM-33: correcting an existing entry

  const [qModule, setQModule]     = useState(null)   // module whose questions are open
  const [questions, setQuestions] = useState([])
  const [qForm, setQForm]         = useState(EMPTY_Q)
  const [qEditingId, setQEditingId] = useState(null)
  const [qMsg, setQMsg]           = useState('')

  const [completions, setCompletions] = useState([])
  const [filter, setFilter]       = useState({ module_id: '', result: '', reference: '' })
  const [cMsg, setCMsg]           = useState('')

  async function loadModules() {
    const d = await fetch(api, { headers: adminHeaders() }).then(r => r.json()).catch(() => ({}))
    setModules(d.modules || [])
    setLoading(false)
    return d.modules || []
  }

  function filterParams() {
    const p = new URLSearchParams()
    Object.entries(filter).forEach(([k, v]) => { if (v) p.set(k, v) })
    return p
  }

  async function loadCompletions() {
    const d = await fetch(`${api}/completions?${filterParams()}`, { headers: adminHeaders() }).then(r => r.json()).catch(() => ({}))
    setCompletions(d.completions || [])
  }

  useEffect(() => {
    loadModules()
    loadCompletions()
    fetch(`/api/admin/documents/${clientId}`, { headers: adminHeaders() })
      .then(r => r.json())
      .then(d => setDocuments((d.documents || []).filter(doc => doc.is_active && ['published', 'scheduled'].includes(doc.status))))
      .catch(() => setDocuments([]))
  }, [clientId])

  async function handleSave(e) {
    e.preventDefault()
    setMsg('')
    try {
      await call(editingId ? `${api}/${editingId}` : api, editingId ? 'PUT' : 'POST', form)
      setMsg(editingId ? 'Changes saved.' : 'Module created. Add its questions, then set it to Available.')
      setEditingId(null)
      setForm(EMPTY)
      const list = await loadModules()
      if (qModule) setQModule(list.find(m => m.id === qModule.id) || null)
    } catch (err) {
      setMsg(`✕ ${err.message}`)
    }
  }

  function startEdit(m) {
    setEditingId(m.id)
    setForm(Object.fromEntries(Object.keys(EMPTY).map(k => [k, m[k] ?? EMPTY[k]])))
    setMsg('')
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(EMPTY)
    setMsg('')
  }

  async function handleDelete(m) {
    if (!confirm(`Delete "${m.title}"?`)) return
    try {
      await call(`${api}/${m.id}`, 'DELETE')
      if (qModule?.id === m.id) setQModule(null)
      loadModules()
    } catch (err) {
      setMsg(`✕ ${err.message}`)
    }
  }

  // ── Questions ──
  async function openQuestions(m) {
    setQModule(m); setQForm(EMPTY_Q); setQEditingId(null); setQMsg('')
    const d = await fetch(`${api}/${m.id}/questions`, { headers: adminHeaders() }).then(r => r.json()).catch(() => ({}))
    setQuestions(d.questions || [])
  }

  async function refreshQuestions() {
    const list = await loadModules()
    const m = list.find(x => x.id === qModule.id)
    setQModule(m)
    const d = await fetch(`${api}/${qModule.id}/questions`, { headers: adminHeaders() }).then(r => r.json()).catch(() => ({}))
    setQuestions(d.questions || [])
  }

  async function saveQuestion(e) {
    e.preventDefault()
    setQMsg('')
    try {
      const url = qEditingId ? `${api}/${qModule.id}/questions/${qEditingId}` : `${api}/${qModule.id}/questions`
      await call(url, qEditingId ? 'PUT' : 'POST', qForm)
      setQForm(EMPTY_Q); setQEditingId(null)
      setQMsg('Saved. The module is now a new version.')
      refreshQuestions()
    } catch (err) {
      setQMsg(`✕ ${err.message}`)
    }
  }

  async function deleteQuestion(q) {
    if (!confirm('Remove this question?')) return
    try {
      await call(`${api}/${qModule.id}/questions/${q.id}`, 'DELETE')
      setQMsg('Removed. The module is now a new version.')
      refreshQuestions()
    } catch (err) {
      setQMsg(`✕ ${err.message}`)
    }
  }

  function setOption(i, value) {
    setQForm(f => ({ ...f, options: f.options.map((o, oi) => (oi === i ? value : o)) }))
  }

  function removeOption(i) {
    setQForm(f => {
      const options = f.options.filter((_, oi) => oi !== i)
      const correct = f.correct_index === i ? 0 : f.correct_index > i ? f.correct_index - 1 : f.correct_index
      return { ...f, options, correct_index: correct }
    })
  }

  // ── Completions ──
  async function exportCsv() {
    setCMsg('')
    try {
      const res = await fetch(`${api}/completions/export?${filterParams()}`, { headers: adminHeaders() })
      if (!res.ok) throw new Error('Export failed.')
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = `training-completions-${clientId}-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setCMsg(`✕ ${err.message}`)
    }
  }

  function readiness(m) {
    const missing = []
    if (!m.document_id) missing.push('document')
    if (!m.question_count) missing.push('questions')
    if (!missing.length) return <span style={{ color: '#047857' }}>Ready</span>
    return <span style={{ color: '#B45309' }}>Needs {missing.join(' and ')}</span>
  }

  return (
    <AdminLayout>
      <div className="cp-admin-page" style={{ padding: 24 }}>
      <div className="cp-page-header" style={{ marginBottom: 20 }}>
        <h1>CME & REMS Educational Training Manager</h1>
        <p>Set up training modules: the document to read, the questions and the pass mark. Every attempt a doctor makes is recorded below.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 24 }}>
        <ReadOnlyUnless area="training" what="the training modules">
        <form onSubmit={handleSave} className="cp-card" style={card}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>{editingId ? 'Edit Training Module' : 'Create Training Module'}</h3>
          <div style={{ marginBottom: 12 }}>
            <label style={label}>Module Title *</label>
            <input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Title of training module" style={input} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={label}>Module document (what doctors read)</label>
            <select value={form.document_id ?? ''} onChange={e => setForm({ ...form, document_id: e.target.value })} style={input}>
              <option value="">— Choose a published document —</option>
              {documents.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={label}>Type</label>
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} style={input}>
              <option value="CME Accredited">CME Accredited</option>
              <option value="REMS Certification">REMS Certification</option>
              <option value="Mandatory Compliance">Mandatory Compliance</option>
            </select>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={label}>CME Credits <span style={{ fontWeight: 400, color: '#4B5563' }}>(only if an accrediting body has granted them; never printed on certificates)</span></label>
            <input value={form.credits} onChange={e => setForm({ ...form, credits: e.target.value })} placeholder="Leave blank if none" style={input} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={label}>Pass Score Threshold (%)</label>
            <input type="number" value={form.pass_score} onChange={e => setForm({ ...form, pass_score: e.target.value })} min={50} max={100} style={input} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={label}>Status</label>
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} style={input}>
              <option value="Coming soon">Coming soon</option>
              <option value="Available">Available (doctors can take it)</option>
              <option value="Retired">Retired</option>
            </select>
          </div>
          {msg && <div style={{ fontSize: 13, marginBottom: 12, fontWeight: 600 }}>{msg}</div>}
          <button type="submit" className="cp-btn cp-btn-primary" style={{ width: '100%', padding: '9px 14px', background: 'var(--cp-primary)', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>
            {editingId ? 'Save changes' : 'Create module'}
          </button>
          {editingId && (
            <button type="button" onClick={cancelEdit} style={{ width: '100%', marginTop: 8, padding: '8px 14px', background: '#fff', color: '#374151', border: '1px solid #CBD5E1', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>
              Cancel editing
            </button>
          )}
        </form>
        </ReadOnlyUnless>

        <div className="cp-card" style={card}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Training Modules ({modules.length})</h3>
          {loading ? <div>Loading...</div> : modules.length === 0 ? <div>No training modules yet.</div> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #E2E8F0', textAlign: 'left' }}>
                  <th style={{ padding: 8 }}>Module</th>
                  <th style={{ padding: 8 }}>Status</th>
                  <th style={{ padding: 8 }}>Setup</th>
                  <th style={{ padding: 8 }}>Pass mark</th>
                  <th style={{ padding: 8 }}>Passed / attempts</th>
                  <th style={{ padding: 8 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {modules.map(m => (
                  <tr key={m.id} style={{ borderBottom: '1px solid #F1F5F9', background: qModule?.id === m.id ? '#F5F3FF' : undefined }}>
                    <td style={{ padding: 8 }}>
                      <div style={{ fontWeight: 600 }}>{m.title}</div>
                      <div style={{ fontSize: 11, color: '#4B5563' }}>Version {m.version} · {m.document_title || 'no document'}</div>
                    </td>
                    <td style={{ padding: 8 }}>{m.status}</td>
                    <td style={{ padding: 8 }}>{m.question_count} question{m.question_count === 1 ? '' : 's'} · {readiness(m)}</td>
                    <td style={{ padding: 8 }}>{m.pass_score}%</td>
                    <td style={{ padding: 8 }}>{m.pass_count} / {m.attempt_count}</td>
                    <td style={{ padding: 8, whiteSpace: 'nowrap' }}>
                      <CanChange area="training">
                      <button onClick={() => startEdit(m)} style={{ ...link, color: 'var(--cp-primary)' }}>Edit</button>
                      </CanChange>
                      <button onClick={() => openQuestions(m)} style={{ ...link, color: 'var(--cp-primary)' }}>Questions</button>
                      <CanChange area="training">
                      <button onClick={() => handleDelete(m)} style={{ ...link, color: '#B91C1C' }}>Delete</button>
                      </CanChange>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {qModule && (
        <div className="cp-card" style={{ ...card, marginTop: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>Questions — {qModule.title} <span style={{ fontWeight: 400, color: '#4B5563', fontSize: 13 }}>(version {qModule.version})</span></h3>
            <button onClick={() => setQModule(null)} style={{ ...link, color: '#374151' }}>Close</button>
          </div>
          <p style={{ fontSize: 12, color: '#4B5563', marginBottom: 12 }}>Adding, changing or removing a question starts a new version of the module. Earlier completions keep the version they passed.</p>
          {questions.length === 0 ? <div style={{ fontSize: 13, marginBottom: 16 }}>No questions yet.</div> : (
            <ol style={{ paddingLeft: 20, marginBottom: 16 }}>
              {questions.map(q => (
                <li key={q.id} style={{ marginBottom: 10, fontSize: 13 }}>
                  <div style={{ fontWeight: 600 }}>{q.question}</div>
                  <ul style={{ listStyle: 'none', paddingLeft: 0, margin: '4px 0' }}>
                    {q.options.map((o, i) => <li key={i} style={{ color: i === q.correct_index ? '#047857' : '#4B5563' }}>{o}{i === q.correct_index ? ' (correct answer)' : ''}</li>)}
                  </ul>
                  <CanChange area="training">
                  <button onClick={() => { setQEditingId(q.id); setQForm({ question: q.question, options: q.options, correct_index: q.correct_index }); setQMsg('') }} style={{ ...link, color: 'var(--cp-primary)' }}>Edit</button>
                  </CanChange>
                  <CanChange area="training">
                  <button onClick={() => deleteQuestion(q)} style={{ ...link, color: '#B91C1C' }}>Remove</button>
                  </CanChange>
                </li>
              ))}
            </ol>
          )}

          <CanChange area="training">
          <form onSubmit={saveQuestion} style={{ borderTop: '1px solid #E2E8F0', paddingTop: 14, maxWidth: 640 }}>
            <label style={label}>{qEditingId ? 'Edit question' : 'New question'}</label>
            <textarea required value={qForm.question} onChange={e => setQForm(f => ({ ...f, question: e.target.value }))} rows={2} style={{ ...input, marginBottom: 10 }} />
            <label style={label}>Answers — select the right one</label>
            {qForm.options.map((o, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                <input type="radio" name="correct" checked={qForm.correct_index === i} onChange={() => setQForm(f => ({ ...f, correct_index: i }))} aria-label={`Answer ${i + 1} is right`} />
                <input required value={o} onChange={e => setOption(i, e.target.value)} placeholder={`Answer ${i + 1}`} style={input} />
                {qForm.options.length > 2 && <button type="button" onClick={() => removeOption(i)} style={{ ...link, color: '#B91C1C' }} aria-label={`Remove answer ${i + 1}`}>✕</button>}
              </div>
            ))}
            {qForm.options.length < 6 && (
              <button type="button" onClick={() => setQForm(f => ({ ...f, options: [...f.options, ''] }))} style={{ ...link, color: 'var(--cp-primary)', marginBottom: 10 }}>+ Add an answer</button>
            )}
            {qMsg && <div style={{ fontSize: 13, margin: '6px 0 10px', fontWeight: 600 }}>{qMsg}</div>}
            <div>
              <button type="submit" className="cp-btn cp-btn-primary">{qEditingId ? 'Save question' : 'Add question'}</button>
              {qEditingId && <button type="button" onClick={() => { setQEditingId(null); setQForm(EMPTY_Q) }} className="cp-btn cp-btn-outline" style={{ marginLeft: 8 }}>Cancel</button>}
            </div>
          </form>
          </CanChange>
        </div>
      )}

      <div className="cp-card" style={{ ...card, marginTop: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Completions</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <select value={filter.module_id} onChange={e => setFilter(f => ({ ...f, module_id: e.target.value }))} style={{ ...input, width: 'auto' }}>
            <option value="">All modules</option>
            {modules.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
          </select>
          <select value={filter.result} onChange={e => setFilter(f => ({ ...f, result: e.target.value }))} style={{ ...input, width: 'auto' }}>
            <option value="">Passed and failed</option>
            <option value="pass">Passed</option>
            <option value="fail">Failed</option>
          </select>
          <input value={filter.reference} onChange={e => setFilter(f => ({ ...f, reference: e.target.value }))} placeholder="Certificate reference, e.g. TR-…" style={{ ...input, width: 240 }} />
          <button className="cp-btn cp-btn-outline" onClick={loadCompletions}>Search</button>
          <button className="cp-btn cp-btn-outline" onClick={exportCsv} style={{ marginLeft: 'auto' }}>Export CSV</button>
        </div>
        {cMsg && <div style={{ fontSize: 13, marginBottom: 10, fontWeight: 600 }}>{cMsg}</div>}
        {completions.length === 0 ? <div style={{ fontSize: 13 }}>No attempts match.</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #E2E8F0', textAlign: 'left' }}>
                <th style={{ padding: 8 }}>When (your time)</th>
                <th style={{ padding: 8 }}>Person</th>
                <th style={{ padding: 8 }}>Module</th>
                <th style={{ padding: 8 }}>Version</th>
                <th style={{ padding: 8 }}>Score</th>
                <th style={{ padding: 8 }}>Result</th>
                <th style={{ padding: 8 }}>Reference</th>
              </tr>
            </thead>
            <tbody>
              {completions.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: 8 }}>{new Date(c.taken_at).toLocaleString()}</td>
                  <td style={{ padding: 8 }}>{c.person_name}<div style={{ fontSize: 11, color: '#4B5563' }}>{c.person_email}</div></td>
                  <td style={{ padding: 8 }}>{c.module_title}</td>
                  <td style={{ padding: 8 }}>{c.module_version}</td>
                  <td style={{ padding: 8 }}>{c.score}% <span style={{ color: '#4B5563' }}>(pass {c.pass_score}%)</span></td>
                  <td style={{ padding: 8, color: c.passed ? '#047857' : '#B45309', fontWeight: 600 }}>{c.passed ? 'Passed' : 'Failed'}</td>
                  <td style={{ padding: 8, fontFamily: 'monospace' }}>{c.reference || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
    </AdminLayout>
  )
}
