import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiJson, authHeaders, getOrgToken, getOrgUser } from '../../common/utils/session'

function formatDate(value) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString()
}

export default function DossiersPage() {
  const token = getOrgToken()
  const user = getOrgUser()
  const canCreate = ['admin', 'author'].includes(String(user.role || ''))
  const canPatch = String(user.role || '') === 'admin'
  const [dossiers, setDossiers] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [selected, setSelected] = useState(null)
  const [contentOptions, setContentOptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [newDossier, setNewDossier] = useState({ title: '', description: '' })
  const [newItem, setNewItem] = useState({ content_id: '', position: '' })

  async function loadDossiers() {
    const query = new URLSearchParams()
    if (statusFilter) query.set('status', statusFilter)

    setLoading(true)
    setError('')
    try {
      const rows = await apiJson(`/api/dossiers${query.toString() ? `?${query.toString()}` : ''}`, {
        headers: authHeaders(token)
      })
      setDossiers(rows)
      if (!selectedId && rows.length) setSelectedId(rows[0].id)
      if (selectedId && !rows.find(row => Number(row.id) === Number(selectedId))) {
        setSelectedId(rows.length ? rows[0].id : null)
      }
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadDetail(id) {
    if (!id) {
      setSelected(null)
      return
    }
    setDetailLoading(true)
    setError('')
    try {
      const payload = await apiJson(`/api/dossiers/${id}`, {
        headers: authHeaders(token)
      })
      setSelected(payload)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setDetailLoading(false)
    }
  }

  async function loadContentOptions() {
    try {
      const rows = await apiJson('/api/content', { headers: authHeaders(token) })
      setContentOptions(rows)
    } catch {
      // Non-blocking for dossier core flow.
    }
  }

  useEffect(() => {
    if (!token) {
      setError('Session not found. Please log in first.')
      setLoading(false)
      return
    }
    loadDossiers()
    loadContentOptions()
  }, [])

  useEffect(() => {
    loadDossiers()
  }, [statusFilter])

  useEffect(() => {
    if (!selectedId) {
      setSelected(null)
      return
    }
    loadDetail(selectedId)
  }, [selectedId])

  const selectedItems = useMemo(() => selected?.items || [], [selected])

  async function createDossier(event) {
    event.preventDefault()
    if (!canCreate) return
    setError('')
    try {
      const payload = await apiJson('/api/dossiers', {
        method: 'POST',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(newDossier)
      })
      setNewDossier({ title: '', description: '' })
      await loadDossiers()
      setSelectedId(payload.id)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function updateDossierStatus(status) {
    if (!canPatch || !selected) return
    setError('')
    try {
      await apiJson(`/api/dossiers/${selected.id}`, {
        method: 'PATCH',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ status })
      })
      await loadDossiers()
      await loadDetail(selected.id)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function addItem(event) {
    event.preventDefault()
    if (!selected) return
    const contentId = Number(newItem.content_id || 0)
    if (!contentId) {
      setError('Select a document to add.')
      return
    }
    setError('')
    try {
      await apiJson(`/api/dossiers/${selected.id}/items`, {
        method: 'POST',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          content_id: contentId,
          position: newItem.position ? Number(newItem.position) : selectedItems.length + 1
        })
      })
      setNewItem({ content_id: '', position: '' })
      await loadDetail(selected.id)
      await loadDossiers()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function removeItem(itemId) {
    if (!selected) return
    setError('')
    try {
      await apiJson(`/api/dossiers/${selected.id}/items/${itemId}`, {
        method: 'DELETE',
        headers: authHeaders(token)
      })
      await loadDetail(selected.id)
      await loadDossiers()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function reorderItem(item, direction) {
    if (!selected) return
    const items = [...selectedItems]
    const index = items.findIndex(row => Number(row.id) === Number(item.id))
    if (index < 0) return

    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= items.length) return

    const swap = items[targetIndex]
    const updated = items.map((row, idx) => {
      if (idx === index) return { itemId: row.id, position: swap.position }
      if (idx === targetIndex) return { itemId: row.id, position: item.position }
      return { itemId: row.id, position: row.position }
    })

    setError('')
    try {
      await apiJson(`/api/dossiers/${selected.id}/items/reorder`, {
        method: 'PATCH',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ items: updated })
      })
      await loadDetail(selected.id)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function exportToPdf() {
    if (!selected) return
    try {
      const module = await import('jspdf')
      const doc = new module.jsPDF()
      let y = 20
      doc.setFontSize(16)
      doc.text(`Dossier: ${selected.title}`, 14, y)
      y += 8
      doc.setFontSize(11)
      doc.text(`Status: ${selected.status}  |  Created: ${formatDate(selected.created_at)}`, 14, y)
      y += 10
      selectedItems.forEach((item, index) => {
        if (y > 275) {
          doc.addPage()
          y = 20
        }
        doc.text(
          `${index + 1}. ${item.doc_number || '-'} | ${item.title} | v${item.version_number || '-'} | ${item.lifecycle_state || '-'}`,
          14,
          y
        )
        y += 7
      })
      doc.save(`${selected.title.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_toc.pdf`)
    } catch {
      window.print()
    }
  }

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="brand-block">
          <h1 className="brand-title">Dossiers</h1>
          <p className="brand-subtitle">Curated document binders for regulatory and review workflows</p>
        </div>
        <span className="topbar-pill">{dossiers.length} dossiers</span>
      </header>

      <main className="dashboard-grid">
        <section className="panel span-4">
          <div className="folder-header">
            <h3>Dossier List</h3>
            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
              <option value="">All</option>
              <option value="draft">Draft</option>
              <option value="final">Final</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <ul className="taxonomy-list">
            {dossiers.map(dossier => (
              <li
                key={dossier.id}
                className={Number(selectedId) === Number(dossier.id) ? 'selected' : ''}
                onClick={() => setSelectedId(dossier.id)}
              >
                <div>
                  <strong>{dossier.title}</strong>
                  <span>{dossier.status} · {dossier.item_count} items</span>
                </div>
              </li>
            ))}
            {!dossiers.length ? <li><span>No dossiers found.</span></li> : null}
          </ul>

          {canCreate ? (
            <form className="auth-form users-create-form" onSubmit={createDossier}>
              <h3>Create Dossier</h3>
              <div className="form-field">
                <label htmlFor="dossier-title">Title</label>
                <input
                  id="dossier-title"
                  value={newDossier.title}
                  onChange={event => setNewDossier({ ...newDossier, title: event.target.value })}
                  required
                />
              </div>
              <div className="form-field">
                <label htmlFor="dossier-description">Description</label>
                <textarea
                  id="dossier-description"
                  value={newDossier.description}
                  onChange={event => setNewDossier({ ...newDossier, description: event.target.value })}
                  rows={3}
                />
              </div>
              <button className="btn-primary" type="submit">Create</button>
            </form>
          ) : null}
          <div className="detail-actions">
            <Link className="btn-secondary link-button" to="/vault">
              Back to Vault
            </Link>
          </div>
        </section>

        <section className="panel span-8">
          {error ? <div className="auth-error">{error}</div> : null}
          {loading ? <p className="panel-note">Loading dossiers...</p> : null}
          {detailLoading ? <p className="panel-note">Loading dossier detail...</p> : null}

          {!detailLoading && selected ? (
            <>
              <div className="folder-header">
                <div>
                  <h3>{selected.title}</h3>
                  <p className="panel-note">{selected.description || 'No description'}</p>
                </div>
                <div className="detail-actions">
                  <span className={selected.status === 'final' ? 'status-chip success' : 'status-chip pending'}>
                    {selected.status}
                  </span>
                  {canPatch ? (
                    <>
                      <button className="btn-secondary" onClick={() => updateDossierStatus('draft')}>Draft</button>
                      <button className="btn-secondary" onClick={() => updateDossierStatus('final')}>Final</button>
                      <button className="btn-secondary" onClick={() => updateDossierStatus('archived')}>Archive</button>
                    </>
                  ) : null}
                  <button className="btn-secondary" onClick={exportToPdf}>
                    Export ToC PDF
                  </button>
                </div>
              </div>

              {canCreate ? (
                <form className="auth-form users-create-form dossier-add-form" onSubmit={addItem}>
                  <div className="form-field">
                    <label htmlFor="dossier-content">Add Document</label>
                    <select
                      id="dossier-content"
                      value={newItem.content_id}
                      onChange={event => setNewItem({ ...newItem, content_id: event.target.value })}
                      required
                    >
                      <option value="">Select content</option>
                      {contentOptions.map(content => (
                        <option value={content.id} key={content.id}>
                          {content.doc_number} - {content.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field">
                    <label htmlFor="dossier-position">Position</label>
                    <input
                      id="dossier-position"
                      type="number"
                      min={1}
                      value={newItem.position}
                      onChange={event => setNewItem({ ...newItem, position: event.target.value })}
                      placeholder={String(selectedItems.length + 1)}
                    />
                  </div>
                  <button className="btn-secondary" type="submit">Add Item</button>
                </form>
              ) : null}

              <div className="users-table-wrap">
                <table className="users-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Doc Number</th>
                      <th>Title</th>
                      <th>Version</th>
                      <th>State</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedItems.map(item => (
                      <tr key={item.id}>
                        <td>{item.position}</td>
                        <td>{item.doc_number}</td>
                        <td>{item.title}</td>
                        <td>{item.version_number || '-'}</td>
                        <td>{item.lifecycle_state || '-'}</td>
                        <td>
                          <div className="detail-actions">
                            <Link className="btn-secondary link-button" to={`/vault/content/${item.content_id}`}>
                              Open
                            </Link>
                            <button className="btn-secondary" onClick={() => reorderItem(item, 'up')}>Up</button>
                            <button className="btn-secondary" onClick={() => reorderItem(item, 'down')}>Down</button>
                            {canCreate ? (
                              <button className="btn-secondary" onClick={() => removeItem(item.id)}>
                                Remove
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!selectedItems.length ? (
                      <tr>
                        <td colSpan={6} className="users-empty">No documents in this dossier yet.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </section>
      </main>
    </div>
  )
}
