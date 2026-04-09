/**
 * InboxPage.jsx — Inbox Module
 *
 * Implements all 10 Sprint 2 user stories:
 * US-01: View inbox list (grouped Today/Older)
 * US-02: Tab navigation with counts
 * US-03: Keyword search
 * US-04: Lock/unlock inquiry
 * US-05: Color code locked inquiry
 * US-06: Split view detail panel
 * US-07: Sort by date (newest first default)
 * US-08: Pagination (50 per page)
 * US-09: Attachment count in detail
 * US-10: Timezone display
 *
 * Data: Seed data from the backend (no real email integration in Sprint 2)
 */

import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../shared/context/AuthContext'
import Sidebar from '../components/Sidebar'
import Topbar from '../components/Topbar'

const PAGE_SIZE = 50
const TABS = ['Inbox', 'Pending', 'Processed', 'Non-Processed', 'Outbox']
const COLORS = ['red', 'yellow', 'green', 'blue']
const TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

export default function InboxPage() {
  const { user } = useAuth()
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('mims_sidebar_collapsed') === 'true')
  const [theme, setThemeState] = useState(() => localStorage.getItem('mims_theme') || 'light')

  // Per-user localStorage key — each user gets their own inbox state
  const STORAGE_KEY = `mims_inbox_${user?.id || 'guest'}`

  // Helper: save inquiries to localStorage
  function saveInquiries(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }

  // Helper: update inquiries in both state AND localStorage atomically
  function updateInquiries(updaterFn) {
    setInquiries(prev => {
      const next = updaterFn(prev)
      saveInquiries(next)
      return next
    })
  }

  // Inbox state
  const [inquiries, setInquiries] = useState([])
  const [inboxSource, setInboxSource] = useState('seed') // 'db' | 'seed'
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('Inbox')
  const [search, setSearch] = useState('')
  const [sortAsc, setSortAsc] = useState(false) // false = newest first (US-07)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState(null) // US-06: selected inquiry for detail

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('mims_theme', theme)
  }, [theme])

  // Load inbox — localStorage first, API only if no saved data
  useEffect(() => {
    loadInquiries()
    // Background sync: if server has DB-backed inbox, refresh even when localStorage exists.
    // This prevents "seed cache" from hiding newly ingested emails.
    setTimeout(() => { loadInquiries({ force: true }) }, 250)
  }, [])

  function mergeLocalState(serverItems, localItems) {
    const localById = new Map((localItems || []).map(i => [i.id, i]))
    return (serverItems || []).map(s => {
      const l = localById.get(s.id)
      if (!l) return s
      return { ...s, is_locked: l.is_locked, locked_by: l.locked_by, color: l.color }
    })
  }

  async function loadInquiries(opts = {}) {
    const { force = false } = opts
    setLoading(true)

    // Check localStorage first — preserves all user changes across refreshes
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && !force) {
      setInquiries(JSON.parse(saved))
      setLoading(false)
      return
    }

    // Fetch from backend and save it
    try {
      const res = await fetch('/api/inbox', {
        headers: { Authorization: `Bearer ${localStorage.getItem('mims_token')}` }
      })
      if (res.ok) {
        const data = await res.json()
        const inquiryList = data.inquiries || []
        setInboxSource(data.source || 'seed')
        setInquiries(prev => {
          const merged = mergeLocalState(inquiryList, prev)
          // If server is DB-backed, always overwrite cache so seed data doesn't stick.
          if (data.source === 'db' || force) saveInquiries(merged)
          return merged
        })
      }
    } catch {
      // API not reachable — empty state
    } finally {
      setLoading(false)
    }
  }

  const AUTH_H = { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('mims_token')}` }

  async function patchInquiry(id, body) {
    if (inboxSource === 'db') {
      await fetch(`/api/inbox/${id}`, { method: 'PATCH', headers: AUTH_H, body: JSON.stringify(body) }).catch(() => {})
    }
  }

  // US-04: Lock an inquiry — persists to DB if DB-backed, always saves to localStorage
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

  // US-05: Set color — persists to DB if DB-backed, always saves to localStorage
  function setColor(id, color) {
    patchInquiry(id, { color })
    updateInquiries(prev => prev.map(inq =>
      inq.id === id ? { ...inq, color } : inq
    ))
  }

  // Tab counts (US-02)
  const tabCounts = useMemo(() => {
    return TABS.reduce((acc, tab) => {
      acc[tab] = inquiries.filter(i => i.status === tab.toLowerCase().replace('-', '_')).length
      return acc
    }, {})
  }, [inquiries])

  // Filter + sort + paginate
  const filtered = useMemo(() => {
    let result = inquiries.filter(i => {
      const matchTab = i.status === activeTab.toLowerCase().replace('-', '_')
      const matchSearch = search === '' ||
        i.sender?.toLowerCase().includes(search.toLowerCase()) ||
        i.subject?.toLowerCase().includes(search.toLowerCase())
      return matchTab && matchSearch
    })

    result.sort((a, b) => {
      const da = new Date(a.received_at), db = new Date(b.received_at)
      return sortAsc ? da - db : db - da
    })

    return result
  }, [inquiries, activeTab, search, sortAsc])

  // Pagination (US-08)
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // Group into Today / Older (US-01)
  const today = new Date().toDateString()
  const grouped = paginated.reduce((acc, inq) => {
    const group = new Date(inq.received_at).toDateString() === today ? 'Today' : 'Older'
    if (!acc[group]) acc[group] = []
    acc[group].push(inq)
    return acc
  }, {})

  function toggleSidebar() {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('mims_sidebar_collapsed', next)
  }

  function formatTime(dateStr) {
    const d = new Date(dateStr)
    const isToday = d.toDateString() === today
    if (isToday) return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  function formatFullDate(dateStr) {
    return new Date(dateStr).toLocaleString('en-US', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  }

  const colorBarClass = { red: 'color-bar-red', yellow: 'color-bar-yellow', green: 'color-bar-green', blue: 'color-bar-blue' }
  const dotClass = { red: 'dot-red', yellow: 'dot-yellow', green: 'dot-green', blue: 'dot-blue' }

  return (
    <div className="app-wrapper">
      <Sidebar collapsed={collapsed} onCollapse={toggleSidebar} theme={theme} setTheme={setThemeState} />

      <div className="main-content">
        <Topbar title="Inbox" onToggleSidebar={toggleSidebar} />

        <div className="page-content" style={{ padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="inbox-wrapper">

            {/* ── LEFT PANEL: List ── */}
            <div className="inbox-list-panel">

              {/* US-02: Tabs */}
              <div className="inbox-tabs">
                {TABS.map(tab => (
                  <button key={tab} className={`inbox-tab ${activeTab === tab ? 'active' : ''}`}
                    onClick={() => { setActiveTab(tab); setPage(1); setSelected(null) }}>
                    {tab}
                    {tabCounts[tab] > 0 && <span className="inbox-tab-count">{tabCounts[tab]}</span>}
                  </button>
                ))}
              </div>

              {/* US-03: Search */}
              <div className="inbox-search-bar">
                <input type="text" placeholder="Search by sender or subject..."
                  value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
              </div>

              {/* US-07 + US-08: Sort + Count */}
              <div className="inbox-sort-bar">
                <span>Showing {filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="inbox-sort-btn" onClick={() => loadInquiries({ force: true })} disabled={loading}>
                    {loading ? 'Syncing…' : 'Sync from Server'}
                  </button>
                  <button className="inbox-sort-btn" onClick={() => setSortAsc(a => !a)}>
                    Sort: {sortAsc ? '↑ Oldest' : '↓ Newest'}
                  </button>
                  <button className="inbox-sort-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>◀</button>
                  <button className="inbox-sort-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>▶</button>
                </div>
              </div>

              {/* US-01: List */}
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
                      {grouped[group].map(inq => (
                        <div key={inq.id}
                          className={`inbox-row ${selected?.id === inq.id ? 'selected' : ''}`}
                          onClick={() => setSelected(inq)}>
                          {/* US-05: Color bar */}
                          <div className={`inbox-row-color ${inq.color ? colorBarClass[inq.color] : ''}`} />
                          <div className="inbox-row-content">
                            <div className="inbox-row-sender">
                              {inq.is_locked && <span className="lock-icon">🔒 </span>}
                              {inq.sender}
                            </div>
                            <div className="inbox-row-subject">{inq.subject}</div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                            <span className="inbox-row-time">{formatTime(inq.received_at)}</span>
                            {/* US-04: Lock button */}
                            <button onClick={e => toggleLock(inq.id, e)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: inq.is_locked ? 'var(--warning)' : 'var(--text-muted)' }}
                              title={inq.is_locked ? 'Unlock' : 'Lock'}>
                              {inq.is_locked ? '🔒' : '🔓'}
                            </button>
                          </div>
                        </div>
                      ))}
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
                  {/* US-05: Color picker (only on locked) */}
                  {selected.is_locked && selected.locked_by === user?.name && (
                    <div className="color-picker-bar">
                      <span className="picker-label">Mark color:</span>
                      {COLORS.map(c => (
                        <div key={c} className={`color-dot ${dotClass[c]} ${selected.color === c ? 'active' : ''}`}
                          onClick={() => { setColor(selected.id, c); setSelected(s => ({ ...s, color: c })) }}
                        title={c} />
                      ))}
                      <div className={`color-dot dot-none ${!selected.color ? 'active' : ''}`}
                        onClick={() => { setColor(selected.id, null); setSelected(s => ({ ...s, color: null })) }}
                        title="Clear color" />
                    </div>
                  )}

                  {/* US-06 + US-09 + US-10: Email detail */}
                  <div className="inbox-detail-header">
                    <div className="inbox-detail-subject">{selected.subject}</div>
                    {/* US-10: Timezone */}
                    <div className="inbox-timezone-note">📅 Dates displayed in {TIMEZONE} (?)</div>
                    <div className="inbox-detail-meta">
                      <span className="meta-label">From</span>
                      <span className="meta-value">{selected.sender}</span>
                      <span className="meta-label">To</span>
                      <span className="meta-value">{selected.recipient}</span>
                      <span className="meta-label">Sent On</span>
                      <span className="meta-value">{formatFullDate(selected.received_at)}</span>
                      <span className="meta-label">Received On</span>
                      <span className="meta-value">{formatFullDate(selected.received_at)}</span>
                      {/* US-09: Attachments */}
                      <span className="meta-label">Attachments</span>
                      <span className="meta-value">({selected.attachments_count || 0})</span>
                    </div>
                  </div>

                  <div className="inbox-detail-body">{selected.body}</div>

                  <div className="inbox-detail-actions">
                    <button className="btn btn-primary" style={{ fontSize: 12, padding: '6px 14px' }}>↩ Reply</button>
                    <button className="btn btn-outline" style={{ fontSize: 12, padding: '6px 14px' }}>↗ Forward</button>
                    <button className="btn btn-outline" style={{ fontSize: 12, padding: '6px 14px' }}
                      onClick={() => {
                        patchInquiry(selected.id, { status: 'pending' })
                        updateInquiries(prev => prev.map(i =>
                          i.id === selected.id ? { ...i, status: 'pending' } : i
                        ))
                        setSelected(null)
                      }}>
                      ⏳ Mark Pending
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
