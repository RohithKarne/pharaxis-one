/**
 * RegionalLabelsAdmin.jsx — Prescribing Information & Regional SmPC Registry
 *
 * Links pharmaceutical products to regional label versions (US PI, EU SmPC, UK SmPC)
 * for compliant regional response authoring (Ticket 5, Clinical Governance).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../../../shared/context/AuthContext'
import { httpFetch } from '../../../../shared/api/httpFetch.js'

const shell = { display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--surface,#fff)' }
const box = { background: 'var(--surface, #fff)', border: '1px solid var(--border, #e5e7eb)', padding: 16, marginBottom: 14 }
const th = { padding: '8px 12px', borderBottom: '1px solid var(--border,#e5e7eb)', fontWeight: 600, color: 'var(--text-secondary,#374151)' }
const td = { padding: '8px 12px', borderBottom: '1px solid var(--border,#e5e7eb)' }
const ipt = { padding: '6px 10px', border: '1px solid var(--border,#d1d5db)', borderRadius: 2, fontSize: 13, width: '100%' }
const primaryBtn = { background: 'var(--primary,#1e40af)', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 2, cursor: 'pointer', fontWeight: 600, fontSize: 13 }
const miniBtn = (color = '#374151') => ({ background: 'none', border: '1px solid var(--border,#d1d5db)', color, padding: '3px 8px', borderRadius: 2, cursor: 'pointer', fontSize: 11, marginLeft: 4 })

const LABEL_TYPES = [
  { value: 'US_PI', label: 'US Prescribing Information (FDA)' },
  { value: 'EU_SMPC', label: 'EU Summary of Product Characteristics (EMA)' },
  { value: 'UK_SMPC', label: 'UK SmPC (MHRA)' },
  { value: 'HEALTH_CANADA_PM', label: 'Health Canada Product Monograph' },
  { value: 'SWISSMEDIC_PI', label: 'Swissmedic Prescribing Information' },
  { value: 'OTHER', label: 'Other Jurisdictional Label' }
]

export default function RegionalLabelsAdmin() {
  const { token } = useAuth()
  const H = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token])
  const [labels, setLabels] = useState([])
  const [products, setProducts] = useState([])
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState(null)
  const [flash, setFlash] = useState(null)
  const [loading, setLoading] = useState(false)

  function showFlash(text, type = 'success') {
    setFlash({ text, type })
    setTimeout(() => setFlash(null), 3000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await httpFetch('/api/admin/product-regional-labels', { headers: H })
      const data = await res.json()
      setLabels(data.labels || [])
    } catch (err) {
      showFlash(err.message || 'Failed to load regional labels', 'error')
    } finally {
      setLoading(false)
    }
  }, [H])

  useEffect(() => {
    load()
    httpFetch('/api/admin/products-full', { headers: H })
      .then(r => r.json())
      .then(d => setProducts(d.products || []))
      .catch(() => {})
  }, [load, H])

  async function save() {
    if (!edit?.product_id || !edit?.region_code || !edit?.label_title) {
      showFlash('Product, region code, and label title are required', 'error')
      return
    }
    try {
      const path = edit.id ? `/api/admin/products/regional-labels/${edit.id}` : `/api/admin/products/${edit.product_id}/regional-labels`
      const method = edit.id ? 'PUT' : 'POST'
      const res = await httpFetch(path, { method, headers: H, body: JSON.stringify(edit) })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || 'Save failed')
      }
      showFlash(edit.id ? 'Regional label updated' : 'Regional label added')
      setEdit(null)
      load()
    } catch (err) {
      showFlash(err.message, 'error')
    }
  }

  async function remove(id) {
    if (!confirm('Are you sure you want to delete this regional label?')) return
    try {
      const res = await httpFetch(`/api/admin/products/regional-labels/${id}`, { method: 'DELETE', headers: H })
      if (!res.ok) throw new Error('Delete failed')
      showFlash('Regional label removed')
      load()
    } catch (err) {
      showFlash(err.message, 'error')
    }
  }

  const filtered = labels.filter(l => {
    const term = q.toLowerCase()
    return (
      l.product_name?.toLowerCase().includes(term) ||
      l.region_code?.toLowerCase().includes(term) ||
      l.label_title?.toLowerCase().includes(term) ||
      l.label_type?.toLowerCase().includes(term)
    )
  })

  return (
    <div style={shell} data-testid="regional-labels-admin">
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border,#e5e7eb)' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 18 }}>Regional Product Labeling (PI / SmPC)</h1>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted,#6b7280)' }}>
          Jurisdictional prescribing information, European SmPC, and monographs for compliant medical response attachments.
        </p>
      </div>

      {flash && (
        <div className={`alert alert-${flash.type === 'error' ? 'error' : 'success'}`} style={{ margin: '12px 20px' }}>
          {flash.text}
        </div>
      )}

      <div style={{ padding: '12px 20px', display: 'flex', gap: 10, alignItems: 'center' }}>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Filter by product, region, or title..."
          style={{ ...ipt, maxWidth: 300 }}
        />
        <span style={{ flex: 1 }} />
        <button
          onClick={() =>
            setEdit({
              product_id: products[0]?.id || 92,
              region_code: 'US',
              label_type: 'US_PI',
              label_title: '',
              version: '1.0',
              document_url: '',
              is_active: 1
            })
          }
          style={primaryBtn}
        >
          + New Regional Label
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface-alt,#f9fafb)', textAlign: 'left' }}>
              <th style={th}>Product</th>
              <th style={th}>Region</th>
              <th style={th}>Type</th>
              <th style={th}>Label Title</th>
              <th style={th}>Version</th>
              <th style={th}>Approval Date</th>
              <th style={th}>Status</th>
              <th style={{ ...th, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                  Loading regional labels...
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                  No regional labels recorded.
                </td>
              </tr>
            )}
            {!loading &&
              filtered.map(l => (
                <tr key={l.id}>
                  <td style={td}>
                    <strong>{l.product_name}</strong>
                  </td>
                  <td style={td}>
                    <span style={{ background: '#e0e7ff', color: '#3730a3', padding: '2px 6px', borderRadius: 3, fontWeight: 700, fontSize: 11 }}>
                      {l.region_code}
                    </span>
                  </td>
                  <td style={td}>
                    <code style={{ fontSize: 11 }}>{l.label_type}</code>
                  </td>
                  <td style={td}>
                    {l.label_title}
                    {l.document_url && (
                      <div style={{ fontSize: 11, color: 'var(--primary,#1e40af)' }}>
                        <a href={l.document_url} target="_blank" rel="noopener noreferrer">
                          Document link ↗
                        </a>
                      </div>
                    )}
                  </td>
                  <td style={td}>v{l.version}</td>
                  <td style={td}>{l.approval_date ? String(l.approval_date).slice(0, 10) : '–'}</td>
                  <td style={td}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 10,
                        fontSize: 10,
                        fontWeight: 600,
                        color: '#fff',
                        background: l.is_active ? '#15803d' : '#6b7280'
                      }}
                    >
                      {l.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <button onClick={() => setEdit({ ...l })} style={miniBtn()}>
                      Edit
                    </button>
                    <button onClick={() => remove(l.id)} style={miniBtn('#dc2626')}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {edit && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 1000
          }}
        >
          <div style={{ ...box, width: 480, maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>{edit.id ? 'Edit Regional Label' : 'Add Regional Label'}</h3>
            <div style={{ display: 'grid', gap: 10 }}>
              <label style={{ fontSize: 12, fontWeight: 600 }}>
                Product
                <select
                  style={{ ...ipt, marginTop: 4 }}
                  value={edit.product_id}
                  disabled={!!edit.id}
                  onChange={e => setEdit({ ...edit, product_id: Number(e.target.value) })}
                >
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.trade_name}
                    </option>
                  ))}
                </select>
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
                <label style={{ fontSize: 12, fontWeight: 600 }}>
                  Region Code
                  <input
                    style={{ ...ipt, marginTop: 4 }}
                    value={edit.region_code || ''}
                    placeholder="US, EU, UK, CA"
                    onChange={e => setEdit({ ...edit, region_code: e.target.value })}
                  />
                </label>
                <label style={{ fontSize: 12, fontWeight: 600 }}>
                  Label Type
                  <select
                    style={{ ...ipt, marginTop: 4 }}
                    value={edit.label_type}
                    onChange={e => setEdit({ ...edit, label_type: e.target.value })}
                  >
                    {LABEL_TYPES.map(t => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label style={{ fontSize: 12, fontWeight: 600 }}>
                Label Title
                <input
                  style={{ ...ipt, marginTop: 4 }}
                  value={edit.label_title || ''}
                  placeholder="e.g. Entresto Prescribing Information (FDA)"
                  onChange={e => setEdit({ ...edit, label_title: e.target.value })}
                />
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label style={{ fontSize: 12, fontWeight: 600 }}>
                  Version
                  <input
                    style={{ ...ipt, marginTop: 4 }}
                    value={edit.version || ''}
                    placeholder="2024.1"
                    onChange={e => setEdit({ ...edit, version: e.target.value })}
                  />
                </label>
                <label style={{ fontSize: 12, fontWeight: 600 }}>
                  Approval Date
                  <input
                    type="date"
                    style={{ ...ipt, marginTop: 4 }}
                    value={edit.approval_date ? String(edit.approval_date).slice(0, 10) : ''}
                    onChange={e => setEdit({ ...edit, approval_date: e.target.value })}
                  />
                </label>
              </div>

              <label style={{ fontSize: 12, fontWeight: 600 }}>
                Document URL / Path
                <input
                  style={{ ...ipt, marginTop: 4 }}
                  value={edit.document_url || ''}
                  placeholder="https://... or /docs/..."
                  onChange={e => setEdit({ ...edit, document_url: e.target.value })}
                />
              </label>

              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginTop: 6 }}>
                <input
                  type="checkbox"
                  checked={!!edit.is_active}
                  onChange={e => setEdit({ ...edit, is_active: e.target.checked ? 1 : 0 })}
                />
                Active for clinical inquiries
              </label>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setEdit(null)} style={miniBtn()}>
                Cancel
              </button>
              <button onClick={save} style={primaryBtn}>
                Save Label
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
