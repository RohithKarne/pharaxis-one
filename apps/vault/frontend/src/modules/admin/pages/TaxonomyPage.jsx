import { useEffect, useMemo, useState } from 'react'
import { orgApi as api } from '../../common/api/client'
import AdminTabs from '../components/AdminTabs'

export default function TaxonomyPage() {
  const [types, setTypes] = useState([])
  const [subtypes, setSubtypes] = useState([])
  const [classifications, setClassifications] = useState([])
  const [selectedTypeId, setSelectedTypeId] = useState(null)
  const [selectedSubtypeId, setSelectedSubtypeId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [typeForm, setTypeForm] = useState({ name: '', code: '' })
  const [subtypeName, setSubtypeName] = useState('')
  const [classificationName, setClassificationName] = useState('')

  async function loadTypes(nextSelectedTypeId) {
    const rows = await api('/api/taxonomy/types', { method: 'GET' })
    setTypes(rows)
    if (!rows.length) {
      setSelectedTypeId(null)
      setSubtypes([])
      setSelectedSubtypeId(null)
      setClassifications([])
      return
    }

    const preferred =
      nextSelectedTypeId && rows.some(type => Number(type.id) === Number(nextSelectedTypeId))
        ? Number(nextSelectedTypeId)
        : Number(rows[0].id)
    setSelectedTypeId(preferred)
  }

  async function loadSubtypes(typeId, nextSubtypeId) {
    if (!typeId) {
      setSubtypes([])
      setSelectedSubtypeId(null)
      setClassifications([])
      return
    }
    const rows = await api(`/api/taxonomy/types/${typeId}/subtypes`, { method: 'GET' })
    setSubtypes(rows)
    if (!rows.length) {
      setSelectedSubtypeId(null)
      setClassifications([])
      return
    }

    const preferred =
      nextSubtypeId && rows.some(sub => Number(sub.id) === Number(nextSubtypeId))
        ? Number(nextSubtypeId)
        : Number(rows[0].id)
    setSelectedSubtypeId(preferred)
  }

  async function loadClassifications(subtypeId) {
    if (!subtypeId) {
      setClassifications([])
      return
    }
    const rows = await api(`/api/taxonomy/subtypes/${subtypeId}/classifications`, { method: 'GET' })
    setClassifications(rows)
  }

  async function refreshAll(options = {}) {
    setError('')
    try {
      await loadTypes(options.typeId)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshAll()
  }, [])

  useEffect(() => {
    if (!selectedTypeId) return
    loadSubtypes(selectedTypeId)
      .catch(requestError => setError(requestError.message))
  }, [selectedTypeId])

  useEffect(() => {
    if (!selectedSubtypeId) return
    loadClassifications(selectedSubtypeId)
      .catch(requestError => setError(requestError.message))
  }, [selectedSubtypeId])

  const selectedType = useMemo(
    () => types.find(type => Number(type.id) === Number(selectedTypeId)) || null,
    [types, selectedTypeId]
  )
  const selectedSubtype = useMemo(
    () => subtypes.find(sub => Number(sub.id) === Number(selectedSubtypeId)) || null,
    [subtypes, selectedSubtypeId]
  )

  async function createType(event) {
    event.preventDefault()
    try {
      await api('/api/taxonomy/types', {
        method: 'POST',
        body: JSON.stringify(typeForm)
      })
      setTypeForm({ name: '', code: '' })
      await refreshAll()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function createSubtype(event) {
    event.preventDefault()
    if (!selectedTypeId) return
    try {
      await api(`/api/taxonomy/types/${selectedTypeId}/subtypes`, {
        method: 'POST',
        body: JSON.stringify({ name: subtypeName })
      })
      setSubtypeName('')
      await loadSubtypes(selectedTypeId)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function createClassification(event) {
    event.preventDefault()
    if (!selectedSubtypeId) return
    try {
      await api(`/api/taxonomy/subtypes/${selectedSubtypeId}/classifications`, {
        method: 'POST',
        body: JSON.stringify({ name: classificationName })
      })
      setClassificationName('')
      await loadClassifications(selectedSubtypeId)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function renameType(type) {
    const name = window.prompt('Rename content type', type.name)
    if (!name) return
    try {
      await api(`/api/taxonomy/types/${type.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name })
      })
      await refreshAll({ typeId: type.id })
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function toggleType(type) {
    try {
      await api(`/api/taxonomy/types/${type.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: Number(type.is_active) === 1 ? 0 : 1 })
      })
      await refreshAll({ typeId: type.id })
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function renameSubtype(subtype) {
    const name = window.prompt('Rename subtype', subtype.name)
    if (!name) return
    try {
      await api(`/api/taxonomy/subtypes/${subtype.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name })
      })
      await loadSubtypes(selectedTypeId, subtype.id)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function toggleSubtype(subtype) {
    try {
      await api(`/api/taxonomy/subtypes/${subtype.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: Number(subtype.is_active) === 1 ? 0 : 1 })
      })
      await loadSubtypes(selectedTypeId, subtype.id)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function renameClassification(classification) {
    const name = window.prompt('Rename classification', classification.name)
    if (!name) return
    try {
      await api(`/api/taxonomy/classifications/${classification.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name })
      })
      await loadClassifications(selectedSubtypeId)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function toggleClassification(classification) {
    try {
      await api(`/api/taxonomy/classifications/${classification.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: Number(classification.is_active) === 1 ? 0 : 1 })
      })
      await loadClassifications(selectedSubtypeId)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="brand-block">
          <h1 className="brand-title">Taxonomy Management</h1>
          <p className="brand-subtitle">Types, subtypes, and classifications for structured content governance</p>
        </div>
        <span className="topbar-pill">Admin Console</span>
      </header>

      <main className="dashboard-grid">
        <section className="panel span-12">
          <AdminTabs active="taxonomy" />
          {error ? <div className="auth-error taxonomy-error">{error}</div> : null}
          {loading ? <p className="panel-note">Loading taxonomy...</p> : null}

          <div className="taxonomy-grid">
            <section className="taxonomy-column">
              <header>
                <h3>Content Types</h3>
                <p className="panel-note">Top-level categories (SOP, Policy, Template)</p>
              </header>
              <form className="taxonomy-create" onSubmit={createType}>
                <input
                  placeholder="Type name"
                  value={typeForm.name}
                  onChange={event => setTypeForm({ ...typeForm, name: event.target.value })}
                  required
                />
                <input
                  placeholder="Code (optional)"
                  value={typeForm.code}
                  onChange={event => setTypeForm({ ...typeForm, code: event.target.value })}
                />
                <button className="btn-secondary" type="submit">
                  Add Type
                </button>
              </form>
              <ul className="taxonomy-list">
                {types.map(type => (
                  <li
                    key={type.id}
                    className={Number(type.id) === Number(selectedTypeId) ? 'selected' : ''}
                    onClick={() => setSelectedTypeId(Number(type.id))}
                  >
                    <div>
                      <strong>{type.name}</strong>
                      <span>{type.code}</span>
                    </div>
                    <div className="taxonomy-actions">
                      <button type="button" onClick={event => { event.stopPropagation(); renameType(type) }}>
                        Rename
                      </button>
                      <button type="button" onClick={event => { event.stopPropagation(); toggleType(type) }}>
                        {Number(type.is_active) === 1 ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="taxonomy-column">
              <header>
                <h3>Subtypes</h3>
                <p className="panel-note">
                  {selectedType ? `Children of ${selectedType.name}` : 'Select a type to manage subtypes'}
                </p>
              </header>
              <form className="taxonomy-create" onSubmit={createSubtype}>
                <input
                  placeholder="Subtype name"
                  value={subtypeName}
                  onChange={event => setSubtypeName(event.target.value)}
                  disabled={!selectedTypeId}
                  required
                />
                <button className="btn-secondary" type="submit" disabled={!selectedTypeId}>
                  Add Subtype
                </button>
              </form>
              <ul className="taxonomy-list">
                {subtypes.map(subtype => (
                  <li
                    key={subtype.id}
                    className={Number(subtype.id) === Number(selectedSubtypeId) ? 'selected' : ''}
                    onClick={() => setSelectedSubtypeId(Number(subtype.id))}
                  >
                    <div>
                      <strong>{subtype.name}</strong>
                    </div>
                    <div className="taxonomy-actions">
                      <button type="button" onClick={event => { event.stopPropagation(); renameSubtype(subtype) }}>
                        Rename
                      </button>
                      <button type="button" onClick={event => { event.stopPropagation(); toggleSubtype(subtype) }}>
                        {Number(subtype.is_active) === 1 ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="taxonomy-column">
              <header>
                <h3>Classifications</h3>
                <p className="panel-note">
                  {selectedSubtype
                    ? `Values under ${selectedSubtype.name}`
                    : 'Select a subtype to manage classifications'}
                </p>
              </header>
              <form className="taxonomy-create" onSubmit={createClassification}>
                <input
                  placeholder="Classification name"
                  value={classificationName}
                  onChange={event => setClassificationName(event.target.value)}
                  disabled={!selectedSubtypeId}
                  required
                />
                <button className="btn-secondary" type="submit" disabled={!selectedSubtypeId}>
                  Add Classification
                </button>
              </form>
              <ul className="taxonomy-list">
                {classifications.map(classification => (
                  <li key={classification.id}>
                    <div>
                      <strong>{classification.name}</strong>
                    </div>
                    <div className="taxonomy-actions">
                      <button
                        type="button"
                        onClick={() => renameClassification(classification)}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleClassification(classification)}
                      >
                        {Number(classification.is_active) === 1 ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </section>
      </main>
    </div>
  )
}
