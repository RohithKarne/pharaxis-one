/**
 * CasesPage.jsx — Case Management List View
 * F-13: New case creation modal (3 steps: Org → Site → Case Type)
 * Tabs: My Cases | Unassigned Cases | Deleted Cases
 * CSS namespace: cf- (case form)
 */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../shared/context/AuthContext'
import '../cases.css'

const API = 'http://localhost:3000/api'

const CASE_TYPE_LABELS = { MI: 'Medical Information', AE: 'Adverse Event', PC: 'Product Complaint' }
const CASE_TYPE_COLORS = { MI: '#2563eb', AE: '#dc2626', PC: '#d97706' }
const PRIORITY_COLORS  = { normal: '#6b7280', high: '#f59e0b', urgent: '#ef4444' }

export default function CasesPage() {
  const navigate        = useNavigate()
  const { token }       = useAuth()
  const headers         = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  const [activeTab, setActiveTab]   = useState('my')       // my | unassigned | deleted
  const [cases, setCases]           = useState([])
  const [loading, setLoading]       = useState(false)
  const [search, setSearch]         = useState('')

  // New case modal state
  const [modalOpen, setModalOpen]   = useState(false)
  const [step, setStep]             = useState(1)           // 1=Org, 2=Site, 3=Type
  const [orgs, setOrgs]             = useState([])
  const [sites, setSites]           = useState([])
  const [newCase, setNewCase]       = useState({ org_id: '', site_id: '', case_type: '', date_received: '' })
  const [creating, setCreating]     = useState(false)

  // ── Load cases ────────────────────────────────────────────────────────────

  const loadCases = useCallback(async () => {
    setLoading(true)
    try {
      const endpoint = activeTab === 'my'
        ? `${API}/cases/my`
        : activeTab === 'unassigned'
          ? `${API}/cases/unassigned`
          : `${API}/cases?deleted=true`
      const res  = await fetch(endpoint, { headers })
      const data = await res.json()
      setCases(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('loadCases error:', err)
      setCases([])
    } finally {
      setLoading(false)
    }
  }, [activeTab, token])

  useEffect(() => { loadCases() }, [loadCases])

  // ── New case modal helpers ────────────────────────────────────────────────

  async function openModal() {
    setStep(1)
    setNewCase({ org_id: '', site_id: '', case_type: '', date_received: '' })
    setSites([])
    setModalOpen(true)
    try {
      const res  = await fetch(`${API}/admin/orgs`, { headers })
      const data = await res.json()
      const list = Array.isArray(data) ? data : (Array.isArray(data.orgs) ? data.orgs : [])
      setOrgs(list.filter(o => o.is_active))
    } catch { setOrgs([]) }
  }

  async function selectOrg(orgId) {
    setNewCase(p => ({ ...p, org_id: orgId, site_id: '' }))
    try {
      const res  = await fetch(`${API}/admin/orgs/${orgId}/sites`, { headers })
      const data = await res.json()
      const list = Array.isArray(data) ? data : (Array.isArray(data.sites) ? data.sites : [])
      setSites(list.filter(s => s.is_active))
    } catch { setSites([]) }
    setStep(2)
  }

  function selectSite(siteId) {
    setNewCase(p => ({ ...p, site_id: siteId }))
    setStep(3)
  }

  async function createCase() {
    if (!newCase.case_type) return
    setCreating(true)
    try {
      const res  = await fetch(`${API}/cases`, {
        method: 'POST', headers,
        body: JSON.stringify({
          org_id:         newCase.org_id,
          site_id:        newCase.site_id,
          case_type:      newCase.case_type,
          date_received:  newCase.date_received || undefined,
          intake_channel: 'manual',
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create case')
      setModalOpen(false)
      navigate(`/cases/${data.id}`)
    } catch (err) {
      alert(err.message)
    } finally {
      setCreating(false)
    }
  }

  // ── Filtered list ─────────────────────────────────────────────────────────

  const filtered = cases.filter(c => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      (c.case_number || '').toLowerCase().includes(q) ||
      (c.org_name    || '').toLowerCase().includes(q) ||
      (c.site_name   || '').toLowerCase().includes(q) ||
      (c.description || '').toLowerCase().includes(q)
    )
  })

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="cf-cases-page">

      {/* Header */}
      <div className="cf-cases-header">
        <div className="cf-cases-title-row">
          <h1 className="cf-cases-title">Case Management</h1>
          <button className="cf-new-case-btn" onClick={openModal}>+ New Case</button>
        </div>

        {/* Tabs */}
        <div className="cf-cases-tabs">
          {[
            { key: 'my',         label: 'My Cases' },
            { key: 'unassigned', label: 'Unassigned Cases' },
            { key: 'deleted',    label: 'Deleted Cases' },
          ].map(t => (
            <button
              key={t.key}
              className={`cf-cases-tab ${activeTab === t.key ? 'active' : ''}`}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="cf-cases-search-row">
          <input
            className="cf-cases-search"
            placeholder="Search by case number, org, site, description…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Case table */}
      <div className="cf-cases-body">
        {loading ? (
          <div className="cf-cases-loading">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="cf-cases-empty">
            {search ? 'No cases match your search.' : `No ${activeTab === 'my' ? 'cases assigned to you' : activeTab + ' cases'} yet.`}
          </div>
        ) : (
          <table className="cf-cases-table">
            <thead>
              <tr>
                <th>Case #</th>
                <th>Type</th>
                <th>Organisation</th>
                <th>Site</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Date Received</th>
                <th>Owner</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} className="cf-cases-row" onClick={() => navigate(`/cases/${c.id}`)}>
                  <td className="cf-case-num">
                    {c.case_number || <span className="cf-draft-badge">DRAFT</span>}
                  </td>
                  <td>
                    <span
                      className="cf-type-badge"
                      style={{ background: CASE_TYPE_COLORS[c.case_type] }}
                    >
                      {c.case_type}
                    </span>
                  </td>
                  <td>{c.org_name  || '—'}</td>
                  <td>{c.site_name || '—'}</td>
                  <td>{c.status_name || <span className="cf-no-status">New</span>}</td>
                  <td>
                    <span style={{ color: PRIORITY_COLORS[c.priority] || '#6b7280', fontWeight: 600 }}>
                      {c.priority || 'normal'}
                    </span>
                  </td>
                  <td>{c.date_received ? c.date_received.slice(0, 10) : '—'}</td>
                  <td>{c.owner_name || '—'}</td>
                  <td>
                    <button className="cf-open-btn" onClick={e => { e.stopPropagation(); navigate(`/cases/${c.id}`) }}>
                      Open →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* New Case Modal */}
      {modalOpen && (
        <div className="cf-modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="cf-modal" onClick={e => e.stopPropagation()}>
            <div className="cf-modal-header">
              <span className="cf-modal-title">New Case</span>
              <button className="cf-modal-close" onClick={() => setModalOpen(false)}>✕</button>
            </div>

            {/* Step indicator */}
            <div className="cf-modal-steps">
              {['Organisation', 'Site', 'Case Type'].map((label, i) => (
                <div key={i} className={`cf-modal-step ${step > i + 1 ? 'done' : step === i + 1 ? 'active' : ''}`}>
                  <span className="cf-step-num">{step > i + 1 ? '✓' : i + 1}</span>
                  <span className="cf-step-label">{label}</span>
                </div>
              ))}
            </div>

            <div className="cf-modal-body">

              {/* Step 1: Organisation */}
              {step === 1 && (
                <div className="cf-modal-step-content">
                  <p className="cf-modal-instruction">Select the organisation for this case:</p>
                  <div className="cf-select-list">
                    {orgs.length === 0 && <div className="cf-select-empty">No organisations found.</div>}
                    {orgs.map(o => (
                      <button key={o.id} className="cf-select-item" onClick={() => selectOrg(o.id)}>
                        {o.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 2: Site */}
              {step === 2 && (
                <div className="cf-modal-step-content">
                  <p className="cf-modal-instruction">Select the site for this case:</p>
                  <div className="cf-select-list">
                    {sites.length === 0 && <div className="cf-select-empty">No active sites for this organisation.</div>}
                    {sites.map(s => (
                      <button key={s.id} className="cf-select-item" onClick={() => selectSite(s.id)}>
                        {s.name}{s.country ? ` — ${s.country}` : ''}
                      </button>
                    ))}
                  </div>
                  <button className="cf-modal-back" onClick={() => setStep(1)}>← Back</button>
                </div>
              )}

              {/* Step 3: Case Type + Date */}
              {step === 3 && (
                <div className="cf-modal-step-content">
                  <p className="cf-modal-instruction">Select case type:</p>
                  <div className="cf-type-select-grid">
                    {Object.entries(CASE_TYPE_LABELS).map(([type, label]) => (
                      <button
                        key={type}
                        className={`cf-type-select-card ${newCase.case_type === type ? 'selected' : ''}`}
                        style={{ borderColor: newCase.case_type === type ? CASE_TYPE_COLORS[type] : undefined }}
                        onClick={() => setNewCase(p => ({ ...p, case_type: type }))}
                      >
                        <span className="cf-type-card-badge" style={{ background: CASE_TYPE_COLORS[type] }}>{type}</span>
                        <span className="cf-type-card-label">{label}</span>
                      </button>
                    ))}
                  </div>

                  <div className="cf-modal-field">
                    <label className="cf-modal-label">Date Received (optional)</label>
                    <input
                      type="date"
                      className="cf-modal-input"
                      value={newCase.date_received}
                      onChange={e => setNewCase(p => ({ ...p, date_received: e.target.value }))}
                    />
                  </div>

                  <div className="cf-modal-actions">
                    <button className="cf-modal-back" onClick={() => setStep(2)}>← Back</button>
                    <button
                      className="cf-modal-confirm"
                      disabled={!newCase.case_type || creating}
                      onClick={createCase}
                    >
                      {creating ? 'Creating…' : 'Create Case →'}
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  )
}
