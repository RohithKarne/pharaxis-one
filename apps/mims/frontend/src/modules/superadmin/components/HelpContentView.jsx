import { useState, useEffect } from 'react'
import { guardedFetch } from '../utils/guardedFetch'
import { confirm } from '../../../shared/utils/confirm'

const AUDIENCE_OPTIONS = [
  { value: 'all',        label: 'All Users' },
  { value: 'agent',      label: 'Case Agent' },
  { value: 'cm_admin',   label: 'CM Admin' },
  { value: 'admin',      label: 'Org Admin' },
  { value: 'superadmin', label: 'Superadmin' },
]

const BLANK_ARTICLE = {
  feature_key: '', feature_group: '', title: '', content_html: '',
  summary: '', audience: ['all'], sort_order: 100, is_active: true, tags: [],
}

export default function HelpContentView({ H, flash }) {
  const [tab, setTab]             = useState('articles')
  const [articles, setArticles]   = useState([])
  const [stale, setStale]         = useState([])
  const [coverage, setCoverage]   = useState(null)
  const [total, setTotal]         = useState(0)
  const [loading, setLoading]     = useState(false)
  const [search, setSearch]       = useState('')
  const [fkFilter, setFkFilter]   = useState('')
  const [activeFilter, setActFilter] = useState('')
  const [page, setPage]           = useState(1)
  const LIMIT = 25

  const [editing, setEditing]     = useState(null)
  const [saving, setSaving]       = useState(false)

  async function load() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page, limit: LIMIT })
      if (search)       params.set('search', search)
      if (fkFilter)     params.set('feature_key', fkFilter)
      if (activeFilter !== '') params.set('is_active', activeFilter)
      const data = await guardedFetch(`/api/admin/help?${params}`, { headers: H }).then(r => r.json())
      setArticles(data.articles || [])
      setTotal(data.total || 0)
    } finally {
      setLoading(false)
    }
  }

  async function loadAttention() {
    const [staleData, covData] = await Promise.all([
      guardedFetch('/api/admin/help/stale', { headers: H }).then(r => r.json()),
      guardedFetch('/api/admin/help/coverage', { headers: H }).then(r => r.json()),
    ])
    setStale(staleData.articles || [])
    setCoverage(covData)
  }

  useEffect(() => { load() }, [page, search, fkFilter, activeFilter]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === 'attention') loadAttention() }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!editing) return
    setSaving(true)
    try {
      const isNew = !editing.id
      const url = isNew ? '/api/admin/help' : `/api/admin/help/${editing.id}`
      const method = isNew ? 'POST' : 'PUT'
      const res = await guardedFetch(url, {
        method,
        headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editing,
          audience: Array.isArray(editing.audience) ? editing.audience : ['all'],
          tags: Array.isArray(editing.tags) ? editing.tags : [],
        }),
      })
      const data = await res.json()
      if (!res.ok) { flash(data.error || 'Save failed', 'error'); return }
      flash(isNew ? 'Article created.' : 'Article updated.', 'success')
      setEditing(null)
      load()
    } finally {
      setSaving(false)
    }
  }

  async function softDelete(id) {
    if (!await confirm('Deactivate this article?')) return
    await guardedFetch(`/api/admin/help/${id}`, { method: 'DELETE', headers: H })
    flash('Article deactivated.', 'success')
    load()
  }

  async function markReviewed(id) {
    await guardedFetch(`/api/admin/help/${id}/reviewed`, { method: 'PATCH', headers: H })
    flash('Marked as reviewed.', 'success')
    loadAttention()
  }

  function toggleAudience(val) {
    setEditing(prev => {
      const current = Array.isArray(prev.audience) ? prev.audience : ['all']
      if (val === 'all') return { ...prev, audience: ['all'] }
      const without = current.filter(a => a !== 'all')
      const exists  = without.includes(val)
      const next    = exists ? without.filter(a => a !== val) : [...without, val]
      return { ...prev, audience: next.length ? next : ['all'] }
    })
  }

  const pages = Math.ceil(total / LIMIT)

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Help Content</h2>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            Manage in-app help articles for all user roles
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({ ...BLANK_ARTICLE })}>
          + New Article
        </button>
      </div>

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
        {[['articles','Articles'],['attention','Needs Attention']].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: '7px 18px', fontSize: 13, fontWeight: 600, background: 'none',
            border: 'none', cursor: 'pointer', borderBottom: `2px solid ${tab === k ? '#1d4ed8' : 'transparent'}`,
            color: tab === k ? '#1d4ed8' : 'var(--text-muted)', borderRadius: '6px 6px 0 0',
          }}>{l}</button>
        ))}
      </div>

      {tab === 'articles' && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <input
              className="form-input" style={{ flex: 1, minWidth: 180 }}
              placeholder="Search title, key…"
              value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            />
            <input
              className="form-input" style={{ width: 180 }}
              placeholder="Feature key filter"
              value={fkFilter} onChange={e => { setFkFilter(e.target.value); setPage(1) }}
            />
            <select className="form-input" style={{ width: 130 }} value={activeFilter} onChange={e => setActFilter(e.target.value)}>
              <option value="">All status</option>
              <option value="1">Active</option>
              <option value="0">Inactive</option>
            </select>
          </div>

          {loading && <div style={{ color: 'var(--text-muted)', padding: 20 }}>Loading…</div>}

          {!loading && (
            <div className="card">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', background: 'var(--bg-subtle)' }}>
                    {['Title','Feature Key','Audience','Version','Last Reviewed','Status','Actions'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, fontSize: 12 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {articles.length === 0 && (
                    <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>No articles found.</td></tr>
                  )}
                  {articles.map(art => (
                    <tr key={art.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 12px', maxWidth: 220 }}>
                        <div style={{ fontWeight: 600, color: '#1e293b' }}>{art.title}</div>
                        {art.summary && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{art.summary.slice(0, 60)}{art.summary.length > 60 ? '…' : ''}</div>}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <code style={{ fontSize: 11, background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>{art.feature_key}</code>
                      </td>
                      <td style={{ padding: '8px 12px', fontSize: 11 }}>
                        {(typeof art.audience === 'string' ? JSON.parse(art.audience) : art.audience || ['all']).join(', ')}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>v{art.version}</td>
                      <td style={{ padding: '8px 12px', fontSize: 11 }}>
                        {art.last_reviewed_at
                          ? new Date(art.last_reviewed_at).toLocaleDateString()
                          : <span style={{ color: '#e67e22', fontWeight: 600 }}>Not reviewed</span>
                        }
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                          background: art.is_active ? '#dcfce7' : '#fee2e2',
                          color: art.is_active ? '#166534' : '#dc2626',
                        }}>{art.is_active ? 'Active' : 'Inactive'}</span>
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 9px' }}
                            onClick={() => setEditing({ ...art, audience: typeof art.audience === 'string' ? JSON.parse(art.audience) : art.audience, tags: typeof art.tags === 'string' ? JSON.parse(art.tags) : (art.tags || []) })}>
                            Edit
                          </button>
                          {art.is_active && (
                            <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 9px', color: '#dc2626', borderColor: '#dc2626' }}
                              onClick={() => softDelete(art.id)}>
                              Deactivate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, justifyContent: 'center' }}>
              <button className="btn btn-outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Page {page} of {pages} — {total} total</span>
              <button className="btn btn-outline" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next →</button>
            </div>
          )}
        </>
      )}

      {tab === 'attention' && (
        <>
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>
              Stale Articles
              <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>not reviewed in 90+ days</span>
            </h3>
            {stale.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No stale articles. ✅</div>}
            {stale.map(art => (
              <div key={art.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 8, background: '#fffbeb' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{art.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {art.feature_key} · {art.days_since_review} days since review
                    {art.reviewed_by_name && ` · Last reviewed by ${art.reviewed_by_name}`}
                  </div>
                </div>
                <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => markReviewed(art.id)}>
                  Mark Reviewed
                </button>
              </div>
            ))}
          </div>

          {coverage && (
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>
                Feature Key Coverage
                <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>
                  {coverage.covered_count}/{coverage.total_keys} keys covered
                </span>
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {coverage.coverage.map(c => (
                  <div key={c.feature_key} style={{
                    padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                    background: c.covered ? '#dcfce7' : '#fee2e2',
                    color: c.covered ? '#166534' : '#dc2626',
                    border: `1px solid ${c.covered ? '#bbf7d0' : '#fecaca'}`,
                  }}>
                    {c.feature_key}
                    {c.article_count > 0 && <span style={{ opacity: 0.6, marginLeft: 4 }}>({c.article_count})</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 400, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 40, overflowY: 'auto' }}>
          <div style={{ background: '#fff', borderRadius: 12, width: 680, maxWidth: '95vw', padding: 28, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', marginBottom: 40 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{editing.id ? 'Edit Help Article' : 'New Help Article'}</h3>
              <button style={{ background: '#f1f5f9', border: 'none', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', fontSize: 14 }} onClick={() => setEditing(null)}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>Feature Key *</label>
                <input className="form-input" value={editing.feature_key} onChange={e => setEditing(p => ({ ...p, feature_key: e.target.value }))} placeholder="e.g. cm.documents" />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>Feature Group</label>
                <input className="form-input" value={editing.feature_group || ''} onChange={e => setEditing(p => ({ ...p, feature_group: e.target.value }))} placeholder="e.g. cm" />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>Title *</label>
              <input className="form-input" value={editing.title} onChange={e => setEditing(p => ({ ...p, title: e.target.value }))} placeholder="Article title" />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>Summary</label>
              <input className="form-input" value={editing.summary || ''} onChange={e => setEditing(p => ({ ...p, summary: e.target.value }))} placeholder="1-2 sentence summary for search results" />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>Audience</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {AUDIENCE_OPTIONS.map(opt => {
                  const aud = Array.isArray(editing.audience) ? editing.audience : ['all']
                  const selected = aud.includes(opt.value)
                  return (
                    <button key={opt.value} type="button" onClick={() => toggleAudience(opt.value)} style={{
                      padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      background: selected ? '#1d4ed8' : '#f1f5f9',
                      color: selected ? '#fff' : '#334155',
                      border: `1px solid ${selected ? '#1d4ed8' : '#cbd5e1'}`,
                    }}>{opt.label}</button>
                  )
                })}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>Content HTML *</label>
              <textarea
                style={{ width: '100%', minHeight: 260, padding: 10, border: '1px solid #cbd5e1', borderRadius: 8, fontFamily: 'monospace', fontSize: 12, resize: 'vertical', boxSizing: 'border-box' }}
                value={editing.content_html}
                onChange={e => setEditing(p => ({ ...p, content_html: e.target.value }))}
                placeholder="<h4>What is this?</h4><p>…</p>"
              />
            </div>

            <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>Sort Order</label>
                <input type="number" className="form-input" value={editing.sort_order} onChange={e => setEditing(p => ({ ...p, sort_order: parseInt(e.target.value, 10) || 100 }))} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 22 }}>
                <input type="checkbox" id="ha-active" checked={!!editing.is_active} onChange={e => setEditing(p => ({ ...p, is_active: e.target.checked }))} />
                <label htmlFor="ha-active" style={{ fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Active</label>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
              <button className="btn btn-outline" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : (editing.id ? 'Save Changes' : 'Create Article')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
