import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiJson, authHeaders, getOrgToken, getOrgUser } from '../../common/utils/session'

export default function ContentSlotsPage() {
  const token = getOrgToken()
  const user = getOrgUser()
  const canCreate = String(user.role) === 'admin'
  const canFill = ['admin', 'author'].includes(String(user.role))
  const [slots, setSlots] = useState([])
  const [contentOptions, setContentOptions] = useState([])
  const [types, setTypes] = useState([])
  const [users, setUsers] = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [slotForm, setSlotForm] = useState({
    title: '',
    expected_type_id: '',
    responsible_user_id: '',
    due_date: ''
  })
  const [fillMap, setFillMap] = useState({})

  async function loadRefs() {
    const [typeRows, userRows, contentRows] = await Promise.all([
      apiJson('/api/taxonomy/types', { headers: authHeaders(token) }),
      apiJson('/api/users', { headers: authHeaders(token) }),
      apiJson('/api/content', { headers: authHeaders(token) })
    ])
    setTypes(typeRows)
    setUsers(userRows)
    setContentOptions(contentRows)
  }

  async function loadSlots() {
    if (!token) {
      setError('Session not found. Please log in first.')
      setLoading(false)
      return
    }

    const query = new URLSearchParams()
    if (statusFilter) query.set('status', statusFilter)
    if (overdueOnly) query.set('overdue', 'true')

    setLoading(true)
    setError('')
    try {
      const rows = await apiJson(`/api/slots${query.toString() ? `?${query.toString()}` : ''}`, {
        headers: authHeaders(token)
      })
      setSlots(rows)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRefs().catch(requestError => setError(requestError.message))
  }, [])

  useEffect(() => {
    loadSlots()
  }, [statusFilter, overdueOnly])

  const pendingCount = useMemo(
    () => slots.filter(slot => slot.status === 'pending').length,
    [slots]
  )
  const overdueCount = useMemo(
    () =>
      slots.filter(slot => slot.status === 'pending' && slot.due_date && new Date(slot.due_date) < new Date()).length,
    [slots]
  )

  async function createSlot(event) {
    event.preventDefault()
    if (!canCreate) return
    setCreating(true)
    setError('')
    try {
      await apiJson('/api/slots', {
        method: 'POST',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          title: slotForm.title,
          expected_type_id: slotForm.expected_type_id ? Number(slotForm.expected_type_id) : null,
          responsible_user_id: slotForm.responsible_user_id ? Number(slotForm.responsible_user_id) : null,
          due_date: slotForm.due_date || null
        })
      })
      setSlotForm({ title: '', expected_type_id: '', responsible_user_id: '', due_date: '' })
      await loadSlots()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setCreating(false)
    }
  }

  async function fillSlot(slotId) {
    const contentId = Number(fillMap[slotId] || 0)
    if (!contentId) {
      setError('Choose a content record to fill this slot.')
      return
    }
    setError('')
    try {
      await apiJson(`/api/slots/${slotId}/fill`, {
        method: 'POST',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ content_id: contentId })
      })
      await loadSlots()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  return (
    <div className="app-shell">
      <main className="dashboard-grid">
        <section className="panel span-12 workspace-hero-card">
          <div>
            <p className="workspace-hero-kicker">Compliance / Content Slots</p>
            <h2 className="workspace-hero-title">Content Slots</h2>
            <p className="panel-note">Expected-document placeholders with ownership and due dates.</p>
          </div>
          <div className="workspace-hero-right">
            <span className="workspace-status-pill">Slot Tracking</span>
            <span className="workspace-hero-date">{pendingCount} pending · {overdueCount} overdue</span>
          </div>
        </section>

        <section className="panel span-12">
          <ul className="simple-list">
            <li>
              <span>Role access</span>
              <strong>{canCreate ? 'Admin can create slots' : 'Read access'}</strong>
            </li>
          </ul>
        </section>
      </main>

      <main className="dashboard-grid">
        <section className="panel span-4">
          <h3>Filters</h3>
          <div className="form-field">
            <label htmlFor="slot-status">Status</label>
            <select id="slot-status" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="filled">Filled</option>
            </select>
          </div>
          <label className="status-toggle">
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={event => setOverdueOnly(event.target.checked)}
            />
            <span>Overdue only</span>
          </label>
          <div className="detail-actions">
            <Link className="btn-secondary link-button" to="/vault">
              Back to Vault
            </Link>
          </div>
          {canCreate ? (
            <form className="auth-form users-create-form" onSubmit={createSlot}>
              <h3>Create Slot</h3>
              <div className="form-field">
                <label htmlFor="slot-title">Title</label>
                <input
                  id="slot-title"
                  value={slotForm.title}
                  onChange={event => setSlotForm({ ...slotForm, title: event.target.value })}
                  required
                />
              </div>
              <div className="form-field">
                <label htmlFor="slot-type">Expected Type</label>
                <select
                  id="slot-type"
                  value={slotForm.expected_type_id}
                  onChange={event => setSlotForm({ ...slotForm, expected_type_id: event.target.value })}
                >
                  <option value="">Any</option>
                  {types.map(type => (
                    <option key={type.id} value={type.id}>{type.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="slot-owner">Responsible User</label>
                <select
                  id="slot-owner"
                  value={slotForm.responsible_user_id}
                  onChange={event => setSlotForm({ ...slotForm, responsible_user_id: event.target.value })}
                >
                  <option value="">Unassigned</option>
                  {users.map(orgUser => (
                    <option key={orgUser.id} value={orgUser.id}>{orgUser.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="slot-due">Due Date</label>
                <input
                  id="slot-due"
                  type="date"
                  value={slotForm.due_date}
                  onChange={event => setSlotForm({ ...slotForm, due_date: event.target.value })}
                />
              </div>
              <button className="btn-primary" type="submit" disabled={creating}>
                {creating ? 'Creating...' : 'Create Slot'}
              </button>
            </form>
          ) : null}
        </section>

        <section className="panel span-8">
          <h3>Slots</h3>
          <p className="panel-note">Track pending expected documents and mark fulfilled items.</p>
          {error ? <div className="auth-error">{error}</div> : null}
          {loading ? <p className="panel-note">Loading slots...</p> : null}

          {!loading ? (
            <div className="users-table-wrap">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Expected Type</th>
                    <th>Responsible</th>
                    <th>Due Date</th>
                    <th>Status</th>
                    <th>Fill</th>
                  </tr>
                </thead>
                <tbody>
                  {slots.map(slot => {
                    const dueDate = slot.due_date ? new Date(slot.due_date) : null
                    const overdue = slot.status === 'pending' && dueDate && dueDate < new Date()
                    return (
                      <tr key={slot.id} className={overdue ? 'row-overdue' : ''}>
                        <td>{slot.title}</td>
                        <td>{slot.expected_type_name || '-'}</td>
                        <td>{slot.responsible_user_name || '-'}</td>
                        <td>{slot.due_date ? String(slot.due_date).slice(0, 10) : '-'}</td>
                        <td>
                          <span className={slot.status === 'filled' ? 'status-chip success' : 'status-chip pending'}>
                            {slot.status}
                          </span>
                        </td>
                        <td>
                          {slot.status === 'filled' ? (
                            <Link className="btn-secondary link-button" to={`/vault/content/${slot.filled_content_id}`}>
                              Open
                            </Link>
                          ) : canFill ? (
                            <div className="slot-fill-cell">
                              <select
                                value={fillMap[slot.id] || ''}
                                onChange={event => setFillMap({ ...fillMap, [slot.id]: event.target.value })}
                              >
                                <option value="">Select document</option>
                                {contentOptions.map(content => (
                                  <option value={content.id} key={content.id}>
                                    {content.doc_number} - {content.title}
                                  </option>
                                ))}
                              </select>
                              <button className="btn-secondary" onClick={() => fillSlot(slot.id)}>
                                Fill
                              </button>
                            </div>
                          ) : (
                            '-'
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {!slots.length ? (
                    <tr>
                      <td colSpan={6} className="users-empty">No slots found for selected filter.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  )
}
