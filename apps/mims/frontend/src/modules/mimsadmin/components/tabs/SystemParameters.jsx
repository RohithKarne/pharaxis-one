/**
 * SystemParameters.jsx — MIMS Admin > System > System Parameters
 *
 * Three sub-tabs:
 *   1. General  — Password rules (expiry days, alphanumeric, special chars, history count)
 *   2. Themes   — Blue / Warm / Green
 *   3. Others   — Placeholder
 *
 * CSS namespace: ma-sp-
 */

import { useState, useEffect } from 'react'
import { useAuth } from '../../../../shared/context/AuthContext'
import { httpFetch } from '../../../../shared/api/httpFetch.js'
import { setActiveTheme } from '../../../../shared/utils/applyTheme.js'
import './SystemParameters.css'

const API = '/api/admin/system-params'

const THEMES = [
  { key: 'blue',  name: 'Blue Theme',  swatches: ['#1d2b4f', '#1264a3', '#f8f9fb'] },
  { key: 'warm',  name: 'Warm Theme',  swatches: ['#5e1f12', '#c2410c', '#fdf8f3'] },
  { key: 'green', name: 'Green Theme', swatches: ['#064e3b', '#047857', '#f4faf7'] },
]

// ─────────────────────────────────────────────────────────────────────────────
export default function SystemParameters() {
  const { token } = useAuth()
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  const [tab,      setTab]      = useState('general')
  const [loading,  setLoading]  = useState(true)
  const [general,  setGeneral]  = useState(null)
  const [theme,    setTheme]    = useState('blue')
  const [flash,    setFlash]    = useState(null)

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true)
    try {
      const data = await httpFetch(API, { headers: H }).then(r => r.json())
      setGeneral(data.general)
      setTheme(data.themes?.ui_theme || 'blue')
    } catch {
      setGeneral({
        password_expiry_days: 90,
        password_require_alphanumeric: false,
        password_require_special_chars: false,
        password_history_count: 10,
      })
    } finally {
      setLoading(false)
    }
  }

  function showFlash(msg, type = 'success') {
    setFlash({ msg, type })
    setTimeout(() => setFlash(null), 3500)
  }

  if (loading) {
    return <div className="ma-sp-page"><div className="ma-sp-loading">Loading system parameters…</div></div>
  }

  return (
    <div className="ma-sp-page">

      {/* Header */}
      <div className="ma-sp-header">
        <h1 className="ma-sp-title">System Parameters</h1>
        <div className="ma-sp-sub">Platform-wide configuration applied to all tenants.</div>
      </div>

      {/* Sub-tabs */}
      <div className="ma-sp-tabs">
        <div className={`ma-sp-tab${tab === 'general' ? ' active' : ''}`} onClick={() => setTab('general')}>General</div>
        <div className={`ma-sp-tab${tab === 'themes'  ? ' active' : ''}`} onClick={() => setTab('themes')}>Themes</div>
        <div className={`ma-sp-tab${tab === 'others'  ? ' active' : ''}`} onClick={() => setTab('others')}>Others</div>
      </div>

      {/* Body */}
      <div className="ma-sp-body">
        {tab === 'general' && (
          // L4 (2026-11-13): password rules moved to Sign-in & Security, the one screen for sign-in.
          <div className="ma-sp-section">
            <div className="ma-sp-section-title">Password rules</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Password rules are now set on <strong>Sign-in &amp; Security</strong> (Security menu), with the other sign-in rules.
            </div>
          </div>
        )}
        {tab === 'themes' && (
          <ThemesTab
            initial={theme}
            H={H}
            onSaved={msg => showFlash(msg)}
            onError={msg => showFlash(msg, 'error')}
            flash={flash}
          />
        )}
        {tab === 'others' && <OthersTab general={general} theme={theme} />}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Themes Tab
// ─────────────────────────────────────────────────────────────────────────────
function ThemesTab({ initial, H, onSaved, onError, flash }) {
  const [selected, setSelected] = useState(initial)
  const [saving,   setSaving]   = useState(false)

  function chooseTheme(key) {
    setSelected(key)
    // Preview immediately (locally) — committed on save
    setActiveTheme(key)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const r = await httpFetch(`${API}/themes`, {
        method: 'PUT', headers: H,
        body: JSON.stringify({ ui_theme: selected }),
      })
      const d = await r.json()
      if (!r.ok) { onError(d.error || 'Failed to save theme.'); return }
      setActiveTheme(selected)
      onSaved('Theme applied successfully.')
    } catch { onError('Network error.') }
    finally { setSaving(false) }
  }

  return (
    <>
      <div className="ma-sp-section">
        <div className="ma-sp-section-title">Choose Platform Theme</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
          Theme applies to every user across all tenants. Selecting a theme previews it immediately. Click Save to apply permanently.
        </div>

        <div className="ma-sp-themes-grid">
          {THEMES.map(t => (
            <div
              key={t.key}
              className={`ma-sp-theme-card${selected === t.key ? ' selected' : ''}`}
              onClick={() => chooseTheme(t.key)}
            >
              <div className="ma-sp-theme-swatches">
                {t.swatches.map((c, i) => (
                  <div key={i} className="ma-sp-theme-swatch" style={{ background: c }} />
                ))}
              </div>
              <div className="ma-sp-theme-name">{t.name}</div>
              <div className="ma-sp-theme-radio">
                <input type="radio" checked={selected === t.key} onChange={() => chooseTheme(t.key)} />
                {selected === t.key ? 'Selected' : 'Select'}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="ma-sp-save-bar">
        {flash && (
          <span className={flash.type === 'error' ? 'ma-sp-flash-err' : 'ma-sp-flash-ok'}>
            {flash.msg}
          </span>
        )}
        <button className="ma-sp-btn-save" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save Theme'}
        </button>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Others Tab — operational overview
// ─────────────────────────────────────────────────────────────────────────────
function OthersTab({ general, theme }) {
  return (
    <div className="ma-sp-placeholder" style={{ alignItems: 'stretch', textAlign: 'left' }}>
      <div className="ma-sp-placeholder-title" style={{ marginBottom: 12 }}>Operational Summary</div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
        Review the currently active system-wide controls without switching tabs.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: '#fff' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Theme</div>
          <div style={{ marginTop: 6, fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>{String(theme || 'blue').toUpperCase()}</div>
        </div>
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: '#fff' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Password Expiry</div>
          <div style={{ marginTop: 6, fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>{general?.password_expiry_days || 0} days</div>
        </div>
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: '#fff' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Special Characters</div>
          <div style={{ marginTop: 6, fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>
            {general?.password_require_special_chars ? 'Required' : 'Optional'}
          </div>
        </div>
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: '#fff' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Password History</div>
          <div style={{ marginTop: 6, fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>{general?.password_history_count || 0} versions</div>
        </div>
      </div>
    </div>
  )
}
