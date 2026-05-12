/**
 * FeedbackWidget.jsx — Floating bug report + feature suggestion widget
 *
 * Renders a fixed button in the bottom-right corner of every page.
 * Opens a modal for either a bug report or a feature suggestion.
 * Auto-captures: current page URL, browser info, user details.
 *
 * Owned by: Saad (Frontend)
 */

import { useState, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'

const API_BASE = import.meta.env.VITE_API_URL || ''

const MODULES = [
  'Cases', 'Case MI', 'Case AE', 'Case PC', 'Case QA',
  'Inbox', 'Content Management', 'Reports', 'Transmissions',
  'Admin', 'Integrations', 'Chat', 'Dashboard', 'Other',
]

const SEVERITY_OPTIONS = [
  { value: 'critical', label: '🔴 Critical — App is unusable', color: '#e01e5a' },
  { value: 'broken',   label: '🟠 Broken — Feature doesn\'t work', color: '#e07b1e' },
  { value: 'wrong',    label: '🟡 Wrong — Incorrect behaviour', color: '#b8860b' },
  { value: 'minor',    label: '🟢 Minor — Small issue / cosmetic', color: '#007a5a' },
]

const FREQ_OPTIONS = [
  { value: 'daily',  label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'rarely', label: 'Rarely' },
]

function getBrowserInfo() {
  try {
    const ua = navigator.userAgent
    const w  = window.innerWidth
    const h  = window.innerHeight
    return `${ua} | ${w}×${h}`
  } catch (_) { return '' }
}

const overlayStyle = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
  zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 16,
}

const modalStyle = {
  background: 'var(--surface, #fff)', borderRadius: 12,
  boxShadow: '0 8px 40px rgba(0,0,0,0.18)', width: '100%', maxWidth: 560,
  maxHeight: '90vh', overflowY: 'auto', padding: '28px 28px 24px',
  position: 'relative',
}

const labelStyle = {
  display: 'block', fontSize: 12, fontWeight: 600,
  color: 'var(--text-secondary, #64748b)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em',
}

const inputStyle = {
  width: '100%', padding: '9px 12px', border: '1px solid var(--border, #e2e8f0)',
  borderRadius: 7, fontSize: 14, color: 'var(--text-primary, #1e293b)',
  background: 'var(--surface, #fff)', boxSizing: 'border-box', outline: 'none',
  resize: 'vertical',
}

const btnPrimary = {
  padding: '10px 22px', background: '#3b82f6', color: '#fff',
  border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
  cursor: 'pointer', letterSpacing: '0.02em',
}

const btnSecondary = {
  padding: '10px 18px', background: 'transparent', color: 'var(--text-secondary, #64748b)',
  border: '1px solid var(--border, #e2e8f0)', borderRadius: 8, fontSize: 14, cursor: 'pointer',
}

// ── Bug Report Form ───────────────────────────────────────────────────────────

function BugForm({ onClose, token }) {
  const [form, setForm] = useState({
    description: '', steps_to_reproduce: '', severity: 'wrong', module: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone]             = useState(false)
  const [error, setError]           = useState('')

  function update(key, val) { setForm(f => ({ ...f, [key]: val })) }

  async function submit(e) {
    e.preventDefault()
    if (!form.description.trim()) { setError('Please describe what happened.'); return }
    setSubmitting(true); setError('')
    try {
      const res = await fetch(`${API_BASE}/api/qa/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...form,
          page_url:     window.location.href,
          browser_info: getBrowserInfo(),
        }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Submit failed'); }
      setDone(true)
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Report submitted!</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary, #64748b)', marginBottom: 24 }}>
          Bala will review it shortly. Thank you for helping improve MIMS.
        </div>
        <button style={btnPrimary} onClick={onClose}>Close</button>
      </div>
    )
  }

  return (
    <form onSubmit={submit}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20, gap: 10 }}>
        <span style={{ fontSize: 22 }}>🐛</span>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary, #1e293b)' }}>Report a Bug</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary, #64748b)' }}>
            Page: <span style={{ fontFamily: 'monospace' }}>{window.location.pathname}</span>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fde8ef', color: '#e01e5a', padding: '9px 14px', borderRadius: 7, fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>What happened? *</label>
        <textarea
          style={{ ...inputStyle, minHeight: 80 }}
          placeholder="Describe the issue clearly..."
          value={form.description}
          onChange={e => update('description', e.target.value)}
          required
        />
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Steps to reproduce</label>
        <textarea
          style={{ ...inputStyle, minHeight: 60 }}
          placeholder="1. Go to... 2. Click... 3. See error..."
          value={form.steps_to_reproduce}
          onChange={e => update('steps_to_reproduce', e.target.value)}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div>
          <label style={labelStyle}>Severity *</label>
          <select style={inputStyle} value={form.severity} onChange={e => update('severity', e.target.value)}>
            {SEVERITY_OPTIONS.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Module</label>
          <select style={inputStyle} value={form.module} onChange={e => update('module', e.target.value)}>
            <option value="">Select module…</option>
            {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button type="button" style={btnSecondary} onClick={onClose}>Cancel</button>
        <button type="submit" style={btnPrimary} disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit Report'}
        </button>
      </div>
    </form>
  )
}

// ── Feature Request Form ───────────────────────────────────────────────────────

function FeatureForm({ onClose, token }) {
  const [form, setForm] = useState({
    suggestion: '', current_pain: '', module: '',
    use_frequency: 'weekly', priority: 'nice-to-have',
  })
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone]             = useState(false)
  const [error, setError]           = useState('')

  function update(key, val) { setForm(f => ({ ...f, [key]: val })) }

  async function submit(e) {
    e.preventDefault()
    if (!form.suggestion.trim()) { setError('Please describe your suggestion.'); return }
    setSubmitting(true); setError('')
    try {
      const res = await fetch(`${API_BASE}/api/qa/features`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Submit failed'); }
      setDone(true)
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>💡</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Suggestion received!</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary, #64748b)', marginBottom: 24 }}>
          Bala will review it and share with the team. Great ideas move MIMS forward!
        </div>
        <button style={btnPrimary} onClick={onClose}>Close</button>
      </div>
    )
  }

  return (
    <form onSubmit={submit}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20, gap: 10 }}>
        <span style={{ fontSize: 22 }}>💡</span>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary, #1e293b)' }}>Suggest a Feature</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary, #64748b)' }}>Share an idea to make MIMS better</div>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fde8ef', color: '#e01e5a', padding: '9px 14px', borderRadius: 7, fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>What are you trying to do that's difficult right now?</label>
        <textarea
          style={{ ...inputStyle, minHeight: 60 }}
          placeholder="Currently I have to manually… which takes a long time…"
          value={form.current_pain}
          onChange={e => update('current_pain', e.target.value)}
        />
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Your suggestion *</label>
        <textarea
          style={{ ...inputStyle, minHeight: 80 }}
          placeholder="It would be great if MIMS could…"
          value={form.suggestion}
          onChange={e => update('suggestion', e.target.value)}
          required
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
        <div>
          <label style={labelStyle}>Module</label>
          <select style={inputStyle} value={form.module} onChange={e => update('module', e.target.value)}>
            <option value="">Any</option>
            {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>How often?</label>
          <select style={inputStyle} value={form.use_frequency} onChange={e => update('use_frequency', e.target.value)}>
            {FREQ_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Priority</label>
          <select style={inputStyle} value={form.priority} onChange={e => update('priority', e.target.value)}>
            <option value="nice-to-have">Nice to have</option>
            <option value="critical">Critical need</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button type="button" style={btnSecondary} onClick={onClose}>Cancel</button>
        <button type="submit" style={btnPrimary} disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit Suggestion'}
        </button>
      </div>
    </form>
  )
}

// ── Main Widget ───────────────────────────────────────────────────────────────

export default function FeedbackWidget() {
  const { user, token } = useAuth()
  const [open, setOpen]       = useState(false)      // picker open
  const [mode, setMode]       = useState(null)       // 'bug' | 'feature'

  const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('token') : '')

  // Don't render on login page or if not authenticated
  if (!user) return null

  function pickMode(m) { setMode(m); setOpen(false) }
  function closeModal() { setMode(null) }

  return (
    <>
      {/* Floating trigger button */}
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9000 }}>
        {open && (
          <div style={{
            position: 'absolute', bottom: 56, right: 0,
            background: 'var(--surface, #fff)', borderRadius: 10,
            boxShadow: '0 4px 24px rgba(0,0,0,0.14)',
            border: '1px solid var(--border, #e2e8f0)',
            overflow: 'hidden', minWidth: 200,
          }}>
            <button
              onClick={() => pickMode('bug')}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '12px 18px', background: 'none', border: 'none',
                cursor: 'pointer', fontSize: 14, fontWeight: 500,
                color: 'var(--text-primary, #1e293b)', textAlign: 'left',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover, #f1f5f9)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <span style={{ fontSize: 18 }}>🐛</span> Report a Bug
            </button>
            <div style={{ height: 1, background: 'var(--border, #e2e8f0)' }} />
            <button
              onClick={() => pickMode('feature')}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '12px 18px', background: 'none', border: 'none',
                cursor: 'pointer', fontSize: 14, fontWeight: 500,
                color: 'var(--text-primary, #1e293b)', textAlign: 'left',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover, #f1f5f9)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <span style={{ fontSize: 18 }}>💡</span> Suggest a Feature
            </button>
          </div>
        )}
        <button
          onClick={() => setOpen(o => !o)}
          title="Report bug or suggest feature"
          style={{
            width: 48, height: 48, borderRadius: '50%',
            background: open ? '#1e293b' : '#3b82f6',
            color: '#fff', border: 'none', cursor: 'pointer',
            fontSize: 20, boxShadow: '0 4px 14px rgba(59,130,246,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.15s',
          }}
        >
          {open ? '✕' : '＋'}
        </button>
      </div>

      {/* Bug report modal */}
      {mode === 'bug' && (
        <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) closeModal() }}>
          <div style={modalStyle}>
            <BugForm onClose={closeModal} token={authToken} />
          </div>
        </div>
      )}

      {/* Feature request modal */}
      {mode === 'feature' && (
        <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) closeModal() }}>
          <div style={modalStyle}>
            <FeatureForm onClose={closeModal} token={authToken} />
          </div>
        </div>
      )}
    </>
  )
}
