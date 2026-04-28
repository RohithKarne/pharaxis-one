import { useState, useEffect, useCallback, useMemo } from 'react'
import { confirm } from '../../../shared/utils/confirm'
import MIMSLayout from '../../../shared/components/MIMSLayout'
import FlowDiagram from '../processExplorer/FlowDiagram'
import { FLOW_TEMPLATES, generateFlow } from '../processExplorer/flowTemplates'
import { useAuth } from '../../../shared/context/AuthContext'
import { httpFetch } from '../../../shared/api/httpFetch.js'

function toIST(ts) {
  if (!ts) return ''
  const dt = new Date(ts)
  if (Number.isNaN(dt.getTime())) return ts
  return dt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true }) + ' IST'
}

const METHOD_STYLES = {
  GET: { bg: '#DCFCE7', fg: '#15803D' },
  POST: { bg: '#DBEAFE', fg: '#1D4ED8' },
  PUT: { bg: '#FEF9C3', fg: '#854D0E' },
  PATCH: { bg: '#FEF9C3', fg: '#854D0E' },
  DELETE: { bg: '#FEE2E2', fg: '#DC2626' },
  JOB: { bg: '#EDE9FE', fg: '#6D28D9' },
  SCHEMA: { bg: '#E0F2FE', fg: '#075985' },
}

function MethodBadge({ method }) {
  const s = METHOD_STYLES[String(method || '').toUpperCase()] || { bg: '#F1F5F9', fg: '#475569' }
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 5px', borderRadius: 3,
      background: s.bg, color: s.fg, letterSpacing: '0.03em', flexShrink: 0,
    }}>
      {String(method || '').toUpperCase()}
    </span>
  )
}

function StatusBadge({ code }) {
  if (!code) return null
  const ok = Number(code) < 400
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 5px', borderRadius: 3,
      background: ok ? '#DCFCE7' : '#FEE2E2', color: ok ? '#15803D' : '#DC2626', flexShrink: 0,
    }}>
      {code}
    </span>
  )
}

function FlowCard({ title, description, meta, isSelected, onClick }) {
  return (
    <div onClick={onClick} style={{
      padding: '10px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 4,
      border: `1.5px solid ${isSelected ? '#6B3FA0' : '#E2E8F0'}`,
      background: isSelected ? '#F9F5FF' : '#fff',
      transition: 'all 0.15s',
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#1E293B', marginBottom: 2 }}>{title}</div>
      <p style={{ margin: 0, fontSize: 11, color: '#64748B', lineHeight: 1.4 }}>
        {description}
      </p>
      {meta ? <div style={{ marginTop: 5, fontSize: 10, color: '#94A3B8' }}>{meta}</div> : null}
    </div>
  )
}

function LogRow({ log, isSelected, onClick }) {
  const isError = Number(log.status_code) >= 400
  return (
    <div onClick={onClick} style={{
      padding: '8px 10px', borderRadius: 6, cursor: 'pointer', marginBottom: 3,
      border: `1.5px solid ${isSelected ? '#6B3FA0' : '#E2E8F0'}`,
      background: isSelected ? '#F9F5FF' : isError ? '#FFF5F5' : '#fff',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
          background: '#F3E8FF', color: '#6B3FA0', flexShrink: 0,
        }}>
          {log.source_module || 'MIMS'}
        </span>
        <MethodBadge method={log.method} />
        <span style={{
          fontSize: 11, color: '#334155', fontFamily: 'monospace',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0,
        }}>
          {log.path}
        </span>
        <StatusBadge code={log.status_code} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: '#94A3B8' }}>{toIST(log.created_at)}</span>
        {log.duration_ms != null && <span style={{ fontSize: 10, color: '#94A3B8' }}>{log.duration_ms}ms</span>}
        {log.event_type && <span style={{ fontSize: 10, color: '#6B3FA0', fontWeight: 600 }}>{log.event_type}</span>}
      </div>
      {log.summary ? <div style={{ fontSize: 10, color: '#64748B', marginTop: 3 }}>{log.summary}</div> : null}
    </div>
  )
}

const selStyle = {
  flex: 1, padding: '4px 6px', borderRadius: 5, border: '1px solid #E2E8F0',
  fontSize: 11, background: '#fff',
}

const eventStyle = {
  flex: 1, padding: '4px 6px', borderRadius: 5, border: '1px solid #E2E8F0',
  fontSize: 11, background: '#fff', marginTop: 4,
}

export default function ProcessExplorerPage() {
  const { token } = useAuth()
  const headers = useMemo(() => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }), [token])

  const [tab, setTab] = useState('live')
  const [logs, setLogs] = useState([])
  const [totalLogs, setTotalLogs] = useState(0)
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [filterMethod, setFilterMethod] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterEvent, setFilterEvent] = useState('all')
  const [search, setSearch] = useState('')
  const [selectedLog, setSelectedLog] = useState(null)
  const [selectedFlowKey, setSelectedFlowKey] = useState(null)
  const [libSearch, setLibSearch] = useState('')
  const [retention, setRetention] = useState(30)
  const [leftOpen, setLeftOpen] = useState(true)
  const [windowMin, setWindowMin] = useState(5)
  const [hasFetched, setHasFetched] = useState(false)
  const [generatedFlows, setGeneratedFlows] = useState([])
  const [generatedSelected, setGeneratedSelected] = useState(null)
  const [sqlPolicy, setSqlPolicy] = useState(null)

  const fetchConfig = useCallback(async () => {
    try {
      const res = await httpFetch('/api/admin/process-logs/config', { headers })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load explorer config')
      setSqlPolicy(data?.sql_policy || null)
    } catch (_) {
      setSqlPolicy(null)
    }
  }, [headers])

  const fetchLogs = useCallback(async () => {
    setLoadingLogs(true)
    try {
      const params = new URLSearchParams({ limit: 200, window_min: String(windowMin) })
      if (filterMethod !== 'all') params.set('method', filterMethod)
      if (filterStatus !== 'all') params.set('status', filterStatus)
      if (filterEvent !== 'all') params.set('event_type', filterEvent)
      if (search.trim()) params.set('search', search.trim())
      const res = await httpFetch(`/api/admin/process-logs?${params.toString()}`, { headers })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load logs')
      setLogs(data.logs || [])
      setTotalLogs(data.total || 0)
      setSelectedLog(prev => prev || (data.logs || [])[0] || null)
      setSqlPolicy(data?.config?.sql_policy || null)
      setHasFetched(true)
    } catch (_) {
      setLogs([])
      setTotalLogs(0)
    }
    setLoadingLogs(false)
  }, [filterEvent, filterMethod, filterStatus, headers, search, windowMin])

  const fetchLibrary = useCallback(async () => {
    try {
      const res = await httpFetch('/api/admin/process-logs/library', { headers })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load library')
      const rows = Array.isArray(data.flows) ? data.flows : []
      setGeneratedFlows(rows)
      setGeneratedSelected(prev => prev || null)
    } catch (_) {
      setGeneratedFlows([])
    }
  }, [headers])

  useEffect(() => {
    if (tab === 'library') fetchLibrary()
  }, [tab, fetchLibrary])

  useEffect(() => {
    fetchConfig()
  }, [fetchConfig])

  async function purgeOldLogs() {
    if (!await confirm(`Delete logs older than ${retention} days?`)) return
    await httpFetch(`/api/admin/process-logs/purge?days=${retention}`, { method: 'DELETE', headers })
    if (hasFetched) fetchLogs()
    if (tab === 'library') fetchLibrary()
  }

  const libraryEntries = Object.entries(FLOW_TEMPLATES).filter(([, f]) => {
    if (!libSearch.trim()) return true
    const q = libSearch.toLowerCase()
    return f.title.toLowerCase().includes(q) || f.description.toLowerCase().includes(q) || String(f.source || '').includes(q)
  })
  const mimsDedicatedFlows = libraryEntries
    .filter(([key]) => key === 'generic_admin' || key.startsWith('error_'))
    .map(([key, flow]) => {
      const title = key === 'generic_admin'
        ? 'MIMS Generic Admin Flow'
        : flow.title.replace(/^Error/i, 'MIMS Error')
      return [key, { ...flow, title, source: 'mims' }]
    })
  const mimsFeatureFlows = libraryEntries
    .filter(([key]) => key.startsWith('mims_'))
    .map(([key, flow]) => [key, { ...flow, source: 'mims' }])
  const dedicatedFlowMap = new Map(mimsDedicatedFlows)
  for (const [key, flow] of mimsFeatureFlows) dedicatedFlowMap.set(key, flow)
  const generatedMatches = generatedFlows.filter((f) => {
    if (!libSearch.trim()) return true
    const q = libSearch.toLowerCase()
    return String(f.path_pattern || '').toLowerCase().includes(q) || String(f.source_module || '').toLowerCase().includes(q)
  })

  const activeFlow = useMemo(() => {
    if (tab === 'library') {
      if (selectedFlowKey) {
        const flow = dedicatedFlowMap.get(selectedFlowKey)
        if (flow) return flow
      }
      if (generatedSelected) {
        return generateFlow(generatedSelected.method, generatedSelected.path_pattern, {
          routeFile: generatedSelected.route_file || null,
        })
      }
      return null
    }
    if (!selectedLog) return null
    return generateFlow(selectedLog.method, selectedLog.path_pattern || selectedLog.path, {
      routeFile: selectedLog.route_file || null,
    })
  }, [tab, selectedFlowKey, dedicatedFlowMap, generatedSelected, selectedLog])

  const activeFlowKey = useMemo(() => {
    if (tab === 'library') {
      if (selectedFlowKey) return `library:static:${selectedFlowKey}`
      if (generatedSelected) {
        return `library:generated:${generatedSelected.method || ''}:${generatedSelected.path_pattern || ''}:${generatedSelected.event_type || ''}`
      }
      return 'library:none'
    }
    if (!selectedLog) return 'live:none'
    return `live:${selectedLog.id || ''}:${selectedLog.method || ''}:${selectedLog.path || ''}:${selectedLog.created_at || ''}`
  }, [tab, selectedFlowKey, generatedSelected, selectedLog])

  const activeLogEntry = tab === 'live' ? selectedLog : null

  return (
    <MIMSLayout showStatStrip={false}>
      <div style={{ display: 'flex', height: 'calc(100vh - 150px)', gap: 0, overflow: 'hidden' }}>
        {leftOpen && (
          <div style={{
            width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column',
            borderRight: '1px solid #E2E8F0', background: '#FAFAFA',
          }}>
            <div style={{ display: 'flex', borderBottom: '1px solid #E2E8F0' }}>
              {['live', 'library'].map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '10px 0', border: 'none', cursor: 'pointer', fontSize: 12,
                  fontWeight: 700,
                  borderBottom: tab === t ? '2px solid #6B3FA0' : '2px solid transparent',
                  background: 'transparent', color: tab === t ? '#6B3FA0' : '#64748B',
                }}>
                  <span style={{ width: 14, display: 'inline-flex', justifyContent: 'center', flexShrink: 0 }}>
                    {t === 'live' ? '🔴' : '📚'}
                  </span>
                  <span>{t === 'live' ? 'Live Feed' : 'Flow Library'}</span>
                </button>
              ))}
            </div>

            {tab === 'live' && (
              <>
                <div style={{ padding: '8px 10px', borderBottom: '1px solid #E2E8F0' }}>
                  <input
                    placeholder="Search path…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{
                      width: '100%', padding: '5px 8px', borderRadius: 6,
                      border: '1px solid #E2E8F0', fontSize: 12, boxSizing: 'border-box', marginBottom: 6,
                    }}
                  />
                  <div style={{ display: 'flex', gap: 4 }}>
                    <select value={filterMethod} onChange={e => setFilterMethod(e.target.value)} style={selStyle}>
                      <option value="all">All methods</option>
                      {['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'JOB', 'SCHEMA'].map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selStyle}>
                      <option value="all">All status</option>
                      <option value="success">Success</option>
                      <option value="error">Error</option>
                    </select>
                  </div>
                  <select value={filterEvent} onChange={e => setFilterEvent(e.target.value)} style={eventStyle}>
                    <option value="all">All business events</option>
                    <option value="create">Create</option>
                    <option value="update">Update</option>
                    <option value="delete">Delete</option>
                    <option value="job_success">Job Success</option>
                    <option value="job_failed">Job Failed</option>
                    <option value="schema_create_table">Schema Create Table</option>
                    <option value="schema_add_column">Schema Add Column</option>
                    <option value="schema_alter_column">Schema Alter Column</option>
                    <option value="schema_drop_column">Schema Drop Column</option>
                    <option value="schema_drop_table">Schema Drop Table</option>
                  </select>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                    <span style={{ fontSize: 11, color: '#94A3B8' }}>
                      {loadingLogs ? 'Loading…' : hasFetched ? `${totalLogs} captured` : 'No data fetched yet'}
                    </span>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <select value={windowMin} onChange={e => setWindowMin(Number(e.target.value) || 5)} style={{ ...selStyle, width: 86, flex: 'none' }}>
                        <option value={5}>5 mins</option>
                        <option value={10}>10 mins</option>
                        <option value={15}>15 mins</option>
                      </select>
                      <button onClick={fetchLogs} style={miniBtn('#EFF6FF', '#1D4ED8')}>Get Data</button>
                    </div>
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 4, marginTop: 5,
                    paddingTop: 5, borderTop: '1px solid #F1F5F9',
                  }}>
                    <span style={{ fontSize: 10, color: '#94A3B8' }}>Keep:</span>
                    <select value={retention} onChange={e => setRetention(Number(e.target.value))} style={{ ...selStyle, flex: 'none', width: 90 }}>
                      <option value={7}>7 days</option>
                      <option value={14}>14 days</option>
                      <option value={30}>30 days</option>
                      <option value={60}>60 days</option>
                      <option value={90}>90 days</option>
                    </select>
                    <button onClick={purgeOldLogs} style={miniBtn('#FEF3C7', '#92400E')}>🧹 Purge old</button>
                  </div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', scrollbarGutter: 'stable', padding: '6px 8px' }}>
                  {!hasFetched && !loadingLogs && (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94A3B8', fontSize: 12 }}>
                      Click <strong>Get Data</strong> to fetch saved business events.
                    </div>
                  )}
                  {hasFetched && logs.length === 0 && !loadingLogs && (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94A3B8' }}>
                      <div style={{ fontSize: 30, marginBottom: 8 }}>📡</div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>No events in selected window</div>
                    </div>
                  )}
                  {logs.map(log => (
                    <LogRow
                      key={log.id}
                      log={log}
                      isSelected={selectedLog?.id === log.id}
                      onClick={() => { setSelectedLog(log); setTab('live') }}
                    />
                  ))}
                </div>
              </>
            )}

            {tab === 'library' && (
              <>
                <div style={{ padding: '8px 10px', borderBottom: '1px solid #E2E8F0' }}>
                  <input
                    placeholder="Search flows…"
                    value={libSearch}
                    onChange={e => setLibSearch(e.target.value)}
                    style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #E2E8F0', fontSize: 12, boxSizing: 'border-box' }}
                  />
                  <div style={{ marginTop: 4, fontSize: 11, color: '#94A3B8' }}>
                    {mimsDedicatedFlows.length + mimsFeatureFlows.length + generatedMatches.length} flows
                  </div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', scrollbarGutter: 'stable', padding: '6px 8px' }}>
                  {mimsDedicatedFlows.length > 0 && <div style={groupLabelStyle}>Dedicated MIMS Flows</div>}
                  {mimsDedicatedFlows.map(([key, flow]) => (
                    <FlowCard
                      key={key}
                      title={flow.title}
                      description={flow.description}
                      meta={`${flow.swimlanes.join(' → ')} · ${flow.steps.length} steps`}
                      isSelected={selectedFlowKey === key && !generatedSelected}
                      onClick={() => { setSelectedFlowKey(key); setGeneratedSelected(null) }}
                    />
                  ))}
                  {mimsFeatureFlows.length > 0 && <div style={groupLabelStyle}>MIMS Feature Templates</div>}
                  {mimsFeatureFlows.map(([key, flow]) => (
                    <FlowCard
                      key={key}
                      title={flow.title}
                      description={flow.description}
                      meta={`${flow.swimlanes.join(' → ')} · ${flow.steps.length} steps`}
                      isSelected={selectedFlowKey === key && !generatedSelected}
                      onClick={() => { setSelectedFlowKey(key); setGeneratedSelected(null) }}
                    />
                  ))}
                  <div style={groupLabelStyle}>Generated From MIMS Data</div>
                  {generatedMatches.map((row, idx) => (
                    <FlowCard
                      key={`${row.path_pattern}-${row.method}-${idx}`}
                      title={`${row.method} ${row.path_pattern}`}
                      description={`${row.source_module} · ${row.event_type}`}
                      meta={`${row.event_count} events · ${row.coverage_source || 'logs'}${row.last_seen ? ` · last ${toIST(row.last_seen)}` : ''}`}
                      isSelected={generatedSelected === row}
                      onClick={() => { setGeneratedSelected(row); setSelectedFlowKey(null) }}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
            borderBottom: '1px solid #E2E8F0', background: '#fff', flexShrink: 0,
          }}>
            <button onClick={() => setLeftOpen(o => !o)} style={{
              background: '#F1F5F9', border: '1px solid #E2E8F0', color: '#334155',
              borderRadius: 6, padding: '4px 8px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>
              {leftOpen ? '⟨⟨ Hide Panel' : '⟩⟩ Show Panel'}
            </button>
          </div>
          {activeFlow ? (
            <FlowDiagram
              flow={activeFlow}
              flowKey={activeFlowKey}
              logEntry={activeLogEntry}
              authHeaders={headers}
              sqlPolicy={sqlPolicy}
              onClose={tab === 'live' ? () => setSelectedLog(null) : () => { setSelectedFlowKey(null); setGeneratedSelected(null) }}
            />
          ) : (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', color: '#94A3B8', padding: 40, textAlign: 'center',
            }}>
              <div style={{ fontSize: 56, marginBottom: 16 }}>{tab === 'live' ? '📡' : '📐'}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#64748B', marginBottom: 8 }}>
                {tab === 'live' ? 'Select an event log' : 'Select a flow'}
              </div>
            </div>
          )}
        </div>
      </div>
    </MIMSLayout>
  )
}

function miniBtn(bg, fg) {
  return {
    background: bg, color: fg, border: 'none', borderRadius: 4, padding: '3px 8px',
    fontSize: 10, fontWeight: 600, cursor: 'pointer',
  }
}

const groupLabelStyle = {
  fontSize: 10, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em',
  textTransform: 'uppercase', padding: '8px 2px 6px',
}
