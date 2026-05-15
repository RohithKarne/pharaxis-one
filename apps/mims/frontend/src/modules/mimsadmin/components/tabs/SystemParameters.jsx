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
          <GeneralTab
            initial={general}
            H={H}
            onSaved={msg => { showFlash(msg); load() }}
            onError={msg => showFlash(msg, 'error')}
            flash={flash}
          />
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
        {tab === 'others' && <OthersTab />}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// General Tab — Password Rules
// ─────────────────────────────────────────────────────────────────────────────
function GeneralTab({ initial, H, onSaved, onError, flash }) {
  const [form,   setForm]   = useState(initial)
  const [saving, setSaving] = useState(false)

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function clampHistory(v) {
    const n = parseInt(v, 10)
    if (!Number.isFinite(n)) return 1
    return Math.min(24, Math.max(1, n))
  }

  function clampExpiry(v) {
    const n = parseInt(v, 10)
    if (!Number.isFinite(n)) return 1
    return Math.min(3650, Math.max(1, n))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const r = await httpFetch(`${API}/general`, {
        method: 'PUT', headers: H,
        body: JSON.stringify({
          password_expiry_days:           clampExpiry(form.password_expiry_days),
          password_require_alphanumeric:  !!form.password_require_alphanumeric,
          password_require_special_chars: !!form.password_require_special_chars,
          password_history_count:         clampHistory(form.password_history_count),
        }),
      })
      const d = await r.json()
      if (!r.ok) { onError(d.error || 'Failed to save.'); return }
      onSaved('Password rules saved successfully.')
    } catch { onError('Network error.') }
    finally { setSaving(false) }
  }

  return (
    <>
      {/* Password Rules section */}
      <div className="ma-sp-section">
        <div className="ma-sp-section-title">Password Rules</div>

        {/* Field 1 — Expiry days */}
        <div className="ma-sp-row">
          <div className="ma-sp-label-block">
            <span className="ma-sp-label">Password expires after</span>
            <span className="ma-sp-desc">
              Users will be required to reset their password after this many days. Applies to all new and reset passwords going forward.
            </span>
          </div>
          <div className="ma-sp-control">
            <input
              type="number"
              min={1} max={3650}
              className="ma-sp-num-input"
              value={form.password_expiry_days}
              onChange={e => setField('password_expiry_days', e.target.value)}
            />
            <span className="ma-sp-num-suffix">days</span>
          </div>
        </div>

        {/* Field 2 — Alpha-numeric */}
        <div className="ma-sp-row">
          <div className="ma-sp-label-block">
            <span className="ma-sp-label">Require alpha-numeric passwords</span>
            <span className="ma-sp-desc">
              Password must contain at least one letter (A–Z, a–z) and at least one number (0–9).
            </span>
          </div>
          <div className="ma-sp-control">
            <label className="ma-sp-toggle">
              <input
                type="checkbox"
                checked={!!form.password_require_alphanumeric}
                onChange={e => setField('password_require_alphanumeric', e.target.checked)}
              />
              <span className="slider" />
            </label>
          </div>
        </div>

        {/* Field 3 — Special chars */}
        <div className="ma-sp-row">
          <div className="ma-sp-label-block">
            <span className="ma-sp-label">Require special characters</span>
            <span className="ma-sp-desc">
              Password must contain at least one special character. Allowed: <code>! @ # $ % ^ & *</code>
            </span>
          </div>
          <div className="ma-sp-control">
            <label className="ma-sp-toggle">
              <input
                type="checkbox"
                checked={!!form.password_require_special_chars}
                onChange={e => setField('password_require_special_chars', e.target.checked)}
              />
              <span className="slider" />
            </label>
          </div>
        </div>

        {/* Field 4 — History count */}
        <div className="ma-sp-row">
          <div className="ma-sp-label-block">
            <span className="ma-sp-label">Password cannot be one of the last</span>
            <span className="ma-sp-desc">
              Users cannot reuse any of their previous N passwords. Minimum 1, maximum 24.
            </span>
          </div>
          <div className="ma-sp-control">
            <input
              type="number"
              min={1} max={24}
              className="ma-sp-num-input"
              value={form.password_history_count}
              onChange={e => setField('password_history_count', e.target.value)}
            />
            <span className="ma-sp-num-suffix">passwords</span>
          </div>
        </div>
      </div>

      {/* Save bar */}
      <div className="ma-sp-save-bar">
        {flash && (
          <span className={flash.type === 'error' ? 'ma-sp-flash-err' : 'ma-sp-flash-ok'}>
            {flash.msg}
          </span>
        )}
        <button className="ma-sp-btn-save" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </>
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
// Others Tab — placeholder
// ─────────────────────────────────────────────────────────────────────────────
function OthersTab() {
  return (
    <div className="ma-sp-placeholder">
      <div className="ma-sp-placeholder-icon">🚧</div>
      <div className="ma-sp-placeholder-title">Coming Soon</div>
      <div style={{ fontSize: 13 }}>Additional system parameters will be available here in a future release.</div>
    </div>
  )
}
