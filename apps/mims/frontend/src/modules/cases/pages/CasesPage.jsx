/**
 * CasesPage.jsx — Case Management List View
 * F-13: New case creation modal (3 steps: Org → Site → Case Type)
 * Tabs: My Cases | Unassigned Cases | Deleted Cases
 * The one place to find a case (Phase 3): text search, "More filters" for the
 * reporter, the patient and correspondence (what Case Query and the Cross-Case
 * Search pop-up offered), and a built-in "Correspondence" view.
 * CSS namespace: cf- (case form)
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
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
const PAGE_SIZE = 50
// "More filters": the server's names for them, so they go on the request as they are.
const EMPTY_MORE = { reporter: '', patient_initials: '', has_correspondence: '', corr_box: '', corr_party: '', corr_from: '', corr_to: '' }
const CORR_KEYS  = ['has_correspondence', 'corr_box', 'corr_party', 'corr_from', 'corr_to']
const CORRESPONDENCE_VIEW = { ...EMPTY_MORE, has_correspondence: 'yes' }

function formatDateTime(value) {
  if (!value) return '—'
  const dt = parseServerTime(value)
  return Number.isNaN(dt.getTime()) ? String(value) : dt.toLocaleString()
}

import SlaCountdownBadge from '../../../shared/components/SlaCountdownBadge'
import { parseServerTime } from '../../../shared/utils/serverTime.js'

export default function CasesPage() {
  const navigate        = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { token, user, hasCapability, orgId, allOrgs } = useAuth()
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

  const [typeFilter, setTypeFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  // ?view=correspondence (where old Case Query links land) opens the Correspondence view.
  const openCorrespondence = searchParams.get('view') === 'correspondence'
  const [more, setMore]             = useState(openCorrespondence ? CORRESPONDENCE_VIEW : EMPTY_MORE)
  const [showMore, setShowMore]     = useState(openCorrespondence)
  const [sortBy, setSortBy]         = useState('created_at')
  const [page, setPage]             = useState(0)
  const [total, setTotal]           = useState(null)   // set only when searching all active cases
  const [loadError, setLoadError]   = useState('')
  const moreActive = Object.values(more).some(v => String(v).trim())
  const corrActive = CORR_KEYS.some(k => String(more[k]).trim())

  function setMoreField(key, value) {
    setMore(m => ({ ...m, [key]: value }))
    setPage(0)
    setActiveViewId(null)
  }

  // New case modal state — multi-step intake form (CF-E1–E5)
  const [modalOpen, setModalOpen]     = useState(false)
  const [modalStep, setModalStep]     = useState(1) // 1=Org/Site/Type, 2=Reporter+Patient, 3=Type-specific
  const [orgs, setOrgs]               = useState([])
  const [newCase, setNewCase]         = useState({ org_id: '', case_type: '' })
  const [creating, setCreating]       = useState(false)
  // The chosen org's governed lists (reporter type, gender, …) — the values the
  // server checks the intake against. Loaded when the reporter step opens.
  const [intakeLists, setIntakeLists] = useState({})
  // Reporter fields
  const [reporter, setReporter]       = useState({ first_name: '', last_name: '', email: '', phone: '', reporter_type: '', country: '', organisation: '' })
  // Patient fields (AE/PC)
  const [patient, setPatient]         = useState({ initials: '', age: '', age_unit: '', gender: '', weight_kg: '' })
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
  
  // Bulk update state
  const [selectedCaseIds, setSelectedCaseIds] = useState([])
  const [bulkUsers, setBulkUsers] = useState([])
  const [bulkStatuses, setBulkStatuses] = useState([])
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkActionLoading, setBulkActionLoading] = useState(false)
  
  const [bulkNewOwnerId, setBulkNewOwnerId] = useState('')
  const [bulkStatusId, setBulkStatusId] = useState('')
  const [bulkPriority, setBulkPriority] = useState('')

  useEffect(() => {
    if (selectedCaseIds.length > 0 && bulkUsers.length === 0 && !bulkLoading) {
      setBulkLoading(true)
      Promise.all([
        httpFetch(`${API}/users${orgId ? `?org_id=${orgId}` : ''}`, { headers }),
        httpFetch(`${API}/admin/workflow-states`, { headers })
      ]).then(async ([uRes, sRes]) => {
        const u = await uRes.json()
        const s = await sRes.json()
        if (Array.isArray(u)) setBulkUsers(u.filter(x => x.is_active !== false))
        // The endpoint answers { states: [...] }; reading only a bare array left
        // "Change Status" with no choices (item 7, 2026-09-29).
        const states = Array.isArray(s) ? s : (Array.isArray(s?.states) ? s.states : [])
        setBulkStatuses(states.filter(x => x.is_active !== false))
      }).catch(err => console.error('Bulk load error:', err))
      .finally(() => setBulkLoading(false))
    }
  }, [selectedCaseIds.length, bulkUsers.length, headers, orgId, bulkLoading])

  function handleSelectAll(e) {
    if (e.target.checked) setSelectedCaseIds(filteredCases.map(c => c.id))
    else setSelectedCaseIds([])
  }

  function handleSelectRow(id, checked) {
    if (checked) setSelectedCaseIds(prev => [...prev, id])
    else setSelectedCaseIds(prev => prev.filter(x => x !== id))
  }

  // Each selected case goes through the same request as a single-case edit
  // (PUT /cases/:id) or delete (DELETE /cases/:id), so every case gets that
  // path's permission, access-scope, workflow and audit checks, and a case the
  // server refuses is reported by name instead of being counted as updated.
  async function applyBulkAction(action) {
    if (!selectedCaseIds.length) return
    let payload = {}
    if (action === 'reassign') {
      if (!bulkNewOwnerId) return toast.error('Select an owner')
      payload = { case_owner_id: bulkNewOwnerId === 'null' ? null : Number(bulkNewOwnerId) }
    } else if (action === 'update_status') {
      if (!bulkStatusId) return toast.error('Select a status')
      payload = { status_id: Number(bulkStatusId) }
    } else if (action === 'update_priority') {
      if (!bulkPriority) return toast.error('Select a priority')
      payload = { priority: bulkPriority }
    } else if (action === 'delete') {
      if (!await confirm(`Delete ${selectedCaseIds.length} selected case(s)?`)) return
    }

    setBulkActionLoading(true)
    const failures = []
    try {
      for (const caseId of selectedCaseIds) {
        const label = cases.find(c => c.id === caseId)?.case_number || `Case ${caseId}`
        try {
          const res = action === 'delete'
            ? await httpFetch(`${API}/cases/${caseId}`, { method: 'DELETE', headers })
            : await httpFetch(`${API}/cases/${caseId}`, { method: 'PUT', headers, body: JSON.stringify(payload) })
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            failures.push(`${label}: ${data.error || `request failed (${res.status})`}`)
          }
        } catch (err) {
          failures.push(`${label}: ${err.message}`)
        }
      }
      const done = selectedCaseIds.length - failures.length
      if (done > 0) toast.success(`Updated ${done} of ${selectedCaseIds.length} case(s).`)
      if (failures.length) {
        const shown = failures.slice(0, 3).join('; ') + (failures.length > 3 ? `; and ${failures.length - 3} more` : '')
        toast.error(`${failures.length} of ${selectedCaseIds.length} case(s) not updated — ${shown}`, 10000)
      }
      setSelectedCaseIds([])
      setBulkStatusId('')
      setBulkPriority('')
      setBulkNewOwnerId('')
      loadCases()
    } finally {
      setBulkActionLoading(false)
    }
  }

  // ── Load cases ────────────────────────────────────────────────────────────
  useEffect(() => {
    const tab = (searchParams.get('tab') || '').toLowerCase()
    if (tab === 'my' || tab === 'unassigned' || tab === 'deleted') {
      setActiveTab(tab)
    }
  }, [searchParams])

  function handleTabChange(tab, options = {}) {
    setActiveTab(tab)
    setPage(0)
    if (!options.preserveSavedView) setActiveViewId(null)
    const next = new URLSearchParams(searchParams)
    next.set('tab', tab)
    setSearchParams(next)
  }

  const loadCases = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const searchTerm = search.trim()
      const searchQuery = searchTerm ? `search=${encodeURIComponent(searchTerm)}` : ''
      const useGlobalSearch = (searchTerm.length > 0 && searchScope === 'all') || moreActive

      // Searching all active cases pages through the server's full result.
      if (useGlobalSearch) {
        const q = new URLSearchParams({ include_meta: 'true', limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE), sort_by: sortBy })
        if (searchTerm) q.set('search', searchTerm)
        if (typeFilter !== 'all') q.set('type', typeFilter)
        for (const [key, value] of Object.entries(more)) if (String(value).trim()) q.set(key, String(value).trim())
        const res  = await httpFetch(`${API}/cases?${q}`, { headers })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'The search could not be run.')
        setCases(Array.isArray(data.rows) ? data.rows : [])
        setTotal(Number(data.total || 0))
        setSelectedCaseIds([])
        return
      }
      setTotal(null)

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
      setSelectedCaseIds([])
    } catch (err) {
      console.error('loadCases error:', err)
      setCases([])
      setTotal(null)
      setLoadError(err.message || 'The cases could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [activeTab, headers, search, searchScope, moreActive, more, page, sortBy, typeFilter])

  useEffect(() => { loadCases() }, [loadCases])

  // An empty My Cases while cases wait unassigned: say how many and open them.
  // With no tab in the address, the page moves there once by itself.
  const [unassignedCount, setUnassignedCount] = useState(0)
  const autoOpenedUnassigned = useRef(false)
  const myCasesEmpty = !loading && activeTab === 'my' && cases.length === 0 && !search.trim()
  useEffect(() => {
    if (!myCasesEmpty) return
    let cancelled = false
    httpFetch(`${API}/cases/dashboard-summary`, { headers })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (cancelled) return
        const count = Number(data?.stats?.unassigned_cases || 0)
        setUnassignedCount(count)
        if (count > 0 && !searchParams.get('tab') && !autoOpenedUnassigned.current) {
          autoOpenedUnassigned.current = true
          handleTabChange('unassigned')
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [myCasesEmpty]) // eslint-disable-line react-hooks/exhaustive-deps

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
    setTypeFilter(filters.typeFilter || 'all')
    setPriorityFilter(filters.priorityFilter || 'all')
    setStatusFilter(filters.statusFilter || 'all')
    const nextMore = { ...EMPTY_MORE, ...(filters.more || {}) }
    setMore(nextMore)
    setShowMore(Object.values(nextMore).some(Boolean))
    setSortBy(filters.sortBy || 'created_at')
    setPage(0)
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
            typeFilter,
            priorityFilter,
            statusFilter,
            more,
            sortBy,
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
    setReporter({ first_name: '', last_name: '', email: '', phone: '', reporter_type: '', country: '', organisation: '' })
    setPatient({ initials: '', age: '', age_unit: '', gender: '', weight_kg: '' })
    setAeIntake({ suspect_drug_name: '', batch_lot_number: '', dose: '', route_of_admin: '', treatment_start_date: '', treatment_stop_date: '', reaction_description: '', reaction_onset_date: '', outcome: '', is_death: false, is_life_threatening: false, is_hospitalization: false, is_prolonged_hospitalization: false, is_disability: false, is_congenital_anomaly: false, is_other_medically_important: false })
    setPcIntake({ product_name: '', batch_lot_number: '', expiry_date: '', purchase_date: '', complaint_category: '', complaint_description: '', sample_available: false, sample_return_requested: false })
    setDupCandidates([])
    setDupError('')
    setModalOpen(true)
    // The user's own organisations arrive with the sign-in. The admin-only org
    // list refused agents (403) and left this required field empty.
    const ownOrgs = (allOrgs || []).map(o => ({ id: o.orgId, name: o.orgName })).filter(o => o.id)
    if (ownOrgs.length) { setOrgs(ownOrgs); return }
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

  async function goToReporterStep() {
    setModalStep(2)
    setIntakeLists({})
    try {
      const res  = await httpFetch(`${API}/cases/intake-lists?org_id=${newCase.org_id}`, { headers })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load the lists for this organisation')
      setIntakeLists(data)
    } catch (err) { toast.error(err.message) }
  }

  const listOptions = (name) => (intakeLists[name] || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)

  function step1Valid() { return newCase.org_id && newCase.case_type }
  // One list drives both the header count and the step strip — they disagreed
  // ("Step 1 of 3" then "Step 2 of 2", M-44). No count until a case type is picked.
  const newCaseSteps = ['Case Details', 'Reporter', newCase.case_type === 'AE' ? 'AE Intake' : newCase.case_type === 'PC' ? 'PC Intake' : null].filter(Boolean)
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
      // A case needs its number (MI-000123) — the inbox's Create Case asks for one;
      // New Case never did, so every case made here stayed unnumbered (M-85).
      const numRes = await httpFetch(`${API}/cases/${data.id}/assign-number`, { method: 'POST', headers })
      if (!numRes.ok) toast.error('Case created, but its case number could not be assigned. Reopen the case to retry.')
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

  const filteredCases = useMemo(() => {
    return cases.filter(c => {
      if (typeFilter !== 'all' && c.case_type !== typeFilter) return false
      
      // The case form saves the list's capitalised value ("Urgent", "High");
      // imported cases hold lowercase. Compare without case, or dropdown-set
      // priorities never match the filters (M-80).
      const p = String(c.priority || 'normal').toLowerCase()
      if (priorityFilter === 'high_urgent') {
        if (p !== 'high' && p !== 'urgent') return false
      } else if (priorityFilter !== 'all' && p !== priorityFilter) {
        return false
      }

      if (statusFilter !== 'all' && (c.status_name || 'New') !== statusFilter) return false
      return true
    })
  }, [cases, typeFilter, priorityFilter, statusFilter])

  const uniqueStatuses = useMemo(() => {
    return [...new Set(cases.map(c => c.status_name || 'New'))].sort()
  }, [cases])

  const hasSearch = search.trim().length > 0
  const isGlobalSearch = (hasSearch && searchScope === 'all') || moreActive
  const openCase = (c) => navigate(`/cases/${c.id}${corrActive ? '?section=correspondence' : ''}`, { state: { from: '/cases' } })

  return (
    <MIMSLayout showStatStrip={false} bodyClassName="mims-ops-page-body" surfaceVariant="workspace" compact>
    <div className="cf-cases-page">

      {/* Header */}
      <div className="cf-cases-header">
        <div className="cf-cases-title-row">
          <h1 className="cf-cases-title">Case Management</h1>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="cf-new-case-btn" onClick={openModal}
              disabled={!hasCapability('case.create')}
              title={!hasCapability('case.create') ? 'Your security group does not allow creating cases.' : undefined}>
              + New Case
            </button>
          </div>
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
            aria-label="Search cases"
            placeholder="Global search: case #, notes, contacts, products…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); setActiveViewId(null) }}
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
              className={`cf-cases-scope-btn ${searchScope === 'tab' && !moreActive ? 'active' : ''}`}
              onClick={() => { setSearchScope('tab'); setActiveViewId(null) }}
              disabled={moreActive}
              title={moreActive ? 'More filters always search all active cases.' : undefined}
              type="button"
            >
              Current Tab
            </button>
          </div>
          <div className="cf-cases-view-actions">
            <button
              className={`cf-cases-view-btn ${showMore ? 'active' : ''}`}
              type="button"
              aria-expanded={showMore}
              onClick={() => setShowMore(v => !v)}
            >
              More filters{moreActive ? ` (${Object.values(more).filter(v => String(v).trim()).length})` : ''}
            </button>
            <button
              className="cf-cases-view-btn"
              type="button"
              onClick={saveCurrentView}
              disabled={viewSaving}
            >
              {viewSaving ? 'Saving…' : 'Save View'}
            </button>
          </div>
          {(hasSearch || moreActive) && (
            <div className="cf-cases-search-hint">
              {isGlobalSearch
                ? 'Showing global results across active cases in your organisation.'
                : `Showing results in ${activeTab === 'my' ? 'My Cases' : activeTab === 'unassigned' ? 'Unassigned Cases' : 'Deleted Cases'}.`}
            </div>
          )}
        </div>
        {showMore && (
          <div className="cf-cases-more">
            <fieldset>
              <legend>People</legend>
              <label>Reporter
                <input className="cf-query-input" placeholder="Name, email or phone" value={more.reporter} onChange={e => setMoreField('reporter', e.target.value)} />
              </label>
              <label>Patient initials
                <input className="cf-query-input" placeholder="e.g. J.D." value={more.patient_initials} onChange={e => setMoreField('patient_initials', e.target.value)} />
              </label>
            </fieldset>
            <fieldset>
              <legend>Correspondence</legend>
              <label>Has correspondence
                <select className="cf-query-select" value={more.has_correspondence} onChange={e => setMoreField('has_correspondence', e.target.value)}>
                  <option value="">Any</option><option value="yes">Yes</option><option value="no">No</option>
                </select>
              </label>
              <label>Last message
                <select className="cf-query-select" value={more.corr_box} onChange={e => setMoreField('corr_box', e.target.value)}>
                  <option value="">Any</option><option value="inbox">Received</option><option value="sent">Sent</option>
                </select>
              </label>
              <label>Sender or recipient
                <input className="cf-query-input" placeholder="Name or email" value={more.corr_party} onChange={e => setMoreField('corr_party', e.target.value)} />
              </label>
              <label>Last message from
                <input type="date" value={more.corr_from} onChange={e => setMoreField('corr_from', e.target.value)} />
              </label>
              <label>to
                <input type="date" value={more.corr_to} onChange={e => setMoreField('corr_to', e.target.value)} />
              </label>
            </fieldset>
            <fieldset>
              <legend>Order</legend>
              <label>Sort by
                <select className="cf-query-select" value={sortBy} onChange={e => { setSortBy(e.target.value); setPage(0) }}>
                  <option value="created_at">Newest first</option>
                  <option value="updated_at">Recently updated</option>
                  <option value="date_received">Date received</option>
                  <option value="case_number">Case number</option>
                  <option value="last_comm_at">Latest message</option>
                  <option value="communication_count">Most messages</option>
                </select>
              </label>
              <button type="button" className="cf-cancel-btn" onClick={() => { setMore(EMPTY_MORE); setSortBy('created_at'); setPage(0); setActiveViewId(null) }}>Clear these</button>
            </fieldset>
          </div>
        )}

        <div className="cf-cases-quick-presets" style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <button type="button" className="cf-cases-preset-btn" onClick={() => { setTypeFilter('AE'); setPriorityFilter('high_urgent'); setStatusFilter('all'); setPage(0); setActiveViewId(null) }}>High Priority AE</button>
          <button type="button" className="cf-cases-preset-btn" onClick={() => { setTypeFilter('all'); setPriorityFilter('urgent'); setStatusFilter('all'); setPage(0); setActiveViewId(null) }}>Urgent SLA</button>
          <button type="button" className="cf-cases-preset-btn" onClick={() => { setTypeFilter('MI'); setPriorityFilter('all'); setStatusFilter('all'); setPage(0); setActiveViewId(null) }}>MI Cases</button>
          <button type="button" className="cf-cases-preset-btn" onClick={() => { setTypeFilter('all'); setPriorityFilter('all'); setStatusFilter('all'); setSearch(''); setMore(EMPTY_MORE); setSortBy('created_at'); setPage(0); setActiveViewId(null) }}>Clear Filters</button>
        </div>

        <div className="cf-cases-saved-views">
          <span className="cf-cases-saved-label">Saved Views</span>
          {/* Built in: what Case Query used to show. */}
          <div className={`cf-cases-view-chip ${!activeViewId && corrActive && more.has_correspondence === 'yes' ? 'active' : ''}`}>
            <button type="button" onClick={() => { setMore(CORRESPONDENCE_VIEW); setShowMore(true); setPage(0); setActiveViewId(null) }}>
              Correspondence
            </button>
          </div>
          {viewsLoading && <span className="cf-cases-saved-empty">Loading…</span>}
          {!viewsLoading && savedViews.length === 0 && <span className="cf-cases-saved-empty">None of your own yet.</span>}
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
        {selectedCaseIds.length > 0 && (
          <div className="cf-cases-bulk-bar">
            <span className="cf-cases-bulk-count">{selectedCaseIds.length} case(s) selected</span>
            <div className="cf-cases-bulk-actions">
              <div className="cf-cases-bulk-group">
                <select className="cf-cases-bulk-select" value={bulkNewOwnerId} onChange={e => setBulkNewOwnerId(e.target.value)}>
                  <option value="">— Reassign to —</option>
                  <option value="null">Unassigned</option>
                  {bulkUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <button className="cf-cases-bulk-apply" onClick={() => applyBulkAction('reassign')} disabled={bulkActionLoading}>Apply</button>
              </div>
              <div className="cf-cases-bulk-group">
                <select className="cf-cases-bulk-select" value={bulkStatusId} onChange={e => setBulkStatusId(e.target.value)}>
                  <option value="">— Change Status —</option>
                  {bulkStatuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <button className="cf-cases-bulk-apply" onClick={() => applyBulkAction('update_status')} disabled={bulkActionLoading}>Apply</button>
              </div>
              <div className="cf-cases-bulk-group">
                <select className="cf-cases-bulk-select" value={bulkPriority} onChange={e => setBulkPriority(e.target.value)}>
                  <option value="">— Change Priority —</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
                <button className="cf-cases-bulk-apply" onClick={() => applyBulkAction('update_priority')} disabled={bulkActionLoading}>Apply</button>
              </div>
              <button className="cf-cases-bulk-delete" onClick={() => applyBulkAction('delete')} disabled={bulkActionLoading}>Delete Selected</button>
              <button className="cf-cases-bulk-cancel" onClick={() => setSelectedCaseIds([])}>Deselect All</button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="cf-cases-loading">Loading…</div>
        ) : loadError ? (
          <div className="cf-form-error">{loadError}</div>
        ) : filteredCases.length === 0 ? (
          <div className="cf-cases-empty">
            {search || moreActive || typeFilter !== 'all' || priorityFilter !== 'all' || statusFilter !== 'all'
              ? (isGlobalSearch
                ? 'No active cases match your global search and filters.'
                : 'No cases match your filters/search.')
              : `No ${activeTab === 'my' ? 'cases assigned to you' : activeTab + ' cases'} yet.`}
            {activeTab === 'my' && !search && !moreActive && unassignedCount > 0 && (
              <div className="cf-cases-empty-action">
                <button type="button" className="cf-cases-tab" onClick={() => handleTabChange('unassigned')}>
                  See {unassignedCount} unassigned {unassignedCount === 1 ? 'case' : 'cases'}
                </button>
              </div>
            )}
          </div>
        ) : (
          <table className="cf-cases-table">
            <thead>
              <tr>
                <th style={{ width: '40px', textAlign: 'center' }}>
                  <input type="checkbox" className="cf-cases-checkbox" aria-label="Select all cases"
                    checked={filteredCases.length > 0 && selectedCaseIds.length === filteredCases.length}
                    onChange={handleSelectAll} 
                  />
                </th>
                <th>Case #</th>
                <th>
                  Type
                  <select className="cf-th-filter-select" aria-label="Filter by type" value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(0) }}>
                    <option value="all">All</option>
                    <option value="MI">MI</option>
                    <option value="AE">AE</option>
                    <option value="PC">PC</option>
                  </select>
                </th>
                <th>Organisation</th>
                <th>
                  Status
                  <select className="cf-th-filter-select" aria-label="Filter by status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                    <option value="all">All</option>
                    {uniqueStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </th>
                <th>
                  Priority
                  <select className="cf-th-filter-select" aria-label="Filter by priority" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
                    <option value="all">All</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                    <option value="high_urgent">High/Urgent</option>
                  </select>
                </th>
                <th>SLA</th>
                <th>Date Received</th>
                <th>Owner</th>
                {corrActive && <th>Messages</th>}
                {corrActive && <th>Last message</th>}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredCases.map(c => (
                <tr key={c.id} className={`cf-cases-row ${selectedCaseIds.includes(c.id) ? 'selected' : ''}`} onClick={() => openCase(c)}>
                  <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                    <input type="checkbox" className="cf-cases-checkbox"
                      aria-label={`Select case ${c.case_number || 'draft'}`}
                      checked={selectedCaseIds.includes(c.id)}
                      onChange={e => handleSelectRow(c.id, e.target.checked)}
                    />
                  </td>
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
                  <td><SlaCountdownBadge dueAt={c.sla_due || c.due_at} compact /></td>
                  <td>{c.date_received ? c.date_received.slice(0, 10) : '—'}</td>
                  <td>{c.owner_name || '—'}</td>
                  {corrActive && <td>{c.communication_count || 0}</td>}
                  {corrActive && (
                    <td>
                      {c.last_comm_box && <span className={`cf-query-dir ${c.last_comm_box}`}>{c.last_comm_box === 'sent' ? 'Sent' : 'Received'}</span>}{' '}
                      {formatDateTime(c.last_comm_at)}
                    </td>
                  )}
                  <td>
                    <button className="cf-open-btn" onClick={e => { e.stopPropagation(); openCase(c) }}>
                      {corrActive ? 'Open messages' : 'Open'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && !loadError && total !== null && total > 0 && (
          <div className="cf-query-pagination">
            <div className="cf-query-page-meta">
              Showing {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + cases.length} of {total}
              {(statusFilter !== 'all' || priorityFilter !== 'all') && ' (the Status and Priority column filters narrow this page only)'}
            </div>
            {total > PAGE_SIZE && (
              <div className="cf-query-page-actions">
                <button className="cf-open-btn" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</button>
                <span className="cf-query-page-num">Page {page + 1} of {Math.ceil(total / PAGE_SIZE)}</span>
                <button className="cf-open-btn" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage(p => p + 1)}>Next</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* New Case Modal — multi-step intake (CF-E1–E5) */}
      {modalOpen && (
        <div className="cf-modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="cf-modal" style={{ maxWidth: 640, width: '95vw' }} onClick={e => e.stopPropagation()}>
            <div className="cf-modal-header">
              <span className="cf-modal-title">New Case — Step {modalStep}{newCase.case_type ? ` of ${newCaseSteps.length}` : ''}</span>
              <button className="cf-modal-close" onClick={() => setModalOpen(false)}>✕</button>
            </div>

            {/* Step indicator */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border, #e5e7eb)' }}>
              {newCaseSteps.map((label, i) => (
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
                    <select aria-label="Organisation" className="cf-modal-select" value={newCase.org_id} onChange={e => selectOrg(e.target.value)}>
                      <option value="">— Select Organisation —</option>
                      {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </div>
                  <div className="cf-form-field">
                    <label className="cf-modal-label">Case Type *</label>
                    <div style={{ display: 'flex', gap: 10 }}>
                      {[{ key: 'MI', label: 'Medical Information', color: '#2563eb' }, { key: 'AE', label: 'Adverse Event', color: '#dc2626' }, { key: 'PC', label: 'Product Complaint', color: '#d97706' }].map(ct => (
                        <button key={ct.key} type="button"
                          aria-label={ct.label} aria-pressed={newCase.case_type === ct.key}
                          onClick={() => setNewCase(p => ({ ...p, case_type: ct.key }))}
                          style={{ flex: 1, padding: '10px 6px', border: `2px solid ${newCase.case_type === ct.key ? ct.color : 'var(--border, #e5e7eb)'}`,
                            borderRadius: 8, background: newCase.case_type === ct.key ? ct.color + '15' : 'transparent',
                            color: newCase.case_type === ct.key ? ct.color : 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, fontWeight: newCase.case_type === ct.key ? 700 : 400 }}>
                          <div>{ct.key}</div>
                          <div style={{ fontSize: 10, opacity: 0.8 }}>{ct.label}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="cf-modal-actions">
                    <button className="cf-modal-confirm" disabled={!step1Valid()} onClick={goToReporterStep}>Next: Reporter</button>
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
                      <input aria-label="First Name" className="cf-modal-select" value={reporter.first_name} onChange={e => setReporter(p => ({ ...p, first_name: e.target.value }))} placeholder="First name" />
                    </div>
                    <div className="cf-form-field" style={{ margin: 0 }}>
                      <label className="cf-modal-label">Last Name *</label>
                      <input aria-label="Last Name" className="cf-modal-select" value={reporter.last_name} onChange={e => setReporter(p => ({ ...p, last_name: e.target.value }))} placeholder="Last name" />
                    </div>
                    <div className="cf-form-field" style={{ margin: 0 }}>
                      <label className="cf-modal-label">Email</label>
                      <input aria-label="Email" className="cf-modal-select" type="email" value={reporter.email} onChange={e => setReporter(p => ({ ...p, email: e.target.value }))} placeholder="email@example.com" />
                    </div>
                    <div className="cf-form-field" style={{ margin: 0 }}>
                      <label className="cf-modal-label">Phone</label>
                      <input aria-label="Phone" className="cf-modal-select" value={reporter.phone} onChange={e => setReporter(p => ({ ...p, phone: e.target.value }))} placeholder="+1 555 000 0000" />
                    </div>
                    <div className="cf-form-field" style={{ margin: 0 }}>
                      <label className="cf-modal-label">Reporter Type</label>
                      <select aria-label="Reporter Type" className="cf-modal-select" value={reporter.reporter_type} onChange={e => setReporter(p => ({ ...p, reporter_type: e.target.value }))}>
                        <option value="">— Select —</option>
                        {listOptions('reporter_type')}
                      </select>
                    </div>
                    <div className="cf-form-field" style={{ margin: 0 }}>
                      <label className="cf-modal-label">Country</label>
                      <input aria-label="Country" className="cf-modal-select" value={reporter.country} onChange={e => setReporter(p => ({ ...p, country: e.target.value }))} placeholder="Country" />
                    </div>
                    <div className="cf-form-field" style={{ margin: 0, gridColumn: '1/-1' }}>
                      <label className="cf-modal-label">Organisation / Institution</label>
                      <input aria-label="Organisation / Institution" className="cf-modal-select" value={reporter.organisation} onChange={e => setReporter(p => ({ ...p, organisation: e.target.value }))} placeholder="Hospital, clinic, company…" />
                    </div>
                  </div>

                  {/* Patient — AE/PC only */}
                  {['AE', 'PC'].includes(newCase.case_type) && (
                    <>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8, marginBottom: 4 }}>Patient Demographics</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                        <div className="cf-form-field" style={{ margin: 0 }}>
                          <label className="cf-modal-label">Initials</label>
                          <input aria-label="Initials" className="cf-modal-select" value={patient.initials} onChange={e => setPatient(p => ({ ...p, initials: e.target.value }))} placeholder="e.g. J.D." maxLength={10} />
                        </div>
                        <div className="cf-form-field" style={{ margin: 0 }}>
                          <label className="cf-modal-label">Age</label>
                          <input aria-label="Age" className="cf-modal-select" type="number" min="0" value={patient.age} onChange={e => setPatient(p => ({ ...p, age: e.target.value }))} placeholder="Age" />
                        </div>
                        <div className="cf-form-field" style={{ margin: 0 }}>
                          <label className="cf-modal-label">Age Unit</label>
                          <select aria-label="Age Unit" className="cf-modal-select" value={patient.age_unit} onChange={e => setPatient(p => ({ ...p, age_unit: e.target.value }))}>
                            <option value="">— Select —</option>
                            {listOptions('age_unit')}
                          </select>
                        </div>
                        <div className="cf-form-field" style={{ margin: 0 }}>
                          <label className="cf-modal-label">Gender</label>
                          <select aria-label="Gender" className="cf-modal-select" value={patient.gender} onChange={e => setPatient(p => ({ ...p, gender: e.target.value }))}>
                            <option value="">— Select —</option>
                            {listOptions('gender')}
                          </select>
                        </div>
                        <div className="cf-form-field" style={{ margin: 0 }}>
                          <label className="cf-modal-label">Weight (kg)</label>
                          <input aria-label="Weight (kg)" className="cf-modal-select" type="number" min="0" step="0.1" value={patient.weight_kg} onChange={e => setPatient(p => ({ ...p, weight_kg: e.target.value }))} placeholder="kg" />
                        </div>
                      </div>
                    </>
                  )}

                  {renderDuplicateAssist()}

                  <div className="cf-modal-actions" style={{ display: 'flex', gap: 10 }}>
                    <button style={{ flex: 1, padding: '10px', border: '1px solid var(--border)', borderRadius: 6, background: 'none', cursor: 'pointer', fontSize: 13 }} onClick={() => setModalStep(1)}>Back</button>
                    {newCase.case_type === 'MI'
                      ? <button className="cf-modal-confirm" style={{ flex: 2 }} disabled={!step2Valid() || creating} onClick={createCase}>{creating ? 'Creating…' : 'Create MI Case'}</button>
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
                    {[['suspect_drug_name','Drug / Product Name','text'],['batch_lot_number','Batch / Lot Number','text'],['dose','Dose','text'],['route_of_admin','Route of Administration','list'],['treatment_start_date','Treatment Start Date','date'],['treatment_stop_date','Treatment Stop Date','date'],['reaction_onset_date','Reaction Onset Date','date']].map(([key, label, type]) => (
                      <div key={key} className="cf-form-field" style={{ margin: 0 }}>
                        <label className="cf-modal-label">{label}</label>
                        {type === 'list'
                          ? <select className="cf-modal-select" value={aeIntake[key]} onChange={e => setAeIntake(p => ({ ...p, [key]: e.target.value }))}>
                              <option value="">— Select —</option>
                              {listOptions(key)}
                            </select>
                          : <input className="cf-modal-select" type={type} value={aeIntake[key]} onChange={e => setAeIntake(p => ({ ...p, [key]: e.target.value }))} placeholder={label} />}
                      </div>
                    ))}
                    <div className="cf-form-field" style={{ margin: 0 }}>
                      <label className="cf-modal-label">Outcome</label>
                      <select aria-label="Outcome" className="cf-modal-select" value={aeIntake.outcome} onChange={e => setAeIntake(p => ({ ...p, outcome: e.target.value }))}>
                        <option value="">— Select —</option>
                        {listOptions('ae_outcome')}
                      </select>
                    </div>
                  </div>
                  <div className="cf-form-field" style={{ margin: '4px 0' }}>
                    <label className="cf-modal-label">Reaction / Event Description</label>
                    <textarea aria-label="Reaction / Event Description" className="cf-modal-select" rows={3} value={aeIntake.reaction_description} onChange={e => setAeIntake(p => ({ ...p, reaction_description: e.target.value }))} placeholder="Describe the adverse event or reaction…" style={{ resize: 'vertical' }} />
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
                    <button style={{ flex: 1, padding: '10px', border: '1px solid var(--border)', borderRadius: 6, background: 'none', cursor: 'pointer', fontSize: 13 }} onClick={() => setModalStep(2)}>Back</button>
                    <button className="cf-modal-confirm" style={{ flex: 2 }} disabled={creating} onClick={createCase}>{creating ? 'Creating…' : 'Create AE Case'}</button>
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
                      <select aria-label="Complaint Category" className="cf-modal-select" value={pcIntake.complaint_category} onChange={e => setPcIntake(p => ({ ...p, complaint_category: e.target.value }))}>
                        <option value="">— Select —</option>
                        {listOptions('pc_category')}
                      </select>
                    </div>
                  </div>
                  <div className="cf-form-field" style={{ margin: '4px 0' }}>
                    <label className="cf-modal-label">Complaint Description</label>
                    <textarea aria-label="Complaint Description" className="cf-modal-select" rows={3} value={pcIntake.complaint_description} onChange={e => setPcIntake(p => ({ ...p, complaint_description: e.target.value }))} placeholder="Describe the product complaint in detail…" style={{ resize: 'vertical' }} />
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
                    <button style={{ flex: 1, padding: '10px', border: '1px solid var(--border)', borderRadius: 6, background: 'none', cursor: 'pointer', fontSize: 13 }} onClick={() => setModalStep(2)}>Back</button>
                    <button className="cf-modal-confirm" style={{ flex: 2 }} disabled={creating} onClick={createCase}>{creating ? 'Creating…' : 'Create PC Case'}</button>
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
