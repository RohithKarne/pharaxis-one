/**
 * InboxPage.jsx — Inbox Module
 * Phase 1: F6 (body search), F7 (date range), F10 (read/unread), F13 (bulk), F14 (CSV export)
 * Phase 2: F1 (assign), F2 (priority), F3 (templates), F4 (due date), F5 (notes),
 *          F8 (advanced filters), F9 (saved views), F12 (reply thread)
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../../shared/context/AuthContext'
import MIMSLayout from '../../../shared/components/MIMSLayout'
import { httpFetch } from '../../../shared/api/httpFetch.js'

const PAGE_SIZE = 50
const TABS = ['Inbox', 'Pending', 'Processed', 'Non-Processed', 'Outbox']
const TAB_STATUS = { Outbox: 'outbox' }
const COLORS = ['red', 'yellow', 'green', 'blue']
const PRIORITIES = ['high', 'medium', 'low']
const TRIAGE_STATES = ['new', 'in_review', 'linked', 'converted', 'no_action', 'closed']
const PRIORITY_ICON = { high: '🔴', medium: '🟡', low: '🟢' }
const TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone
const EMAIL_URL_PATTERN = /<?https?:\/\/[^\s<>]+>?/gi

function normalizeEmailUrl(rawUrl) {
  let href = String(rawUrl || '').trim()
  let suffix = ''

  if (href.startsWith('<')) href = href.slice(1)
  if (href.endsWith('>')) href = href.slice(0, -1)

  while (/[.,;:!?)]$/.test(href)) {
    suffix = href.slice(-1) + suffix
    href = href.slice(0, -1)
  }

  return { href, suffix }
}

function getEmailLinkLabel(href) {
  try {
    const url = new URL(href)
    const host = url.hostname.replace(/^www\./, '')
    return `${host} link`
  } catch {
    return 'email link'
  }
}

function compactEmailBodyText(body) {
  const urlPattern = new RegExp(EMAIL_URL_PATTERN.source, 'gi')
  return normalizeEmailBodyText(body)
    .replace(/\r\n/g, '\n')
    .replace(urlPattern, rawUrl => {
      const { href, suffix } = normalizeEmailUrl(rawUrl)
      return ` [${getEmailLinkLabel(href)}]${suffix}`
    })
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function decodeEmailEntities(text) {
  if (typeof document === 'undefined') return String(text || '')
  const el = document.createElement('textarea')
  el.innerHTML = String(text || '')
  return el.value
}

function normalizeEmailBodyText(body) {
  return decodeEmailEntities(body)
    .replace(/=\r?\n/g, '')
    .replace(/=3D/gi, '=')
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n/g, '\n')
}

function renderEmailBodySegments(text) {
  const urlPattern = new RegExp(EMAIL_URL_PATTERN.source, 'gi')
  const segments = []
  let lastIndex = 0

  for (const match of text.matchAll(urlPattern)) {
    const rawUrl = match[0]
    const matchIndex = match.index ?? 0
    if (matchIndex > lastIndex) {
      segments.push(text.slice(lastIndex, matchIndex))
    }

    const { href, suffix } = normalizeEmailUrl(rawUrl)
    segments.push(
      <a
        key={`email-link-${matchIndex}`}
        className="email-body-link"
        href={href}
        target="_blank"
        rel="noreferrer"
        title={href}
      >
        {getEmailLinkLabel(href)}
      </a>
    )
    if (suffix) segments.push(suffix)
    lastIndex = matchIndex + rawUrl.length
  }

  if (lastIndex < text.length) {
    segments.push(text.slice(lastIndex))
  }

  return segments
}

function EmailBody({ body }) {
  const normalized = normalizeEmailBodyText(body)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{3,}/g, ' ')
    .trim()

  if (!normalized) {
    return <div className="inbox-detail-body inbox-detail-body-empty">No email body available.</div>
  }

  const blocks = normalized.split(/\n{2,}/).map(block => block.trim()).filter(Boolean)

  return (
    <div className="inbox-detail-body">
      {blocks.map((block, index) => (
        <p key={`email-body-block-${index}`} className="email-body-paragraph">
          {renderEmailBodySegments(block.replace(/\n/g, ' '))}
        </p>
      ))}
    </div>
  )
}

export default function InboxPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, siteId, orgId, allOrgs } = useAuth()

  const STORAGE_KEY = `mims_inbox_${user?.id || 'guest'}`
  const VIEWS_KEY   = `mims_inbox_views_${user?.id || 'guest'}`
  const DENSITY_KEY = `mims_inbox_density_${user?.id || 'guest'}`

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
  const [savedViews, setSavedViews]         = useState([])   // F9
  const [saveViewName, setSaveViewName]     = useState('')
  const [notes, setNotes]                   = useState([])   // F5
  const [newNote, setNewNote]               = useState('')
  const [notesLoading, setNotesLoading]     = useState(false)
  const [savingNote, setSavingNote]         = useState(false)
  const [insightPanel, setInsightPanel] = useState(null) // notes | history | recommendations | receipts | null
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

  const AUTH_H = useMemo(
    () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('mims_token')}` }),
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

  useEffect(() => {
    try { setSavedViews(JSON.parse(localStorage.getItem(VIEWS_KEY) || '[]')) } catch { /* ignore */ }
  }, [VIEWS_KEY])

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

  function toggleLock(id, e) {
    e.stopPropagation()
    updateInquiries(prev => prev.map(inq => {
      if (inq.id !== id) return inq
      if (inq.locked_by && inq.locked_by !== user?.name) return inq
      const newLocked = !inq.is_locked
      const newLockedBy = newLocked ? user?.name : null
      patchInquiry(id, { is_locked: newLocked, locked_by: newLockedBy, color: newLocked ? inq.color : null })
      return { ...inq, is_locked: newLocked, locked_by: newLockedBy, color: newLocked ? inq.color : null }
    }))
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

  // ── Saved Views (F9) ──────────────────────────────────────────

  function saveCurrentView(name) {
    if (!name.trim()) return
    const view = { name: name.trim(), search, filterFrom, filterTo, tenantFilterOrgId, advFilters }
    const next = [...savedViews.filter(v => v.name !== name.trim()), view].slice(-5)
    setSavedViews(next)
    localStorage.setItem(VIEWS_KEY, JSON.stringify(next))
  }

  function applyView(view) {
    setSearch(view.search || '')
    setFilterFrom(view.filterFrom || '')
    setFilterTo(view.filterTo || '')
    setTenantFilterOrgId(view.tenantFilterOrgId || '')
    setAdvFilters(view.advFilters || { color: '', priority: '', readStatus: '', isLocked: '', assignee: '', triageState: '', queueName: '', firstTouchSla: '', responseSla: '' })
    setPage(1)
  }

  function deleteView(idx) {
    const next = savedViews.filter((_, i) => i !== idx)
    setSavedViews(next)
    localStorage.setItem(VIEWS_KEY, JSON.stringify(next))
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
  function renderAiChip(inquiry) {
    const type = String(inquiry?.ai_suggested_type || '').toUpperCase()
    if (!type) return null
    let payload = inquiry.ai_suggested_payload
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload) } catch { payload = {} }
    }
    const urgency = payload?.urgency ? ` / ${payload.urgency}` : ''
    return <span className="ai-inbox-chip">AI: {type}{urgency}</span>
  }

  // H2 FIX: map all SLA statuses to correct badge classes instead of defaulting everything to yellow
  function slaClass(status) {
    if (status === 'breached') return 'due-overdue'
    if (status === 'at_risk')  return 'due-today'
    return ''
  }

  // ── Render ────────────────────────────────────────────────────

  return (
    <MIMSLayout>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className={`inbox-wrapper ${compactMode ? 'compact-mode' : 'comfort-mode'}`}>

            {/* ── LEFT PANEL: List ── */}
            <div className="inbox-list-panel">

              {/* Tabs */}
              <div className="inbox-tabs">
                {TABS.map(tab => (
                  <button key={tab} className={`inbox-tab ${activeTab === tab ? 'active' : ''}`}
                    onClick={() => { setActiveTab(tab); setPage(1); setSelected(null) }}>
                    {tab}
                    {tabCounts[tab] > 0 && <span className="inbox-tab-count">{tabCounts[tab]}</span>}
                  </button>
                ))}
              </div>

              <div className="inbox-layout-controls">
                <div className="inbox-density-switch" role="group" aria-label="Inbox density">
                  <button
                    className={`density-option ${compactMode ? 'active' : ''}`}
                    onClick={() => setCompactMode(true)}
                  >
                    Compact
                  </button>
                  <button
                    className={`density-option ${!compactMode ? 'active' : ''}`}
                    onClick={() => setCompactMode(false)}
                  >
                    Comfort
                  </button>
                </div>
              </div>

              {/* F9: Saved Views chips */}
              {savedViews.length > 0 && (
                <div className="saved-views-bar">
                  {savedViews.map((v, idx) => (
                    <span key={idx} className="saved-view-chip">
                      <button className="chip-label" onClick={() => applyView(v)}>{v.name}</button>
                      <button className="chip-delete" onClick={() => deleteView(idx)}>✕</button>
                    </span>
                  ))}
                </div>
              )}

              {/* Search (F6) */}
              <div className="inbox-search-bar">
                <input type="text" placeholder="Search sender, subject or body..."
                  value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
              </div>

              {/* Date range filter (F7) */}
              <div className="inbox-date-filter">
                {tenantOptions.length > 0 && (
                  <>
                    <span className="date-filter-label">Tenant</span>
                    <select
                      value={tenantFilterOrgId}
                      onChange={e => { setTenantFilterOrgId(e.target.value); setPage(1) }}
                      className="inbox-tenant-select"
                    >
                      <option value="">All Assigned Tenants</option>
                      {tenantOptions.map(org => (
                        <option key={org.id} value={String(org.id)}>{org.name}</option>
                      ))}
                    </select>
                  </>
                )}
                <span className="date-filter-label">From</span>
                <input type="date" value={filterFrom}
                  onChange={e => { setFilterFrom(e.target.value); setPage(1) }} />
                <span className="date-filter-label">To</span>
                <input type="date" value={filterTo}
                  onChange={e => { setFilterTo(e.target.value); setPage(1) }} />
                {(filterFrom || filterTo) && (
                  <button className="inbox-sort-btn" onClick={() => { setFilterFrom(''); setFilterTo('') }}>✕</button>
                )}
              </div>

              {/* F8: Advanced filter toggle + panel */}
              <div className="inbox-adv-filter-toggle">
                <button className={`inbox-sort-btn ${hasAdvFilters ? 'adv-active' : ''}`}
                  onClick={() => setShowAdvFilters(a => !a)}>
                  🔍 Filters {hasAdvFilters ? '●' : (showAdvFilters ? '▾' : '▸')}
                </button>
                {hasAdvFilters && (
                  <button className="inbox-sort-btn" style={{ fontSize: 11 }}
                    onClick={() => setAdvFilters({ color: '', priority: '', readStatus: '', isLocked: '', assignee: '', triageState: '', queueName: '', firstTouchSla: '', responseSla: '' })}>
                    Clear
                  </button>
                )}
              </div>

              {showAdvFilters && (
                <div className="inbox-adv-filter-panel">
                  <div className="adv-filter-row">
                    <select value={advFilters.color}
                      onChange={e => { setAdvFilters(f => ({ ...f, color: e.target.value })); setPage(1) }}>
                      <option value="">All Colors</option>
                      {COLORS.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                    </select>
                    <select value={advFilters.priority}
                      onChange={e => { setAdvFilters(f => ({ ...f, priority: e.target.value })); setPage(1) }}>
                      <option value="">All Priorities</option>
                      {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_ICON[p]} {p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                    </select>
                    <select value={advFilters.readStatus}
                      onChange={e => { setAdvFilters(f => ({ ...f, readStatus: e.target.value })); setPage(1) }}>
                      <option value="">All Read Status</option>
                      <option value="unread">Unread</option>
                      <option value="read">Read</option>
                    </select>
                    <select value={advFilters.isLocked}
                      onChange={e => { setAdvFilters(f => ({ ...f, isLocked: e.target.value })); setPage(1) }}>
                      <option value="">All Lock Status</option>
                      <option value="locked">Locked</option>
                      <option value="unlocked">Unlocked</option>
                    </select>
                    <select value={advFilters.assignee}
                      onChange={e => { setAdvFilters(f => ({ ...f, assignee: e.target.value })); setPage(1) }}>
                      <option value="">All Assignees</option>
                      <option value="__UNASSIGNED__">Unassigned</option>
                      {users.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                    </select>
                    <select value={advFilters.triageState}
                      onChange={e => { setAdvFilters(f => ({ ...f, triageState: e.target.value })); setPage(1) }}>
                      <option value="">All Triage States</option>
                      {TRIAGE_STATES.map(state => <option key={state} value={state}>{state.replace(/_/g, ' ')}</option>)}
                    </select>
                    <select value={advFilters.queueName}
                      onChange={e => { setAdvFilters(f => ({ ...f, queueName: e.target.value })); setPage(1) }}>
                      <option value="">All Queues</option>
                      {queueOptions.map(queue => <option key={queue} value={queue}>{queue}</option>)}
                    </select>
                    <select value={advFilters.firstTouchSla}
                      onChange={e => { setAdvFilters(f => ({ ...f, firstTouchSla: e.target.value })); setPage(1) }}>
                      <option value="">First Touch SLA</option>
                      <option value="breached">Breached</option>
                      <option value="at_risk">At Risk</option>
                      <option value="on_track">On Track</option>
                      <option value="met">Met</option>
                    </select>
                    <select value={advFilters.responseSla}
                      onChange={e => { setAdvFilters(f => ({ ...f, responseSla: e.target.value })); setPage(1) }}>
                      <option value="">Response SLA</option>
                      <option value="breached">Breached</option>
                      <option value="at_risk">At Risk</option>
                      <option value="on_track">On Track</option>
                      <option value="met">Met</option>
                    </select>
                  </div>
                  {/* F9: Save current view */}
                  <div className="adv-save-view-row">
                    <input className="save-view-input" placeholder="Name this view…"
                      value={saveViewName} onChange={e => setSaveViewName(e.target.value)} />
                    <button className="inbox-sort-btn"
                      disabled={!saveViewName.trim() || savedViews.length >= 5}
                      onClick={() => { saveCurrentView(saveViewName); setSaveViewName('') }}>
                      Save View
                    </button>
                  </div>
                </div>
              )}

              {/* Bulk action bar (F13) */}
              {bulkSelected.size > 0 && (
                <div className="inbox-bulk-bar">
                  <span className="bulk-count">{bulkSelected.size} selected</span>
                  <select value={bulkTriageState} onChange={e => setBulkTriageState(e.target.value)} className="meta-select" style={{ minWidth: 130 }}>
                    <option value="">Triage State</option>
                    {TRIAGE_STATES.map(state => <option key={state} value={state}>{state.replace(/_/g, ' ')}</option>)}
                  </select>
                  <select value={bulkAssignee} onChange={e => setBulkAssignee(e.target.value)} className="meta-select" style={{ minWidth: 140 }}>
                    <option value="">Assign To</option>
                    <option value="__UNASSIGNED__">Unassigned</option>
                    {users.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                  </select>
                  <select value={bulkPriority} onChange={e => setBulkPriority(e.target.value)} className="meta-select" style={{ minWidth: 120 }}>
                    <option value="">Priority</option>
                    {PRIORITIES.map(priority => <option key={priority} value={priority}>{priority}</option>)}
                  </select>
                  <input type="date" value={bulkSnoozeUntil} onChange={e => setBulkSnoozeUntil(e.target.value)} className="meta-date-input" />
                  <button className="inbox-sort-btn" onClick={() => applyBulkUpdates()}>Apply</button>
                  <button className="inbox-sort-btn" onClick={() => applyBulkUpdates({ status: 'processed', triage_state: 'closed', closed_at: new Date().toISOString() })}>Close</button>
                  <button className="inbox-sort-btn" onClick={() => setBulkSelected(new Set())}>Cancel</button>
                </div>
              )}

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
                  <button className="inbox-sort-btn" onClick={fetchEmails} disabled={fetching || loading}>
                    {fetching ? 'Fetching…' : '⬇ Fetch'}
                  </button>
                  <button className="inbox-sort-btn" onClick={exportCSV} title="Export current view to CSV">⬇ CSV</button>
                  <button className="inbox-sort-btn" onClick={() => setSortAsc(a => !a)}>
                    Sort: {sortAsc ? '↑ Oldest' : '↓ Newest'}
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
                        const dueStatus = dueDateStatus(inq.due_date)
                        const bodyPreview = compactEmailBodyText(inq.body).replace(/\s+/g, ' ')
                        return (
                          <div key={inq.id}
                            className={`inbox-row ${selected?.id === inq.id ? 'selected' : ''} ${!inq.is_read ? 'unread' : ''}`}
                            onClick={() => selectInquiry(inq)}>
                            {/* Bulk checkbox (F13) */}
                            <input type="checkbox" className="inbox-row-checkbox"
                              checked={bulkSelected.has(inq.id)}
                              onChange={e => toggleBulk(inq.id, e)}
                              onClick={e => e.stopPropagation()} />
                            {/* Color bar */}
                            <div className={`inbox-row-color ${inq.color ? colorBarClass[inq.color] : ''}`} />
                            <div className="inbox-row-content">
                              <div className="inbox-row-headline">
                                <div className="inbox-row-sender">
                                  {!inq.is_read && <span className="unread-dot" />}
                                  {inq.priority && (
                                    <span className={`priority-dot priority-dot-${inq.priority}`}>
                                      {PRIORITY_ICON[inq.priority]}
                                    </span>
                                  )}
                                  {inq.sender}
                                </div>
                                <div className="inbox-row-head-actions">
                                  <button
                                    className={`inbox-lock-btn ${inq.is_locked ? 'locked' : ''}`}
                                    onClick={e => toggleLock(inq.id, e)}
                                    title={inq.is_locked ? 'Unlock' : 'Lock'}
                                  >
                                    {inq.is_locked ? '🔒' : '🔓'}
                                  </button>
                                  <span className="inbox-row-time">{formatTime(inq.received_at)}</span>
                                </div>
                              </div>
                              <div className="inbox-row-subject">{inq.subject}</div>
                              <div className="inbox-row-meta-row">
                                {inq.assigned_to && (
                                  <span className="assignee-tag">👤 {inq.assigned_to}</span>
                                )}
                                {inq.queue_name && <span className="assignee-tag">📥 {inq.queue_name}</span>}
                                {renderAiChip(inq)}
                                {inq.triage_state && <span className="assignee-tag">Workflow: {inq.triage_state.replace(/_/g, ' ')}</span>}
                                {dueStatus === 'overdue' && <span className="due-chip due-overdue-chip">⏰ Overdue</span>}
                                {dueStatus === 'today'   && <span className="due-chip due-today-chip">⏰ Due Today</span>}
                                {inq.first_touch_sla_status === 'breached' && !inq.first_touched_at && <span className="due-chip due-overdue-chip">First Touch SLA</span>}
                                {inq.response_sla_status === 'breached' && inq.first_touched_at && !inq.first_response_at && <span className="due-chip due-overdue-chip">Response SLA</span>}
                              </div>
                              {!compactMode && bodyPreview && (
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
                  {/* Color picker */}
                  <div className="color-picker-bar">
                    <span className="picker-label">Color:</span>
                    {COLORS.map(c => (
                      <div key={c} className={`color-dot ${dotClass[c]} ${selected.color === c ? 'active' : ''}`}
                        onClick={() => { setColor(selected.id, c); setSelected(s => ({ ...s, color: c })) }}
                        title={c} />
                    ))}
                    <div className={`color-dot dot-none ${!selected.color ? 'active' : ''}`}
                      onClick={() => { setColor(selected.id, null); setSelected(s => ({ ...s, color: null })) }}
                      title="Clear color" />
                  </div>

                  {/* Email detail header */}
                  <div className="inbox-detail-header">
                    <div className="inbox-detail-subject">{selected.subject}</div>
                    {renderAiChip(selected)}
                    <div className="inbox-timezone-note">Dates displayed in {TIMEZONE}</div>
                    <div className="inbox-detail-meta">
                      <div className="inbox-meta-item inbox-meta-item-inline">
                        <span className="meta-label">From</span>
                        <span className="meta-value" title={selected.sender}>{selected.sender}</span>
                      </div>
                      <div className="inbox-meta-item inbox-meta-item-inline">
                        <span className="meta-label">To</span>
                        <span className="meta-value" title={selected.recipient}>{selected.recipient}</span>
                      </div>
                      <div className="inbox-meta-item inbox-meta-item-inline">
                        <span className="meta-label">Received</span>
                        <span className="meta-value">{formatFullDate(selected.received_at)}</span>
                      </div>
                      <div className="inbox-meta-item inbox-meta-item-inline">
                        <span className="meta-label">Case</span>
                        <span className="meta-value">
                          {selected.case_id ? (
                            <button
                              className="btn btn-outline"
                              style={{ fontSize: 10.5, padding: '2px 8px', whiteSpace: 'nowrap' }}
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

                      <div className="inbox-control-item">
                        <span className="meta-label">Read Receipt</span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <span className="meta-value">{formatReadReceiptSummary(selected)}</span>
                          <span className="meta-label" style={{ textTransform: 'none' }}>
                            {selected.read_receipt_count > 0
                              ? `${selected.read_receipt_count} team member${selected.read_receipt_count === 1 ? '' : 's'} recorded`
                              : (selected.is_read ? 'Legacy read state only' : 'No receipt yet')}
                          </span>
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

                  {/* Action buttons */}
                  <div className="inbox-detail-actions">
                    <button className="btn btn-primary" style={{ fontSize: 12, padding: '6px 14px' }} onClick={openReply}>
                      ↩ Reply
                    </button>
                    <button className="btn btn-outline" style={{ fontSize: 12, padding: '6px 14px' }} onClick={openForward}>
                      ↗ Forward
                    </button>
                    <button
                      className="btn btn-outline"
                      style={{ fontSize: 12, padding: '6px 14px' }}
                      onClick={openCreateCaseModal}
                    >
                      ＋ Create Case
                    </button>
                    <button
                      className="btn btn-outline"
                      style={{ fontSize: 12, padding: '6px 14px' }}
                      onClick={openAppendCaseModal}
                    >
                      🔗 Append to Case
                    </button>
                    <button className="btn btn-outline" style={{ fontSize: 12, padding: '6px 14px' }}
                      onClick={() => {
                        const newLocked = !selected.is_locked
                        if (selected.is_locked && selected.locked_by !== user?.name) return
                        const newLockedBy = newLocked ? user?.name : null
                        patchInquiry(selected.id, { is_locked: newLocked, locked_by: newLockedBy, color: newLocked ? selected.color : null })
                        updateInquiries(prev => prev.map(i =>
                          i.id === selected.id ? { ...i, is_locked: newLocked, locked_by: newLockedBy, color: newLocked ? i.color : null } : i
                        ))
                        setSelected(s => ({ ...s, is_locked: newLocked, locked_by: newLockedBy, color: newLocked ? s.color : null }))
                      }}
                      title={selected.is_locked && selected.locked_by !== user?.name ? `Locked by ${selected.locked_by}` : ''}>
                      {selected.is_locked ? '🔒 Unlock' : '🔓 Lock'}
                    </button>
                  </div>

                  {/* Email body */}
                  <EmailBody body={selected.body} />

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
