/**
 * CasesPage.jsx — Case Management List View
 * F-13: New case creation modal (3 steps: Org → Site → Case Type)
 * Tabs: My Cases | Unassigned Cases | Deleted Cases
 * CSS namespace: cf- (case form)
 */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../../shared/context/AuthContext'
import MIMSLayout from '../../../shared/components/MIMSLayout'
import '../cases.css'

const API = import.meta.env.VITE_API_URL || '/api'

const CASE_TYPE_COLORS = { MI: '#2563eb', AE: '#dc2626', PC: '#d97706' }
const PRIORITY_COLORS  = { normal: '#6b7280', high: '#f59e0b', urgent: '#ef4444' }

export default function CasesPage() {
  const navigate        = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { token }       = useAuth()
  const headers         = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  const [activeTab, setActiveTab]   = useState('my')       // my | unassigned | deleted
  const [cases, setCases]           = useState([])
  const [loading, setLoading]       = useState(false)
  const [search, setSearch]         = useState('')
  const [searchScope, setSearchScope] = useState('all') // all | tab

  // New case modal state
  const [modalOpen, setModalOpen]     = useState(false)
  const [orgs, setOrgs]               = useState([])
  const [sites, setSites]             = useState([])
  const [newCase, setNewCase]         = useState({ org_id: '', site_id: '' })
  const [selectedSiteId, setSelectedSiteId] = useState('')
  const [creating, setCreating]       = useState(false)

  // ── Load cases ────────────────────────────────────────────────────────────
  useEffect(() => {
    const tab = (searchParams.get('tab') || '').toLowerCase()
    if (tab === 'my' || tab === 'unassigned' || tab === 'deleted') {
      setActiveTab(tab)
    }
  }, [searchParams])

  function handleTabChange(tab) {
    setActiveTab(tab)
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

      const res  = await fetch(endpoint, { headers })
      const data = await res.json()
      setCases(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('loadCases error:', err)
      setCases([])
    } finally {
      setLoading(false)
    }
  }, [activeTab, search, searchScope, token])

  useEffect(() => { loadCases() }, [loadCases])

  // ── New case modal helpers ────────────────────────────────────────────────

  async function openModal() {
    setNewCase({ org_id: '', site_id: '' })
    setSelectedSiteId('')
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
    setSelectedSiteId('')
    setSites([])
    if (!orgId) return
    try {
      const res  = await fetch(`${API}/admin/orgs/${orgId}/sites`, { headers })
      const data = await res.json()
      const list = Array.isArray(data) ? data : (Array.isArray(data.sites) ? data.sites : [])
      setSites(list.filter(s => s.is_active))
    } catch { setSites([]) }
  }

  function handleSiteChange(siteId) {
    setSelectedSiteId(siteId)
    setNewCase(p => ({ ...p, site_id: siteId }))
  }

  async function createCase() {
    if (!newCase.org_id || !newCase.site_id) return
    setCreating(true)
    try {
      const res  = await fetch(`${API}/cases`, {
        method: 'POST', headers,
        body: JSON.stringify({
          org_id:         newCase.org_id,
          site_id:        newCase.site_id,
          intake_channel: 'manual',
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create case')
      setModalOpen(false)
      navigate(`/cases/${data.id}`, { state: { from: '/cases' } })
    } catch (err) {
      alert(err.message)
    } finally {
      setCreating(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const hasSearch = search.trim().length > 0
  const isGlobalSearch = hasSearch && searchScope === 'all'

  return (
    <MIMSLayout>
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
            onChange={e => setSearch(e.target.value)}
          />
          <div className="cf-cases-search-scope">
            <button
              className={`cf-cases-scope-btn ${searchScope === 'all' ? 'active' : ''}`}
              onClick={() => setSearchScope('all')}
              type="button"
            >
              All Active Cases
            </button>
            <button
              className={`cf-cases-scope-btn ${searchScope === 'tab' ? 'active' : ''}`}
              onClick={() => setSearchScope('tab')}
              type="button"
            >
              Current Tab
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
                <th>Site</th>
                <th>Status</th>
                <th>Priority</th>
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

      {/* New Case Modal */}
      {modalOpen && (
        <div className="cf-modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="cf-modal" onClick={e => e.stopPropagation()}>
            <div className="cf-modal-header">
              <span className="cf-modal-title">New Case</span>
              <button className="cf-modal-close" onClick={() => setModalOpen(false)}>✕</button>
            </div>

            <div className="cf-modal-body">
              <div className="cf-modal-step-content">

                <div className="cf-form-field" style={{ marginBottom: '16px' }}>
                  <label className="cf-modal-label">Organisation</label>
                  <select
                    className="cf-modal-select"
                    value={newCase.org_id}
                    onChange={e => selectOrg(e.target.value)}
                  >
                    <option value="">— Select Organisation —</option>
                    {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>

                <div className="cf-form-field" style={{ marginBottom: '24px' }}>
                  <label className="cf-modal-label">Site</label>
                  <select
                    className="cf-modal-select"
                    value={selectedSiteId}
                    onChange={e => handleSiteChange(e.target.value)}
                    disabled={!newCase.org_id}
                  >
                    <option value="">— Select Site —</option>
                    {sites.map(s => <option key={s.id} value={s.id}>{s.name}{s.country ? ` — ${s.country}` : ''}</option>)}
                  </select>
                  {newCase.org_id && sites.length === 0 && (
                    <div className="cf-select-empty" style={{ marginTop: '8px' }}>No active sites for this organisation.</div>
                  )}
                </div>

                <div className="cf-modal-actions">
                  <button
                    className="cf-modal-confirm"
                    disabled={!newCase.org_id || !selectedSiteId || creating}
                    onClick={createCase}
                  >
                    {creating ? 'Creating…' : 'Create Case →'}
                  </button>
                </div>

              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </MIMSLayout>
  )
}
