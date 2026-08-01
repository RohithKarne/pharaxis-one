import React, { useEffect, useMemo, useState } from 'react'

const API_BASE = import.meta.env.VITE_AI_AGENT_URL || ''
const TOKENS = {
  primary: '#6B3FA0',
  navy: '#0f172a',
  slate: '#64748b',
  bg: '#f8fafc',
  card: '#ffffff',
  border: '#e2e8f0',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#3b82f6'
}

const PAGE_SIZE = 20

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(toNumber(value))
}

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString()
}

function statusColor(status) {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'success') return TOKENS.success
  if (normalized === 'failed') return TOKENS.danger
  if (normalized === 'timeout') return TOKENS.warning
  return TOKENS.slate
}

export default function UsagePage() {
  const [draftFilters, setDraftFilters] = useState({
    app_source: '',
    status: '',
    from_date: '',
    to_date: ''
  })
  const [appliedFilters, setAppliedFilters] = useState({
    app_source: '',
    status: '',
    from_date: '',
    to_date: ''
  })
  const [page, setPage] = useState(1)
  const [logs, setLogs] = useState([])
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState({ total_queries: 0, total_tokens_in: 0, total_tokens_out: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadUsage() {
      setLoading(true)
      setError('')

      const params = new URLSearchParams()
      params.set('limit', String(PAGE_SIZE))
      params.set('offset', String((page - 1) * PAGE_SIZE))
      if (appliedFilters.app_source) params.set('app_source', appliedFilters.app_source)
      if (appliedFilters.status) params.set('status', appliedFilters.status)
      if (appliedFilters.from_date) params.set('from_date', `${appliedFilters.from_date} 00:00:00`)
      if (appliedFilters.to_date) params.set('to_date', `${appliedFilters.to_date} 23:59:59`)

      try {
        const response = await fetch(`${API_BASE}/api/v1/agent/admin/usage?${params.toString()}`, {
          credentials: 'include'
        })
        const payload = await response.json()

        if (!response.ok) {
          throw new Error(payload?.error || 'Failed to load usage logs')
        }

        if (!cancelled) {
          const rawLogs = Array.isArray(payload?.logs) ? payload.logs : []
          const filteredLogs = appliedFilters.status
            ? rawLogs.filter(log => String(log.status).toLowerCase() === String(appliedFilters.status).toLowerCase())
            : rawLogs

          setLogs(filteredLogs)
          setTotal(toNumber(payload?.total))
          setSummary({
            total_queries: toNumber(payload?.summary?.total_queries),
            total_tokens_in: toNumber(payload?.summary?.total_tokens_in),
            total_tokens_out: toNumber(payload?.summary?.total_tokens_out)
          })
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load usage logs')
          setLogs([])
          setTotal(0)
          setSummary({ total_queries: 0, total_tokens_in: 0, total_tokens_out: 0 })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadUsage()
    return () => { cancelled = true }
  }, [page, appliedFilters])

  const start = total === 0 ? 0 : ((page - 1) * PAGE_SIZE) + 1
  const end = Math.min((page - 1) * PAGE_SIZE + logs.length, total)
  const hasPrevious = page > 1
  const hasNext = page * PAGE_SIZE < total

  const summaryCards = useMemo(() => ([
    { label: 'Total Queries', value: summary.total_queries, color: TOKENS.info },
    { label: 'Tokens In', value: summary.total_tokens_in, color: TOKENS.warning },
    { label: 'Tokens Out', value: summary.total_tokens_out, color: TOKENS.primary }
  ]), [summary])

  function handleApplyFilters() {
    setPage(1)
    setAppliedFilters({ ...draftFilters })
  }

  return (
    <div style={{ display: 'grid', gap: '18px' }}>
      <section style={{ background: TOKENS.card, border: `1px solid ${TOKENS.border}`, borderRadius: '12px', padding: '14px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <select
            value={draftFilters.app_source}
            onChange={event => setDraftFilters(prev => ({ ...prev, app_source: event.target.value }))}
            style={{ width: '170px', padding: '10px 12px', border: `1px solid ${TOKENS.border}`, borderRadius: '8px', background: '#fff' }}
          >
            <option value="">All App Sources</option>
            <option value="cp_portal">cp_portal</option>
            <option value="mims">mims</option>
            <option value="vault">vault</option>
            <option value="qms">qms</option>
            <option value="safety">safety</option>
            <option value="external">external</option>
          </select>

          <select
            value={draftFilters.status}
            onChange={event => setDraftFilters(prev => ({ ...prev, status: event.target.value }))}
            style={{ width: '150px', padding: '10px 12px', border: `1px solid ${TOKENS.border}`, borderRadius: '8px', background: '#fff' }}
          >
            <option value="">All Status</option>
            <option value="success">success</option>
            <option value="failed">failed</option>
            <option value="timeout">timeout</option>
          </select>

          <input
            type="date"
            value={draftFilters.from_date}
            onChange={event => setDraftFilters(prev => ({ ...prev, from_date: event.target.value }))}
            style={{ width: '170px', padding: '10px 12px', border: `1px solid ${TOKENS.border}`, borderRadius: '8px' }}
          />

          <input
            type="date"
            value={draftFilters.to_date}
            onChange={event => setDraftFilters(prev => ({ ...prev, to_date: event.target.value }))}
            style={{ width: '170px', padding: '10px 12px', border: `1px solid ${TOKENS.border}`, borderRadius: '8px' }}
          />

          <button
            type="button"
            onClick={handleApplyFilters}
            style={{
              border: 'none',
              borderRadius: '8px',
              background: TOKENS.primary,
              color: '#fff',
              fontWeight: 600,
              padding: '0 16px',
              cursor: 'pointer'
            }}
          >
            Apply
          </button>
        </div>
      </section>

      <section style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        {summaryCards.map(card => (
          <article key={card.label} style={{ background: TOKENS.card, border: `1px solid ${TOKENS.border}`, borderRadius: '12px', padding: '14px' }}>
            <div style={{ color: TOKENS.slate, fontSize: '12px' }}>{card.label}</div>
            <div style={{ color: card.color, fontWeight: 700, fontSize: '24px', marginTop: '6px' }}>{formatNumber(card.value)}</div>
          </article>
        ))}
      </section>

      {loading && <div style={{ color: TOKENS.slate }}>Loading usage logs...</div>}
      {error && <div style={{ color: TOKENS.danger, fontWeight: 500 }}>{error}</div>}

      <section style={{ background: TOKENS.card, border: `1px solid ${TOKENS.border}`, borderRadius: '12px', padding: '14px' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '980px' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: TOKENS.slate, fontSize: '12px' }}>
                <th style={{ paddingBottom: '10px' }}>Time</th>
                <th style={{ paddingBottom: '10px' }}>App Source</th>
                <th style={{ paddingBottom: '10px' }}>Query Type</th>
                <th style={{ paddingBottom: '10px' }}>Provider</th>
                <th style={{ paddingBottom: '10px' }}>Tokens In</th>
                <th style={{ paddingBottom: '10px' }}>Tokens Out</th>
                <th style={{ paddingBottom: '10px' }}>Latency ms</th>
                <th style={{ paddingBottom: '10px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && !loading && (
                <tr>
                  <td colSpan={8} style={{ padding: '14px 0', color: TOKENS.slate }}>
                    No usage logs for current filters.
                  </td>
                </tr>
              )}
              {logs.map(log => {
                const badgeColor = statusColor(log.status)
                return (
                  <tr key={log.id} style={{ borderTop: `1px solid ${TOKENS.border}`, fontSize: '13px' }}>
                    <td style={{ padding: '11px 0', color: TOKENS.slate }}>{formatDate(log.created_at)}</td>
                    <td style={{ padding: '11px 0', color: TOKENS.navy }}>{log.app_source}</td>
                    <td style={{ padding: '11px 0', color: TOKENS.navy }}>{log.query_type}</td>
                    <td style={{ padding: '11px 0', color: TOKENS.navy }}>{log.provider}</td>
                    <td style={{ padding: '11px 0', color: TOKENS.navy }}>{formatNumber(log.tokens_in)}</td>
                    <td style={{ padding: '11px 0', color: TOKENS.navy }}>{formatNumber(log.tokens_out)}</td>
                    <td style={{ padding: '11px 0', color: TOKENS.navy }}>{formatNumber(log.response_latency_ms)}</td>
                    <td style={{ padding: '11px 0' }}>
                      <span style={{ background: `${badgeColor}22`, color: badgeColor, padding: '4px 9px', borderRadius: '999px', fontWeight: 600 }}>
                        {log.status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ color: TOKENS.slate, fontSize: '13px' }}>
            Showing {start} to {end} of {formatNumber(total)}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              disabled={!hasPrevious}
              onClick={() => setPage(prev => Math.max(prev - 1, 1))}
              style={{
                border: `1px solid ${TOKENS.border}`,
                borderRadius: '8px',
                padding: '7px 12px',
                background: '#fff',
                color: TOKENS.navy,
                cursor: hasPrevious ? 'pointer' : 'not-allowed'
              }}
            >
              Prev
            </button>
            <button
              type="button"
              disabled={!hasNext}
              onClick={() => setPage(prev => prev + 1)}
              style={{
                border: `1px solid ${TOKENS.border}`,
                borderRadius: '8px',
                padding: '7px 12px',
                background: '#fff',
                color: TOKENS.navy,
                cursor: hasNext ? 'pointer' : 'not-allowed'
              }}
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
