import { useEffect, useMemo, useState } from 'react'
import AdminTabs from '../components/AdminTabs'
import { apiJson, authHeaders, getOrgToken } from '../../common/utils/session'

export default function RetentionPoliciesPage() {
  const token = getOrgToken()
  const [types, setTypes] = useState([])
  const [defaults, setDefaults] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const rows = useMemo(
    () => types.map(type => ({
      ...type,
      review_cycle_months: defaults[type.id] || ''
    })),
    [types, defaults]
  )

  async function loadData() {
    if (!token) {
      setError('Session not found. Please log in first.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const [typeRows, retentionRows] = await Promise.all([
        apiJson('/api/taxonomy/types', { headers: authHeaders(token) }),
        apiJson('/api/admin/retention', { headers: authHeaders(token) })
      ])

      const mapping = {}
      retentionRows.forEach(row => {
        if (row.content_type_id) {
          mapping[row.content_type_id] = String(row.review_cycle_months || '')
        }
      })

      setTypes(typeRows)
      setDefaults(mapping)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  async function saveRetentionPolicies() {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const payload = rows
        .filter(row => Number(row.review_cycle_months) > 0)
        .map(row => ({
          content_type_id: Number(row.id),
          review_cycle_months: Number(row.review_cycle_months)
        }))

      if (!payload.length) {
        throw new Error('Provide at least one valid retention default.')
      }

      await apiJson('/api/admin/retention', {
        method: 'PATCH',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ defaults: payload })
      })
      setSuccess('Retention defaults saved successfully.')
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="brand-block">
          <h1 className="brand-title">Retention Policies</h1>
          <p className="brand-subtitle">Default review cycle per content type</p>
        </div>
        <span className="topbar-pill">Admin Console</span>
      </header>

      <main className="dashboard-grid">
        <section className="panel span-12">
          <AdminTabs active="retention" />
          <p className="panel-note">
            Configure `review_cycle_months` defaults used during metadata updates.
          </p>

          {error ? <div className="auth-error">{error}</div> : null}
          {success ? <div className="upload-success">{success}</div> : null}
          {loading ? <p className="panel-note">Loading retention policies...</p> : null}

          {!loading ? (
            <>
              <div className="users-table-wrap">
                <table className="users-table">
                  <thead>
                    <tr>
                      <th>Content Type</th>
                      <th>Code</th>
                      <th>Default Review Cycle (Months)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => (
                      <tr key={row.id}>
                        <td>{row.name}</td>
                        <td>{row.code}</td>
                        <td>
                          <input
                            type="number"
                            min={1}
                            className="inline-number-input"
                            value={row.review_cycle_months}
                            onChange={event =>
                              setDefaults({
                                ...defaults,
                                [row.id]: event.target.value
                              })
                            }
                          />
                        </td>
                      </tr>
                    ))}
                    {!rows.length ? (
                      <tr>
                        <td colSpan={3} className="users-empty">No content types available.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <div className="detail-actions">
                <button className="btn-primary" onClick={saveRetentionPolicies} disabled={saving || !rows.length}>
                  {saving ? 'Saving...' : 'Save Retention Defaults'}
                </button>
              </div>
            </>
          ) : null}
        </section>
      </main>
    </div>
  )
}
