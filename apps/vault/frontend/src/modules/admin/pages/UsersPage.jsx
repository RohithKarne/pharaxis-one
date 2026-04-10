import { useEffect, useMemo, useState } from 'react'
import AdminTabs from '../components/AdminTabs'
import { apiJson, authHeaders, getOrgToken } from '../../common/utils/session'

const ROLE_OPTIONS = ['admin', 'author', 'reviewer', 'approver', 'viewer']

function formatDate(value) {
  if (!value) return 'Never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Never'
  return date.toLocaleString()
}

export default function UsersPage() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [savingId, setSavingId] = useState(null)
  const [draftById, setDraftById] = useState({})
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState({
    name: '',
    email: '',
    role: 'author',
    password: ''
  })

  const token = getOrgToken()

  async function fetchUsers() {
    if (!token) {
      setError('Session not found. Please log in first.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    try {
      const payload = await apiJson('/api/users', {
        headers: authHeaders(token)
      })
      setUsers(payload)
      const nextDraft = {}
      payload.forEach(user => {
        nextDraft[user.id] = { role: user.role, is_active: Number(user.is_active) }
      })
      setDraftById(nextDraft)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  const filteredUsers = useMemo(() => {
    if (roleFilter === 'all') return users
    return users.filter(user => user.role === roleFilter)
  }, [users, roleFilter])

  async function handleCreateUser(event) {
    event.preventDefault()
    if (!token) return

    setCreating(true)
    setError('')
    try {
      await apiJson('/api/users', {
        method: 'POST',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(createForm)
      })
      setCreateForm({ name: '', email: '', role: 'author', password: '' })
      await fetchUsers()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setCreating(false)
    }
  }

  async function handleSaveUser(userId) {
    if (!token) return
    const draft = draftById[userId]
    if (!draft) return

    setSavingId(userId)
    setError('')
    try {
      await apiJson(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          role: draft.role,
          is_active: Number(draft.is_active)
        })
      })
      await fetchUsers()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="brand-block">
          <h1 className="brand-title">User Management</h1>
          <p className="brand-subtitle">Admin workspace for organization user access control</p>
        </div>
        <span className="topbar-pill">Admin Console</span>
      </header>

      <main className="dashboard-grid">
        <section className="panel span-4">
          <AdminTabs active="users" />
          <h3>Create User</h3>
          <p className="panel-note">Invite new users with role-specific access.</p>

          <form className="auth-form users-create-form" onSubmit={handleCreateUser}>
            <div className="form-field">
              <label htmlFor="new-name">Name</label>
              <input
                id="new-name"
                value={createForm.name}
                onChange={event => setCreateForm({ ...createForm, name: event.target.value })}
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="new-email">Email</label>
              <input
                id="new-email"
                type="email"
                value={createForm.email}
                onChange={event => setCreateForm({ ...createForm, email: event.target.value })}
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="new-role">Role</label>
              <select
                id="new-role"
                value={createForm.role}
                onChange={event => setCreateForm({ ...createForm, role: event.target.value })}
              >
                {ROLE_OPTIONS.map(role => (
                  <option value={role} key={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="new-password">Temporary Password</label>
              <input
                id="new-password"
                type="password"
                value={createForm.password}
                onChange={event => setCreateForm({ ...createForm, password: event.target.value })}
                required
              />
            </div>
            <button className="btn-primary" type="submit" disabled={creating}>
              {creating ? 'Creating...' : 'Create User'}
            </button>
          </form>
        </section>

        <section className="panel span-8">
          <div className="users-toolbar">
            <div>
              <h3>Organization Users</h3>
              <p className="panel-note">List is scoped to your organization only.</p>
            </div>
            <div className="users-filter">
              <label htmlFor="role-filter">Role filter</label>
              <select
                id="role-filter"
                value={roleFilter}
                onChange={event => setRoleFilter(event.target.value)}
              >
                <option value="all">All roles</option>
                {ROLE_OPTIONS.map(role => (
                  <option value={role} key={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error ? <div className="auth-error">{error}</div> : null}

          {loading ? (
            <p className="panel-note users-loading">Loading users...</p>
          ) : (
            <div className="users-table-wrap">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Last Login</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map(user => (
                    <tr key={user.id}>
                      <td>{user.name}</td>
                      <td>{user.email}</td>
                      <td>
                        <select
                          value={draftById[user.id]?.role || user.role}
                          onChange={event =>
                            setDraftById({
                              ...draftById,
                              [user.id]: {
                                ...draftById[user.id],
                                role: event.target.value
                              }
                            })
                          }
                        >
                          {ROLE_OPTIONS.map(role => (
                            <option value={role} key={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <label className="status-toggle">
                          <input
                            type="checkbox"
                            checked={Number(draftById[user.id]?.is_active || 0) === 1}
                            onChange={event =>
                              setDraftById({
                                ...draftById,
                                [user.id]: {
                                  ...draftById[user.id],
                                  is_active: event.target.checked ? 1 : 0
                                }
                              })
                            }
                          />
                          <span>{Number(draftById[user.id]?.is_active || 0) === 1 ? 'Active' : 'Inactive'}</span>
                        </label>
                      </td>
                      <td>{formatDate(user.last_login_at)}</td>
                      <td>
                        <button
                          className="btn-secondary"
                          onClick={() => handleSaveUser(user.id)}
                          disabled={savingId === user.id}
                        >
                          {savingId === user.id ? 'Saving...' : 'Save'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!filteredUsers.length ? (
                    <tr>
                      <td colSpan={6} className="users-empty">
                        No users found for this filter.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
