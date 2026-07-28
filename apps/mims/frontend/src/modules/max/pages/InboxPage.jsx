/**
 * InboxPage.jsx — Inbox Module
 * Phase 1: F6 (body search), F7 (date range), F10 (read/unread), F13 (bulk), F14 (CSV export)
 * Phase 2: F1 (assign), F2 (priority), F3 (templates), F4 (due date), F5 (notes),
 *          F8 (advanced filters), F9 (saved views), F12 (reply thread)
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../../shared/context/AuthContext'
import MIMSLayout from '../../../shared/components/MIMSLayout'
import { httpFetch } from '../../../shared/api/httpFetch.js'

import EmailBody, { compactEmailBodyText, normalizeEmailBodyText } from '../components/EmailBody'
import InboxFilterBar from '../components/InboxFilterBar'
import InboxBulkBar from '../components/InboxBulkBar'

const PAGE_SIZE = 50
const TABS = ['Inbox', 'Pending', 'Processed', 'Non-Processed', 'Outbox']
const TAB_STATUS = { Outbox: 'outbox' }
const COLORS = ['red', 'yellow', 'green', 'blue']
const PRIORITIES = ['high', 'medium', 'low']
const TRIAGE_STATES = ['new', 'in_review', 'linked', 'converted', 'no_action', 'closed']
const PRIORITY_ICON = { high: '🔴', medium: '🟡', low: '🟢' }
const TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone


export default function InboxPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, siteId, orgId, allOrgs } = useAuth()

  const STORAGE_KEY = `mims_inbox_${user?.id || 'guest'}`
  const DENSITY_KEY = `mims_inbox_density_${user?.id || 'guest'}`
  const SAVED_VIEWS_SCREEN_KEY = 'inbox'  // server-side saved views via /api/admin/user-preferences

  const saveInquiries = useCallback((data) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }, [STORAGE_KEY])

  function updateInquiries(updaterFn) {
    setInquiries(prev => {
      const next = updaterFn(prev)
      saveInquiries(next)
      return next
    })
  }

  // ── Core inbox state ──────────────────────────────────────────
  const [inquiries, setInquiries]     = useState([])
  const [inboxSource, setInboxSource] = useState('seed')
  const [loading, setLoading]         = useState(true)
  const [loadError, setLoadError]     = useState(null)   // L4: surface fetch errors
  const [attachmentsLoading, setAttachmentsLoading] = useState(false) // H5: proper loading state
  const [fetching, setFetching]       = useState(false)
  const [fetchResult, setFetchResult] = useState(null)
  const [activeTab, setActiveTab]     = useState('Inbox')
  const [search, setSearch]           = useState('')
  const [sortAsc, setSortAsc]         = useState(false)
  const [page, setPage]               = useState(1)
  const [selected, setSelected]       = useState(null)
  const [attachments, setAttachments] = useState([])
  const [compose, setCompose]         = useState(null)
  const [filterFrom, setFilterFrom]   = useState('')
  const [filterTo, setFilterTo]       = useState('')
  const [tenantFilterOrgId, setTenantFilterOrgId] = useState('')
  const [bulkSelected, setBulkSelected] = useState(new Set())
  const [bulkTriageState, setBulkTriageState] = useState('')
  const [bulkAssignee, setBulkAssignee] = useState('')
  const [bulkPriority, setBulkPriority] = useState('')
  const [bulkSnoozeUntil, setBulkSnoozeUntil] = useState('')
  const [compactMode, setCompactMode] = useState(() => {
    try {
      return localStorage.getItem(DENSITY_KEY) !== 'comfort'
    } catch {
      return true
    }
  })

  // ── Phase 2 state ─────────────────────────────────────────────
  const [users, setUsers]           = useState([])           // F1
  const [templates, setTemplates]   = useState([])           // F3
  const [advFilters, setAdvFilters] = useState({             // F8
    color: '', priority: '', readStatus: '', isLocked: '', assignee: '', triageState: '', queueName: '', firstTouchSla: '', responseSla: '',
  })
  const [showAdvFilters, setShowAdvFilters] = useState(false)
  const [selectionMode, setSelectionMode]   = useState(false)
  const [savedViews, setSavedViews]         = useState([])   // F9
  const [saveViewName, setSaveViewName]     = useState('')
  const [showSaveViewModal, setShowSaveViewModal] = useState(false)
  const [viewNotice, setViewNotice]         = useState(null) // F9: stale-value / limit messages
  const defaultViewAppliedRef               = useRef(false)  // F9: auto-apply default only once per mount
  const [notes, setNotes]                   = useState([])   // F5
  const [newNote, setNewNote]               = useState('')
  const [notesLoading, setNotesLoading]     = useState(false)
  const [savingNote, setSavingNote]         = useState(false)
  const [insightPanel, setInsightPanel] = useState(null) // notes | history | recommendations | receipts | null
  const [showUtilityMenu, setShowUtilityMenu] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [recommendationsLoading, setRecommendationsLoading] = useState(false)
  const [readReceiptsLoading, setReadReceiptsLoading] = useState(false)
  const [senderHistory, setSenderHistory] = useState({ previous_inquiries: [], linked_cases: [], previous_inquiry_count: 0, linked_case_count: 0 })
  const [recommendations, setRecommendations] = useState([])
  const [readReceipts, setReadReceipts] = useState([])
  const [caseFlow, setCaseFlow] = useState({
    open: false,
    mode: 'create', // create | append
    caseType: 'MI',
    caseNumber: '',
    search: '',
    searching: false,
    actionBusy: false,
    actionError: '',
    results: [],
  })

  // Auth rides on the httpOnly mims_token cookie (httpFetch sends credentials:
  // 'include'); the session JWT is no longer persisted in localStorage (F14), so
  // no Authorization header is attached here.
  const AUTH_H = useMemo(
    () => ({ 'Content-Type': 'application/json' }),
    []
  )

  // ── Data loaders ──────────────────────────────────────────────

  function mergeLocalState(serverItems, localItems) {
    const localById = new Map((localItems || []).map(i => [i.id, i]))
    return (serverItems || []).map(s => {
      const l = localById.get(s.id)
      if (!l) return s
      return {
        ...s,
        is_locked: l.is_locked, locked_by: l.locked_by,
        color: l.color,
        assigned_to: l.assigned_to, priority: l.priority, due_date: l.due_date,
      }
    })
  }

  const loadInquiries = useCallback(async (opts = {}) => {
    const { force = false, background = false } = opts
    // M3 FIX: guard against writing to 'guest' key before user identity is known
    if (!user?.id) return
    // C3 FIX: background refreshes don't show a loading spinner
    if (!background) setLoading(true)
    setLoadError(null)
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && !force && !tenantFilterOrgId) {
      setInquiries(JSON.parse(saved))
      setLoading(false)
      return
    }
    try {
      const query = tenantFilterOrgId ? `?org_id=${encodeURIComponent(tenantFilterOrgId)}` : ''
      const res = await httpFetch(`/api/inbox${query}`, { headers: AUTH_H })
      if (res.ok) {
        const data = await res.json()
        const inquiryList = data.inquiries || []
        setInboxSource(data.source || 'seed')
        setInquiries(prev => {
          const merged = mergeLocalState(inquiryList, prev)
          if (data.source === 'db' || force) saveInquiries(merged)
          return merged
        })
      }
    } catch (err) {
      // L4 FIX: surface load errors rather than silently swallowing them
      console.error('[Inbox] Failed to load inquiries:', err)
      setLoadError('Failed to refresh inbox. Showing cached data.')
    } finally { setLoading(false) }
  }, [AUTH_H, STORAGE_KEY, saveInquiries, tenantFilterOrgId, user?.id])

  const USERS_KEY = `mims_inbox_users_${user?.id || 'guest'}`

  const loadUsers = useCallback(async () => {
    // Load from cache immediately so the dropdown is never empty on restart
    const cached = localStorage.getItem(USERS_KEY)
    if (cached) {
      try { setUsers(JSON.parse(cached)) } catch { /* ignore */ }
    }
    // Always refresh from API in background
    try {
      const query = tenantFilterOrgId ? `?org_id=${encodeURIComponent(tenantFilterOrgId)}` : ''
      const res = await httpFetch(`/api/inbox/users${query}`, { headers: AUTH_H })
      if (res.ok) {
        const d = await res.json()
        const list = d.users || []
        setUsers(list)
        localStorage.setItem(USERS_KEY, JSON.stringify(list))
      }
    } catch { /* silently keep cached list */ }
  }, [AUTH_H, USERS_KEY, tenantFilterOrgId])

  const loadTemplates = useCallback(async () => {
    try {
      const res = await httpFetch('/api/inbox/templates', { headers: AUTH_H })
      if (res.ok) { const d = await res.json(); setTemplates(d.templates || []) }
    } catch { /* ignore */ }
  }, [AUTH_H])

  // F9: load saved views from the shared user-preferences API (server-side, cross-device)
  const loadViews = useCallback(async () => {
    try {
      const res = await httpFetch(`/api/admin/user-preferences/views?screen_key=${SAVED_VIEWS_SCREEN_KEY}`, { headers: AUTH_H })
      if (!res.ok) return undefined
      const d = await res.json()
      const views = (d.views || []).map(v => ({
        id: v.id,
        name: v.view_name,
        isDefault: !!v.is_default,
        ...(v.filter_json || {}),
      }))
      setSavedViews(views)
      return views
    } catch { return undefined }
  }, [AUTH_H])

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    loadViews().then(views => {
      // Auto-apply the default view once per mount, after views load
      if (cancelled || !Array.isArray(views) || defaultViewAppliedRef.current) return
      const def = views.find(v => v.isDefault)
      if (def) { defaultViewAppliedRef.current = true; applyView(def) }
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, loadViews])

  useEffect(() => {
    localStorage.setItem(DENSITY_KEY, compactMode ? 'compact' : 'comfort')
  }, [compactMode, DENSITY_KEY])

  useEffect(() => {
    // C3 FIX: single load on mount — serves cache first, then silently refreshes in background
    // without triggering a second loading spinner
    loadInquiries()
    loadUsers()
    loadTemplates()
  }, [loadInquiries, loadTemplates, loadUsers])

  // C3 FIX: background refresh after cache serve — runs once after mount, no loading spinner
  useEffect(() => {
    const timer = setTimeout(() => loadInquiries({ force: true, background: true }), 800)
    return () => clearTimeout(timer)
  }, [loadInquiries])

  useEffect(() => {
    const reportFilters = location.state?.reportFilters
    if (!reportFilters) return
    setAdvFilters(prev => ({
      ...prev,
      assignee: reportFilters.assignee || '',
      triageState: reportFilters.triageState || '',
      queueName: reportFilters.queueName || '',
      firstTouchSla: reportFilters.firstTouchSla || '',
      responseSla: reportFilters.responseSla || '',
    }))
    setPage(1)
  }, [location.state])

  async function loadAttachments(inquiryId) {
    // H5 FIX: track loading state separately so "Loading…" doesn't show forever on failure
    setAttachments([])
    setAttachmentsLoading(true)
    try {
      const res = await httpFetch(`/api/inbox/${inquiryId}/attachments`, { headers: AUTH_H })
      if (res.ok) { const d = await res.json(); setAttachments(d.attachments || []) }
      else setAttachments([])
    } catch { setAttachments([]) }
    finally { setAttachmentsLoading(false) }
  }

  async function loadNotes(id) {
    setNotesLoading(true)
    try {
      const res = await httpFetch(`/api/inbox/${id}/notes`, { headers: AUTH_H })
      if (res.ok) { const d = await res.json(); setNotes(d.notes || []) }
    } catch { setNotes([]) }
    finally { setNotesLoading(false) }
  }

  async function loadHistory(id) {
    setHistoryLoading(true)
    try {
      const res = await httpFetch(`/api/inbox/${id}/history`, { headers: AUTH_H })
      if (res.ok) {
        const data = await res.json()
        setSenderHistory(data || { previous_inquiries: [], linked_cases: [], previous_inquiry_count: 0, linked_case_count: 0 })
      } else {
        setSenderHistory({ previous_inquiries: [], linked_cases: [], previous_inquiry_count: 0, linked_case_count: 0 })
      }
    } catch {
      setSenderHistory({ previous_inquiries: [], linked_cases: [], previous_inquiry_count: 0, linked_case_count: 0 })
    } finally {
      setHistoryLoading(false)
    }
  }

  async function loadRecommendations(id) {
    setRecommendationsLoading(true)
    try {
      const res = await httpFetch(`/api/inbox/${id}/recommendations`, { headers: AUTH_H })
      if (res.ok) {
        const data = await res.json()
        setRecommendations(data.recommendations || [])
      } else {
        setRecommendations([])
      }
    } catch {
      setRecommendations([])
    } finally {
      setRecommendationsLoading(false)
    }
  }

  async function loadReadReceipts(id) {
    setReadReceiptsLoading(true)
    try {
      const res = await httpFetch(`/api/inbox/${id}/read-receipts`, { headers: AUTH_H })
      if (res.ok) {
        const data = await res.json()
        setReadReceipts(Array.isArray(data.receipts) ? data.receipts : [])
      } else {
        setReadReceipts([])
      }
    } catch {
      setReadReceipts([])
    } finally {
      setReadReceiptsLoading(false)
    }
  }

  useEffect(() => {
    const selectInquiryId = Number(location.state?.selectInquiryId || 0)
    if (!selectInquiryId || inquiries.length === 0) return
    const target = inquiries.find(item => Number(item.id) === selectInquiryId)
    if (target) selectInquiry(target)
  }, [location.state, inquiries]) // eslint-disable-line react-hooks/exhaustive-deps -- selectInquiry intentionally hydrates related panels for route-driven selection

  useEffect(() => {
    setPage(1)
    setSelected(null)
    setBulkSelected(new Set())
    setSelectionMode(false)
    loadUsers()
    loadInquiries({ force: true, background: true })
  }, [tenantFilterOrgId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ───────────────────────────────────────────────────

  async function fetchEmails() {
    setFetching(true); setFetchResult(null)
    try {
      const res = await httpFetch('/api/inbox/fetch', { method: 'POST', headers: AUTH_H })
      if (res.ok) { const d = await res.json(); setFetchResult(d); await loadInquiries({ force: true }) }
    } catch { /* silently fail */ }
    finally { setFetching(false) }
  }

  function selectInquiry(inq) {
    setSelected(inq)
    setInsightPanel(null)
    setShowUtilityMenu(false)
    if (inq.attachments_count > 0) loadAttachments(inq.id)
    else { setAttachments([]); setAttachmentsLoading(false) }
    if (!inq.read_at) {
      const nowIso = new Date().toISOString()
      patchInquiry(inq.id, { is_read: true })
      updateInquiries(prev => prev.map(i => i.id === inq.id ? {
        ...i,
        is_read: true,
        read_at: i.read_at || nowIso,
        read_receipt_count: Math.max(1, Number(i.read_receipt_count || 0) + 1),
        last_read_at: nowIso,
        last_read_by_name: user?.name || user?.email || 'You',
      } : i))
      setSelected(prev => prev ? ({
        ...prev,
        is_read: true,
        read_at: prev.read_at || nowIso,
        read_receipt_count: Math.max(1, Number(prev.read_receipt_count || 0) + 1),
        last_read_at: nowIso,
        last_read_by_name: user?.name || user?.email || 'You',
      }) : prev)
    }
    setNotes([]); setNewNote('')
    setSenderHistory({ previous_inquiries: [], linked_cases: [], previous_inquiry_count: 0, linked_case_count: 0 })
    setRecommendations([])
    setReadReceipts([])
    loadNotes(inq.id)
    loadHistory(inq.id)
    loadRecommendations(inq.id)
    loadReadReceipts(inq.id)
  }

  function openReply() {
    if (!selected) return
    setCompose({
      mode: 'reply',
      to: selected.sender,
      subject: `Re: ${selected.subject}`,
      body: `\n\n---\nOn ${formatFullDate(selected.received_at)}, ${selected.sender} wrote:\n\n${selected.body || ''}`,
      sending: false, error: null,
    })
  }

  function openForward() {
    if (!selected) return
    setCompose({
      mode: 'forward',
      to: '',
      subject: `Fwd: ${selected.subject}`,
      body: `\n\n---\nFrom: ${selected.sender}\nSent: ${formatFullDate(selected.received_at)}\nTo: ${selected.recipient}\nSubject: ${selected.subject}\n\n${selected.body || ''}`,
      sending: false, error: null,
    })
  }

  // H3 FIX: validate email format on the frontend before sending
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  async function sendCompose() {
    if (!compose || !selected) return
    if (!EMAIL_RE.test(compose.to.trim())) {
      setCompose(c => ({ ...c, error: 'Invalid recipient email address.' }))
      return
    }
    setCompose(c => ({ ...c, sending: true, error: null }))
    const endpoint = compose.mode === 'reply' ? 'reply' : 'forward'
    try {
      const res = await httpFetch(`/api/inbox/${selected.id}/${endpoint}`, {
        method: 'POST', headers: AUTH_H,
        body: JSON.stringify({ to: compose.to, subject: compose.subject, body: compose.body }),
      })
      const data = await res.json()
      if (!res.ok) { setCompose(c => ({ ...c, sending: false, error: data.error || 'Failed to send.' })); return }
      if (compose.mode === 'reply') {
        updateInquiries(prev => prev.map(i =>
          i.id === selected.id ? { ...i, status: 'processed' } : i
        ))
        setSelected(null)
      }
      setCompose(null)
      loadInquiries({ force: true })
    } catch {
      setCompose(c => ({ ...c, sending: false, error: 'Network error. Please try again.' }))
    }
  }

  function openCreateCaseModal() {
    const suggestedType = ['MI', 'AE', 'PC'].includes(String(selected?.ai_suggested_type || '').toUpperCase())
      ? String(selected.ai_suggested_type).toUpperCase()
      : 'MI'
    setCaseFlow({
      open: true,
      mode: 'create',
      caseType: suggestedType,
      caseNumber: '',
      search: '',
      searching: false,
      actionBusy: false,
      actionError: '',
      results: [],
    })
  }

  function openAppendCaseModal() {
    setCaseFlow({
      open: true,
      mode: 'append',
      caseType: 'MI',
      caseNumber: '',
      search: '',
      searching: false,
      actionBusy: false,
      actionError: '',
      results: [],
    })
    searchCases('')
  }

  async function searchCases(term = '') {
    setCaseFlow(prev => ({ ...prev, searching: true, actionError: '' }))
    try {
      const q = new URLSearchParams({ limit: '20', deleted: 'false' })
      if (term?.trim()) q.set('search', term.trim())
      const res = await httpFetch(`/api/cases?${q.toString()}`, { headers: AUTH_H })
      if (!res.ok) {
        setCaseFlow(prev => ({ ...prev, searching: false, actionError: 'Failed to load cases.' }))
        return
      }
      const rows = await res.json()
      setCaseFlow(prev => ({ ...prev, searching: false, results: rows || [] }))
    } catch {
      setCaseFlow(prev => ({ ...prev, searching: false, actionError: 'Failed to load cases.' }))
    }
  }

  async function linkInquiryToCase(caseId, linkMode = 'linked') {
    if (!selected) return false
    const res = await httpFetch(`/api/inbox/${selected.id}/link-case`, {
      method: 'POST',
      headers: AUTH_H,
      body: JSON.stringify({ case_id: caseId, link_mode: linkMode }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setCaseFlow(prev => ({ ...prev, actionError: data.error || 'Failed to link case.' }))
      return false
    }
    updateInquiries(prev => prev.map(i => (
      i.id === selected.id ? { ...i, status: 'processed', case_id: caseId, triage_state: linkMode } : i
    )))
    setSelected(prev => prev ? ({ ...prev, status: 'processed', case_id: caseId, triage_state: linkMode }) : prev)
    return true
  }

  async function createCaseFromInquiry() {
    if (!selected) return
    if (!siteId) {
      setCaseFlow(prev => ({ ...prev, actionError: 'No active site assigned. Contact admin.' }))
      return
    }
    setCaseFlow(prev => ({ ...prev, actionBusy: true, actionError: '' }))
    try {
      // S19-P1: carry inquiry context into case — pre-fill description + internal notes
      const subjectText  = selected.subject || '(No subject)'
      const bodySnippet  = (selected.body || '').slice(0, 1000).trim()
      const contextNotes = `[Inbox] From: ${selected.sender || '—'} | Subject: ${subjectText} | Received: ${selected.received_at ? new Date(selected.received_at).toLocaleString() : '—'}`

      const createRes = await httpFetch('/api/cases', {
        method: 'POST',
        headers: AUTH_H,
        body: JSON.stringify({
          site_id: siteId,
          case_type: caseFlow.caseType,
          intake_channel: 'email',
          date_received: toDateOnly(selected.received_at),
          description:    bodySnippet  || null,
          internal_notes: contextNotes || null,
        }),
      })
      const created = await createRes.json().catch(() => ({}))
      if (!createRes.ok || !created?.id) {
        setCaseFlow(prev => ({ ...prev, actionBusy: false, actionError: created.error || 'Failed to create case.' }))
        return
      }

      await httpFetch(`/api/cases/${created.id}/assign-number`, {
        method: 'POST',
        headers: AUTH_H,
      })

      const linked = await linkInquiryToCase(created.id, 'converted')
      if (!linked) {
        setCaseFlow(prev => ({ ...prev, actionBusy: false }))
        return
      }

      setCaseFlow(prev => ({ ...prev, actionBusy: false, open: false }))
      navigate(`/cases/${created.id}`, { state: { from: '/inbox' } })
    } catch {
      setCaseFlow(prev => ({ ...prev, actionBusy: false, actionError: 'Failed to create case.' }))
    }
  }

  async function appendToExistingCase(caseId) {
    if (!selected || !caseId) return
    setCaseFlow(prev => ({ ...prev, actionBusy: true, actionError: '' }))
    const linked = await linkInquiryToCase(caseId, 'linked')
    if (!linked) {
      setCaseFlow(prev => ({ ...prev, actionBusy: false }))
      return
    }
    setCaseFlow(prev => ({ ...prev, actionBusy: false, open: false }))
  }

  async function appendByCaseNumber() {
    const raw = (caseFlow.caseNumber || '').trim()
    if (!raw) {
      setCaseFlow(prev => ({ ...prev, actionError: 'Enter case number first.' }))
      return
    }
    setCaseFlow(prev => ({ ...prev, searching: true, actionError: '' }))
    try {
      const q = new URLSearchParams({ limit: '50', deleted: 'false', search: raw })
      const res = await httpFetch(`/api/cases?${q.toString()}`, { headers: AUTH_H })
      if (!res.ok) {
        setCaseFlow(prev => ({ ...prev, searching: false, actionError: 'Failed to search case number.' }))
        return
      }
      const rows = await res.json()
      const normalized = raw.toLowerCase()
      const exact = (rows || []).find(c => (c.case_number || '').toLowerCase() === normalized)
      if (!exact) {
        setCaseFlow(prev => ({ ...prev, searching: false, actionError: `No exact case found for "${raw}".` }))
        return
      }
      setCaseFlow(prev => ({ ...prev, searching: false }))
      await appendToExistingCase(exact.id)
    } catch {
      setCaseFlow(prev => ({ ...prev, searching: false, actionError: 'Failed to search case number.' }))
    }
  }

  async function patchInquiry(id, body) {
    if (inboxSource === 'db') {
      await httpFetch(`/api/inbox/${id}`, { method: 'PATCH', headers: AUTH_H, body: JSON.stringify(body) }).catch(() => {})
    }
  }

  function setColor(id, color) {
    patchInquiry(id, { color })
    updateInquiries(prev => prev.map(inq => inq.id === id ? { ...inq, color } : inq))
  }

  function toggleBulk(id, e) {
    e.stopPropagation()
    setBulkSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function applyBulkUpdates(extraPayload = {}) {
    const ids = [...bulkSelected]
    if (ids.length === 0) return

    const payload = { ids, ...extraPayload }
    if (bulkTriageState) payload.triage_state = bulkTriageState
    if (bulkAssignee) payload.assigned_to = bulkAssignee === '__UNASSIGNED__' ? null : bulkAssignee
    if (bulkPriority) payload.priority = bulkPriority
    // L2 FIX: use 5 PM in the user's local timezone instead of hardcoded 18:00 UTC
    // new Date('YYYY-MM-DDT17:00:00') is parsed as local time; .toISOString() converts to UTC offset
    if (bulkSnoozeUntil) payload.snoozed_until = new Date(`${bulkSnoozeUntil}T17:00:00`).toISOString()

    if (Object.keys(payload).length <= 1) return

    if (inboxSource === 'db') {
      await httpFetch('/api/inbox/bulk-update', {
        method: 'POST',
        headers: AUTH_H,
        body: JSON.stringify(payload),
      }).catch(() => {})
    }

    await loadInquiries({ force: true })
    setBulkSelected(new Set())
    setSelected(null)
    setBulkTriageState('')
    setBulkAssignee('')
    setBulkPriority('')
    setBulkSnoozeUntil('')
  }

  function exportCSV() {
    const headers = ['ID', 'From', 'To', 'Subject', 'Received', 'Status', 'Triage State', 'Queue', 'Priority', 'Assigned To', 'Due Date', 'First Touch SLA', 'Response SLA', 'Color', 'Locked By']
    // M1 FIX: escape ALL fields (including headers and non-string columns) to prevent broken CSV when
    // values contain commas, quotes, or newlines; use CRLF for RFC 4180 compliance
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`
    const rows = filtered.map(i => [
      esc(i.id), esc(i.sender), esc(i.recipient), esc(i.subject),
      esc(i.received_at), esc(i.status), esc(i.triage_state || ''), esc(i.queue_name || ''),
      esc(i.priority || ''), esc(i.assigned_to || ''), esc(i.due_date || ''),
      esc(i.first_touch_sla_status || ''), esc(i.response_sla_status || ''),
      esc(i.color || ''), esc(i.locked_by || ''),
    ])
    const csv = [headers.map(esc), ...rows].map(r => r.join(',')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `inbox-${activeTab.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  async function submitNote() {
    if (!selected || !newNote.trim()) return
    setSavingNote(true)
    try {
      const res = await httpFetch(`/api/inbox/${selected.id}/notes`, {
        method: 'POST', headers: AUTH_H,
        body: JSON.stringify({ note: newNote.trim() }),
      })
      if (res.ok) {
        const d = await res.json()
        setNotes(prev => [...prev, d.note || {
          user_name: user?.name || user?.email || 'You',
          note: newNote.trim(),
          created_at: new Date().toISOString(),
        }])
        setNewNote('')
      }
    } catch { /* ignore */ }
    finally { setSavingNote(false) }
  }

  // ── Saved Views (F9) — server-side, cross-device via /api/admin/user-preferences ──

  const EMPTY_ADV = { color: '', priority: '', readStatus: '', isLocked: '', assignee: '', triageState: '', queueName: '', firstTouchSla: '', responseSla: '' }

  // Persist a view (create or overwrite by name). Server clears other defaults when asDefault.
  async function persistView(name, filterJson, asDefault) {
    const res = await httpFetch('/api/admin/user-preferences/views', {
      method: 'POST',
      headers: AUTH_H,
      body: JSON.stringify({
        screen_key: SAVED_VIEWS_SCREEN_KEY,
        view_name: name,
        filter_json: filterJson,
        is_default: asDefault ? 1 : 0,
      }),
    })
    return res.ok
  }

  async function saveCurrentView(name) {
    const trimmed = (name || '').trim()
    if (!trimmed) return
    const isExisting = savedViews.some(v => v.name === trimmed)
    if (!isExisting && savedViews.length >= 5) {
      setViewNotice('You have reached the limit of 5 saved views. Delete one before saving a new view.')
      return
    }
    const filterJson = { search, filterFrom, filterTo, tenantFilterOrgId, advFilters }
    try {
      const ok = await persistView(trimmed, filterJson, false)
      if (ok) { setViewNotice(null); await loadViews() }
      else setViewNotice('Could not save the view. Please try again.')
    } catch { setViewNotice('Could not save the view. Please try again.') }
  }

  // Apply a view, silently dropping filter values the user no longer has access to.
  function applyView(view) {
    const dropped = []
    let tenant = view.tenantFilterOrgId || ''
    if (tenant && tenantOptions.length && !tenantOptions.some(o => String(o.id) === String(tenant))) {
      tenant = ''; dropped.push('tenant')
    }
    const adv = { ...EMPTY_ADV, ...(view.advFilters || {}) }
    if (adv.assignee && adv.assignee !== '__UNASSIGNED__' && users.length && !users.some(u => u.name === adv.assignee)) {
      adv.assignee = ''; dropped.push('assignee')
    }
    setSearch(view.search || '')
    setFilterFrom(view.filterFrom || '')
    setFilterTo(view.filterTo || '')
    setTenantFilterOrgId(tenant)
    setAdvFilters(adv)
    setPage(1)
    setViewNotice(dropped.length
      ? `Some filters in "${view.name}" were reset because your access changed.`
      : null)
  }

  // Toggle a view as the user's default (auto-applies on next inbox open).
  async function toggleDefaultView(view) {
    try {
      const ok = await persistView(view.name, {
        search: view.search, filterFrom: view.filterFrom, filterTo: view.filterTo,
        tenantFilterOrgId: view.tenantFilterOrgId, advFilters: view.advFilters,
      }, !view.isDefault)
      if (ok) await loadViews()
    } catch { /* keep current state on failure */ }
  }

  async function deleteView(view) {
    if (!view?.id) return
    try {
      const res = await httpFetch(`/api/admin/user-preferences/views/${view.id}`, { method: 'DELETE', headers: AUTH_H })
      if (res.ok) await loadViews()
    } catch { /* ignore */ }
  }

  // ── Computed state ────────────────────────────────────────────

  const tabCounts = useMemo(() => {
    return TABS.reduce((acc, tab) => {
      acc[tab] = inquiries.filter(i => i.status === (TAB_STATUS[tab] || tab.toLowerCase().replace('-', '_'))).length
      return acc
    }, {})
  }, [inquiries])

  const filtered = useMemo(() => {
    let result = inquiries.filter(i => {
      const matchTab  = i.status === (TAB_STATUS[activeTab] || activeTab.toLowerCase().replace('-', '_'))
      const q         = search.toLowerCase()
      const matchSearch = search === '' ||
        i.sender?.toLowerCase().includes(q) ||
        i.subject?.toLowerCase().includes(q) ||
        i.body?.toLowerCase().includes(q)
      // M2 FIX: append T00:00:00 (no Z) so filterFrom is treated as local midnight, not UTC midnight
      const matchFrom = !filterFrom || new Date(i.received_at) >= new Date(filterFrom + 'T00:00:00')
      const matchTo   = !filterTo   || new Date(i.received_at) <= new Date(filterTo + 'T23:59:59')
      // F8: advanced filters
      const matchColor    = !advFilters.color    || i.color === advFilters.color
      const matchPriority = !advFilters.priority || i.priority === advFilters.priority
      const matchRead     = !advFilters.readStatus ||
        (advFilters.readStatus === 'unread' ? !i.is_read : !!i.is_read)
      const matchLock     = !advFilters.isLocked ||
        (advFilters.isLocked === 'locked' ? i.is_locked : !i.is_locked)
      const matchAssignee = !advFilters.assignee ||
        (advFilters.assignee === '__UNASSIGNED__' ? !i.assigned_to : i.assigned_to === advFilters.assignee)
      const matchTriage   = !advFilters.triageState || i.triage_state === advFilters.triageState
      const matchQueue    = !advFilters.queueName || i.queue_name === advFilters.queueName
      const matchFirstTouch = !advFilters.firstTouchSla || i.first_touch_sla_status === advFilters.firstTouchSla
      const matchResponse = !advFilters.responseSla || i.response_sla_status === advFilters.responseSla
      return matchTab && matchSearch && matchFrom && matchTo &&
             matchColor && matchPriority && matchRead && matchLock && matchAssignee &&
             matchTriage && matchQueue && matchFirstTouch && matchResponse
    })
    result.sort((a, b) => {
      const da = new Date(a.received_at), db = new Date(b.received_at)
      return sortAsc ? da - db : db - da
    })
    return result
  }, [inquiries, activeTab, search, sortAsc, filterFrom, filterTo, advFilters])

  const queueOptions = useMemo(
    () => [...new Set(inquiries.map(inquiry => inquiry.queue_name).filter(Boolean))].sort(),
    [inquiries]
  )

  const tenantOptions = useMemo(() => {
    const options = Array.isArray(allOrgs)
      ? allOrgs
        .map((org) => ({
          id: Number(org?.orgId || 0),
          name: String(org?.orgName || '').trim(),
        }))
        .filter((org) => org.id > 0 && org.name)
      : []
    const dedup = new Map()
    for (const org of options) dedup.set(org.id, org)
    if (orgId && !dedup.has(Number(orgId))) {
      dedup.set(Number(orgId), { id: Number(orgId), name: `Org ${orgId}` })
    }
    return [...dedup.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [allOrgs, orgId])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const today   = new Date().toDateString()
  // L1 FIX: add Yesterday group so users can distinguish today vs yesterday vs older
  const _yesterday = new Date(); _yesterday.setDate(_yesterday.getDate() - 1)
  const yesterdayStr = _yesterday.toDateString()
  const grouped = paginated.reduce((acc, inq) => {
    const dateStr = new Date(inq.received_at).toDateString()
    const group = dateStr === today ? 'Today' : dateStr === yesterdayStr ? 'Yesterday' : 'Older'
    if (!acc[group]) acc[group] = []
    acc[group].push(inq)
    return acc
  }, {})

  // ── Helpers ───────────────────────────────────────────────────

  function formatTime(dateStr) {
    const d = new Date(dateStr)
    if (d.toDateString() === today) return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  function formatFullDate(dateStr) {
    return new Date(dateStr).toLocaleString('en-US', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  }

  function formatReadReceiptSummary(inquiry) {
    if (!inquiry?.is_read) return 'Unread'
    if (inquiry.read_receipt_count > 0 && inquiry.last_read_at) {
      const reader = inquiry.last_read_by_name || 'Team member'
      return `${reader} · ${formatFullDate(inquiry.last_read_at)}`
    }
    return 'Previously marked read'
  }

  function dueDateStatus(dueDateStr) {
    if (!dueDateStr) return null
    const d = new Date(dueDateStr); d.setHours(0, 0, 0, 0)
    const t = new Date(); t.setHours(0, 0, 0, 0)
    if (d < t)  return 'overdue'
    if (d.getTime() === t.getTime()) return 'today'
    return null
  }

  function toDateOnly(value) {
    if (!value) return null
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
    const dt = new Date(value)
    if (Number.isNaN(dt.getTime())) return null
    const y = dt.getUTCFullYear()
    const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
    const d = String(dt.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  const hasAdvFilters = Object.values(advFilters).some(v => v)

  const colorBarClass = { red: 'color-bar-red', yellow: 'color-bar-yellow', green: 'color-bar-green', blue: 'color-bar-blue' }
  const dotClass      = { red: 'dot-red', yellow: 'dot-yellow', green: 'dot-green', blue: 'dot-blue' }
  const heroMetrics = useMemo(() => ([
    {
      label: 'Open work',
      value: inquiries.filter(item => ['inbox', 'pending', 'non_processed'].includes(item.status)).length,
    },
    {
      label: 'Unassigned',
      value: inquiries.filter(item => !item.assigned_to && ['inbox', 'pending', 'non_processed'].includes(item.status)).length,
    },
    {
      label: 'My queue',
      value: inquiries.filter(item => item.assigned_to === user?.name && ['inbox', 'pending', 'non_processed'].includes(item.status)).length,
    },
    {
      label: 'SLA risk',
      value: inquiries.filter(item => item.first_touch_sla_status === 'breached' || item.response_sla_status === 'breached').length,
    },
  ]), [inquiries, user?.name])

  const activeFilterChips = useMemo(() => {
    const chips = []
    const tenantName = tenantOptions.find(org => String(org.id) === String(tenantFilterOrgId))?.name

    if (search) chips.push({ key: 'search', label: `Search: ${search}` })
    if (tenantFilterOrgId && tenantName) chips.push({ key: 'tenant', label: `Tenant: ${tenantName}` })
    if (filterFrom) chips.push({ key: 'from', label: `From: ${filterFrom}` })
    if (filterTo) chips.push({ key: 'to', label: `To: ${filterTo}` })
    if (advFilters.color) chips.push({ key: 'color', label: `Color: ${advFilters.color}` })
    if (advFilters.priority) chips.push({ key: 'priority', label: `Priority: ${advFilters.priority}` })
    if (advFilters.readStatus) chips.push({ key: 'readStatus', label: advFilters.readStatus === 'unread' ? 'Unread only' : 'Read only' })
    if (advFilters.isLocked) chips.push({ key: 'isLocked', label: advFilters.isLocked === 'locked' ? 'Locked only' : 'Unlocked only' })
    if (advFilters.assignee) chips.push({ key: 'assignee', label: advFilters.assignee === '__UNASSIGNED__' ? 'Unassigned only' : `Assignee: ${advFilters.assignee}` })
    if (advFilters.triageState) chips.push({ key: 'triageState', label: `State: ${advFilters.triageState.replace(/_/g, ' ')}` })
    if (advFilters.queueName) chips.push({ key: 'queueName', label: `Queue: ${advFilters.queueName}` })
    if (advFilters.firstTouchSla) chips.push({ key: 'firstTouchSla', label: `First Touch: ${advFilters.firstTouchSla.replace(/_/g, ' ')}` })
    if (advFilters.responseSla) chips.push({ key: 'responseSla', label: `Response: ${advFilters.responseSla.replace(/_/g, ' ')}` })

    return chips
  }, [search, tenantFilterOrgId, tenantOptions, filterFrom, filterTo, advFilters])

  function getAiChipLabel(inquiry) {
    const type = String(inquiry?.ai_suggested_type || '').toUpperCase()
    if (!type) return ''
    let payload = inquiry.ai_suggested_payload
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload) } catch { payload = {} }
    }
    const urgency = payload?.urgency ? ` / ${payload.urgency}` : ''
    return `AI: ${type}${urgency}`
  }

  function renderAiChip(inquiry) {
    const label = getAiChipLabel(inquiry)
    if (!label) return null
    return <span className="ai-inbox-chip">{label}</span>
  }

  // H2 FIX: map all SLA statuses to correct badge classes instead of defaulting everything to yellow
  function slaClass(status) {
    if (status === 'breached') return 'due-overdue'
    if (status === 'at_risk')  return 'due-today'
    return ''
  }

  function getRowChips(inquiry) {
    const chips = []
    const aiLabel = getAiChipLabel(inquiry)
    const dueStatus = dueDateStatus(inquiry.due_date)

    if (inquiry.priority) chips.push({ label: inquiry.priority, tone: inquiry.priority })
    if (inquiry.queue_name) chips.push({ label: inquiry.queue_name, tone: 'neutral' })
    if (inquiry.triage_state) chips.push({ label: inquiry.triage_state.replace(/_/g, ' '), tone: 'neutral' })
    if (aiLabel) chips.push({ label: aiLabel, tone: 'ai' })
    if (dueStatus === 'overdue') chips.push({ label: 'Overdue', tone: 'risk' })
    if (dueStatus === 'today') chips.push({ label: 'Due today', tone: 'warning' })
    if (inquiry.first_touch_sla_status === 'breached' && !inquiry.first_touched_at) chips.push({ label: 'First Touch SLA', tone: 'risk' })
    if (inquiry.response_sla_status === 'breached' && inquiry.first_touched_at && !inquiry.first_response_at) chips.push({ label: 'Response SLA', tone: 'risk' })
    if (inquiry.assigned_to) chips.push({ label: inquiry.assigned_to, tone: 'neutral' })

    return chips
  }

  function clearAllFilters() {
    setSearch('')
    setFilterFrom('')
    setFilterTo('')
    setTenantFilterOrgId('')
    setAdvFilters(EMPTY_ADV)
    setPage(1)
  }

  function clearFilterChip(key) {
    if (key === 'search') setSearch('')
    if (key === 'tenant') setTenantFilterOrgId('')
    if (key === 'from') setFilterFrom('')
    if (key === 'to') setFilterTo('')
    if (key in advFilters) {
      setAdvFilters(prev => ({ ...prev, [key]: '' }))
    }
    setPage(1)
  }

  function toggleSelectionMode() {
    setSelectionMode(prev => {
      const next = !prev
      if (!next) {
        setBulkSelected(new Set())
        setBulkTriageState('')
        setBulkAssignee('')
        setBulkPriority('')
        setBulkSnoozeUntil('')
      }
      return next
    })
  }

  async function saveViewAndClose() {
    const trimmed = saveViewName.trim()
    if (!trimmed) return
    await saveCurrentView(trimmed)
    setSaveViewName('')
    setShowSaveViewModal(false)
  }

  // ── Render ────────────────────────────────────────────────────

  return (
    <MIMSLayout showStatStrip={false} bodyClassName="no-scroll mims-inbox-page-body" surfaceVariant="workspace" compact>
      <div className={`inbox-page-shell ${compactMode ? 'compact-mode' : 'comfort-mode'}`}>
        <section className="inbox-hero">
          <div className="inbox-hero-top">
            <div className="inbox-hero-copy">
              <span className="inbox-hero-kicker">Shared inbox workspace</span>
              <h1 className="inbox-hero-title">Inbox</h1>
              <p className="inbox-hero-description">A calmer triage surface for medical affairs communication, routing, and case creation.</p>
            </div>
            <div className="inbox-hero-actions">
              <button className="btn btn-outline inbox-toolbar-btn" onClick={() => setShowAdvFilters(a => !a)}>
                {showAdvFilters ? 'Hide filters' : 'Filters'}
              </button>
              <button className="btn btn-outline inbox-toolbar-btn" onClick={toggleSelectionMode}>
                {selectionMode ? 'Done selecting' : 'Select'}
              </button>
              <button className="btn btn-outline inbox-toolbar-btn" onClick={() => setShowSaveViewModal(true)}>
                Save view
              </button>
              <button className="btn btn-outline inbox-toolbar-btn" onClick={exportCSV} title="Export current view to CSV">
                Export CSV
              </button>
              <button className="btn btn-primary inbox-toolbar-btn" onClick={fetchEmails} disabled={fetching || loading}>
                {fetching ? 'Fetching…' : 'Fetch mail'}
              </button>
            </div>
          </div>

          <div className="inbox-hero-metrics">
            {heroMetrics.map(metric => (
              <div key={metric.label} className="inbox-hero-metric">
                <span className="inbox-hero-metric-value">{metric.value}</span>
                <span className="inbox-hero-metric-label">{metric.label}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="inbox-wrapper">

            {/* ── LEFT PANEL: List ── */}
            <div className="inbox-list-panel">

              {/* Tabs */}
              <div className="inbox-tabs">
                {TABS.map(tab => (
                  <button key={tab} className={`inbox-tab ${activeTab === tab ? 'active' : ''}`}
                    onClick={() => { setActiveTab(tab); setPage(1); setSelected(null); setSelectionMode(false) }}>
                    {tab}
                    {tabCounts[tab] > 0 && <span className="inbox-tab-count">{tabCounts[tab]}</span>}
                  </button>
                ))}
              </div>

              <div className="inbox-layout-controls">
                <div className="inbox-density-switch" role="group" aria-label="Inbox density">
                  <button className={`density-option ${compactMode ? 'active' : ''}`} onClick={() => setCompactMode(true)}>
                    Compact
                  </button>
                  <button className={`density-option ${!compactMode ? 'active' : ''}`} onClick={() => setCompactMode(false)}>
                    Comfort
                  </button>
                </div>
                <div className="inbox-layout-summary">
                  <span>{activeTab} triage</span>
                  <span>{filtered.length} in current view</span>
                </div>
              </div>

              <div className="saved-views-bar">
                <span className="saved-views-label">Saved views</span>
                {savedViews.length === 0 && (
                  <span className="saved-views-empty">
                    No saved views yet. Save your current filters from the header.
                  </span>
                )}
                {savedViews.map((v) => (
                  <span key={v.id} className={`saved-view-chip${v.isDefault ? ' is-default' : ''}`}>
                    <button className="chip-label" onClick={() => applyView(v)}>
                      {v.isDefault ? '★ ' : ''}{v.name}
                    </button>
                    <button
                      className="chip-default"
                      title={v.isDefault ? 'Remove as default' : 'Set as default'}
                      onClick={() => toggleDefaultView(v)}
                    >{v.isDefault ? '★' : '☆'}</button>
                    <button className="chip-delete" title="Delete view" onClick={() => deleteView(v)}>✕</button>
                  </span>
                ))}
              </div>
              {viewNotice && (
                <div className="saved-views-notice">
                  <span>{viewNotice}</span>
                  <button className="chip-delete" onClick={() => setViewNotice(null)}>✕</button>
                </div>
              )}

              {/* Search (F6) */}
              <div className="inbox-search-bar">
                <input type="text" placeholder="Search sender, subject or body..."
                  value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
              </div>

              <InboxFilterBar
                advFilters={advFilters}
                setAdvFilters={setAdvFilters}
                showAdvFilters={showAdvFilters}
                setShowAdvFilters={setShowAdvFilters}
                filterFrom={filterFrom}
                setFilterFrom={setFilterFrom}
                filterTo={filterTo}
                setFilterTo={setFilterTo}
                users={users}
                activeFilterChips={activeFilterChips}
                clearFilterChip={clearFilterChip}
                clearAllFilters={clearAllFilters}
                hasAdvFilters={hasAdvFilters}
                tenantOptions={tenantOptions}
                tenantFilterOrgId={tenantFilterOrgId}
                setTenantFilterOrgId={setTenantFilterOrgId}
                queueOptions={queueOptions}
                setPage={setPage}
              />

              {/* Bulk action bar (F13) */}
              <InboxBulkBar
                selectionMode={selectionMode}
                bulkSelected={bulkSelected}
                bulkTriageState={bulkTriageState}
                setBulkTriageState={setBulkTriageState}
                bulkAssignee={bulkAssignee}
                setBulkAssignee={setBulkAssignee}
                bulkPriority={bulkPriority}
                setBulkPriority={setBulkPriority}
                bulkSnoozeUntil={bulkSnoozeUntil}
                setBulkSnoozeUntil={setBulkSnoozeUntil}
                users={users}
                applyBulkUpdates={applyBulkUpdates}
                toggleSelectionMode={toggleSelectionMode}
              />

              {/* Sort + Count + Export */}
              {loadError && (
                <div className="inbox-load-error">{loadError}</div>
              )}
              <div className="inbox-sort-bar">
                <span>
                  Showing {filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
                  {fetchResult != null && (
                    <span style={{ marginLeft: 8, color: 'var(--success, #22c55e)', fontSize: 11 }}>
                      {fetchResult.ingested > 0 ? `+${fetchResult.ingested} new` : 'Up to date'}
                    </span>
                  )}
                </span>
                <div className="inbox-sort-actions">
                  <button className="inbox-sort-btn" onClick={() => setSortAsc(a => !a)}>
                    {sortAsc ? 'Oldest first' : 'Newest first'}
                  </button>
                  <button className="inbox-sort-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>◀</button>
                  <button className="inbox-sort-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>▶</button>
                </div>
              </div>

              {/* Inquiry list */}
              <div className="inbox-list">
                {loading ? (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
                ) : filtered.length === 0 ? (
                  <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: 32 }}>📭</div>
                    <div style={{ marginTop: 8 }}>No inquiries in {activeTab}</div>
                  </div>
                ) : (
                  ['Today', 'Yesterday', 'Older'].map(group => grouped[group] && (
                    <div key={group}>
                      <div className="inbox-date-group">{group}</div>
                      {grouped[group].map(inq => {
                        const bodyPreview = compactEmailBodyText(inq.body).replace(/\s+/g, ' ')
                        const rowChips = getRowChips(inq)
                        const visibleChips = rowChips.slice(0, 3)
                        const overflowCount = rowChips.length - visibleChips.length
                        return (
                          <div key={inq.id}
                            className={`inbox-row ${selected?.id === inq.id ? 'selected' : ''} ${!inq.is_read ? 'unread' : ''}`}
                            onClick={() => selectInquiry(inq)}>
                            {selectionMode && (
                              <input type="checkbox" className="inbox-row-checkbox"
                                checked={bulkSelected.has(inq.id)}
                                onChange={e => toggleBulk(inq.id, e)}
                                onClick={e => e.stopPropagation()} />
                            )}
                            <div className={`inbox-row-color ${inq.color ? colorBarClass[inq.color] : ''}`} />
                            <div className="inbox-row-content">
                              <div className="inbox-row-headline">
                                <div className="inbox-row-sender">
                                  {!inq.is_read && <span className="unread-dot" />}
                                  {inq.sender}
                                </div>
                                <div className="inbox-row-head-actions">
                                  {inq.is_locked && <span className="inbox-row-lock-state">Locked</span>}
                                  <span className="inbox-row-time">{formatTime(inq.received_at)}</span>
                                </div>
                              </div>
                              <div className="inbox-row-subject">{inq.subject}</div>
                              <div className="inbox-row-meta-row">
                                {visibleChips.map(chip => (
                                  <span key={`${inq.id}-${chip.label}`} className={`inbox-row-chip inbox-row-chip-${chip.tone}`}>
                                    {chip.label}
                                  </span>
                                ))}
                                {overflowCount > 0 && <span className="inbox-row-chip inbox-row-chip-overflow">+{overflowCount} more</span>}
                              </div>
                              {bodyPreview && (
                                <div className="inbox-row-preview">{bodyPreview}</div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* ── RIGHT PANEL: Detail ── */}
            <div className="inbox-detail-panel">
              {!selected ? (
                <div className="inbox-detail-empty">
                  <div style={{ fontSize: 40 }}>📧</div>
                  <div>Select an inquiry to view details</div>
                </div>
              ) : (
                <>
                  <div className="color-picker-bar">
                    <div className="inbox-detail-primary-actions">
                      <button className="btn btn-primary inbox-toolbar-btn" onClick={openReply}>Reply</button>
                      <button className="btn btn-outline inbox-toolbar-btn" onClick={openForward}>Forward</button>
                      <button className="btn btn-outline inbox-toolbar-btn" onClick={openCreateCaseModal}>Create Case</button>
                      <button className="btn btn-outline inbox-toolbar-btn" onClick={openAppendCaseModal}>Append to Case</button>
                    </div>
                    <div className="inbox-detail-utility-group">
                      <button className="btn btn-outline inbox-toolbar-btn" onClick={() => setShowUtilityMenu(open => !open)}>
                        Utilities
                      </button>
                      {showUtilityMenu && (
                        <div className="inbox-utility-menu">
                          <span className="inbox-utility-label">Color tag</span>
                          <div className="inbox-color-options">
                            {COLORS.map(c => (
                              <button key={c} className={`color-dot ${dotClass[c]} ${selected.color === c ? 'active' : ''}`}
                                onClick={() => { setColor(selected.id, c); setSelected(s => ({ ...s, color: c })); setShowUtilityMenu(false) }}
                                title={c} />
                            ))}
                            <button className={`color-dot dot-none ${!selected.color ? 'active' : ''}`}
                              onClick={() => { setColor(selected.id, null); setSelected(s => ({ ...s, color: null })); setShowUtilityMenu(false) }}
                              title="Clear color" />
                          </div>
                          <button className="inbox-utility-action"
                            onClick={() => {
                              const newLocked = !selected.is_locked
                              if (selected.is_locked && selected.locked_by !== user?.name) return
                              const newLockedBy = newLocked ? user?.name : null
                              patchInquiry(selected.id, { is_locked: newLocked, locked_by: newLockedBy, color: newLocked ? selected.color : null })
                              updateInquiries(prev => prev.map(i =>
                                i.id === selected.id ? { ...i, is_locked: newLocked, locked_by: newLockedBy, color: newLocked ? i.color : null } : i
                              ))
                              setSelected(s => ({ ...s, is_locked: newLocked, locked_by: newLockedBy, color: newLocked ? s.color : null }))
                              setShowUtilityMenu(false)
                            }}
                            disabled={selected.is_locked && selected.locked_by !== user?.name}
                            title={selected.is_locked && selected.locked_by !== user?.name ? `Locked by ${selected.locked_by}` : ''}>
                            {selected.is_locked ? 'Unlock conversation' : 'Lock conversation'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Email detail header */}
                  <div className="inbox-detail-header">
                    <div className="inbox-detail-title-row">
                      <div className="inbox-detail-subject">{selected.subject}</div>
                      {renderAiChip(selected)}
                    </div>
                    <div className="inbox-detail-meta">
                      <div className="inbox-meta-inline-item">
                        <span className="meta-label">From</span>
                        <span className="meta-value" title={selected.sender}>{selected.sender}</span>
                      </div>
                      <div className="inbox-meta-inline-item">
                        <span className="meta-label">To</span>
                        <span className="meta-value" title={selected.recipient}>{selected.recipient}</span>
                      </div>
                      <div className="inbox-meta-inline-item">
                        <span className="meta-label">Received</span>
                        <span className="meta-value">{formatFullDate(selected.received_at)}</span>
                      </div>
                      <div className="inbox-meta-inline-item">
                        <span className="meta-label">Timezone</span>
                        <span className="meta-value">{TIMEZONE}</span>
                      </div>
                      <div className="inbox-meta-inline-item">
                        <span className="meta-label">Case</span>
                        <span className="meta-value">
                          {selected.case_id ? (
                            <button
                              className="inbox-inline-case-btn"
                              onClick={() => navigate(`/cases/${selected.case_id}`, { state: { from: '/inbox' } })}
                            >
                              Open Case #{selected.case_id}
                            </button>
                          ) : 'Not linked'}
                        </span>
                      </div>
                    </div>

                    <div className="inbox-detail-controls">
                      <div className="inbox-control-item">
                        <span className="meta-label">Assigned To</span>
                        <select className="meta-select"
                          value={selected.assigned_to || ''}
                          onChange={e => {
                            const v = e.target.value || null
                            patchInquiry(selected.id, { assigned_to: v })
                            updateInquiries(prev => prev.map(i => i.id === selected.id ? { ...i, assigned_to: v } : i))
                            setSelected(s => ({ ...s, assigned_to: v }))
                          }}>
                          <option value="">Unassigned</option>
                          {users.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                        </select>
                      </div>

                      <div className="inbox-control-item">
                        <span className="meta-label">Triage State</span>
                        <select className="meta-select"
                          value={selected.triage_state || 'new'}
                          onChange={e => {
                            const value = e.target.value
                            patchInquiry(selected.id, { triage_state: value })
                            updateInquiries(prev => prev.map(i => i.id === selected.id ? { ...i, triage_state: value } : i))
                            setSelected(s => ({ ...s, triage_state: value }))
                          }}>
                          {TRIAGE_STATES.map(state => <option key={state} value={state}>{state.replace(/_/g, ' ')}</option>)}
                        </select>
                      </div>

                      <div className="inbox-control-item">
                        <span className="meta-label">Queue</span>
                        <select className="meta-select"
                          value={selected.queue_name || ''}
                          onChange={e => {
                            const value = e.target.value || null
                            patchInquiry(selected.id, { queue_name: value })
                            updateInquiries(prev => prev.map(i => i.id === selected.id ? { ...i, queue_name: value } : i))
                            setSelected(s => ({ ...s, queue_name: value }))
                          }}>
                          <option value="">Select queue</option>
                          {queueOptions.map(queue => <option key={queue} value={queue}>{queue}</option>)}
                          {!queueOptions.includes('Medical Information') && <option value="Medical Information">Medical Information</option>}
                          {!queueOptions.includes('Safety') && <option value="Safety">Safety</option>}
                          {!queueOptions.includes('Quality') && <option value="Quality">Quality</option>}
                          {!queueOptions.includes('Regulatory') && <option value="Regulatory">Regulatory</option>}
                        </select>
                      </div>

                      <div className="inbox-control-item">
                        <span className="meta-label">Due Date</span>
                        <div className="inbox-due-date-control">
                          <input type="date" className="meta-date-input"
                            value={selected.due_date ? selected.due_date.slice(0, 10) : ''}
                            onChange={e => {
                              const v = e.target.value || null
                              patchInquiry(selected.id, { due_date: v })
                              updateInquiries(prev => prev.map(i => i.id === selected.id ? { ...i, due_date: v } : i))
                              setSelected(s => ({ ...s, due_date: v }))
                            }} />
                          {dueDateStatus(selected.due_date) === 'overdue' && <span className="due-badge due-overdue">Overdue</span>}
                          {dueDateStatus(selected.due_date) === 'today'   && <span className="due-badge due-today">Due Today</span>}
                        </div>
                      </div>

                      <div className="inbox-control-item">
                        <span className="meta-label">Priority</span>
                        <div className="priority-picker">
                          {PRIORITIES.map(p => (
                            <button key={p}
                              className={`priority-btn priority-${p} ${selected.priority === p ? 'active' : ''}`}
                              onClick={() => {
                                const v = selected.priority === p ? null : p
                                patchInquiry(selected.id, { priority: v })
                                updateInquiries(prev => prev.map(i => i.id === selected.id ? { ...i, priority: v } : i))
                                setSelected(s => ({ ...s, priority: v }))
                              }}>
                              {PRIORITY_ICON[p]} {p.charAt(0).toUpperCase() + p.slice(1)}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="inbox-sla-actions-row">
                      <div className="inbox-sla-strip">
                        {/* H2 FIX: use slaClass() so on_track/met don't show yellow due-today badge */}
                        <span className={`due-badge ${slaClass(selected.first_touch_sla_status)}`}>
                          First Touch: {selected.first_touch_sla_status || 'untracked'}
                        </span>
                        {selected.first_touch_due_at && (
                          <span className="inbox-sla-time">due {formatFullDate(selected.first_touch_due_at)}</span>
                        )}
                        <span className={`due-badge ${slaClass(selected.response_sla_status)}`}>
                          Response: {selected.response_sla_status || 'untracked'}
                        </span>
                        {selected.response_due_at && (
                          <span className="inbox-sla-time">due {formatFullDate(selected.response_due_at)}</span>
                        )}
                        <span className="inbox-sla-read-summary">{formatReadReceiptSummary(selected)}</span>
                      </div>
                      <div className="inbox-insight-toolbar">
                        <button
                          className={`inbox-insight-btn ${insightPanel === 'notes' ? 'active' : ''}`}
                          onClick={() => setInsightPanel(p => p === 'notes' ? null : 'notes')}
                        >
                          📝 Internal Notes {notes.length > 0 ? `(${notes.length})` : ''}
                        </button>
                        <button
                          className={`inbox-insight-btn ${insightPanel === 'history' ? 'active' : ''}`}
                          onClick={() => setInsightPanel(p => p === 'history' ? null : 'history')}
                        >
                          📇 Sender & Case History
                        </button>
                        <button
                          className={`inbox-insight-btn ${insightPanel === 'recommendations' ? 'active' : ''}`}
                          onClick={() => setInsightPanel(p => p === 'recommendations' ? null : 'recommendations')}
                        >
                          🔎 Inbox-to-Case Recos ({recommendations.length})
                        </button>
                        <button
                          className={`inbox-insight-btn ${insightPanel === 'receipts' ? 'active' : ''}`}
                          onClick={() => setInsightPanel(p => p === 'receipts' ? null : 'receipts')}
                        >
                          👁 Read Receipts ({selected.read_receipt_count || 0})
                        </button>
                      </div>
                    </div>

                    {selected.attachments_count > 0 && (
                      <div className="inbox-attachments-row">
                        <span className="meta-label">Attachments</span>
                        {/* H5 FIX: use attachmentsLoading flag — prevents "Loading…" forever on error */}
                        {attachmentsLoading ? (
                          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Loading…</span>
                        ) : attachments.length === 0 ? (
                          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>No attachments found.</span>
                        ) : (
                          <div className="inbox-attachment-list">
                            {attachments.map(att => (
                              <button key={att.id}
                                onClick={async () => {
                                  const r = await httpFetch(`/api/inbox/attachments/${att.id}/download`, { headers: AUTH_H })
                                  if (!r.ok) return
                                  const blob = await r.blob()
                                  const url = URL.createObjectURL(blob)
                                  const a = document.createElement('a'); a.href = url; a.download = att.filename; a.click()
                                  URL.revokeObjectURL(url)
                                }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4, padding: 0 }}>
                                📎 {att.filename}
                                {att.size_bytes > 0 && (
                                  <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>({(att.size_bytes / 1024).toFixed(1)} KB)</span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                  <div className="inbox-reading-canvas">
                    <EmailBody body={selected.body} />
                  </div>

                  {insightPanel && (
                    <button className="inbox-side-drawer-backdrop" onClick={() => setInsightPanel(null)} aria-label="Close panel" />
                  )}
                  <aside className={`inbox-side-drawer ${insightPanel ? 'open' : ''}`} aria-hidden={!insightPanel}>
                    <div className="inbox-side-drawer-header">
                      <span>
                        {insightPanel === 'notes' && '📝 Internal Notes'}
                        {insightPanel === 'history' && '📇 Sender and Case History'}
                        {insightPanel === 'recommendations' && `🔎 Inbox-to-Case Recommendations (${recommendations.length})`}
                        {insightPanel === 'receipts' && `👁 Read Receipts (${readReceipts.length})`}
                      </span>
                      <button className="compose-close" onClick={() => setInsightPanel(null)}>✕</button>
                    </div>
                    <div className="inbox-side-drawer-body">
                      {insightPanel === 'notes' && (
                        <>
                          {notesLoading ? (
                            <div className="notes-loading">Loading notes…</div>
                          ) : (
                            <>
                              {notes.length === 0 && <div className="notes-empty">No notes yet.</div>}
                              {notes.map((n, idx) => (
                                <div key={idx} className="note-item">
                                  <div className="note-meta">{n.user_name} · {formatFullDate(n.created_at)}</div>
                                  <div className="note-body">{n.note}</div>
                                </div>
                              ))}
                              <div className="note-add">
                                <textarea className="note-input" rows={3} placeholder="Add internal note…"
                                  value={newNote} onChange={e => setNewNote(e.target.value)}
                                  disabled={savingNote} />
                                <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 10px' }}
                                  onClick={submitNote} disabled={savingNote || !newNote.trim()}>
                                  {savingNote ? 'Saving…' : 'Add Note'}
                                </button>
                              </div>
                            </>
                          )}
                        </>
                      )}

                      {insightPanel === 'history' && (
                        <>
                          {historyLoading ? (
                            <div className="notes-loading">Loading history…</div>
                          ) : (
                            <>
                              <div className="notes-empty" style={{ marginBottom: 8 }}>
                                {senderHistory.previous_inquiry_count || 0} prior inquiries • {senderHistory.linked_case_count || 0} linked cases
                              </div>
                              {senderHistory.previous_inquiries.map(item => (
                                <div key={item.id} className="note-item">
                                  <div className="note-meta">{formatFullDate(item.received_at)} · {item.triage_state || item.status}</div>
                                  <div className="note-body">{item.subject || '(No subject)'}</div>
                                </div>
                              ))}
                              {senderHistory.linked_cases.map(caseItem => (
                                <button
                                  key={caseItem.id}
                                  className="btn btn-outline"
                                  style={{ fontSize: 12, marginTop: 6, marginRight: 6 }}
                                  onClick={() => navigate(`/cases/${caseItem.id}`, { state: { from: '/inbox' } })}
                                >
                                  {caseItem.case_number || `Case #${caseItem.id}`} · {caseItem.case_type || '—'} · {caseItem.status_name || '—'}
                                </button>
                              ))}
                              {senderHistory.previous_inquiries.length === 0 && senderHistory.linked_cases.length === 0 && (
                                <div className="notes-empty">No prior sender history found.</div>
                              )}
                            </>
                          )}
                        </>
                      )}

                      {insightPanel === 'recommendations' && (
                        <div className="thread-list">
                          {recommendationsLoading && <div className="notes-loading">Loading recommendations…</div>}
                          {!recommendationsLoading && recommendations.length === 0 && <div className="notes-empty">No strong case recommendations yet.</div>}
                          {!recommendationsLoading && recommendations.map(item => (
                            <div key={item.id} className="thread-item">
                              <div className="thread-item-header">
                                <span className="thread-source">{item.recommendation}</span>
                                <span className="thread-time">{item.confidence}</span>
                              </div>
                              <div className="thread-item-meta">{item.case_number || `Case #${item.id}`} · {item.case_type || '—'} · {item.status_name || '—'}</div>
                              <div className="thread-item-body">
                                Reporter match: {item.reporter_match} • Sender match: {item.sender_match} • Case number match: {item.case_number_match}
                              </div>
                              <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => appendToExistingCase(item.id)}>
                                  Link This Case
                                </button>
                                <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => navigate(`/cases/${item.id}`, { state: { from: '/inbox' } })}>
                                  Open Case
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {insightPanel === 'receipts' && (
                        <>
                          {readReceiptsLoading && <div className="notes-loading">Loading read receipts…</div>}
                          {!readReceiptsLoading && readReceipts.length === 0 && (
                            <div className="notes-empty">
                              {selected.is_read ? 'No per-user receipts recorded yet. This item may predate the new receipt model.' : 'No one has opened this inquiry yet.'}
                            </div>
                          )}
                          {!readReceiptsLoading && readReceipts.map((receipt) => (
                            <div key={`${receipt.user_id}-${receipt.read_at || receipt.last_viewed_at || 'na'}`} className="note-item">
                              <div className="note-meta">
                                {receipt.user_name || receipt.email || `User #${receipt.user_id}`} · first read {formatFullDate(receipt.read_at || receipt.last_viewed_at)}
                              </div>
                              <div className="note-body">
                                Last viewed {formatFullDate(receipt.last_viewed_at || receipt.read_at)}
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  </aside>
                </>
              )}
            </div>
          </div>
        </div>

      {showSaveViewModal && (
        <div className="compose-overlay" onClick={() => setShowSaveViewModal(false)}>
          <div className="compose-modal inbox-save-view-modal" onClick={e => e.stopPropagation()}>
            <div className="compose-modal-header">
              <span>Save current view</span>
              <button className="compose-close" onClick={() => setShowSaveViewModal(false)}>✕</button>
            </div>
            <div className="compose-modal-body">
              <div className="compose-field">
                <label>View name</label>
                <input
                  type="text"
                  value={saveViewName}
                  onChange={e => setSaveViewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && saveViewName.trim()) void saveViewAndClose() }}
                  placeholder="For example: Safety queue overdue"
                />
              </div>
              <div className="notes-empty" style={{ paddingTop: 0 }}>
                This stores the current search, date range, tenant, and advanced filters.
              </div>
            </div>
            <div className="compose-modal-footer">
              <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={() => void saveViewAndClose()} disabled={!saveViewName.trim()}>
                Save view
              </button>
              <button className="btn btn-outline" style={{ fontSize: 13 }} onClick={() => setShowSaveViewModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Compose Modal (Reply / Forward) ── */}
      {compose && (
        <div className="compose-overlay" onClick={() => !compose.sending && setCompose(null)}>
          <div className="compose-modal" onClick={e => e.stopPropagation()}>
            <div className="compose-modal-header">
              <span>{compose.mode === 'reply' ? '↩ Reply' : '↗ Forward'}</span>
              <button className="compose-close" onClick={() => !compose.sending && setCompose(null)}>✕</button>
            </div>
            <div className="compose-modal-body">
              <div className="compose-field">
                <label>To</label>
                <input type="email" value={compose.to}
                  onChange={e => setCompose(c => ({ ...c, to: e.target.value }))}
                  disabled={compose.sending} placeholder="recipient@example.com" />
              </div>
              <div className="compose-field">
                <label>Subject</label>
                <input type="text" value={compose.subject}
                  onChange={e => setCompose(c => ({ ...c, subject: e.target.value }))}
                  disabled={compose.sending} />
              </div>
              {/* F3: Reply templates */}
              {templates.length > 0 && (
                <div className="compose-field">
                  <label>Template</label>
                  <select className="compose-template-select" defaultValue=""
                    onChange={e => {
                      const tpl = templates.find(t => t.id === Number(e.target.value))
                      if (tpl) {
                        setCompose(c => ({
                          ...c,
                          body: tpl.body,
                          subject: tpl.subject || c.subject,
                        }))
                      }
                      e.target.value = ''
                    }}
                    disabled={compose.sending}>
                    <option value="">— Select template —</option>
                    {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}
              <div className="compose-field compose-field-body">
                <label>Message</label>
                <textarea value={compose.body}
                  onChange={e => setCompose(c => ({ ...c, body: e.target.value }))}
                  disabled={compose.sending} rows={10} />
              </div>
              {compose.error && <div className="compose-error">{compose.error}</div>}
            </div>
            <div className="compose-modal-footer">
              <button className="btn btn-primary" style={{ fontSize: 13 }}
                onClick={sendCompose} disabled={compose.sending || !compose.to || !compose.subject}>
                {compose.sending ? 'Sending…' : (compose.mode === 'reply' ? '↩ Send Reply' : '↗ Send Forward')}
              </button>
              <button className="btn btn-outline" style={{ fontSize: 13 }}
                onClick={() => setCompose(null)} disabled={compose.sending}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Case Modal (Create / Append) ── */}
      {caseFlow.open && selected && (
        <div className="compose-overlay" onClick={() => !caseFlow.actionBusy && setCaseFlow(prev => ({ ...prev, open: false }))}>
          <div className="compose-modal" onClick={e => e.stopPropagation()}>
            <div className="compose-modal-header">
              <span>{caseFlow.mode === 'create' ? '＋ Create Case from Email' : '🔗 Append Email to Existing Case'}</span>
              <button className="compose-close" onClick={() => !caseFlow.actionBusy && setCaseFlow(prev => ({ ...prev, open: false }))}>✕</button>
            </div>
            <div className="compose-modal-body">
              {caseFlow.mode === 'create' ? (
                <>
                  <div className="compose-field">
                    <label>Case Type</label>
                    <select
                      value={caseFlow.caseType}
                      onChange={e => setCaseFlow(prev => ({ ...prev, caseType: e.target.value }))}
                      disabled={caseFlow.actionBusy}
                    >
                      <option value="MI">MI</option>
                      <option value="AE">AE</option>
                      <option value="PC">PC</option>
                    </select>
                  </div>
                  <div className="compose-field">
                    <label>Source Email</label>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {selected.subject || '(No subject)'} from {selected.sender}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="compose-field">
                    <label>Append by Case Number</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="text"
                        placeholder="Enter exact case number"
                        value={caseFlow.caseNumber}
                        onChange={e => setCaseFlow(prev => ({ ...prev, caseNumber: e.target.value }))}
                        disabled={caseFlow.searching || caseFlow.actionBusy}
                      />
                      <button
                        className="btn btn-primary"
                        type="button"
                        onClick={appendByCaseNumber}
                        disabled={caseFlow.searching || caseFlow.actionBusy}
                      >
                        {caseFlow.searching ? 'Searching…' : 'Proceed'}
                      </button>
                    </div>
                  </div>
                  <div className="compose-field">
                    <label>Search Case</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="text"
                        placeholder="Case number or description"
                        value={caseFlow.search}
                        onChange={e => setCaseFlow(prev => ({ ...prev, search: e.target.value }))}
                        disabled={caseFlow.searching || caseFlow.actionBusy}
                      />
                      <button
                        className="btn btn-outline"
                        type="button"
                        onClick={() => searchCases(caseFlow.search)}
                        disabled={caseFlow.searching || caseFlow.actionBusy}
                      >
                        {caseFlow.searching ? 'Searching…' : 'Search'}
                      </button>
                    </div>
                  </div>
                  <div className="compose-field" style={{ maxHeight: 220, overflowY: 'auto' }}>
                    {caseFlow.results.length === 0 ? (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {caseFlow.searching ? 'Searching cases…' : 'No cases found.'}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {caseFlow.results.map(c => (
                          <button
                            key={c.id}
                            type="button"
                            className="btn btn-outline"
                            style={{ fontSize: 12, textAlign: 'left', padding: '8px 10px' }}
                            onClick={() => appendToExistingCase(c.id)}
                            disabled={caseFlow.actionBusy}
                          >
                            <strong>{c.case_number || `Case #${c.id}`}</strong> · {c.case_type || '-'} · {c.status_name || '-'}
                            <div style={{ color: 'var(--text-muted)' }}>{(c.description || '').slice(0, 100) || 'No description'}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
              {caseFlow.actionError && <div className="compose-error">{caseFlow.actionError}</div>}
            </div>
            <div className="compose-modal-footer">
              {caseFlow.mode === 'create' ? (
                <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={createCaseFromInquiry} disabled={caseFlow.actionBusy}>
                  {caseFlow.actionBusy ? 'Creating…' : 'Create and Open Case'}
                </button>
              ) : (
                <button className="btn btn-outline" style={{ fontSize: 13 }} disabled>
                  Select a case from above to append
                </button>
              )}
              <button
                className="btn btn-outline"
                style={{ fontSize: 13 }}
                onClick={() => setCaseFlow(prev => ({ ...prev, open: false }))}
                disabled={caseFlow.actionBusy}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </MIMSLayout>
  )
}
