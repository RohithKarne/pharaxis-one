import { useState, useEffect } from 'react'
import { confirm } from '../../../shared/utils/confirm'
import { SectionHeader, StatusPill } from './AdminShared'
import { httpFetch } from '../../../shared/api/httpFetch.js'

const BLANK_PRODUCT = { trade_name: '', mah: '', org_id: '', family_id: '', dosage: '', atc_code: '', authorization_country: '', is_active: true }
const BLANK_FAMILY = { name: '', ingredients_text: '', org_id: '', is_active: true }
const BLANK_GROUP = { name: '', group_type: 'transmissions', description: '', org_id: '', is_active: true }
const BLANK_MEMBER = { member_type: 'product', member_id: '' }
const BLANK_ASSIGNMENT = { target_type: 'transmission_rule', target_id: '', label: '' }
const BLANK_APPROVAL = { approval_number: '', regulatory_body: '', approval_date: '', expiry_date: '', status: 'Active' }
const BLANK_COUNTRY_AUTH = { country: '', auth_number: '', auth_date: '', status: 'Active' }

function parseIngredients(text) {
  return String(text || '').split(',').map(item => item.trim()).filter(Boolean)
}

function groupTypeLabel(types, key) {
  return types.find(item => item.key === key)?.label || key
}

function groupSummary(product) {
  const groups = product.product_groups || {}
  return Object.entries(groups)
    .filter(([, value]) => Array.isArray(value) && value.length)
    .map(([key, value]) => `${key}: ${value.map(group => group.name).join(', ')}`)
    .join(' | ')
}

export default function AdminProductsPanel({ H, flash }) {
  const [orgs, setOrgs] = useState([])
  const [families, setFamilies] = useState([])
  const [products, setProducts] = useState([])
  const [groups, setGroups] = useState([])
  const [groupTypes, setGroupTypes] = useState([])
  const [targetTypes, setTargetTypes] = useState([])
  const [productTab, setProductTab] = useState('families')
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [productForm, setProductForm] = useState(BLANK_PRODUCT)
  const [familyForm, setFamilyForm] = useState(BLANK_FAMILY)
  const [groupForm, setGroupForm] = useState(BLANK_GROUP)
  const [memberForm, setMemberForm] = useState(BLANK_MEMBER)
  const [assignmentForm, setAssignmentForm] = useState(BLANK_ASSIGNMENT)
  const [productApprovals, setProductApprovals] = useState([])
  const [productCountryAuths, setProductCountryAuths] = useState([])
  const [groupMembers, setGroupMembers] = useState([])
  const [groupAssignments, setGroupAssignments] = useState([])
  const [approvalForm, setApprovalForm] = useState(BLANK_APPROVAL)
  const [approvalModal, setApprovalModal] = useState(null)
  const [approvalEditTarget, setApprovalEditTarget] = useState(null)
  const [countryAuthForm, setCountryAuthForm] = useState(BLANK_COUNTRY_AUTH)
  const [countryAuthModal, setCountryAuthModal] = useState(null)
  const [countryAuthEditTarget, setCountryAuthEditTarget] = useState(null)

  useEffect(() => { loadAll() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function readJson(path, options = {}) {
    const res = await httpFetch(path, { ...options, headers: { ...H, ...(options.headers || {}) } })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Request failed.')
    return data
  }

  async function loadAll() {
    await Promise.all([loadOrgs(), loadFamilies(), loadProducts(), loadGroups(), loadGroupTypes()])
  }

  async function loadOrgs() {
    try { setOrgs((await readJson('/api/admin/orgs')).orgs || []) } catch { setOrgs([]) }
  }

  async function loadFamilies() {
    try { setFamilies((await readJson('/api/admin/product-families')).families || []) } catch { setFamilies([]) }
  }

  async function loadProducts() {
    try { setProducts((await readJson('/api/admin/products-full')).products || []) } catch { setProducts([]) }
  }

  async function loadGroups() {
    try { setGroups((await readJson('/api/admin/product-groups')).groups || []) } catch { setGroups([]) }
  }

  async function loadGroupTypes() {
    try {
      const data = await readJson('/api/admin/product-group-types')
      setGroupTypes(data.group_types || [])
      setTargetTypes(data.target_types || [])
    } catch {
      setGroupTypes([])
      setTargetTypes([])
    }
  }

  async function createFamily(event) {
    event.preventDefault()
    try {
      await readJson('/api/admin/product-families', {
        method: 'POST',
        body: JSON.stringify({
          name: familyForm.name,
          org_id: familyForm.org_id || undefined,
          ingredients: parseIngredients(familyForm.ingredients_text),
          is_active: familyForm.is_active,
        }),
      })
      setFamilyForm(BLANK_FAMILY)
      await loadFamilies()
      flash('Product family created.')
    } catch (err) { flash(err.message, 'error') }
  }

  async function createProduct(event) {
    event.preventDefault()
    try {
      const data = await readJson('/api/admin/products-full', {
        method: 'POST',
        body: JSON.stringify({
          ...productForm,
          org_id: productForm.org_id || undefined,
          family_id: productForm.family_id || null,
        }),
      })
      setProductForm(BLANK_PRODUCT)
      await loadProducts()
      if (data.product) setSelectedProduct(data.product)
      flash('Product created.')
    } catch (err) { flash(err.message, 'error') }
  }

  async function saveProduct(product, updates) {
    try {
      await readJson(`/api/admin/products-full/${product.id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...product, ...updates }),
      })
      await loadProducts()
      flash('Product updated.')
    } catch (err) { flash(err.message, 'error') }
  }

  async function createGroup(event) {
    event.preventDefault()
    try {
      const data = await readJson('/api/admin/product-groups', {
        method: 'POST',
        body: JSON.stringify({ ...groupForm, org_id: groupForm.org_id || undefined }),
      })
      setGroupForm(BLANK_GROUP)
      await loadGroups()
      if (data.group) selectGroup(data.group)
      flash('Product group created.')
    } catch (err) { flash(err.message, 'error') }
  }

  async function selectProduct(product) {
    setSelectedProduct(product)
    setProductTab('approvals')
    await Promise.all([loadProductApprovals(product.id), loadProductCountryAuths(product.id)])
  }

  async function selectGroup(group) {
    setSelectedGroup(group)
    setProductTab('assignments')
    await Promise.all([loadGroupMembers(group.id), loadGroupAssignments(group.id)])
  }

  async function loadProductApprovals(productId) {
    try { setProductApprovals((await readJson(`/api/admin/products/${productId}/approvals`)).approvals || []) } catch { setProductApprovals([]) }
  }

  async function loadProductCountryAuths(productId) {
    try { setProductCountryAuths((await readJson(`/api/admin/products/${productId}/country-authorizations`)).authorizations || []) } catch { setProductCountryAuths([]) }
  }

  async function loadGroupMembers(groupId) {
    try { setGroupMembers((await readJson(`/api/admin/product-groups/${groupId}/members`)).members || []) } catch { setGroupMembers([]) }
  }

  async function loadGroupAssignments(groupId) {
    try { setGroupAssignments((await readJson(`/api/admin/product-groups/${groupId}/assignments`)).assignments || []) } catch { setGroupAssignments([]) }
  }

  async function addGroupMember(event) {
    event.preventDefault()
    if (!selectedGroup) return
    try {
      const data = await readJson(`/api/admin/product-groups/${selectedGroup.id}/members`, {
        method: 'POST',
        body: JSON.stringify(memberForm),
      })
      setGroupMembers(data.members || [])
      setMemberForm(BLANK_MEMBER)
      await loadGroups()
      flash('Product group member added.')
    } catch (err) { flash(err.message, 'error') }
  }

  async function removeGroupMember(member) {
    if (!selectedGroup || !await confirm(`Remove ${member.member_label} from this group?`)) return
    try {
      const data = await readJson(`/api/admin/product-groups/${selectedGroup.id}/members/${member.id}`, { method: 'DELETE' })
      setGroupMembers(data.members || [])
      await loadGroups()
      flash('Product group member removed.')
    } catch (err) { flash(err.message, 'error') }
  }

  async function addGroupAssignment(event) {
    event.preventDefault()
    if (!selectedGroup) return
    try {
      const data = await readJson(`/api/admin/product-groups/${selectedGroup.id}/assignments`, {
        method: 'POST',
        body: JSON.stringify({
          target_type: assignmentForm.target_type,
          target_id: assignmentForm.target_id || null,
          metadata: assignmentForm.label ? { label: assignmentForm.label } : {},
        }),
      })
      setGroupAssignments(data.assignments || [])
      setAssignmentForm(BLANK_ASSIGNMENT)
      await loadGroups()
      flash('Product group assignment added.')
    } catch (err) { flash(err.message, 'error') }
  }

  async function removeGroupAssignment(assignment) {
    if (!selectedGroup || !await confirm(`Remove assignment ${assignment.target_label}?`)) return
    try {
      const data = await readJson(`/api/admin/product-groups/${selectedGroup.id}/assignments/${assignment.id}`, { method: 'DELETE' })
      setGroupAssignments(data.assignments || [])
      await loadGroups()
      flash('Product group assignment removed.')
    } catch (err) { flash(err.message, 'error') }
  }

  async function saveApproval(event) {
    event.preventDefault()
    if (!selectedProduct) return
    const isEdit = approvalModal === 'edit'
    const url = isEdit ? `/api/admin/products/approvals/${approvalEditTarget.id}` : `/api/admin/products/${selectedProduct.id}/approvals`
    try {
      await readJson(url, { method: isEdit ? 'PUT' : 'POST', body: JSON.stringify(approvalForm) })
      await loadProductApprovals(selectedProduct.id)
      setApprovalModal(null)
      flash(isEdit ? 'Approval updated.' : 'Approval created.')
    } catch (err) { flash(err.message, 'error') }
  }

  async function deleteApproval(approval) {
    if (!selectedProduct || !await confirm(`Delete approval "${approval.approval_number}"?`)) return
    await readJson(`/api/admin/products/approvals/${approval.id}`, { method: 'DELETE' })
    await loadProductApprovals(selectedProduct.id)
    flash('Approval deleted.')
  }

  async function saveCountryAuth(event) {
    event.preventDefault()
    if (!selectedProduct) return
    const isEdit = countryAuthModal === 'edit'
    const url = isEdit ? `/api/admin/products/country-authorizations/${countryAuthEditTarget.id}` : `/api/admin/products/${selectedProduct.id}/country-authorizations`
    try {
      await readJson(url, { method: isEdit ? 'PUT' : 'POST', body: JSON.stringify(countryAuthForm) })
      await loadProductCountryAuths(selectedProduct.id)
      setCountryAuthModal(null)
      flash(isEdit ? 'Authorization updated.' : 'Authorization created.')
    } catch (err) { flash(err.message, 'error') }
  }

  async function deleteCountryAuth(auth) {
    if (!selectedProduct || !await confirm(`Delete authorization for "${auth.country}"?`)) return
    await readJson(`/api/admin/products/country-authorizations/${auth.id}`, { method: 'DELETE' })
    await loadProductCountryAuths(selectedProduct.id)
    flash('Authorization deleted.')
  }

  function memberOptions() {
    if (memberForm.member_type === 'product_family') return families.map(item => ({ id: item.id, label: item.name }))
    if (memberForm.member_type === 'country_authorization') return productCountryAuths.map(item => ({ id: item.id, label: `${item.country} - ${item.auth_number || 'Authorization'}` }))
    return products.map(item => ({ id: item.id, label: item.trade_name }))
  }

  const tabs = [
    { key: 'families', label: `Families (${families.length})` },
    { key: 'products', label: `Products (${products.length})` },
    { key: 'groups', label: `Product Groups (${groups.length})` },
    { key: 'approvals', label: selectedProduct ? `Approvals - ${selectedProduct.trade_name}` : 'Approvals' },
    { key: 'country-auth', label: selectedProduct ? `Country Auth - ${selectedProduct.trade_name}` : 'Country Auth' },
    { key: 'assignments', label: selectedGroup ? `Assignments - ${selectedGroup.name}` : 'Assignments' },
  ]

  return (
    <>
      <SectionHeader title="Product Dictionary" desc="Manage product families, trade products, typed product groups, approvals, authorizations, and downstream configuration assignments." />

      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 16, flexWrap: 'wrap' }}>
        {tabs.map(tab => {
          const locked = (['approvals', 'country-auth'].includes(tab.key) && !selectedProduct) || (tab.key === 'assignments' && !selectedGroup)
          return (
            <button key={tab.key} onClick={() => !locked && setProductTab(tab.key)}
              style={{ padding: '10px 14px', border: 'none', borderBottom: productTab === tab.key ? '2px solid var(--primary)' : '2px solid transparent', background: 'none', cursor: locked ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: productTab === tab.key ? 700 : 400, color: productTab === tab.key ? 'var(--primary)' : locked ? 'var(--text-muted)' : 'var(--text-secondary)', opacity: locked ? 0.5 : 1 }}>
              {tab.label}
            </button>
          )
        })}
      </div>

      {productTab === 'families' && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header"><h3>Add Product Family</h3></div>
            <div className="card-body">
              <form onSubmit={createFamily} style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 1fr auto', gap: 10 }}>
                <input className="form-control" placeholder="Family name" value={familyForm.name} onChange={e => setFamilyForm(f => ({ ...f, name: e.target.value }))} required />
                <input className="form-control" placeholder="Ingredients, comma separated" value={familyForm.ingredients_text} onChange={e => setFamilyForm(f => ({ ...f, ingredients_text: e.target.value }))} />
                <select className="form-control" value={familyForm.org_id} onChange={e => setFamilyForm(f => ({ ...f, org_id: e.target.value }))}>
                  <option value="">Organisation (optional)</option>
                  {orgs.filter(o => o.is_active).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                <button className="btn btn-primary" type="submit">+ Add</button>
              </form>
            </div>
          </div>
          <SimpleTable headers={['Family', 'Ingredients', 'Products', 'Status']} empty="No families yet.">
            {families.map(family => (
              <tr key={family.id}>
                <td><strong>{family.name}</strong></td>
                <td>{Array.isArray(family.ingredients) ? family.ingredients.join(', ') : '—'}</td>
                <td>{family.products?.length || 0}</td>
                <td><StatusPill active={family.is_active} /></td>
              </tr>
            ))}
          </SimpleTable>
        </>
      )}

      {productTab === 'products' && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header"><h3>Add Product</h3></div>
            <div className="card-body">
              <form onSubmit={createProduct} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(160px, 1fr)) auto', gap: 10 }}>
                <input className="form-control" placeholder="Trade name" value={productForm.trade_name} onChange={e => setProductForm(f => ({ ...f, trade_name: e.target.value }))} required />
                <input className="form-control" placeholder="MAH" value={productForm.mah} onChange={e => setProductForm(f => ({ ...f, mah: e.target.value }))} />
                <select className="form-control" value={productForm.family_id} onChange={e => setProductForm(f => ({ ...f, family_id: e.target.value }))}>
                  <option value="">Family</option>
                  {families.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
                <select className="form-control" value={productForm.org_id} onChange={e => setProductForm(f => ({ ...f, org_id: e.target.value }))}>
                  <option value="">Organisation</option>
                  {orgs.filter(o => o.is_active).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                <input className="form-control" placeholder="Dosage" value={productForm.dosage} onChange={e => setProductForm(f => ({ ...f, dosage: e.target.value }))} />
                <input className="form-control" placeholder="ATC code" value={productForm.atc_code} onChange={e => setProductForm(f => ({ ...f, atc_code: e.target.value }))} />
                <input className="form-control" placeholder="Authorization country" value={productForm.authorization_country} onChange={e => setProductForm(f => ({ ...f, authorization_country: e.target.value }))} />
                <button className="btn btn-primary" type="submit">+ Add</button>
              </form>
            </div>
          </div>
          <SimpleTable headers={['Trade Name', 'Family', 'MAH', 'Auth Country', 'Groups', 'Status', 'Actions']} empty="No products yet.">
            {products.map(product => (
              <tr key={product.id}>
                <td><strong>{product.trade_name}</strong><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{product.dosage || ''} {product.atc_code || ''}</div></td>
                <td>{product.family_name || '—'}</td>
                <td>{product.mah || '—'}</td>
                <td>{product.authorization_country || '—'}</td>
                <td style={{ maxWidth: 260, color: 'var(--text-muted)', fontSize: 12 }}>{groupSummary(product) || '—'}</td>
                <td><StatusPill active={product.is_active} /></td>
                <td><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => selectProduct(product)}>Detail</button>
                  <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => saveProduct(product, { is_active: !product.is_active })}>{product.is_active ? 'Deactivate' : 'Activate'}</button>
                </div></td>
              </tr>
            ))}
          </SimpleTable>
        </>
      )}

      {productTab === 'groups' && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header"><h3>Add Product Group</h3></div>
            <div className="card-body">
              <form onSubmit={createGroup} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.5fr auto', gap: 10 }}>
                <input className="form-control" placeholder="Group name" value={groupForm.name} onChange={e => setGroupForm(f => ({ ...f, name: e.target.value }))} required />
                <select className="form-control" value={groupForm.group_type} onChange={e => setGroupForm(f => ({ ...f, group_type: e.target.value }))}>
                  {(groupTypes.length ? groupTypes : Object.keys({ transmissions: 1, cdr: 1, analytics: 1, custom_form: 1, dccr_cdor: 1, response: 1 }).map(key => ({ key, label: key }))).map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
                <select className="form-control" value={groupForm.org_id} onChange={e => setGroupForm(f => ({ ...f, org_id: e.target.value }))}>
                  <option value="">Organisation</option>
                  {orgs.filter(o => o.is_active).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                <input className="form-control" placeholder="Description" value={groupForm.description} onChange={e => setGroupForm(f => ({ ...f, description: e.target.value }))} />
                <button className="btn btn-primary" type="submit">+ Add</button>
              </form>
            </div>
          </div>
          <SimpleTable headers={['Group', 'Type', 'Members', 'Assignments', 'Status', 'Actions']} empty="No product groups yet.">
            {groups.map(group => (
              <tr key={group.id}>
                <td><strong>{group.name}</strong><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{group.description || ''}</div></td>
                <td>{group.group_type_label || groupTypeLabel(groupTypes, group.group_type)}</td>
                <td>{group.member_count}</td>
                <td>{group.assignment_count}</td>
                <td><StatusPill active={group.is_active} /></td>
                <td><button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => selectGroup(group)}>Members / Assignments</button></td>
              </tr>
            ))}
          </SimpleTable>
        </>
      )}

      {productTab === 'approvals' && selectedProduct && renderApprovals()}
      {productTab === 'country-auth' && selectedProduct && renderCountryAuths()}
      {productTab === 'assignments' && selectedGroup && renderAssignments()}
    </>
  )

  function renderApprovals() {
    return <>
      <DetailHeader title={`Regulatory Approvals - ${selectedProduct.trade_name}`} onBack={() => setProductTab('products')} actionLabel="+ Add Approval" onAction={() => { setApprovalForm(BLANK_APPROVAL); setApprovalEditTarget(null); setApprovalModal('add') }} />
      <SimpleTable headers={['Approval Number', 'Regulatory Body', 'Approval Date', 'Expiry Date', 'Status', 'Actions']} empty="No approvals yet.">
        {productApprovals.map(approval => <tr key={approval.id}>
          <td><strong>{approval.approval_number}</strong></td><td>{approval.regulatory_body || '—'}</td><td>{approval.approval_date ? approval.approval_date.slice(0, 10) : '—'}</td><td>{approval.expiry_date ? approval.expiry_date.slice(0, 10) : '—'}</td><td><span className={`status-pill ${approval.status === 'Active' ? 'active' : 'inactive'}`}>{approval.status}</span></td>
          <td><button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => { setApprovalEditTarget(approval); setApprovalForm({ approval_number: approval.approval_number, regulatory_body: approval.regulatory_body || '', approval_date: approval.approval_date ? approval.approval_date.slice(0, 10) : '', expiry_date: approval.expiry_date ? approval.expiry_date.slice(0, 10) : '', status: approval.status }); setApprovalModal('edit') }}>Edit</button> <button className="btn btn-danger" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => deleteApproval(approval)}>Delete</button></td>
        </tr>)}
      </SimpleTable>
      {approvalModal && <ApprovalModal />}
    </>
  }

  function renderCountryAuths() {
    return <>
      <DetailHeader title={`Country Authorizations - ${selectedProduct.trade_name}`} onBack={() => setProductTab('products')} actionLabel="+ Add Authorization" onAction={() => { setCountryAuthForm(BLANK_COUNTRY_AUTH); setCountryAuthEditTarget(null); setCountryAuthModal('add') }} />
      <SimpleTable headers={['Country', 'Authorization Number', 'Authorization Date', 'Status', 'Actions']} empty="No authorizations yet.">
        {productCountryAuths.map(auth => <tr key={auth.id}>
          <td><strong>{auth.country}</strong></td><td>{auth.auth_number || '—'}</td><td>{auth.auth_date ? auth.auth_date.slice(0, 10) : '—'}</td><td><span className={`status-pill ${auth.status === 'Active' ? 'active' : 'inactive'}`}>{auth.status}</span></td>
          <td><button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => { setCountryAuthEditTarget(auth); setCountryAuthForm({ country: auth.country, auth_number: auth.auth_number || '', auth_date: auth.auth_date ? auth.auth_date.slice(0, 10) : '', status: auth.status }); setCountryAuthModal('edit') }}>Edit</button> <button className="btn btn-danger" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => deleteCountryAuth(auth)}>Delete</button></td>
        </tr>)}
      </SimpleTable>
      {countryAuthModal && <CountryAuthModal />}
    </>
  }

  function renderAssignments() {
    return <>
      <DetailHeader title={`Members and Assignments - ${selectedGroup.name}`} onBack={() => setProductTab('groups')} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card"><div className="card-header"><h3>Add Member</h3></div><div className="card-body">
          <form onSubmit={addGroupMember} style={{ display: 'grid', gap: 10 }}>
            <select className="form-control" value={memberForm.member_type} onChange={e => setMemberForm({ member_type: e.target.value, member_id: '' })}>
              <option value="product">Product</option><option value="product_family">Product Family</option><option value="country_authorization">Country Authorization (selected product)</option>
            </select>
            <select className="form-control" value={memberForm.member_id} onChange={e => setMemberForm(f => ({ ...f, member_id: e.target.value }))} required>
              <option value="">Select member</option>{memberOptions().map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
            <button className="btn btn-primary" type="submit">Add Member</button>
          </form>
        </div></div>
        <div className="card"><div className="card-header"><h3>Add Downstream Assignment</h3></div><div className="card-body">
          <form onSubmit={addGroupAssignment} style={{ display: 'grid', gap: 10 }}>
            <select className="form-control" value={assignmentForm.target_type} onChange={e => setAssignmentForm(f => ({ ...f, target_type: e.target.value }))}>{(targetTypes.length ? targetTypes : [{ key: 'transmission_rule' }, { key: 'report_definition' }, { key: 'case_form_definition' }, { key: 'cm_template' }, { key: 'site_response_template' }]).map(t => <option key={t.key} value={t.key}>{t.key}</option>)}</select>
            <input className="form-control" placeholder="Target ID (optional for rule placeholder)" value={assignmentForm.target_id} onChange={e => setAssignmentForm(f => ({ ...f, target_id: e.target.value }))} />
            <input className="form-control" placeholder="Label / rule name" value={assignmentForm.label} onChange={e => setAssignmentForm(f => ({ ...f, label: e.target.value }))} />
            <button className="btn btn-primary" type="submit">Add Assignment</button>
          </form>
        </div></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
        <SimpleTable headers={['Member', 'Type', 'Actions']} empty="No members yet.">{groupMembers.map(member => <tr key={member.id}><td>{member.member_label}</td><td>{member.member_type}</td><td><button className="btn btn-danger" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => removeGroupMember(member)}>Remove</button></td></tr>)}</SimpleTable>
        <SimpleTable headers={['Target', 'Type', 'Actions']} empty="No assignments yet.">{groupAssignments.map(assignment => <tr key={assignment.id}><td>{assignment.target_label}</td><td>{assignment.target_type}</td><td><button className="btn btn-danger" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => removeGroupAssignment(assignment)}>Remove</button></td></tr>)}</SimpleTable>
      </div>
    </>
  }

  function ApprovalModal() {
    return <Modal title={approvalModal === 'add' ? 'Add Approval' : 'Edit Approval'} onClose={() => setApprovalModal(null)} onSubmit={saveApproval}>
      <input className="form-control" placeholder="Approval number" value={approvalForm.approval_number} onChange={e => setApprovalForm(f => ({ ...f, approval_number: e.target.value }))} required />
      <input className="form-control" placeholder="Regulatory body" value={approvalForm.regulatory_body} onChange={e => setApprovalForm(f => ({ ...f, regulatory_body: e.target.value }))} />
      <input className="form-control" type="date" value={approvalForm.approval_date} onChange={e => setApprovalForm(f => ({ ...f, approval_date: e.target.value }))} />
      <input className="form-control" type="date" value={approvalForm.expiry_date} onChange={e => setApprovalForm(f => ({ ...f, expiry_date: e.target.value }))} />
      <select className="form-control" value={approvalForm.status} onChange={e => setApprovalForm(f => ({ ...f, status: e.target.value }))}><option>Active</option><option>Expired</option><option>Suspended</option></select>
    </Modal>
  }

  function CountryAuthModal() {
    return <Modal title={countryAuthModal === 'add' ? 'Add Authorization' : 'Edit Authorization'} onClose={() => setCountryAuthModal(null)} onSubmit={saveCountryAuth}>
      <input className="form-control" placeholder="Country" value={countryAuthForm.country} onChange={e => setCountryAuthForm(f => ({ ...f, country: e.target.value }))} required />
      <input className="form-control" placeholder="Authorization number" value={countryAuthForm.auth_number} onChange={e => setCountryAuthForm(f => ({ ...f, auth_number: e.target.value }))} />
      <input className="form-control" type="date" value={countryAuthForm.auth_date} onChange={e => setCountryAuthForm(f => ({ ...f, auth_date: e.target.value }))} />
      <select className="form-control" value={countryAuthForm.status} onChange={e => setCountryAuthForm(f => ({ ...f, status: e.target.value }))}><option>Active</option><option>Revoked</option><option>Suspended</option></select>
    </Modal>
  }
}

function DetailHeader({ title, onBack, actionLabel, onAction }) {
  return <div className="card" style={{ marginBottom: 16 }}><div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h3>{title}</h3><div style={{ display: 'flex', gap: 8 }}><button className="btn btn-outline" onClick={onBack}>Back</button>{actionLabel && <button className="btn btn-primary" onClick={onAction}>{actionLabel}</button>}</div></div></div>
}

function SimpleTable({ headers, empty, children }) {
  const rows = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : []
  return <div className="card"><div className="card-body" style={{ padding: 0 }}><table className="admin-table"><thead><tr>{headers.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.length ? rows : <tr><td colSpan={headers.length} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>{empty}</td></tr>}</tbody></table></div></div>
}

function Modal({ title, onClose, onSubmit, children }) {
  return <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
    <div style={{ background: 'var(--surface)', borderRadius: 10, width: '100%', maxWidth: 480, padding: 28, boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}><h3 style={{ margin: 0 }}>{title}</h3><button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}>x</button></div>
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>{children}<div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8, paddingTop: 12, borderTop: '1px solid var(--border)' }}><button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button><button type="submit" className="btn btn-primary">Save</button></div></form>
    </div>
  </div>
}
