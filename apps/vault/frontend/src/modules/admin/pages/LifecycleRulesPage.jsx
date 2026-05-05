import { useEffect, useState } from 'react'
import AdminTabs from '../components/AdminTabs'
import { apiJson, authHeaders, getOrgToken } from '../../common/utils/session'
import VaultPageHeader from '../../vault/components/VaultPageHeader'

export default function LifecycleRulesPage() {
  const token = getOrgToken()
  const [types, setTypes] = useState([])
  const [selectedTypeId, setSelectedTypeId] = useState('')
  const [states, setStates] = useState([])
  const [transitions, setTransitions] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [stateForm, setStateForm] = useState({
    state_name: '',
    state_code: '',
    is_initial: 0,
    is_terminal: 0
  })
  const [transitionForm, setTransitionForm] = useState({
    from_state: '',
    to_state: '',
    allowed_roles: 'author,admin'
  })

  async function loadTypes() {
    const list = await apiJson('/api/taxonomy/types', { headers: authHeaders(token) })
    setTypes(list)
    if (!selectedTypeId && list.length) setSelectedTypeId(String(list[0].id))
  }

  async function loadRules(typeId) {
    if (!typeId) {
      setStates([])
      setTransitions([])
      return
    }
    const [stateRows, transitionRows] = await Promise.all([
      apiJson(`/api/lifecycle/states/${typeId}`, { headers: authHeaders(token) }),
      apiJson(`/api/lifecycle/transitions/${typeId}`, { headers: authHeaders(token) })
    ])
    setStates(stateRows)
    setTransitions(transitionRows)
  }

  useEffect(() => {
    if (!token) {
      setError('Session not found. Please log in first.')
      setLoading(false)
      return
    }
    setError('')
    loadTypes()
      .catch(requestError => setError(requestError.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedTypeId) return
    loadRules(selectedTypeId).catch(requestError => setError(requestError.message))
  }, [selectedTypeId])

  async function createState(event) {
    event.preventDefault()
    if (!selectedTypeId) return

    setError('')
    try {
      await apiJson('/api/lifecycle/states', {
        method: 'POST',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          content_type_id: Number(selectedTypeId),
          state_name: stateForm.state_name,
          state_code: stateForm.state_code,
          is_initial: stateForm.is_initial,
          is_terminal: stateForm.is_terminal
        })
      })
      setStateForm({ state_name: '', state_code: '', is_initial: 0, is_terminal: 0 })
      await loadRules(selectedTypeId)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function createTransition(event) {
    event.preventDefault()
    if (!selectedTypeId) return

    setError('')
    try {
      await apiJson('/api/lifecycle/transitions', {
        method: 'POST',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          content_type_id: Number(selectedTypeId),
          from_state: transitionForm.from_state,
          to_state: transitionForm.to_state,
          allowed_roles: transitionForm.allowed_roles
        })
      })
      setTransitionForm({ from_state: '', to_state: '', allowed_roles: 'author,admin' })
      await loadRules(selectedTypeId)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  return (
    <div className="app-shell">
      <main className="dashboard-grid">
        <VaultPageHeader
          kicker="Administration / Lifecycle"
          title="Lifecycle Rules"
          note="Configure lifecycle states and role-based transitions."
          statusLabel="Admin Console"
        />
        <section className="panel span-12">
          <AdminTabs active="lifecycle" />

          <div className="form-field inline-field">
            <label htmlFor="lifecycle-type">Content Type</label>
            <select
              id="lifecycle-type"
              value={selectedTypeId}
              onChange={event => setSelectedTypeId(event.target.value)}
            >
              {!types.length ? <option value="">No types available</option> : null}
              {types.map(type => (
                <option key={type.id} value={type.id}>{type.name}</option>
              ))}
            </select>
          </div>

          {error ? <div className="auth-error">{error}</div> : null}
          {loading ? <p className="panel-note">Loading lifecycle configuration...</p> : null}

          {!loading ? (
            <div className="taxonomy-grid">
              <section className="taxonomy-column">
                <h3>States</h3>
                <p className="panel-note">Current lifecycle states for this content type.</p>
                <ul className="taxonomy-list">
                  {states.map(state => (
                    <li key={state.id}>
                      <div>
                        <strong>{state.state_name}</strong>
                        <span>{state.state_code}</span>
                      </div>
                      <div className="taxonomy-actions">
                        {Number(state.is_initial) ? <span className="status-chip info">Initial</span> : null}
                        {Number(state.is_terminal) ? <span className="status-chip pending">Terminal</span> : null}
                      </div>
                    </li>
                  ))}
                </ul>
                <form className="taxonomy-create" onSubmit={createState}>
                  <input
                    placeholder="State name"
                    value={stateForm.state_name}
                    onChange={event => setStateForm({ ...stateForm, state_name: event.target.value })}
                    required
                  />
                  <input
                    placeholder="State code (e.g. in_review)"
                    value={stateForm.state_code}
                    onChange={event => setStateForm({ ...stateForm, state_code: event.target.value })}
                    required
                  />
                  <label className="status-toggle">
                    <input
                      type="checkbox"
                      checked={Number(stateForm.is_initial) === 1}
                      onChange={event => setStateForm({ ...stateForm, is_initial: event.target.checked ? 1 : 0 })}
                    />
                    <span>Initial state</span>
                  </label>
                  <label className="status-toggle">
                    <input
                      type="checkbox"
                      checked={Number(stateForm.is_terminal) === 1}
                      onChange={event => setStateForm({ ...stateForm, is_terminal: event.target.checked ? 1 : 0 })}
                    />
                    <span>Terminal state</span>
                  </label>
                  <button className="btn-secondary" type="submit">
                    Add State
                  </button>
                </form>
              </section>

              <section className="taxonomy-column">
                <h3>Transitions</h3>
                <p className="panel-note">Role-permitted lifecycle movements.</p>
                <ul className="taxonomy-list">
                  {transitions.map(transition => (
                    <li key={transition.id}>
                      <div>
                        <strong>{transition.from_state} to {transition.to_state}</strong>
                        <span>{transition.allowed_roles}</span>
                      </div>
                    </li>
                  ))}
                </ul>
                <form className="taxonomy-create" onSubmit={createTransition}>
                  <input
                    placeholder="From state"
                    value={transitionForm.from_state}
                    onChange={event => setTransitionForm({ ...transitionForm, from_state: event.target.value })}
                    required
                  />
                  <input
                    placeholder="To state"
                    value={transitionForm.to_state}
                    onChange={event => setTransitionForm({ ...transitionForm, to_state: event.target.value })}
                    required
                  />
                  <input
                    placeholder="Allowed roles CSV"
                    value={transitionForm.allowed_roles}
                    onChange={event => setTransitionForm({ ...transitionForm, allowed_roles: event.target.value })}
                    required
                  />
                  <button className="btn-secondary" type="submit">
                    Add Transition Rule
                  </button>
                </form>
              </section>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  )
}
