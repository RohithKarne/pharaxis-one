import { useState, useEffect } from 'react'
import { confirm } from '../../../shared/utils/confirm'
import { SectionHeader, StatusPill } from './AdminShared'
import { httpFetch } from '../../../shared/api/httpFetch.js'

export default function AdminProductsPanel({ H, flash }) {
  const [orgs, setOrgs] = useState([])
  const [products, setProducts] = useState([])
  const [productTab, setProductTab] = useState('products')
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [productForm, setProductForm] = useState({ trade_name: '', org_id: '' })
  const [productApprovals, setProductApprovals] = useState([])
  const [productCountryAuths, setProductCountryAuths] = useState([])
  const [approvalForm, setApprovalForm] = useState({ approval_number: '', regulatory_body: '', approval_date: '', expiry_date: '', status: 'Active' })
  const [approvalModal, setApprovalModal] = useState(null)
  const [approvalEditTarget, setApprovalEditTarget] = useState(null)
  const [countryAuthForm, setCountryAuthForm] = useState({ country: '', auth_number: '', auth_date: '', status: 'Active' })
  const [countryAuthModal, setCountryAuthModal] = useState(null)
  const [countryAuthEditTarget, setCountryAuthEditTarget] = useState(null)

  useEffect(() => { loadOrgs(); loadProducts() }, []) // eslint-disable-line

  async function loadOrgs() {
    try {
      const d = await httpFetch('/api/admin/orgs', { headers: H }).then(r => r.json())
      setOrgs(d.orgs || [])
    } catch { setOrgs([]) }
  }

  async function loadProducts() {
    try {
      const d = await httpFetch('/api/admin/products', { headers: H }).then(r => r.json())
      setProducts(d.products || [])
    } catch { setProducts([]) }
  }

  async function createProduct(e) {
    e.preventDefault()
    const res = await httpFetch('/api/admin/products', { method: 'POST', headers: H, body: JSON.stringify(productForm) })
    const d = await res.json()
    if (!res.ok) return flash(d.error, 'error')
    setProducts(prev => [...prev, d])
    setProductForm({ trade_name: '', org_id: '' })
    flash('Product created.')
  }

  async function loadProductApprovals(productId) {
    try {
      const res = await httpFetch(`/api/admin/products/${productId}/approvals`, { headers: H })
      const d = await res.json()
      setProductApprovals(d.approvals || [])
    } catch { /* silent */ }
  }

  async function loadProductCountryAuths(productId) {
    try {
      const res = await httpFetch(`/api/admin/products/${productId}/country-authorizations`, { headers: H })
      const d = await res.json()
      setProductCountryAuths(d.authorizations || [])
    } catch { /* silent */ }
  }

  function selectProductForDetail(p) {
    setSelectedProduct(p)
    setProductTab('approvals')
    loadProductApprovals(p.id)
    loadProductCountryAuths(p.id)
  }

  async function saveApproval(e) {
    e.preventDefault()
    const isEdit = approvalModal === 'edit'
    const url = isEdit ? `/api/admin/products/approvals/${approvalEditTarget.id}` : `/api/admin/products/${selectedProduct.id}/approvals`
    const res = await httpFetch(url, { method: isEdit ? 'PUT' : 'POST', headers: H, body: JSON.stringify(approvalForm) })
    const d = await res.json()
    if (!res.ok) return flash(d.error || 'Save failed.', 'error')
    await loadProductApprovals(selectedProduct.id)
    setApprovalModal(null)
    flash(isEdit ? 'Approval updated.' : 'Approval created.')
  }

  async function deleteApproval(a) {
    if (!await confirm(`Delete approval "${a.approval_number}"?`)) return
    await httpFetch(`/api/admin/products/approvals/${a.id}`, { method: 'DELETE', headers: H })
    await loadProductApprovals(selectedProduct.id)
    flash('Approval deleted.')
  }

  async function saveCountryAuth(e) {
    e.preventDefault()
    const isEdit = countryAuthModal === 'edit'
    const url = isEdit ? `/api/admin/products/country-authorizations/${countryAuthEditTarget.id}` : `/api/admin/products/${selectedProduct.id}/country-authorizations`
    const res = await httpFetch(url, { method: isEdit ? 'PUT' : 'POST', headers: H, body: JSON.stringify(countryAuthForm) })
    const d = await res.json()
    if (!res.ok) return flash(d.error || 'Save failed.', 'error')
    await loadProductCountryAuths(selectedProduct.id)
    setCountryAuthModal(null)
    flash(isEdit ? 'Authorization updated.' : 'Authorization created.')
  }

  async function deleteCountryAuth(a) {
    if (!await confirm(`Delete authorization for "${a.country}"?`)) return
    await httpFetch(`/api/admin/products/country-authorizations/${a.id}`, { method: 'DELETE', headers: H })
    await loadProductCountryAuths(selectedProduct.id)
    flash('Authorization deleted.')
  }

  return (
    <>
      <SectionHeader title="Product Dictionary" desc="Manage drug/trade names, regulatory approvals, and country authorizations." />

      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
        {[
          { key: 'products', label: 'Products' },
          { key: 'approvals', label: selectedProduct ? `Approvals — ${selectedProduct.trade_name}` : 'Approvals' },
          { key: 'country-auth', label: selectedProduct ? `Country Auth — ${selectedProduct.trade_name}` : 'Country Auth' },
        ].map(t => (
          <button key={t.key} onClick={() => { if (t.key !== 'products' && !selectedProduct) return; setProductTab(t.key) }}
            style={{ padding: '10px 20px', border: 'none', borderBottom: productTab === t.key ? '2px solid var(--primary)' : '2px solid transparent', background: 'none', cursor: (t.key !== 'products' && !selectedProduct) ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: productTab === t.key ? 700 : 400, color: productTab === t.key ? 'var(--primary)' : (t.key !== 'products' && !selectedProduct) ? 'var(--text-muted)' : 'var(--text-secondary)', opacity: (t.key !== 'products' && !selectedProduct) ? 0.5 : 1 }}>
            {t.label}
          </button>
        ))}
      </div>

      {productTab === 'products' && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header"><h3>Add Product</h3></div>
            <div className="card-body">
              <form onSubmit={createProduct} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <input className="form-control" placeholder="Trade name" value={productForm.trade_name} onChange={e => setProductForm(f => ({ ...f, trade_name: e.target.value }))} required style={{ flex: 1 }} />
                <select className="form-control" value={productForm.org_id} onChange={e => setProductForm(f => ({ ...f, org_id: e.target.value }))} style={{ flex: 1 }}>
                  <option value="">Organisation (optional)</option>
                  {orgs.filter(o => o.is_active).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                <button className="btn btn-primary" type="submit" style={{ whiteSpace: 'nowrap' }}>+ Add</button>
              </form>
            </div>
          </div>
          <div className="card">
            <div className="card-header"><h3>Products ({products.length})</h3></div>
            <div className="card-body" style={{ padding: 0 }}>
              <table className="admin-table">
                <thead><tr><th>Trade Name</th><th>Organisation</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {products.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No products yet.</td></tr>}
                  {products.map(p => (
                    <tr key={p.id}>
                      <td><strong>{p.trade_name}</strong></td>
                      <td style={{ color: 'var(--text-muted)' }}>{p.org_name || '—'}</td>
                      <td><StatusPill active={p.is_active} /></td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => selectProductForDetail(p)}>Approvals / Auth →</button>
                          <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 9px' }} onClick={async () => {
                            const res = await httpFetch(`/api/admin/products/${p.id}/clone`, { method: 'POST', headers: H })
                            const d = await res.json()
                            if (!res.ok) return flash(d.error || 'Clone failed.', 'error')
                            loadProducts()
                            flash(`Cloned as "${d.trade_name}".`)
                          }}>⧉ Clone</button>
                          {p.is_active && <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 9px', color: 'var(--warning)', borderColor: 'var(--warning)' }} onClick={async () => {
                            const res = await httpFetch('/api/admin/products/bulk-deactivate', { method: 'PATCH', headers: H, body: JSON.stringify({ ids: [p.id] }) })
                            if (!res.ok) return flash('Deactivate failed.', 'error')
                            loadProducts(); flash('Product deactivated.')
                          }}>Deactivate</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {productTab === 'approvals' && selectedProduct && (
        <>
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Regulatory Approvals — {selectedProduct.trade_name} ({productApprovals.length})</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={() => { setSelectedProduct(null); setProductTab('products') }}>← Back</button>
                <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => { setApprovalForm({ approval_number: '', regulatory_body: '', approval_date: '', expiry_date: '', status: 'Active' }); setApprovalEditTarget(null); setApprovalModal('add') }}>+ Add Approval</button>
              </div>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <table className="admin-table">
                <thead><tr><th>Approval Number</th><th>Regulatory Body</th><th>Approval Date</th><th>Expiry Date</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {productApprovals.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No approvals yet.</td></tr>}
                  {productApprovals.map(a => (
                    <tr key={a.id}>
                      <td><strong>{a.approval_number}</strong></td>
                      <td style={{ color: 'var(--text-muted)' }}>{a.regulatory_body || '—'}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{a.approval_date ? a.approval_date.slice(0, 10) : '—'}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{a.expiry_date ? a.expiry_date.slice(0, 10) : '—'}</td>
                      <td><span className={`status-pill ${a.status === 'Active' ? 'active' : 'inactive'}`}>{a.status}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => { setApprovalEditTarget(a); setApprovalForm({ approval_number: a.approval_number, regulatory_body: a.regulatory_body || '', approval_date: a.approval_date ? a.approval_date.slice(0,10) : '', expiry_date: a.expiry_date ? a.expiry_date.slice(0,10) : '', status: a.status }); setApprovalModal('edit') }}>✏ Edit</button>
                          <button className="btn btn-danger" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => deleteApproval(a)}>🗑</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {approvalModal && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
              <div style={{ background: 'var(--surface)', borderRadius: 10, width: '100%', maxWidth: 480, padding: 28, boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <h3 style={{ margin: 0 }}>{approvalModal === 'add' ? 'Add Approval' : 'Edit Approval'}</h3>
                  <button onClick={() => setApprovalModal(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
                </div>
                <form onSubmit={saveApproval}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Approval Number *</label>
                      <input className="form-control" value={approvalForm.approval_number} onChange={e => setApprovalForm(f => ({ ...f, approval_number: e.target.value }))} required />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Regulatory Body</label>
                      <input className="form-control" placeholder="e.g. FDA, EMA, CDSCO" value={approvalForm.regulatory_body} onChange={e => setApprovalForm(f => ({ ...f, regulatory_body: e.target.value }))} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Approval Date</label>
                      <input className="form-control" type="date" value={approvalForm.approval_date} onChange={e => setApprovalForm(f => ({ ...f, approval_date: e.target.value }))} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Expiry Date</label>
                      <input className="form-control" type="date" value={approvalForm.expiry_date} onChange={e => setApprovalForm(f => ({ ...f, expiry_date: e.target.value }))} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Status</label>
                      <select className="form-control" value={approvalForm.status} onChange={e => setApprovalForm(f => ({ ...f, status: e.target.value }))}>
                        <option value="Active">Active</option>
                        <option value="Expired">Expired</option>
                        <option value="Suspended">Suspended</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                    <button type="button" className="btn btn-outline" onClick={() => setApprovalModal(null)}>Cancel</button>
                    <button type="submit" className="btn btn-primary">Save</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}

      {productTab === 'country-auth' && selectedProduct && (
        <>
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Country Authorizations — {selectedProduct.trade_name} ({productCountryAuths.length})</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={() => { setSelectedProduct(null); setProductTab('products') }}>← Back</button>
                <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => { setCountryAuthForm({ country: '', auth_number: '', auth_date: '', status: 'Active' }); setCountryAuthEditTarget(null); setCountryAuthModal('add') }}>+ Add Authorization</button>
              </div>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <table className="admin-table">
                <thead><tr><th>Country</th><th>Authorization Number</th><th>Authorization Date</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {productCountryAuths.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No authorizations yet.</td></tr>}
                  {productCountryAuths.map(a => (
                    <tr key={a.id}>
                      <td><strong>{a.country}</strong></td>
                      <td style={{ color: 'var(--text-muted)' }}>{a.auth_number || '—'}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{a.auth_date ? a.auth_date.slice(0, 10) : '—'}</td>
                      <td><span className={`status-pill ${a.status === 'Active' ? 'active' : 'inactive'}`}>{a.status}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => { setCountryAuthEditTarget(a); setCountryAuthForm({ country: a.country, auth_number: a.auth_number || '', auth_date: a.auth_date ? a.auth_date.slice(0,10) : '', status: a.status }); setCountryAuthModal('edit') }}>✏ Edit</button>
                          <button className="btn btn-danger" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => deleteCountryAuth(a)}>🗑</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {countryAuthModal && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
              <div style={{ background: 'var(--surface)', borderRadius: 10, width: '100%', maxWidth: 440, padding: 28, boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <h3 style={{ margin: 0 }}>{countryAuthModal === 'add' ? 'Add Authorization' : 'Edit Authorization'}</h3>
                  <button onClick={() => setCountryAuthModal(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
                </div>
                <form onSubmit={saveCountryAuth}>
                  <div style={{ display: 'grid', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Country *</label>
                      <input className="form-control" placeholder="e.g. United States" value={countryAuthForm.country} onChange={e => setCountryAuthForm(f => ({ ...f, country: e.target.value }))} required />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Authorization Number</label>
                      <input className="form-control" value={countryAuthForm.auth_number} onChange={e => setCountryAuthForm(f => ({ ...f, auth_number: e.target.value }))} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Authorization Date</label>
                      <input className="form-control" type="date" value={countryAuthForm.auth_date} onChange={e => setCountryAuthForm(f => ({ ...f, auth_date: e.target.value }))} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Status</label>
                      <select className="form-control" value={countryAuthForm.status} onChange={e => setCountryAuthForm(f => ({ ...f, status: e.target.value }))}>
                        <option value="Active">Active</option>
                        <option value="Revoked">Revoked</option>
                        <option value="Suspended">Suspended</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                    <button type="button" className="btn btn-outline" onClick={() => setCountryAuthModal(null)}>Cancel</button>
                    <button type="submit" className="btn btn-primary">Save</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}
    </>
  )
}
