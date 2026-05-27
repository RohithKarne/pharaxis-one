/**
 * CasesPage.jsx — Case Management List View
 * F-13: New case creation modal (3 steps: Org → Site → Case Type)
 * Tabs: My Cases | Unassigned Cases | Deleted Cases
 * CSS namespace: cf- (case form)
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import toast from '../../../shared/utils/toast'
import { confirm } from '../../../shared/utils/confirm'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../../shared/context/AuthContext'
import { isAdminUser } from '../../../shared/utils/adminScope.js'
import MIMSLayout from '../../../shared/components/MIMSLayout'
import '../cases.css'
import { httpFetch } from '../../../shared/api/httpFetch.js'

const API = import.meta.env.VITE_API_URL || '/api'

const CASE_TYPE_COLORS = { MI: '#2563eb', AE: '#dc2626', PC: '#d97706' }
const PRIORITY_COLORS  = { normal: '#6b7280', high: '#f59e0b', urgent: '#ef4444' }

// S19-P0: SLA badge — computed from sla_due date returned by /my and /unassigned
function SlaBadge({ slaDue }) {
  if (!slaDue) return null
  const due   = new Date(slaDue)
  const now   = new Date()
  const diffH = (due - now) / (1000 * 60 * 60)   // hours remaining
  if (diffH < 0) {
    return <span style={{ display:'inline-block', padding:'1px 7px', borderRadius:10, fontSize:11, fontWeight:700, background:'#fee2e2', color:'#dc2626', marginLeft:4 }}>SLA ✕</span>
  }
  if (diffH < 48) {
    return <span style={{ display:'inline-block', padding:'1px 7px', borderRadius:10, fontSize:11, fontWeight:700, background:'#fef9c3', color:'#854d0e', marginLeft:4 }}>SLA ⚠</span>
  }
  return <span style={{ display:'inline-block', padding:'1px 7px', borderRadius:10, fontSize:11, fontWeight:600, background:'#dcfce7', color:'#15803d', marginLeft:4 }}>SLA ✓</span>
}

export default function CasesPage() {
  const navigate        = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { token, user, hasCapability, orgId } = useAuth()
  const headers         = useMemo(
    () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }),
    [token]
  )

  const [activeTab, setActiveTab]   = useState('my')       // my | unassigned | deleted
  const [cases, setCases]           = useState([])
  const [loading, setLoading]       = useState(false)
  const [search, setSearch]         = useState('')
  const [searchScope, setSearchScope] = useState('all') // all | tab
  const [savedViews, setSavedViews] = useState([])
  const [viewsLoading, setViewsLoading] = useState(false)
  const [viewSaving, setViewSaving] = useState(false)
  const [activeViewId, setActiveViewId] = useState(null)

  // New case modal state — multi-step intake form (CF-E1–E5)
  const [modalOpen, setModalOpen]     = useState(false)
  const [modalStep, setModalStep]     = useState(1) // 1=Org/Site/Type, 2=Reporter+Patient, 3=Type-specific
  const [orgs, setOrgs]               = useState([])
  const [newCase, setNewCase]         = useState({ org_id: '', case_type: '' })
  const [creating, setCreating]       = useState(false)
  // Reporter fields
  const [reporter, setReporter]       = useState({ first_name: '', last_name: '', email: '', phone: '', reporter_type: 'HCP', country: '', organisation: '' })
  // Patient fields (AE/PC)
  const [patient, setPatient]         = useState({ initials: '', age: '', age_unit: 'years', gender: '', weight_kg: '' })
  // AE intake
  const [aeIntake, setAeIntake]       = useState({
    suspect_drug_name: '', batch_lot_number: '', dose: '', route_of_admin: '',
    treatment_start_date: '', treatment_stop_date: '', reaction_description: '',
    reaction_onset_date: '', outcome: '',
    is_death: false, is_life_threatening: false, is_hospitalization: false,
    is_prolonged_hospitalization: false, is_disability: false, is_congenital_anomaly: false,
    is_other_medically_important: false,
  })
  // PC intake
  const [pcIntake, setPcIntake]       = useState({
    product_name: '', batch_lot_number: '', expiry_date: '', purchase_date: '',
    complaint_category: '', complaint_description: '', sample_available: false, sample_return_requested: false,
  })
  const [dupCandidates, setDupCandidates] = useState([])
  const [dupCheckLoading, setDupCheckLoading] = useState(false)
  const [dupError, setDupError] = useState('')

  // ── Load cases ────────────────────────────────────────────────────────────
  useEffect(() => {
    const tab = (searchParams.get('tab') || '').toLowerCase()
    if (tab === 'my' || tab === 'unassigned' || tab === 'deleted') {
      setActiveTab(tab)
    }
  }, [searchParams])

  function handleTabChange(tab, options = {}) {
    setActiveTab(tab)
    if (!options.preserveSavedView) setActiveViewId(null)
    const next = new URLSearchParams(searchParams)
    next.set('tab', tab)
    setSearchParams(next)
  }

  const loadCases = useCallback(async () => {
    setLoading(true)
    try {
      const searchTerm = search.trim()
      const searchQuery = searchTerm ? `search=${encodeURIComponent(searchTerm)}` : ''
      const useGlobalSearch = searchTerm.length > 0 && searchScope === 'all'

      const endpoint = useGlobalSearch
        ? `${API}/cases${searchQuery ? `?${searchQuery}` : ''}`
        : activeTab === 'my'
          ? `${API}/cases/my${searchQuery ? `?${searchQuery}` : ''}`
          : activeTab === 'unassigned'
            ? `${API}/cases/unassigned${searchQuery ? `?${searchQuery}` : ''}`
            : `${API}/cases?deleted=true${searchQuery ? `&${searchQuery}` : ''}`

      const res  = await httpFetch(endpoint, { headers })
      const data = await res.json()
      setCases(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('loadCases error:', err)
      setCases([])
    } finally {
      setLoading(false)
    }
  }, [activeTab, headers, search, searchScope])

  useEffect(() => { loadCases() }, [loadCases])

  const loadSavedViews = useCallback(async () => {
    if (!token) return
    setViewsLoading(true)
    try {
      const res = await httpFetch(`${API}/cases/saved-views`, { headers })
      const data = await res.json()
      setSavedViews(Array.isArray(data.views) ? data.views : [])
    } catch (err) {
      console.error('loadSavedViews error:', err)
      setSavedViews([])
    } finally {
      setViewsLoading(false)
    }
  }, [headers, token])

  useEffect(() => { loadSavedViews() }, [loadSavedViews])

  function applySavedView(view) {
    const filters = view?.filters || {}
    setSearch(filters.search || '')
    setSearchScope(filters.searchScope || 'all')
    setActiveViewId(view.id)
    if (filters.tab === 'my' || filters.tab === 'unassigned' || filters.tab === 'deleted') {
      handleTabChange(filters.tab, { preserveSavedView: true })
    }
  }

  async function saveCurrentView() {
    const name = window.prompt('Saved view name')
    if (!name || !name.trim()) return

    const isShared = isAdminUser(user)
      ? await confirm('Save this as a shared team view?')
      : false

    setViewSaving(true)
    try {
      const res = await httpFetch(`${API}/cases/saved-views`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: name.trim(),
          is_shared: isShared,
          filters: {
            tab: activeTab,
            search,
            searchScope,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save view')
      setActiveViewId(data.view?.id || null)
      await loadSavedViews()
    } catch (err) {
      toast.error(err.message || 'Failed to save view')
    } finally {
      setViewSaving(false)
    }
  }

  async function deleteSavedView(viewId) {
    if (!await confirm('Delete this saved view?')) return
    try {
      const res = await httpFetch(`${API}/cases/saved-views/${viewId}`, { method: 'DELETE', headers })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete view')
      if (Number(activeViewId) === Number(viewId)) setActiveViewId(null)
      await loadSavedViews()
    } catch (err) {
      toast.error(err.message || 'Failed to delete view')
    }
  }

  function buildDuplicatePayload() {
    return {
      org_id: newCase.org_id || orgId || '',
      case_type: newCase.case_type,
      reporter,
      patient,
      ae_intake: aeIntake,
      pc_intake: pcIntake,
    }
  }

  async function checkDuplicates() {
    if (!newCase.case_type) return
    setDupCheckLoading(true)
    setDupError('')
    try {
      const res = await httpFetch(`${API}/cases/duplicate-check`, {
        method: 'POST',
        headers,
        body: JSON.stringify(buildDuplicatePayload()),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to check duplicates')
      setDupCandidates(Array.isArray(data.candidates) ? data.candidates : [])
    } catch (err) {
      setDupCandidates([])
      setDupError(err.message || 'Failed to check duplicates')
    } finally {
      setDupCheckLoading(false)
    }
  }

  // ── New case modal helpers ────────────────────────────────────────────────

  async function openModal() {
    setNewCase({ org_id: orgId ? String(orgId) : '', case_type: '' })
    setModalStep(1)
    setReporter({ first_name: '', last_name: '', email: '', phone: '', reporter_type: 'HCP', country: '', organisation: '' })
    setPatient({ initials: '', age: '', age_unit: 'years', gender: '', weight_kg: '' })
    setAeIntake({ suspect_drug_name: '', batch_lot_number: '', dose: '', route_of_admin: '', treatment_start_date: '', treatment_stop_date: '', reaction_description: '', reaction_onset_date: '', outcome: '', is_death: false, is_life_threatening: false, is_hospitalization: false, is_prolonged_hospitalization: false, is_disability: false, is_congenital_anomaly: false, is_other_medically_important: false })
    setPcIntake({ product_name: '', batch_lot_number: '', expiry_date: '', purchase_date: '', complaint_category: '', complaint_description: '', sample_available: false, sample_return_requested: false })
    setDupCandidates([])
    setDupError('')
    setModalOpen(true)
    try {
      const res  = await httpFetch(`${API}/admin/orgs`, { headers })
      const data = await res.json()
      const list = Array.isArray(data) ? data : (Array.isArray(data.orgs) ? data.orgs : [])
      setOrgs(list.filter(o => o.is_active))
    } catch { setOrgs([]) }
  }

  function selectOrg(orgId) {
    // Site concept retired — selecting an org no longer loads/asks for a site.
    setNewCase(p => ({ ...p, org_id: orgId }))
  }

  function step1Valid() { return newCase.org_id && newCase.case_type }
  function step2Valid() { return reporter.first_name && reporter.last_name }

  async function createCase() {
    if (!newCase.org_id || !newCase.case_type) return
    setCreating(true)
    try {
      let candidates = dupCandidates
      if (candidates.length === 0) {
        const dupRes = await httpFetch(`${API}/cases/duplicate-check`, {
          method: 'POST',
          headers,
          body: JSON.stringify(buildDuplicatePayload()),
        })
        const dupData = await dupRes.json()
        if (dupRes.ok) {
          candidates = Array.isArray(dupData.candidates) ? dupData.candidates : []
          setDupCandidates(candidates)
        }
      }
      if (candidates.length > 0) {
        const proceed = await confirm(`Potential duplicates found (${candidates.length}). Create this case anyway?`)
        if (!proceed) return
      }

      const body = {
        org_id: newCase.org_id,
        case_type: newCase.case_type,
        intake_channel: 'manual',
        reporter,
        ...((['AE', 'PC'].includes(newCase.case_type)) && { patient }),
        ...(newCase.case_type === 'AE' && { ae_intake: { ...aeIntake, is_serious: Object.entries(aeIntake).some(([k, v]) => k.startsWith('is_') && v) } }),
        ...(newCase.case_type === 'PC' && { pc_intake: pcIntake }),
      }
      const res  = await httpFetch(`${API}/cases`, { method: 'POST', headers, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create case')
      setModalOpen(false)
      navigate(`/cases/${data.id}`, { state: { from: '/cases' } })
    } catch (err) {
      toast.error(err.message)
    } finally {
      setCreating(false)
    }
  }

  function renderDuplicateAssist() {
    if (modalStep === 1) return null

    return (
      <div className="cf-dup-panel">
        <div className="cf-dup-header">
          <div>
            <div className="cf-dup-title">Duplicate Assist</div>
            <div className="cf-dup-subtitle">Check for similar active cases before final creation.</div>
          </div>
          <button type="button" className="cf-dup-check-btn" onClick={checkDuplicates} disabled={dupCheckLoading}>
            {dupCheckLoading ? 'Checking…' : 'Check Similar Cases'}
          </button>
        </div>
        {dupError && <div className="cf-dup-error">{dupError}</div>}
        {!dupError && !dupCheckLoading && dupCandidates.length === 0 && (
          <div className="cf-dup-empty">No similar cases found in the current check.</div>
        )}
        {dupCandidates.length > 0 && (
          <div className="cf-dup-list">
            {dupCandidates.map((candidate) => (
              <div key={candidate.id} className="cf-dup-item">
                <div>
                  <div className="cf-dup-case">{candidate.case_number || `Case ${candidate.id}`}</div>
                  <div className="cf-dup-meta">
                    {candidate.case_type} • {candidate.status_name || 'Open'} • Score {candidate.match_score}
                  </div>
                  <div className="cf-dup-reasons">{candidate.match_reasons || 'Signal overlap detected'}</div>
                </div>
                <button type="button" className="cf-dup-open-btn" onClick={() => navigate(`/cases/${candidate.id}`, { state: { from: '/cases' } })}>
                  Open
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const hasSearch = search.trim().length > 0
  const isGlobalSearch = hasSearch && searchScope === 'all'

  return (
    <MIMSLayout showStatStrip={false} bodyClassName="mims-ops-page-body" surfaceVariant="workspace" compact>
    <div className="cf-cases-page">

      {/* Header */}
      <div className="cf-cases-header">
        <div className="cf-cases-title-row">
          <h1 className="cf-cases-title">Case Management</h1>
          <button className="cf-new-case-btn" onClick={openModal}
            disabled={!hasCapability('case.create')}
            title={!hasCapability('case.create') ? 'Your security group does not allow creating cases.' : undefined}>
            + New Case
          </button>
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
              onClick={() => handleTabChange(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="cf-cases-search-row">
          <input
            className="cf-cases-search"
            placeholder="Global search: case #, notes, contacts, products…"
            value={search}
            onChange={e => { setSearch(e.target.value); setActiveViewId(null) }}
          />
          <div className="cf-cases-search-scope">
            <button
              className={`cf-cases-scope-btn ${searchScope === 'all' ? 'active' : ''}`}
              onClick={() => { setSearchScope('all'); setActiveViewId(null) }}
              type="button"
            >
              All Active Cases
            </button>
            <button
              className={`cf-cases-scope-btn ${searchScope === 'tab' ? 'active' : ''}`}
              onClick={() => { setSearchScope('tab'); setActiveViewId(null) }}
              type="button"
            >
              Current Tab
            </button>
          </div>
          <div className="cf-cases-view-actions">
            <button
              className="cf-cases-view-btn"
              type="button"
              onClick={saveCurrentView}
              disabled={viewSaving}
            >
              {viewSaving ? 'Saving…' : 'Save View'}
            </button>
          </div>
          {hasSearch && (
            <div className="cf-cases-search-hint">
              {isGlobalSearch
                ? 'Showing global results across active cases in your organisation.'
                : `Showing results in ${activeTab === 'my' ? 'My Cases' : activeTab === 'unassigned' ? 'Unassigned Cases' : 'Deleted Cases'}.`}
            </div>
          )}
        </div>
        <div className="cf-cases-saved-views">
          <span className="cf-cases-saved-label">Saved Views</span>
          {viewsLoading && <span className="cf-cases-saved-empty">Loading…</span>}
          {!viewsLoading && savedViews.length === 0 && <span className="cf-cases-saved-empty">No saved views yet.</span>}
          {!viewsLoading && savedViews.map((view) => (
            <div key={view.id} className={`cf-cases-view-chip ${Number(activeViewId) === Number(view.id) ? 'active' : ''}`}>
              <button type="button" onClick={() => applySavedView(view)}>
                {view.name}
                {view.is_shared ? ' • Shared' : ''}
              </button>
              {(Number(view.user_id) === Number(user?.id) || isAdminUser(user)) && (
                <span onClick={() => deleteSavedView(view.id)}>×</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Case table */}
      <div className="cf-cases-body">
        {loading ? (
          <div className="cf-cases-loading">Loading…</div>
        ) : cases.length === 0 ? (
          <div className="cf-cases-empty">
            {search
              ? (isGlobalSearch
                ? 'No active cases match your global search.'
                : 'No cases in this tab match your search.')
              : `No ${activeTab === 'my' ? 'cases assigned to you' : activeTab + ' cases'} yet.`}
          </div>
        ) : (
          <table className="cf-cases-table">
            <thead>
              <tr>
                <th>Case #</th>
                <th>Type</th>
                <th>Organisation</th>
                <th>Status</th>
                <th>Priority</th>
                <th>SLA</th>
                <th>Date Received</th>
                <th>Owner</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cases.map(c => (
                <tr key={c.id} className="cf-cases-row" onClick={() => navigate(`/cases/${c.id}`, { state: { from: '/cases' } })}>
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
                  <td>{c.status_name || <span className="cf-no-status">New</span>}</td>
                  <td>
                    <span style={{ color: PRIORITY_COLORS[c.priority] || '#6b7280', fontWeight: 600 }}>
                      {c.priority || 'normal'}
                    </span>
                  </td>
                  <td><SlaBadge slaDue={c.sla_due} /></td>
                  <td>{c.date_received ? c.date_received.slice(0, 10) : '—'}</td>
                  <td>{c.owner_name || '—'}</td>
                  <td>
                    <button className="cf-open-btn" onClick={e => { e.stopPropagation(); navigate(`/cases/${c.id}`, { state: { from: '/cases' } }) }}>
                      Open →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* New Case Modal — multi-step intake (CF-E1–E5) */}
      {modalOpen && (
        <div className="cf-modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="cf-modal" style={{ maxWidth: 640, width: '95vw' }} onClick={e => e.stopPropagation()}>
            <div className="cf-modal-header">
              <span className="cf-modal-title">New Case — Step {modalStep} of {newCase.case_type === 'MI' ? 2 : 3}</span>
              <button className="cf-modal-close" onClick={() => setModalOpen(false)}>✕</button>
            </div>

            {/* Step indicator */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border, #e5e7eb)' }}>
              {['Case Details', 'Reporter', newCase.case_type === 'AE' ? 'AE Intake' : newCase.case_type === 'PC' ? 'PC Intake' : null].filter(Boolean).map((label, i) => (
                <div key={i} style={{ flex: 1, padding: '8px 0', textAlign: 'center', fontSize: 12, fontWeight: modalStep === i + 1 ? 700 : 400,
                  color: modalStep === i + 1 ? 'var(--primary, #2563eb)' : 'var(--text-muted, #9ca3af)',
                  borderBottom: modalStep === i + 1 ? '2px solid var(--primary, #2563eb)' : '2px solid transparent' }}>
                  {i + 1}. {label}
                </div>
              ))}
            </div>

            <div className="cf-modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>

              {/* ── Step 1: Org / Site / Case Type ── */}
              {modalStep === 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div className="cf-form-field">
                    <label className="cf-modal-label">Organisation *</label>
                    <select className="cf-modal-select" value={newCase.org_id} onChange={e => selectOrg(e.target.value)}>
                      <option value="">— Select Organisation —</option>
                      {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </div>
                  <div className="cf-form-field">
                    <label className="cf-modal-label">Case Type *</label>
                    <div style={{ display: 'flex', gap: 10 }}>
                      {[{ key: 'MI', label: 'Medical Information', color: '#2563eb' }, { key: 'AE', label: 'Adverse Event', color: '#dc2626' }, { key: 'PC', label: 'Product Complaint', color: '#d97706' }].map(ct => (
                        <button key={ct.key} type="button"
                          onClick={() => setNewCase(p => ({ ...p, case_type: ct.key }))}
                          style={{ flex: 1, padding: '10px 6px', border: `2px solid ${newCase.case_type === ct.key ? ct.color : 'var(--border, #e5e7eb)'}`,
                            borderRadius: 8, background: newCase.case_type === ct.key ? ct.color + '15' : 'transparent',
                            color: newCase.case_type === ct.key ? ct.color : 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, fontWeight: newCase.case_type === ct.key ? 700 : 400 }}>
                          <div style={{ fontSize: 18, marginBottom: 4 }}>{ct.key === 'MI' ? '💊' : ct.key === 'AE' ? '⚠️' : '📦'}</div>
                          <div>{ct.key}</div>
                          <div style={{ fontSize: 10, opacity: 0.8 }}>{ct.label}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="cf-modal-actions">
                    <button className="cf-modal-confirm" disabled={!step1Valid()} onClick={() => setModalStep(2)}>Next: Reporter →</button>
                  </div>
                </div>
              )}

              {/* ── Step 2: Reporter + Patient ── */}
              {modalStep === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Reporter Information</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div className="cf-form-field" style={{ margin: 0 }}>
                      <label className="cf-modal-label">First Name *</label>
                      <input className="cf-modal-select" value={reporter.first_name} onChange={e => setReporter(p => ({ ...p, first_name: e.target.value }))} placeholder="First name" />
                    </div>
                    <div className="cf-form-field" style={{ margin: 0 }}>
                      <label className="cf-modal-label">Last Name *</label>
                      <input className="cf-modal-select" value={reporter.last_name} onChange={e => setReporter(p => ({ ...p, last_name: e.target.value }))} placeholder="Last name" />
                    </div>
                    <div className="cf-form-field" style={{ margin: 0 }}>
                      <label className="cf-modal-label">Email</label>
                      <input className="cf-modal-select" type="email" value={reporter.email} onChange={e => setReporter(p => ({ ...p, email: e.target.value }))} placeholder="email@example.com" />
                    </div>
                    <div className="cf-form-field" style={{ margin: 0 }}>
                      <label className="cf-modal-label">Phone</label>
                      <input className="cf-modal-select" value={reporter.phone} onChange={e => setReporter(p => ({ ...p, phone: e.target.value }))} placeholder="+1 555 000 0000" />
                    </div>
                    <div className="cf-form-field" style={{ margin: 0 }}>
                      <label className="cf-modal-label">Reporter Type</label>
                      <select className="cf-modal-select" value={reporter.reporter_type} onChange={e => setReporter(p => ({ ...p, reporter_type: e.target.value }))}>
                        {['HCP', 'Patient', 'Consumer', 'Caregiver', 'Other'].map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="cf-form-field" style={{ margin: 0 }}>
                      <label className="cf-modal-label">Country</label>
                      <input className="cf-modal-select" value={reporter.country} onChange={e => setReporter(p => ({ ...p, country: e.target.value }))} placeholder="Country" />
                    </div>
                    <div className="cf-form-field" style={{ margin: 0, gridColumn: '1/-1' }}>
                      <label className="cf-modal-label">Organisation / Institution</label>
                      <input className="cf-modal-select" value={reporter.organisation} onChange={e => setReporter(p => ({ ...p, organisation: e.target.value }))} placeholder="Hospital, clinic, company…" />
                    </div>
                  </div>

                  {/* Patient — AE/PC only */}
                  {['AE', 'PC'].includes(newCase.case_type) && (
                    <>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8, marginBottom: 4 }}>Patient Demographics</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                        <div className="cf-form-field" style={{ margin: 0 }}>
                          <label className="cf-modal-label">Initials</label>
                          <input className="cf-modal-select" value={patient.initials} onChange={e => setPatient(p => ({ ...p, initials: e.target.value }))} placeholder="e.g. J.D." maxLength={10} />
                        </div>
                        <div className="cf-form-field" style={{ margin: 0 }}>
                          <label className="cf-modal-label">Age</label>
                          <input className="cf-modal-select" type="number" min="0" value={patient.age} onChange={e => setPatient(p => ({ ...p, age: e.target.value }))} placeholder="Age" />
                        </div>
                        <div className="cf-form-field" style={{ margin: 0 }}>
                          <label className="cf-modal-label">Age Unit</label>
                          <select className="cf-modal-select" value={patient.age_unit} onChange={e => setPatient(p => ({ ...p, age_unit: e.target.value }))}>
                            {['years', 'months', 'weeks', 'days'].map(u => <option key={u}>{u}</option>)}
                          </select>
                        </div>
                        <div className="cf-form-field" style={{ margin: 0 }}>
                          <label className="cf-modal-label">Gender</label>
                          <select className="cf-modal-select" value={patient.gender} onChange={e => setPatient(p => ({ ...p, gender: e.target.value }))}>
                            <option value="">— Unknown —</option>
                            {['Male', 'Female', 'Non-binary', 'Prefer not to say'].map(g => <option key={g}>{g}</option>)}
                          </select>
                        </div>
                        <div className="cf-form-field" style={{ margin: 0 }}>
                          <label className="cf-modal-label">Weight (kg)</label>
                          <input className="cf-modal-select" type="number" min="0" step="0.1" value={patient.weight_kg} onChange={e => setPatient(p => ({ ...p, weight_kg: e.target.value }))} placeholder="kg" />
                        </div>
                      </div>
                    </>
                  )}

                  {renderDuplicateAssist()}

                  <div className="cf-modal-actions" style={{ display: 'flex', gap: 10 }}>
                    <button style={{ flex: 1, padding: '10px', border: '1px solid var(--border)', borderRadius: 6, background: 'none', cursor: 'pointer', fontSize: 13 }} onClick={() => setModalStep(1)}>← Back</button>
                    {newCase.case_type === 'MI'
                      ? <button className="cf-modal-confirm" style={{ flex: 2 }} disabled={!step2Valid() || creating} onClick={createCase}>{creating ? 'Creating…' : 'Create MI Case →'}</button>
                      : <button className="cf-modal-confirm" style={{ flex: 2 }} disabled={!step2Valid()} onClick={() => setModalStep(3)}>Next: {newCase.case_type === 'AE' ? 'AE Details' : 'PC Details'} →</button>
                    }
                  </div>
                </div>
              )}

              {/* ── Step 3a: AE Intake ── */}
              {modalStep === 3 && newCase.case_type === 'AE' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Suspect Product</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {[['suspect_drug_name','Drug / Product Name','text'],['batch_lot_number','Batch / Lot Number','text'],['dose','Dose','text'],['route_of_admin','Route of Administration','text'],['treatment_start_date','Treatment Start Date','date'],['treatment_stop_date','Treatment Stop Date','date'],['reaction_onset_date','Reaction Onset Date','date']].map(([key, label, type]) => (
                      <div key={key} className="cf-form-field" style={{ margin: 0 }}>
                        <label className="cf-modal-label">{label}</label>
                        <input className="cf-modal-select" type={type} value={aeIntake[key]} onChange={e => setAeIntake(p => ({ ...p, [key]: e.target.value }))} placeholder={label} />
                      </div>
                    ))}
                    <div className="cf-form-field" style={{ margin: 0 }}>
                      <label className="cf-modal-label">Outcome</label>
                      <select className="cf-modal-select" value={aeIntake.outcome} onChange={e => setAeIntake(p => ({ ...p, outcome: e.target.value }))}>
                        <option value="">— Select —</option>
                        {['Recovered', 'Recovering', 'Not Recovered', 'Fatal', 'Unknown'].map(o => <option key={o}>{o}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="cf-form-field" style={{ margin: '4px 0' }}>
                    <label className="cf-modal-label">Reaction / Event Description</label>
                    <textarea className="cf-modal-select" rows={3} value={aeIntake.reaction_description} onChange={e => setAeIntake(p => ({ ...p, reaction_description: e.target.value }))} placeholder="Describe the adverse event or reaction…" style={{ resize: 'vertical' }} />
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 6, marginBottom: 4 }}>Seriousness Criteria</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[['is_death','Death'],['is_life_threatening','Life-threatening'],['is_hospitalization','Requires Hospitalisation'],['is_prolonged_hospitalization','Prolonged Hospitalisation'],['is_disability','Disability / Incapacity'],['is_congenital_anomaly','Congenital Anomaly'],['is_other_medically_important','Other Medically Important']].map(([key, label]) => (
                      <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', padding: '6px 8px', borderRadius: 6, border: `1px solid ${aeIntake[key] ? '#dc2626' : 'var(--border)'}`, background: aeIntake[key] ? '#fef2f2' : 'transparent' }}>
                        <input type="checkbox" checked={aeIntake[key]} onChange={e => setAeIntake(p => ({ ...p, [key]: e.target.checked }))} />
                        <span style={{ color: aeIntake[key] ? '#dc2626' : 'var(--text-primary)', fontWeight: aeIntake[key] ? 600 : 400 }}>{label}</span>
                      </label>
                    ))}
                  </div>
                  {renderDuplicateAssist()}
                  <div className="cf-modal-actions" style={{ display: 'flex', gap: 10 }}>
                    <button style={{ flex: 1, padding: '10px', border: '1px solid var(--border)', borderRadius: 6, background: 'none', cursor: 'pointer', fontSize: 13 }} onClick={() => setModalStep(2)}>← Back</button>
                    <button className="cf-modal-confirm" style={{ flex: 2 }} disabled={creating} onClick={createCase}>{creating ? 'Creating…' : 'Create AE Case →'}</button>
                  </div>
                </div>
              )}

              {/* ── Step 3b: PC Intake ── */}
              {modalStep === 3 && newCase.case_type === 'PC' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#d97706', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Product Details</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {[['product_name','Product Name','text'],['batch_lot_number','Batch / Lot Number','text'],['expiry_date','Expiry Date','date'],['purchase_date','Purchase Date','date']].map(([key, label, type]) => (
                      <div key={key} className="cf-form-field" style={{ margin: 0 }}>
                        <label className="cf-modal-label">{label}</label>
                        <input className="cf-modal-select" type={type} value={pcIntake[key]} onChange={e => setPcIntake(p => ({ ...p, [key]: e.target.value }))} placeholder={label} />
                      </div>
                    ))}
                    <div className="cf-form-field" style={{ margin: 0 }}>
                      <label className="cf-modal-label">Complaint Category</label>
                      <select className="cf-modal-select" value={pcIntake.complaint_category} onChange={e => setPcIntake(p => ({ ...p, complaint_category: e.target.value }))}>
                        <option value="">— Select —</option>
                        {['Product Defect', 'Labelling Error', 'Packaging Issue', 'Performance Issue', 'Adverse Reaction'].map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="cf-form-field" style={{ margin: '4px 0' }}>
                    <label className="cf-modal-label">Complaint Description</label>
                    <textarea className="cf-modal-select" rows={3} value={pcIntake.complaint_description} onChange={e => setPcIntake(p => ({ ...p, complaint_description: e.target.value }))} placeholder="Describe the product complaint in detail…" style={{ resize: 'vertical' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                    {[['sample_available','Sample Available'],['sample_return_requested','Sample Return Requested']].map(([key, label]) => (
                      <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', padding: '8px 12px', borderRadius: 6, border: `1px solid ${pcIntake[key] ? '#d97706' : 'var(--border)'}`, background: pcIntake[key] ? '#fffbeb' : 'transparent', flex: 1 }}>
                        <input type="checkbox" checked={pcIntake[key]} onChange={e => setPcIntake(p => ({ ...p, [key]: e.target.checked }))} />
                        <span style={{ color: pcIntake[key] ? '#d97706' : 'var(--text-primary)', fontWeight: pcIntake[key] ? 600 : 400 }}>{label}</span>
                      </label>
                    ))}
                  </div>
                  {renderDuplicateAssist()}
                  <div className="cf-modal-actions" style={{ display: 'flex', gap: 10 }}>
                    <button style={{ flex: 1, padding: '10px', border: '1px solid var(--border)', borderRadius: 6, background: 'none', cursor: 'pointer', fontSize: 13 }} onClick={() => setModalStep(2)}>← Back</button>
                    <button className="cf-modal-confirm" style={{ flex: 2 }} disabled={creating} onClick={createCase}>{creating ? 'Creating…' : 'Create PC Case →'}</button>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
    </MIMSLayout>
  )
}
