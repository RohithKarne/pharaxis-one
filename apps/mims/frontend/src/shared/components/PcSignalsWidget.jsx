/**
 * PcSignalsWidget — Sprint 2 #29.
 *
 * Dashboard widget that surfaces active PC trending signals: product +
 * complaint-code + lot combinations exceeding the configured threshold over
 * the rolling 30-day window vs the prior 60-day baseline.
 */

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { httpFetch } from '../api/httpFetch.js'

export default function PcSignalsWidget({ onOpen }) {
  const { token } = useAuth()
  const [signals, setSignals] = useState([])
  const [loading, setLoading] = useState(true)
  const [trends, setTrends] = useState([])
  const [showTrends, setShowTrends] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, t] = await Promise.all([
        httpFetch('/api/pc-signals', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
        httpFetch('/api/pc-trending', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      ])
      setSignals(s.signals || [])
      setTrends(t.trends || [])
    } catch { setSignals([]); setTrends([]) }
    finally { setLoading(false) }
  }, [token])

  useEffect(() => {
    load()
    const id = setInterval(load, 5 * 60_000)
    return () => clearInterval(id)
  }, [load])

  return (
    <div style={{ background: 'var(--surface,#fff)', border: '1px solid var(--border)', borderRadius: 8 }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: 13 }}>
          🚨 PC Signals {signals.length > 0 && (
            <span style={{
              marginLeft: 6, padding: '0 7px', borderRadius: 9,
              background: '#b91c1c', color: '#fff', fontSize: 10,
            }}>{signals.length}</span>
          )}
        </strong>
        <button onClick={() => setShowTrends(s => !s)} style={{
          background: 'transparent', border: 'none', fontSize: 11,
          color: 'var(--accent,#1a4f9c)', cursor: 'pointer', fontWeight: 600,
        }}>{showTrends ? 'Hide trends' : 'Show all trends'}</button>
      </div>
      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
        {loading && <div style={{ padding: 14, color: 'var(--text-muted)', fontSize: 12 }}>Scanning…</div>}
        {!loading && signals.length === 0 && !showTrends && (
          <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
            ✓ No active signals.
          </div>
        )}
        {!loading && (showTrends ? trends : signals).map((s, i) => (
          <div key={i} onClick={() => onOpen?.(s)} style={{
            padding: '8px 14px', borderBottom: '1px solid var(--border)', cursor: onOpen ? 'pointer' : 'default',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong style={{ fontSize: 12 }}>
                {s.product_name || `Product #${s.product_id}`}
                {s.lot_number && <span style={{ marginLeft: 6, fontFamily: 'monospace', fontSize: 11 }}>Lot {s.lot_number}</span>}
              </strong>
              <span style={{ fontSize: 11, color: s.signal ? '#b91c1c' : 'var(--text-muted)', fontWeight: 600 }}>
                {s.case_count_window} cases (window)
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
              {s.complaint_code && <code style={{ fontSize: 10 }}>{s.complaint_code}</code>}
              {s.complaint_label && ` · ${s.complaint_label}`}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
              Baseline: {s.baseline_count} cases in prior {s.baseline_days || 60}d
              {s.signal && s.severity && ` · severity: ${s.severity}`}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
