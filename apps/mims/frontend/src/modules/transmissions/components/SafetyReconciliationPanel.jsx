import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { httpFetch } from '../../../shared/api/httpFetch.js'

export default function SafetyReconciliationPanel({ headers }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')

  function load() {
    setLoading(true)
    setError('')
    httpFetch('/api/pv/reconciliation', { headers })
      .then(async res => {
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'Could not load reconciliation data.')
        setData(json)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function handleRunSweep() {
    setRunning(true)
    setError('')
    try {
      const res = await httpFetch('/api/pv/reconciliation/run', { method: 'POST', headers })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Reconciliation sweep failed.')
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setRunning(false)
    }
  }

  const current = data?.current
  const history = data?.history || []

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Loading real-time safety reconciliation data...</div>
  }

  return (
    <div className="pv-reconciliation-panel" style={{ padding: '4px 0' }}>
      {error && (
        <div style={{ background: '#FEE2E2', border: '1px solid #DC2626', color: '#B91C1C', padding: 12, borderRadius: 6, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Top Header & Status */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, background: '#fff', border: '1px solid #E2E8F0', padding: 16, borderRadius: 8 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#0F172A' }}>
              Pharmacovigilance Intake Reconciliation
            </h2>
            {current?.balanced ? (
              <span style={{ background: '#DCFCE7', color: '#15803D', padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700 }}>
                ✓ 100% Balanced (Zero Lost Events)
              </span>
            ) : (
              <span style={{ background: '#FEE2E2', color: '#B91C1C', padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700 }}>
                ⚠️ Discrepancy Detected ({current?.counts?.unlinked_intakes + current?.counts?.delayed_triage_cases} items)
              </span>
            )}
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#64748B' }}>
            Cross-system reconciliation between portal intakes, email channels, and MIMS Adverse Event cases. Last audit sweep: {current?.last_run_at ? new Date(current.last_run_at).toLocaleString() : 'Just now'}.
          </p>
        </div>

        <button
          type="button"
          onClick={handleRunSweep}
          disabled={running}
          style={{
            background: '#2563EB',
            color: '#fff',
            border: 'none',
            padding: '8px 16px',
            borderRadius: 6,
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          {running ? 'Running Sweep...' : '⚡ Run Audit Sweep Now'}
        </button>
      </div>

      {/* Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Total Safety Intakes</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#0F172A', marginTop: 4 }}>{current?.counts?.total_safety_intakes || 0}</div>
          <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>Across all intake channels</div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Matched AE Cases</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#15803D', marginTop: 4 }}>{current?.counts?.matched_ae_cases || 0}</div>
          <div style={{ fontSize: 12, color: '#15803D', marginTop: 2 }}>{current?.reconciliation_rate || 100}% reconciled</div>
        </div>

        <div style={{ background: current?.counts?.unlinked_intakes > 0 ? '#FEF2F2' : '#fff', border: '1px solid', borderColor: current?.counts?.unlinked_intakes > 0 ? '#FCA5A5' : '#E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: current?.counts?.unlinked_intakes > 0 ? '#991B1B' : '#64748B', textTransform: 'uppercase' }}>Unlinked Safety Intakes</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: current?.counts?.unlinked_intakes > 0 ? '#DC2626' : '#0F172A', marginTop: 4 }}>{current?.counts?.unlinked_intakes || 0}</div>
          <div style={{ fontSize: 12, color: current?.counts?.unlinked_intakes > 0 ? '#B91C1C' : '#64748B', marginTop: 2 }}>Missing linked AE case</div>
        </div>

        <div style={{ background: current?.counts?.delayed_triage_cases > 0 ? '#FFFBEB' : '#fff', border: '1px solid', borderColor: current?.counts?.delayed_triage_cases > 0 ? '#FCD34D' : '#E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: current?.counts?.delayed_triage_cases > 0 ? '#92400E' : '#64748B', textTransform: 'uppercase' }}>Delayed Triage (&gt;24h)</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: current?.counts?.delayed_triage_cases > 0 ? '#D97706' : '#0F172A', marginTop: 4 }}>{current?.counts?.delayed_triage_cases || 0}</div>
          <div style={{ fontSize: 12, color: current?.counts?.delayed_triage_cases > 0 ? '#B45309' : '#64748B', marginTop: 2 }}>Breached intake clock</div>
        </div>
      </div>

      {/* Delayed Cases Table */}
      {current?.delayed_cases?.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #FCD34D', borderRadius: 8, padding: 16, marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#92400E', margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>⚠️</span> Adverse Event Cases Breaching 24-Hour Triage Target
          </h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E2E8F0', textAlign: 'left', color: '#64748B' }}>
                <th style={{ padding: '8px 6px' }}>Case Number</th>
                <th style={{ padding: '8px 6px' }}>Product</th>
                <th style={{ padding: '8px 6px' }}>Awareness Date</th>
                <th style={{ padding: '8px 6px' }}>Current Status</th>
                <th style={{ padding: '8px 6px' }}>Regulatory Exposure</th>
              </tr>
            </thead>
            <tbody>
              {current.delayed_cases.map(dc => (
                <tr key={dc.case_id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '8px 6px', fontWeight: 600 }}>
                    <Link to={`/cases/${dc.case_id}`} style={{ color: '#2563EB', textDecoration: 'none' }}>
                      {dc.case_number}
                    </Link>
                  </td>
                  <td style={{ padding: '8px 6px' }}>{dc.product || '—'}</td>
                  <td style={{ padding: '8px 6px' }}>{new Date(dc.awareness_date).toLocaleDateString()}</td>
                  <td style={{ padding: '8px 6px' }}>
                    <span style={{ background: '#FEF3C7', color: '#92400E', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                      {dc.status || 'Initial'}
                    </span>
                  </td>
                  <td style={{ padding: '8px 6px', color: '#B91C1C', fontSize: 12 }}>{dc.discrepancy_reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Unlinked Intakes Table */}
      {current?.unlinked_intakes?.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #FCA5A5', borderRadius: 8, padding: 16, marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#B91C1C', margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>🚨</span> Unlinked Safety Intakes (Zero-Loss Mandate)
          </h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E2E8F0', textAlign: 'left', color: '#64748B' }}>
                <th style={{ padding: '8px 6px' }}>Channel / ID</th>
                <th style={{ padding: '8px 6px' }}>Sender</th>
                <th style={{ padding: '8px 6px' }}>Reference / Subject</th>
                <th style={{ padding: '8px 6px' }}>Received</th>
                <th style={{ padding: '8px 6px' }}>Audit Status</th>
              </tr>
            </thead>
            <tbody>
              {current.unlinked_intakes.map(ui => (
                <tr key={ui.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '8px 6px', fontWeight: 600 }}>{ui.source} #{ui.id}</td>
                  <td style={{ padding: '8px 6px' }}>{ui.from || 'Unknown'}</td>
                  <td style={{ padding: '8px 6px' }}>{ui.reference}</td>
                  <td style={{ padding: '8px 6px' }}>{new Date(ui.received_at).toLocaleDateString()}</td>
                  <td style={{ padding: '8px 6px', color: '#DC2626', fontWeight: 600, fontSize: 12 }}>Requires Safety Case Creation</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Audit History Log */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: '0 0 10px 0' }}>
          Reconciliation Audit History (GVP Module VI Ledger)
        </h3>
        {history.length === 0 ? (
          <p style={{ color: '#64748B', fontSize: 13, margin: 0 }}>No past audit runs logged yet. Running a sweep records an immutable audit entry.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E2E8F0', textAlign: 'left', color: '#64748B' }}>
                <th style={{ padding: '6px' }}>Audit ID</th>
                <th style={{ padding: '6px' }}>Timestamp</th>
                <th style={{ padding: '6px' }}>Total Intakes</th>
                <th style={{ padding: '6px' }}>Matched Cases</th>
                <th style={{ padding: '6px' }}>Discrepancies</th>
                <th style={{ padding: '6px' }}>Compliance Status</th>
              </tr>
            </thead>
            <tbody>
              {history.map(h => (
                <tr key={h.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '6px' }}>RECON-{h.id}</td>
                  <td style={{ padding: '6px' }}>{new Date(h.run_at).toLocaleString()}</td>
                  <td style={{ padding: '6px' }}>{h.total_intakes}</td>
                  <td style={{ padding: '6px', color: '#15803D', fontWeight: 600 }}>{h.matched_cases}</td>
                  <td style={{ padding: '6px', color: (h.unlinked_intakes + h.delayed_cases) > 0 ? '#DC2626' : '#64748B' }}>
                    {h.unlinked_intakes + h.delayed_cases}
                  </td>
                  <td style={{ padding: '6px' }}>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: 10,
                      fontWeight: 600,
                      fontSize: 11,
                      background: h.status === 'balanced' ? '#DCFCE7' : '#FEE2E2',
                      color: h.status === 'balanced' ? '#15803D' : '#B91C1C',
                    }}>
                      {h.status === 'balanced' ? 'Balanced' : 'Discrepancy'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
