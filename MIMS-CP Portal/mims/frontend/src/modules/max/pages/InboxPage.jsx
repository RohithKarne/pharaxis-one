/**
 * InboxPage.jsx — Inbox Module
 * Phase 1: F6 (body search), F7 (date range), F10 (read/unread), F13 (bulk), F14 (CSV export)
 * Phase 2: F1 (assign), F2 (priority), F3 (templates), F4 (due date), F5 (notes),
 *          F8 (advanced filters), F9 (saved views), F12 (reply thread)
 */

import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../../shared/context/AuthContext'
import Sidebar from '../components/Sidebar'
import Topbar from '../../../shared/components/Topbar'

const PAGE_SIZE = 50
const TABS = ['Inbox', 'Pending', 'Processed', 'Non-Processed', 'Sent']
const TAB_STATUS = { Sent: 'outbox' }
const COLORS = ['red', 'yellow', 'green', 'blue']
const PRIORITIES = ['high', 'medium', 'low']
const PRIORITY_ICON = { high: '🔴', medium: '🟡', low: '🟢' }
const TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

export default function InboxPage() {
  const { user } = useAuth()
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('mims_sidebar_collapsed') === 'true')
  const [theme, setThemeState] = useState(() => localStorage.getItem('mims_theme') || 'light')

  const STORAGE_KEY = `mims_inbox_${user?.id || 'guest'}`
  const VIEWS_KEY   = `mims_inbox_views_${user?.id || 'guest'}`

  function saveInquiries(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }

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
  const [bulkSelected, setBulkSelected] = useState(new Set())

  // ── Phase 2 state ─────────────────────────────────────────────
  const [users, setUsers]           = useState([])           // F1
  const [templates, setTemplates]   = useState([])           // F3
  const [advFilters, setAdvFilters] = useState({             // F8
    color: '', priority: '', readStatus: '', isLocked: '', assignee: '',
  })
  const [showAdvFilters, setShowAdvFilters] = useState(false)
  const [savedViews, setSavedViews]         = useState([])   // F9
  const [saveViewName, setSaveViewName]     = useState('')
  const [notes, setNotes]                   = useState([])   // F5
  const [newNote, setNewNote]               = useState('')
  const [notesLoading, setNotesLoading]     = useState(false)
  const [savingNote, setSavingNote]         = useState(false)
  const [threadItems, setThreadItems]       = useState([])   // F12
  const [threadExpanded, setThreadExpanded] = useState(true)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('mims_theme', theme)
  }, [theme])

  useEffect(() => {
    try { setSavedViews(JSON.parse(localStorage.getItem(VIEWS_KEY) || '[]')) } catch { /* ignore */ }
  }, [VIEWS_KEY])

  useEffect(() => {
    loadInquiries()
    setTimeout(() => { loadInquiries({ force: true }) }, 250)
    loadUsers()
    loadTemplates()
  }, [])

  const AUTH_H = { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('mims_token')}` }

  // ── Data loaders ──────────────────────────────────────────────

  function mergeLocalState(serverItems, localItems) {
    const localById = new Map((localItems || []).map(i => [i.id, i]))
    return (serverItems || []).map(s => {
      const l = localById.get(s.id)
      if (!l) return s
      return {
        ...s,
        is_locked: l.is_locked, locked_by: l.locked_by,
        color: l.color, is_read: l.is_read,
        assigned_to: l.assigned_to, priority: l.priority, due_date: l.due_date,
      }
    })
  }

  async function loadInquiries(opts = {}) {
    const { force = false } = opts
    setLoading(true)
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && !force) {
      setInquiries(JSON.parse(saved))
      setLoading(false)
      return
    }
    try {
      const res = await fetch('/api/inbox', { headers: AUTH_H })
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
    } catch { /* silently fail */ }
    finally { setLoading(false) }
  }

  const USERS_KEY = `mims_inbox_users_${user?.id || 'guest'}`

  async function loadUsers() {
    // Load from cache immediately so the dropdown is never empty on restart
    const cached = localStorage.getItem(USERS_KEY)
    if (cached) {
      try { setUsers(JSON.parse(cached)) } catch { /* ignore */ }
    }
    // Always refresh from API in background
    try {
      const res = await fetch('/api/inbox/users', { headers: AUTH_H })
      if (res.ok) {
        const d = await res.json()
        const list = d.users || []
        setUsers(list)
        localStorage.setItem(USERS_KEY, JSON.stringify(list))
      }
    } catch { /* silently keep cached list */ }
  }

  async function loadTemplates() {
    try {
      const res = await fetch('/api/inbox/templates', { headers: AUTH_H })
      if (res.ok) { const d = await res.json(); setTemplates(d.templates || []) }
    } catch { /* ignore */ }
  }

  async function loadAttachments(inquiryId) {
    setAttachments([])
    try {
      const res = await fetch(`/api/inbox/${inquiryId}/attachments`, { headers: AUTH_H })
      if (res.ok) { const d = await res.json(); setAttachments(d.attachments || []) }
    } catch { setAttachments([]) }
  }

  async function loadNotes(id) {
    setNotesLoading(true)
    try {
      const res = await fetch(`/api/inbox/${id}/notes`, { headers: AUTH_H })
      if (res.ok) { const d = await res.json(); setNotes(d.notes || []) }
    } catch { setNotes([]) }
    finally { setNotesLoading(false) }
  }

  async function loadThread(id) {
    try {
      const res = await fetch(`/api/inbox/${id}/thread`, { headers: AUTH_H })
      if (res.ok) { const d = await res.json(); setThreadItems(d.thread || []) }
    } catch { setThreadItems([]) }
  }

  // ── Actions ───────────────────────────────────────────────────

  async function fetchEmails() {
    setFetching(true); setFetchResult(null)
    try {
      const res = await fetch('/api/inbox/fetch', { method: 'POST', headers: AUTH_H })
      if (res.ok) { const d = await res.json(); setFetchResult(d); await loadInquiries({ force: true }) }
    } catch { /* silently fail */ }
    finally { setFetching(false) }
  }

  function selectInquiry(inq) {
    setSelected(inq)
    if (inq.attachments_count > 0) loadAttachments(inq.id)
    else setAttachments([])
    if (!inq.is_read) {
      patchInquiry(inq.id, { is_read: true })
      updateInquiries(prev => prev.map(i => i.id === inq.id ? { ...i, is_read: true } : i))
    }
    setNotes([]); setNewNote(''); setThreadItems([])
    loadNotes(inq.id)
    loadThread(inq.id)
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

  async function sendCompose() {
    if (!compose || !selected) return
    setCompose(c => ({ ...c, sending: true, error: null }))
    const endpoint = compose.mode === 'reply' ? 'reply' : 'forward'
    try {
      const res = await fetch(`/api/inbox/${selected.id}/${endpoint}`, {
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

  async function patchInquiry(id, body) {
    if (inboxSource === 'db') {
      await fetch(`/api/inbox/${id}`, { method: 'PATCH', headers: AUTH_H, body: JSON.stringify(body) }).catch(() => {})
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

  function bulkUpdateStatus(status) {
    bulkSelected.forEach(id => {
      patchInquiry(id, { status })
      updateInquiries(prev => prev.map(i => i.id === id ? { ...i, status } : i))
    })
    setBulkSelected(new Set()); setSelected(null)
  }

  function exportCSV() {
    const headers = ['ID', 'From', 'To', 'Subject', 'Received', 'Status', 'Priority', 'Assigned To', 'Due Date', 'Color', 'Locked By']
    const esc = v => `"${String(v || '').replace(/"/g, '""')}"`
    const rows = filtered.map(i => [
      i.id, esc(i.sender), esc(i.recipient), esc(i.subject),
      i.received_at, i.status, i.priority || '', i.assigned_to || '',
      i.due_date || '', i.color || '', i.locked_by || '',
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
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
      const res = await fetch(`/api/inbox/${selected.id}/notes`, {
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
    const view = { name: name.trim(), search, filterFrom, filterTo, advFilters }
    const next = [...savedViews.filter(v => v.name !== name.trim()), view].slice(-5)
    setSavedViews(next)
    localStorage.setItem(VIEWS_KEY, JSON.stringify(next))
  }

  function applyView(view) {
    setSearch(view.search || '')
    setFilterFrom(view.filterFrom || '')
    setFilterTo(view.filterTo || '')
    setAdvFilters(view.advFilters || { color: '', priority: '', readStatus: '', isLocked: '', assignee: '' })
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
      const matchFrom = !filterFrom || new Date(i.received_at) >= new Date(filterFrom)
      const matchTo   = !filterTo   || new Date(i.received_at) <= new Date(filterTo + 'T23:59:59')
      // F8: advanced filters
      const matchColor    = !advFilters.color    || i.color === advFilters.color
      const matchPriority = !advFilters.priority || i.priority === advFilters.priority
      const matchRead     = !advFilters.readStatus ||
        (advFilters.readStatus === 'unread' ? !i.is_read : !!i.is_read)
      const matchLock     = !advFilters.isLocked ||
        (advFilters.isLocked === 'locked' ? i.is_locked : !i.is_locked)
      const matchAssignee = !advFilters.assignee || i.assigned_to === advFilters.assignee
      return matchTab && matchSearch && matchFrom && matchTo &&
             matchColor && matchPriority && matchRead && matchLock && matchAssignee
    })
    result.sort((a, b) => {
      const da = new Date(a.received_at), db = new Date(b.received_at)
      return sortAsc ? da - db : db - da
    })
    return result
  }, [inquiries, activeTab, search, sortAsc, filterFrom, filterTo, advFilters])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const today   = new Date().toDateString()
  const grouped = paginated.reduce((acc, inq) => {
    const group = new Date(inq.received_at).toDateString() === today ? 'Today' : 'Older'
    if (!acc[group]) acc[group] = []
    acc[group].push(inq)
    return acc
  }, {})

  // ── Helpers ───────────────────────────────────────────────────

  function toggleSidebar() {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('mims_sidebar_collapsed', next)
  }

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

  function dueDateStatus(dueDateStr) {
    if (!dueDateStr) return null
    const d = new Date(dueDateStr); d.setHours(0, 0, 0, 0)
    const t = new Date(); t.setHours(0, 0, 0, 0)
    if (d < t)  return 'overdue'
    if (d.getTime() === t.getTime()) return 'today'
    return null
  }

  const hasAdvFilters = Object.values(advFilters).some(v => v)

  const colorBarClass = { red: 'color-bar-red', yellow: 'color-bar-yellow', green: 'color-bar-green', blue: 'color-bar-blue' }
  const dotClass      = { red: 'dot-red', yellow: 'dot-yellow', green: 'dot-green', blue: 'dot-blue' }

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="app-wrapper">
      <Sidebar collapsed={collapsed} onCollapse={toggleSidebar} theme={theme} setTheme={setThemeState} />

      <div className="main-content">
        <Topbar title="Inbox" onToggleSidebar={toggleSidebar} />

        <div className="page-content" style={{ padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="inbox-wrapper">

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
                    onClick={() => setAdvFilters({ color: '', priority: '', readStatus: '', isLocked: '', assignee: '' })}>
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
                      {users.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
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
                  <button className="inbox-sort-btn" onClick={() => bulkUpdateStatus('processed')}>✓ Processed</button>
                  <button className="inbox-sort-btn" onClick={() => bulkUpdateStatus('pending')}>⏳ Pending</button>
                  <button className="inbox-sort-btn" onClick={() => bulkUpdateStatus('non_processed')}>✗ Non-Processed</button>
                  <button className="inbox-sort-btn" onClick={() => setBulkSelected(new Set())}>Cancel</button>
                </div>
              )}

              {/* Sort + Count + Export */}
              <div className="inbox-sort-bar">
                <span>
                  Showing {filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
                  {fetchResult != null && (
                    <span style={{ marginLeft: 8, color: 'var(--success, #22c55e)', fontSize: 11 }}>
                      {fetchResult.ingested > 0 ? `+${fetchResult.ingested} new` : 'Up to date'}
                    </span>
                  )}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
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
                  ['Today', 'Older'].map(group => grouped[group] && (
                    <div key={group}>
                      <div className="inbox-date-group">{group}</div>
                      {grouped[group].map(inq => {
                        const dueStatus = dueDateStatus(inq.due_date)
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
                              <div className="inbox-row-sender">
                                {!inq.is_read && <span className="unread-dot" />}
                                {inq.is_locked && <span className="lock-icon">🔒 </span>}
                                {inq.priority && (
                                  <span className={`priority-dot priority-dot-${inq.priority}`}>
                                    {PRIORITY_ICON[inq.priority]}
                                  </span>
                                )}
                                {inq.sender}
                              </div>
                              <div className="inbox-row-subject">{inq.subject}</div>
                              {/* F1/F4 row indicators */}
                              {(inq.assigned_to || dueStatus) && (
                                <div className="inbox-row-meta-row">
                                  {inq.assigned_to && (
                                    <span className="assignee-tag">👤 {inq.assigned_to}</span>
                                  )}
                                  {dueStatus === 'overdue' && <span className="due-chip due-overdue-chip">⏰ Overdue</span>}
                                  {dueStatus === 'today'   && <span className="due-chip due-today-chip">⏰ Due Today</span>}
                                </div>
                              )}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                              <span className="inbox-row-time">{formatTime(inq.received_at)}</span>
                              <button onClick={e => toggleLock(inq.id, e)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: inq.is_locked ? 'var(--warning)' : 'var(--text-muted)' }}
                                title={inq.is_locked ? 'Unlock' : 'Lock'}>
                                {inq.is_locked ? '🔒' : '🔓'}
                              </button>
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
                    <div className="inbox-timezone-note">📅 Dates displayed in {TIMEZONE}</div>
                    <div className="inbox-detail-meta">
                      <span className="meta-label">From</span>
                      <span className="meta-value">{selected.sender}</span>
                      <span className="meta-label">To</span>
                      <span className="meta-value">{selected.recipient}</span>
                      <span className="meta-label">Sent On</span>
                      <span className="meta-value">{formatFullDate(selected.received_at)}</span>
                      <span className="meta-label">Received On</span>
                      <span className="meta-value">{formatFullDate(selected.received_at)}</span>

                      {/* F1: Assign */}
                      <span className="meta-label">Assigned To</span>
                      <span className="meta-value">
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
                      </span>

                      {/* F2: Priority */}
                      <span className="meta-label">Priority</span>
                      <span className="meta-value">
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
                      </span>

                      {/* F4: Due Date */}
                      <span className="meta-label">Due Date</span>
                      <span className="meta-value" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                      </span>

                      {/* Attachments */}
                      {selected.attachments_count > 0 && (
                        <>
                          <span className="meta-label">Attachments</span>
                          <span className="meta-value">
                            {attachments.length === 0 ? (
                              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Loading…</span>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {attachments.map(att => (
                                  <button key={att.id}
                                    onClick={async () => {
                                      const r = await fetch(`/api/inbox/attachments/${att.id}/download`, { headers: AUTH_H })
                                      if (!r.ok) return
                                      const blob = await r.blob()
                                      const url = URL.createObjectURL(blob)
                                      const a = document.createElement('a'); a.href = url; a.download = att.filename; a.click()
                                      URL.revokeObjectURL(url)
                                    }}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4, padding: 0, textAlign: 'left' }}>
                                    📎 {att.filename}
                                    {att.size_bytes > 0 && (
                                      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>({(att.size_bytes / 1024).toFixed(1)} KB)</span>
                                    )}
                                  </button>
                                ))}
                              </div>
                            )}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="inbox-detail-actions">
                    <button className="btn btn-primary" style={{ fontSize: 12, padding: '6px 14px' }} onClick={openReply}>
                      ↩ Reply
                    </button>
                    <button className="btn btn-outline" style={{ fontSize: 12, padding: '6px 14px' }} onClick={openForward}>
                      ↗ Forward
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
                    <button className="btn btn-outline" style={{ fontSize: 12, padding: '6px 14px' }}
                      onClick={() => {
                        patchInquiry(selected.id, { status: 'pending' })
                        updateInquiries(prev => prev.map(i => i.id === selected.id ? { ...i, status: 'pending' } : i))
                        setSelected(null)
                      }}>
                      ⏳ Mark Pending
                    </button>
                    <button className="btn btn-outline" style={{ fontSize: 12, padding: '6px 14px' }}
                      onClick={() => {
                        patchInquiry(selected.id, { status: 'non_processed' })
                        updateInquiries(prev => prev.map(i => i.id === selected.id ? { ...i, status: 'non_processed' } : i))
                        setSelected(null)
                      }}>
                      ✗ Non-Processed
                    </button>
                  </div>

                  {/* Email body */}
                  <div className="inbox-detail-body">{selected.body}</div>

                  {/* F5: Internal Notes */}
                  <div className="notes-section">
                    <div className="notes-section-header">
                      📝 Internal Notes {notes.length > 0 && <span className="notes-count">({notes.length})</span>}
                    </div>
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
                          <textarea className="note-input" rows={2} placeholder="Add internal note…"
                            value={newNote} onChange={e => setNewNote(e.target.value)}
                            disabled={savingNote} />
                          <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 10px' }}
                            onClick={submitNote} disabled={savingNote || !newNote.trim()}>
                            {savingNote ? 'Saving…' : 'Add Note'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  {/* F12: Reply Thread */}
                  {threadItems.length > 0 && (
                    <div className="thread-section">
                      <button className="thread-toggle" onClick={() => setThreadExpanded(e => !e)}>
                        {threadExpanded ? '▾' : '▸'} Thread ({threadItems.length} {threadItems.length === 1 ? 'message' : 'messages'})
                      </button>
                      {threadExpanded && (
                        <div className="thread-list">
                          {threadItems.map(t => (
                            <div key={t.id} className="thread-item">
                              <div className="thread-item-header">
                                <span className="thread-source">{t.source_tag}</span>
                                <span className="thread-time">{formatFullDate(t.received_at)}</span>
                              </div>
                              <div className="thread-item-meta">To: {t.recipient}</div>
                              <div className="thread-item-subject">{t.subject}</div>
                              <div className="thread-item-body">
                                {t.body?.slice(0, 300)}{t.body?.length > 300 ? '…' : ''}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
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
    </div>
  )
}
