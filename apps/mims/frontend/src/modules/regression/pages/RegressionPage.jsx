import { useState, useEffect } from 'react'
import { useAuth } from '../../../shared/context/AuthContext'
import MIMSLayout from '../../../shared/components/MIMSLayout'
import { httpFetch } from '../../../shared/api/httpFetch.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreColor(score) {
  if (score >= 90) return '#16a34a'
  if (score >= 70) return '#d97706'
  return '#dc2626'
}

function scoreBg(score) {
  if (score >= 90) return '#f0fdf4'
  if (score >= 70) return '#fffbeb'
  return '#fef2f2'
}

function ScoreMeter({ score }) {
  const color = scoreColor(score)
  const label = score >= 90 ? 'Healthy' : score >= 70 ? 'Degraded' : 'Critical'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ position: 'relative', width: 80, height: 80 }}>
        <svg viewBox="0 0 36 36" style={{ width: 80, height: 80, transform: 'rotate(-90deg)' }}>
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="3" />
          <circle cx="18" cy="18" r="15.9" fill="none" stroke={color} strokeWidth="3"
            strokeDasharray={`${score} ${100 - score}`} strokeLinecap="round" />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
          <span style={{ fontSize: 15, fontWeight: 800, color, lineHeight: 1 }}>{score}%</span>
        </div>
      </div>
      <div style={{ padding: '8px 10px', borderRadius: 10, background: scoreBg(score) }}>
        <div style={{ fontSize: 20, fontWeight: 800, color }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Overall Health Score</div>
      </div>
    </div>
  )
}

function StatusBadge({ pass, error }) {
  if (error) return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#fff1f2', color: '#e11d48' }}>ERROR</span>
  if (pass) return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#f0fdf4', color: '#16a34a' }}>PASS</span>
  return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#fef2f2', color: '#dc2626' }}>FAIL</span>
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({ report, running, onRun }) {
  if (running) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: 16 }}>
        <div style={{ width: 48, height: 48, border: '4px solid var(--border)', borderTop: '4px solid var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Running test suite…</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Tests run sequentially with 50ms gaps. This takes ~60–90 seconds.</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (!report) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🧪</div>
        <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700 }}>No Test Run Yet</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24 }}>Click "Run Full Suite" to execute all regression tests and see the health of the app.</p>
        <button onClick={onRun} style={{ padding: '10px 28px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
          ▶ Run Full Suite
        </button>
      </div>
    )
  }

  return (
    <div>
      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Total Tests', value: report.totalTests, color: 'var(--text-primary)', bg: 'var(--surface)' },
          { label: 'Passed', value: report.passed, color: '#16a34a', bg: '#f0fdf4' },
          { label: 'Failed', value: report.failed, color: '#dc2626', bg: '#fef2f2' },
          { label: 'Duration', value: `${(((new Date(report.completedAt) - new Date(report.startedAt)) / 1000).toFixed(1))}s`, color: 'var(--text-secondary)', bg: 'var(--surface)' },
        ].map(card => (
          <div key={card.label} style={{ background: card.bg, border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: card.color }}>{card.value}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, fontWeight: 500 }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* Module breakdown */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {(report.modules || []).map(mod => {
          const modScore = mod.passed + mod.failed > 0 ? Math.round((mod.passed / (mod.passed + mod.failed)) * 100) : 0
          const allPass = mod.failed === 0
          return (
            <div key={mod.name} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              {/* Module header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: allPass ? '#f0fdf4' : '#fef2f2', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 16 }}>{allPass ? '✅' : '❌'}</span>
                  <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{mod.name}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>{mod.passed} passed</span>
                  {mod.failed > 0 && <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 600 }}>{mod.failed} failed</span>}
                  <span style={{ fontSize: 12, fontWeight: 700, color: scoreColor(modScore) }}>{modScore}%</span>
                </div>
              </div>
              {/* Test rows */}
              <div>
                {mod.tests.map((t, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', borderBottom: i < mod.tests.length - 1 ? '1px solid var(--border)' : 'none', background: 'var(--surface)' }}>
                    <StatusBadge pass={t.pass} error={t.error} />
                    <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)' }}>{t.name}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 60, textAlign: 'right' }}>{t.durationMs}ms</span>
                    {t.details && <span style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 200, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.details}</span>}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── API Catalog Tab ───────────────────────────────────────────────────────────

function ApiCatalogTab({ token }) {
  const [catalog, setCatalog] = useState({ routes: [], covered_routes: 0, uncovered_routes: 0, total_tests: 0 })
  const [routes, setRoutes] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('ALL')
  const [coverageFilter, setCoverageFilter] = useState('ALL')

  useEffect(() => {
    httpFetch('/api/admin/regression/api-catalog', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : { routes: [], covered_routes: 0, uncovered_routes: 0, total_tests: 0 })
      .then(d => {
        setCatalog({
          routes: d.routes || [],
          covered_routes: d.covered_routes || 0,
          uncovered_routes: d.uncovered_routes || 0,
          total_tests: d.total_tests || 0,
        })
        setRoutes(d.routes || [])
      })
      .catch(() => {
        setCatalog({ routes: [], covered_routes: 0, uncovered_routes: 0, total_tests: 0 })
        setRoutes([])
      })
      .finally(() => setLoading(false))
  }, [token])

  const METHODS = ['ALL', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH']
  const METHOD_COLORS = { GET: '#2563eb', POST: '#16a34a', PUT: '#d97706', DELETE: '#dc2626', PATCH: '#7c3aed', DEFAULT: '#6b7280' }

  const filtered = routes.filter(r => {
    const matchSearch = !search || r.path.toLowerCase().includes(search.toLowerCase()) || String(r.source_module || '').toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === 'ALL' || r.method === filter
    const matchCoverage = coverageFilter === 'ALL' || (coverageFilter === 'COVERED' ? r.covered : !r.covered)
    return matchSearch && matchFilter && matchCoverage
  })

  if (loading) return <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Loading API catalog…</p>

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 180px))', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Covered APIs', value: catalog.covered_routes, color: '#16a34a', bg: '#f0fdf4' },
          { label: 'Uncovered APIs', value: catalog.uncovered_routes, color: '#dc2626', bg: '#fef2f2' },
          { label: 'Regression Tests', value: catalog.total_tests, color: 'var(--text-primary)', bg: 'var(--surface)' },
        ].map(card => (
          <div key={card.label} style={{ padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 8, background: card.bg }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: card.color }}>{card.value}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{card.label}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          style={{ padding: '7px 12px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, width: 300, background: 'var(--surface)', color: 'var(--text-primary)' }}
          placeholder="Search routes or modules…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 4 }}>
          {METHODS.map(m => (
            <button key={m} onClick={() => setFilter(m)}
              style={{ padding: '5px 10px', fontSize: 11, fontWeight: 600, border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', background: filter === m ? 'var(--primary)' : 'none', color: filter === m ? '#fff' : 'var(--text-secondary)' }}>
              {m}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {['ALL', 'COVERED', 'UNCOVERED'].map(item => (
            <button key={item} onClick={() => setCoverageFilter(item)}
              style={{ padding: '5px 10px', fontSize: 11, fontWeight: 600, border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', background: coverageFilter === item ? 'var(--primary)' : 'none', color: coverageFilter === item ? '#fff' : 'var(--text-secondary)' }}>
              {item}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>{filtered.length} / {routes.length} routes</span>
      </div>
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '80px minmax(0, 1fr) 120px 160px', background: 'var(--bg)', borderBottom: '2px solid var(--border)', padding: '6px 12px', gap: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>METHOD</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>PATH</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>COVERAGE</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>MODULE</span>
        </div>
        <div style={{ maxHeight: 500, overflowY: 'auto' }}>
          {filtered.map((r, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '80px minmax(0, 1fr) 120px 160px', padding: '7px 12px', borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--surface)' : 'var(--bg)', fontSize: 13, gap: 12, alignItems: 'center' }}>
              <span style={{ fontWeight: 700, color: METHOD_COLORS[r.method] || METHOD_COLORS.DEFAULT, fontSize: 11 }}>{r.method}</span>
              <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-primary)' }}>{r.path}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: r.covered ? '#16a34a' : '#dc2626' }}>
                {r.covered ? `Covered (${r.matched_tests?.length || 0})` : 'Uncovered'}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.source_module || 'Core'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── DB Tables Tab ─────────────────────────────────────────────────────────────

function DbTablesTab({ token }) {
  const [health, setHealth] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    httpFetch('/api/admin/regression/db-health', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => setHealth(d))
      .catch(() => setHealth({ status: 'error', tables: [] }))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) return <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Loading DB health…</p>
  if (!health) return <p style={{ color: 'var(--danger)', textAlign: 'center', padding: 40 }}>Failed to load DB health.</p>

  const filtered = (health.tables || []).filter(t => !search || t.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <div style={{ padding: '8px 16px', background: health.status === 'ok' ? '#f0fdf4' : '#fef2f2', border: '1px solid', borderColor: health.status === 'ok' ? '#86efac' : '#fca5a5', borderRadius: 8, fontSize: 13, fontWeight: 600, color: health.status === 'ok' ? '#16a34a' : '#dc2626' }}>
          {health.status === 'ok' ? `✅ DB Connected — ${health.table_count} tables` : `❌ DB Error: ${health.error}`}
        </div>
        <input
          style={{ padding: '7px 12px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, width: 240, background: 'var(--surface)', color: 'var(--text-primary)' }}
          placeholder="Search tables…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filtered.map(t => (
          <div key={t.name} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <div
              onClick={() => setExpanded(expanded === t.name ? null : t.name)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', cursor: 'pointer', background: 'var(--surface)', userSelect: 'none' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 14 }}>🗄️</span>
                <span style={{ fontWeight: 600, fontSize: 13, fontFamily: 'monospace', color: 'var(--text-primary)' }}>{t.name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 12, color: 'var(--text-muted)' }}>
                <span>{t.columns} columns</span>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{t.rows?.toLocaleString()} rows</span>
                <span style={{ color: 'var(--text-muted)' }}>{expanded === t.name ? '▲' : '▼'}</span>
              </div>
            </div>
            {expanded === t.name && (
              <div style={{ padding: '10px 16px', background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {(t.columnNames || []).map(col => (
                    <span key={col} style={{ padding: '2px 8px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11, fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{col}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── History Tab ───────────────────────────────────────────────────────────────

function HistoryTab({ token }) {
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detail, setDetail] = useState(null)

  useEffect(() => {
    httpFetch('/api/admin/regression/history', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : { runs: [] })
      .then(d => setRuns(d.runs || []))
      .catch(() => setRuns([]))
      .finally(() => setLoading(false))
  }, [token])

  async function loadDetail(run) {
    setSelected(run)
    setDetailLoading(true)
    try {
      const res = await httpFetch(`/api/admin/regression/history/${run.id}`, { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) { const d = await res.json(); setDetail(d.run) }
    } catch { /* silent */ }
    setDetailLoading(false)
  }

  if (loading) return <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Loading history…</p>

  if (runs.length === 0) return (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', fontSize: 14 }}>
      No run history yet. Run the suite to start building history.
    </div>
  )

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20 }}>
      {/* Run list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {runs.map(run => (
          <div key={run.id} onClick={() => loadDetail(run)}
            style={{ padding: '12px 14px', border: `1px solid ${selected?.id === run.id ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 8, cursor: 'pointer', background: selected?.id === run.id ? 'var(--primary-light, #f0ebff)' : 'var(--surface)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: scoreColor(run.health_score) }}>{run.health_score}%</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(run.started_at).toLocaleDateString()}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {run.passed}/{run.total_tests} passed · {run.run_by_name || 'System'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {new Date(run.started_at).toLocaleTimeString()}
            </div>
          </div>
        ))}
      </div>

      {/* Detail */}
      <div>
        {!selected && <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', paddingTop: 40 }}>Select a run to see details.</div>}
        {selected && detailLoading && <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Loading…</p>}
        {selected && !detailLoading && detail && (
          <div>
            {/* Summary cards */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              {[
                { l: 'Total', v: detail.totalTests ?? detail.total_tests },
                { l: 'Passed', v: detail.passed },
                { l: 'Failed', v: detail.failed },
                { l: 'Score', v: `${detail.healthScore ?? detail.health_score}%` },
              ].map(s => (
                <div key={s.l} style={{ padding: '8px 16px', border: '1px solid var(--border)', borderRadius: 8, textAlign: 'center', background: 'var(--surface)' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>{s.v}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.l}</div>
                </div>
              ))}
            </div>

            {/* Module grouping — mirrors Overview tab */}
            {(detail.modules || []).length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(detail.modules || []).map(mod => {
                  const allPass = mod.failed === 0
                  const modScore = mod.passed + mod.failed > 0 ? Math.round((mod.passed / (mod.passed + mod.failed)) * 100) : 0
                  return (
                    <div key={mod.name} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', background: allPass ? '#f0fdf4' : '#fef2f2', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>{allPass ? '✅' : '❌'}</span>
                          <span style={{ fontWeight: 700, fontSize: 13 }}>{mod.name}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 10, fontSize: 12 }}>
                          <span style={{ color: '#16a34a', fontWeight: 600 }}>{mod.passed} passed</span>
                          {mod.failed > 0 && <span style={{ color: '#dc2626', fontWeight: 600 }}>{mod.failed} failed</span>}
                          <span style={{ fontWeight: 700, color: scoreColor(modScore) }}>{modScore}%</span>
                        </div>
                      </div>
                      {mod.tests.map((t, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', borderBottom: i < mod.tests.length - 1 ? '1px solid var(--border)' : 'none', background: 'var(--surface)', fontSize: 12 }}>
                          <StatusBadge pass={t.pass} error={t.error} />
                          <span style={{ flex: 1, color: 'var(--text-primary)' }}>{t.name}</span>
                          <span style={{ color: 'var(--text-muted)', minWidth: 50, textAlign: 'right' }}>{t.durationMs}ms</span>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            ) : (
              /* Fallback flat list if modules not available */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(detail.results || []).map((r, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, background: r.pass ? '#f0fdf4' : '#fef2f2', fontSize: 12 }}>
                    <StatusBadge pass={r.pass} error={r.error} />
                    <span style={{ flex: 1 }}>{r.name}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{r.durationMs}ms</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function RegressionPage({ embedded = false } = {}) {
  const { token } = useAuth()
  const [activeTab, setActiveTab] = useState('overview')
  const [report, setReport] = useState(null)
  const [running, setRunning] = useState(false)
  const [lastRunAt, setLastRunAt] = useState(null)
  const [error, setError] = useState('')

  async function runSuite() {
    setRunning(true)
    setError('')
    setActiveTab('overview')
    try {
      const res = await httpFetch('/api/admin/regression/run', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      })
      if (res.ok) {
        const data = await res.json()
        setReport(data)
        setLastRunAt(new Date())
      } else {
        const d = await res.json()
        setError(d.error || 'Run failed.')
      }
    } catch { setError('Network error — could not reach the server.') }
    setRunning(false)
  }

  const TABS = [
    { key: 'overview', label: '📊 Overview' },
    { key: 'api', label: '🔗 API Catalog' },
    { key: 'db', label: '🗄️ DB Tables' },
    { key: 'history', label: '📜 History' },
  ]

  const content = (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ margin: '0 0 2px', fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>🧪 Regression Testing Suite</h2>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
                Full app health check — APIs, DB schema, feature smoke tests.
                {lastRunAt && <span style={{ marginLeft: 8 }}>Last run: {lastRunAt.toLocaleTimeString()}</span>}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {report && <ScoreMeter score={report.healthScore} />}
              <button
                onClick={runSuite}
                disabled={running}
                style={{ padding: '10px 24px', background: running ? 'var(--border)' : 'var(--primary)', color: running ? 'var(--text-muted)' : '#fff', border: 'none', borderRadius: 8, cursor: running ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}
              >
                {running ? '⏳ Running…' : '▶ Run Full Suite'}
              </button>
            </div>
          </div>
          {error && <div style={{ marginTop: 10, padding: '8px 14px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, fontSize: 13, color: '#dc2626' }}>{error}</div>}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--border)', background: 'var(--surface)', flexShrink: 0, padding: '0 24px' }}>
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              style={{ padding: '10px 20px', background: 'none', border: 'none', borderBottom: `2px solid ${activeTab === tab.key ? 'var(--primary)' : 'transparent'}`, marginBottom: -2, cursor: 'pointer', fontSize: 13, fontWeight: activeTab === tab.key ? 700 : 500, color: activeTab === tab.key ? 'var(--primary)' : 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {activeTab === 'overview' && <OverviewTab report={report} running={running} onRun={runSuite} />}
          {activeTab === 'api' && <ApiCatalogTab token={token} />}
          {activeTab === 'db' && <DbTablesTab token={token} />}
          {activeTab === 'history' && <HistoryTab token={token} />}
        </div>
      </div>
    </>
  )

  if (embedded) return content
  return <MIMSLayout showStatStrip={false} bodyClassName="mims-ops-page-body" surfaceVariant="workspace" compact>{content}</MIMSLayout>
}
