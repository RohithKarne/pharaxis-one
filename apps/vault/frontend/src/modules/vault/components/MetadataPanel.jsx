import { useEffect, useState } from 'react'
import { apiJson, authHeaders, getOrgToken } from '../../common/utils/session'

const FIELDS = [
  { key: 'description', label: 'Description', type: 'textarea' },
  { key: 'language', label: 'Language' },
  { key: 'country_region', label: 'Country / Region' },
  { key: 'audience', label: 'Audience' },
  { key: 'confidentiality', label: 'Confidentiality' },
  { key: 'regulated', label: 'Regulated', type: 'checkbox' },
  { key: 'therapeutic_area', label: 'Therapeutic Area' },
  { key: 'product_brand', label: 'Product Brand' },
  { key: 'department', label: 'Department' },
  { key: 'keywords', label: 'Keywords (comma-separated)' },
  { key: 'effective_date', label: 'Effective Date', type: 'date' },
  { key: 'expiry_date', label: 'Expiry Date', type: 'date' },
  { key: 'review_cycle_months', label: 'Review Cycle (Months)', type: 'number' }
]

function normalizeForm(metadata) {
  const next = {}
  FIELDS.forEach(field => {
    if (field.type === 'checkbox') {
      next[field.key] = Number(metadata?.[field.key] || 0) === 1
    } else if (field.type === 'date' && metadata?.[field.key]) {
      next[field.key] = String(metadata[field.key]).slice(0, 10)
    } else {
      next[field.key] = metadata?.[field.key] ?? ''
    }
  })
  return next
}

export default function MetadataPanel({ contentId, userRole }) {
  const token = getOrgToken()
  const [metadata, setMetadata] = useState(null)
  const [form, setForm] = useState(normalizeForm())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const canEdit = ['admin', 'author'].includes(String(userRole || ''))

  async function loadMetadata() {
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const payload = await apiJson(`/api/content/${contentId}/metadata`, {
        headers: authHeaders(token)
      })
      setMetadata(payload || {})
      setForm(normalizeForm(payload || {}))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!contentId || !token) return
    loadMetadata()
  }, [contentId, token])

  async function saveMetadata(event) {
    event.preventDefault()
    if (!canEdit) return

    const payload = {}
    FIELDS.forEach(field => {
      if (field.type === 'checkbox') payload[field.key] = form[field.key] ? 1 : 0
      else payload[field.key] = form[field.key] === '' ? null : form[field.key]
    })

    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const response = await apiJson(`/api/content/${contentId}/metadata`, {
        method: 'PATCH',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
      })
      setMetadata(response.metadata)
      setSuccess('Metadata updated.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="panel">
      <h3>Metadata</h3>
      <p className="panel-note">
        Extended metadata drives search, expiry intelligence, and governance reporting.
      </p>
      {error ? <div className="auth-error taxonomy-error">{error}</div> : null}
      {success ? <div className="upload-success">{success}</div> : null}
      {loading ? <p className="panel-note">Loading metadata...</p> : null}

      {!loading ? (
        <form className="metadata-grid" onSubmit={saveMetadata}>
          {FIELDS.map(field => (
            <div className="form-field" key={field.key}>
              <label htmlFor={`meta-${field.key}`}>{field.label}</label>
              {field.type === 'textarea' ? (
                <textarea
                  id={`meta-${field.key}`}
                  value={form[field.key]}
                  onChange={event => setForm({ ...form, [field.key]: event.target.value })}
                  disabled={!canEdit}
                  rows={3}
                />
              ) : field.type === 'checkbox' ? (
                <label className="status-toggle">
                  <input
                    id={`meta-${field.key}`}
                    type="checkbox"
                    checked={Boolean(form[field.key])}
                    onChange={event => setForm({ ...form, [field.key]: event.target.checked })}
                    disabled={!canEdit}
                  />
                  <span>{Boolean(form[field.key]) ? 'Yes' : 'No'}</span>
                </label>
              ) : (
                <input
                  id={`meta-${field.key}`}
                  type={field.type || 'text'}
                  value={form[field.key]}
                  onChange={event => setForm({ ...form, [field.key]: event.target.value })}
                  disabled={!canEdit}
                />
              )}
            </div>
          ))}
          {canEdit ? (
            <div className="detail-actions">
              <button className="btn-primary" type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Save Metadata'}
              </button>
            </div>
          ) : null}
        </form>
      ) : null}
    </section>
  )
}
