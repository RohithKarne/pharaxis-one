/**
 * CopyDivisionPage.jsx — Copy Division
 * Platform-admin-only: copy all selected org config from one tenant to another.
 * CSS namespace: cd-
 */

import { useState, useEffect } from 'react'
import { useAuth } from '../../../shared/context/AuthContext'
import MIMSLayout from '../../../shared/components/MIMSLayout'
import './CopyDivisionPage.css'
import { httpFetch } from '../../../shared/api/httpFetch.js'

const API = import.meta.env.VITE_API_URL || '/api'

const CATEGORY_ICONS = {
  picklists:     '📋',
  case_form:     '📝',
  workflow:      '⚙️',
  integrations:  '🔗',
  sites:         '🏢',
  case_numbering:'🔢',
  products:      '💊',
  cm_settings:   '📁',
  exports:       '📤',
}

export default function CopyDivisionPage() {
  const { token } = useAuth()
  const headers   = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  const [orgs,        setOrgs]        = useState([])
  const [categories,  setCategories]  = useState([])
  const [sourceOrg,   setSourceOrg]   = useState('')
  const [targetOrg,   setTargetOrg]   = useState('')
  const [selected,    setSelected]    = useState({})
  const [overwrite,   setOverwrite]   = useState(false)
  const [preview,     setPreview]     = useState(null)
  const [previewing,  setPreviewing]  = useState(false)
  const [executing,   setExecuting]   = useState(false)
  const [result,      setResult]      = useState(null)
  const [error,       setError]       = useState(null)
  const [confirmed,   setConfirmed]   = useState(false)

  useEffect(() => {
    Promise.all([
      httpFetch(`${API}/admin/copy-division/orgs`,       { headers }).then(r => r.json()),
      httpFetch(`${API}/admin/copy-division/categories`, { headers }).then(r => r.json()),
    ]).then(([o, c]) => {
      setOrgs(o.orgs || [])
      const cats = c.categories || []
      setCategories(cats)
      const initial = {}
      cats.forEach(c => { initial[c.key] = true })
      setSelected(initial)
    }).catch(() => setError('Failed to load organisations or categories.'))
  }, [])

  const selectedKeys = Object.keys(selected).filter(k => selected[k])
  const canPreview   = sourceOrg && targetOrg && sourceOrg !== targetOrg && selectedKeys.length > 0
  const totalRows    = preview ? Object.values(preview).flatMap(t => Object.values(t)).reduce((a, b) => a + b, 0) : 0

  async function handlePreview() {
    setPreviewing(true); setError(null); setPreview(null); setResult(null); setConfirmed(false)
    try {
      const res  = await httpFetch(`${API}/admin/copy-division/preview`, {
        method: 'POST', headers,
        body: JSON.stringify({ source_org_id: parseInt(sourceOrg), categories: selectedKeys }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setPreview(data.preview)
    } catch { setError('Network error.') }
    finally { setPreviewing(false) }
  }

  async function handleExecute() {
    setExecuting(true); setError(null); setResult(null)
    try {
      const res  = await httpFetch(`${API}/admin/copy-division/execute`, {
        method: 'POST', headers,
        body: JSON.stringify({
          source_org_id: parseInt(sourceOrg),
          target_org_id: parseInt(targetOrg),
          categories: selectedKeys,
          overwrite,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setResult(data.results)
      setPreview(null)
      setConfirmed(false)
    } catch { setError('Network error.') }
    finally { setExecuting(false) }
  }

  function toggleAll(val) {
    const next = {}
    categories.forEach(c => { next[c.key] = val })
    setSelected(next)
  }

  const sourceOrgName = orgs.find(o => String(o.id) === String(sourceOrg))?.name || ''
  const targetOrgName = orgs.find(o => String(o.id) === String(targetOrg))?.name || ''

  return (
    <MIMSLayout activeNav="utilities">
      <div className="cd-page">

        {/* Header */}
        <div className="cd-header">
          <div>
            <h1 className="cd-title">Copy Division</h1>
            <span className="cd-subtitle">Copy all selected configuration from one organisation to another. Admin only. This action cannot be automatically undone.</span>
          </div>
          <div className="cd-badge-platform-admin">Admin Only</div>
        </div>

        {error && <div className="cd-error-banner">{error}</div>}

        {result && (
          <div className="cd-success-banner">
            <div className="cd-success-title">✓ Copy completed successfully</div>
            <div className="cd-success-rows">
              {Object.entries(result).map(([key, count]) => {
                const cat = categories.find(c => c.key === key)
                return (
                  <span key={key} className="cd-success-chip">
                    {CATEGORY_ICONS[key]} {cat?.label || key}: <strong>{count}</strong> rows
                  </span>
                )
              })}
            </div>
          </div>
        )}

        <div className="cd-body">

          {/* Step 1 — Org selection */}
          <div className="cd-card">
            <div className="cd-card-title">Step 1 — Select Organisations</div>
            <div className="cd-org-row">
              <div className="cd-org-block">
                <label className="cd-label">Copy FROM (Source)</label>
                <select className="cd-select" value={sourceOrg} onChange={e => { setSourceOrg(e.target.value); setPreview(null); setResult(null); setConfirmed(false) }}>
                  <option value="">— Select source org —</option>
                  {orgs.map(o => (
                    <option key={o.id} value={o.id} disabled={String(o.id) === String(targetOrg)}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="cd-arrow-sep">→</div>
              <div className="cd-org-block">
                <label className="cd-label">Copy TO (Target)</label>
                <select className="cd-select" value={targetOrg} onChange={e => { setTargetOrg(e.target.value); setPreview(null); setResult(null); setConfirmed(false) }}>
                  <option value="">— Select target org —</option>
                  {orgs.map(o => (
                    <option key={o.id} value={o.id} disabled={String(o.id) === String(sourceOrg)}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {sourceOrg && targetOrg && sourceOrg === targetOrg && (
              <div className="cd-warn-inline">Source and target cannot be the same organisation.</div>
            )}
          </div>

          {/* Step 2 — Categories */}
          <div className="cd-card">
            <div className="cd-card-header">
              <div className="cd-card-title">Step 2 — Select Content Categories</div>
              <div className="cd-select-all-row">
                <button className="cd-link-btn" onClick={() => toggleAll(true)}>Select all</button>
                <span className="cd-divider">·</span>
                <button className="cd-link-btn" onClick={() => toggleAll(false)}>Clear all</button>
              </div>
            </div>
            <div className="cd-categories">
              {categories.map(cat => (
                <label key={cat.key} className={`cd-cat-item ${selected[cat.key] ? 'cd-cat-checked' : ''}`}>
                  <input
                    type="checkbox"
                    className="cd-checkbox"
                    checked={!!selected[cat.key]}
                    onChange={e => {
                      setSelected(s => ({ ...s, [cat.key]: e.target.checked }))
                      setPreview(null); setResult(null); setConfirmed(false)
                    }}
                  />
                  <span className="cd-cat-icon">{CATEGORY_ICONS[cat.key] || '📦'}</span>
                  <span className="cd-cat-info">
                    <span className="cd-cat-label">{cat.label}</span>
                    <span className="cd-cat-desc">{cat.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Step 3 — Options */}
          <div className="cd-card">
            <div className="cd-card-title">Step 3 — Options</div>
            <label className="cd-overwrite-toggle">
              <input type="checkbox" checked={overwrite} onChange={e => { setOverwrite(e.target.checked); setPreview(null); setConfirmed(false) }} />
              <span className="cd-overwrite-label">
                <strong>Overwrite existing records</strong> — deletes all existing config in selected categories for the target org before copying. If unchecked, existing records are preserved and only new ones are added.
              </span>
            </label>
            {overwrite && (
              <div className="cd-warn-overwrite">
                ⚠ Overwrite mode is on. All existing configuration in the selected categories for <strong>{targetOrgName || 'the target org'}</strong> will be permanently deleted before copying.
              </div>
            )}
          </div>

          {/* Preview */}
          {preview && (
            <div className="cd-card cd-preview-card">
              <div className="cd-card-title">Preview — {totalRows} rows will be copied</div>
              <div className="cd-preview-grid">
                {Object.entries(preview).map(([key, tables]) => {
                  const cat = categories.find(c => c.key === key)
                  return (
                    <div key={key} className="cd-preview-cat">
                      <div className="cd-preview-cat-label">{CATEGORY_ICONS[key]} {cat?.label}</div>
                      {Object.entries(tables).map(([tbl, count]) => (
                        <div key={tbl} className="cd-preview-row">
                          <span className="cd-preview-tbl">{tbl}</span>
                          <span className="cd-preview-count">{count} rows</span>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>

              {totalRows > 0 && (
                <label className="cd-confirm-check">
                  <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
                  <span>I confirm copying <strong>{totalRows} rows</strong> from <strong>{sourceOrgName}</strong> to <strong>{targetOrgName}</strong>{overwrite ? ' (overwrite mode)' : ''}.</span>
                </label>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="cd-actions">
            <button
              className="cd-preview-btn"
              onClick={handlePreview}
              disabled={!canPreview || previewing}
            >
              {previewing ? 'Loading preview…' : '🔍 Preview'}
            </button>
            {preview && totalRows > 0 && (
              <button
                className="cd-execute-btn"
                onClick={handleExecute}
                disabled={!confirmed || executing}
              >
                {executing ? 'Copying…' : `▶ Execute Copy (${totalRows} rows)`}
              </button>
            )}
          </div>

        </div>
      </div>
    </MIMSLayout>
  )
}
