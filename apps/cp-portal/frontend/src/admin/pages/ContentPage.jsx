import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { adminHeaders } from '../context/AdminAuthContext'

const TABS = ['Therapeutic Areas', 'Drugs', 'Events', 'Resources']

const endpoints = { 'Therapeutic Areas': 'therapeutic-areas', Drugs: 'drugs', Events: 'events', Resources: 'resources' }

const STATUS_COLORS = {
  draft:       { background: '#F3F4F6', color: '#6B7280' },
  in_review:   { background: '#DBEAFE', color: '#1E40AF' },
  in_progress: { background: '#FFEDD5', color: '#9A3412' },
  published:   { background: '#DCFCE7', color: '#166534' },
  archived:    { background: '#F3F4F6', color: '#6B7280' },
  expired:     { background: '#FEE2E2', color: '#991B1B' },
}

function statusBadge(item) {
  if (item.status && STATUS_COLORS[item.status]) {
    return <span style={{ ...STATUS_COLORS[item.status], padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>{item.status}</span>
  }
  const active = item.is_active !== 0
  return <span style={{ background: active ? '#DCFCE7' : '#F3F4F6', color: active ? '#166534' : '#6B7280', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>{active ? 'active' : 'inactive'}</span>
}

export default function ContentPage() {
  const { clientId }      = useParams()
  const [tab, setTab]     = useState('Therapeutic Areas')
  const [data, setData]   = useState({ therapeutic_areas: [], drugs: [], events: [], resources: [] })
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]   = useState({})
  const [saving, setSaving] = useState(false)
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)

  const [showInactive, setShowInactive] = useState(false)
  const [editItem, setEditItem]       = useState(null)
  const [showEditForm, setShowEditForm] = useState(false)
  const [editForm, setEditForm]       = useState({})

  function toSlug(str) {
    return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  }

  useEffect(() => { loadAll() }, [clientId])
  useEffect(() => { setShowInactive(false) }, [tab])

  async function loadAll() {
    setLoading(true)
    try {
      const [ta, dr, ev, re] = await Promise.all([
        fetch(`/api/admin/content/${clientId}/therapeutic-areas`, { headers: adminHeaders() }).then(r => r.json()),
        fetch(`/api/admin/content/${clientId}/drugs`,             { headers: adminHeaders() }).then(r => r.json()),
        fetch(`/api/admin/content/${clientId}/events`,            { headers: adminHeaders() }).then(r => r.json()),
        fetch(`/api/admin/content/${clientId}/resources`,         { headers: adminHeaders() }).then(r => r.json()),
      ])
      setData({ therapeutic_areas: ta.therapeutic_areas || [], drugs: dr.drugs || [], events: ev.events || [], resources: re.resources || [] })
    } catch {
      // A failed/partial sub-request must not hang the spinner — surface empty and let the page render.
      setData({ therapeutic_areas: [], drugs: [], events: [], resources: [] })
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault(); setSaving(true)
    await fetch(`/api/admin/content/${clientId}/${endpoints[tab]}`, { method: 'POST', headers: adminHeaders(), body: JSON.stringify(form) })
    setSaving(false); setShowForm(false); setForm({}); loadAll()
  }

  async function deactivate(endpoint, id) {
    await fetch(`/api/admin/content/${clientId}/${endpoint}/${id}`, { method: 'DELETE', headers: adminHeaders() })
    loadAll()
  }

  async function reactivate(endpoint, id) {
    await fetch(`/api/admin/content/${clientId}/${endpoint}/${id}`, {
      method: 'PATCH', headers: adminHeaders(), body: JSON.stringify({ is_active: 1 })
    })
    loadAll()
  }

  function openEdit(item) {
    setEditItem(item)
    if (tab === 'Therapeutic Areas') {
      setEditForm({ name: item.name || '', slug: item.slug || '', short_desc: item.short_desc || '', image_url: item.image_url || '', status: item.status || 'draft' })
    } else if (tab === 'Drugs') {
      setEditForm({ brand_name: item.brand_name || '', generic_name: item.generic_name || '', indication: item.indication || '', prescribing_info_url: item.prescribing_info_url || '', storage_conditions: item.storage_conditions || '', status: item.status || 'draft' })
    } else if (tab === 'Events') {
      setEditForm({ title: item.title || '', event_type: item.event_type || 'conference', city: item.city || '', country: item.country || '', start_date: item.start_date ? item.start_date.slice(0, 10) : '', end_date: item.end_date ? item.end_date.slice(0, 10) : '', registration_url: item.registration_url || '', status: item.status || 'draft' })
    } else if (tab === 'Resources') {
      setEditForm({ title: item.title || '', resource_type: item.resource_type || 'document', category: item.category || '', url: item.url || '', description: item.description || '', status: item.status || 'draft' })
    }
    setShowEditForm(true)
  }

  async function handleEdit(e) {
    e.preventDefault(); setSaving(true)
    await fetch(`/api/admin/content/${clientId}/${endpoints[tab]}/${editItem.id}`, {
      method: 'PATCH', headers: adminHeaders(), body: JSON.stringify(editForm)
    })
    setSaving(false); setShowEditForm(false); setEditItem(null); loadAll()
  }

  const tabKey = tab === 'Therapeutic Areas' ? 'therapeutic_areas' : tab.toLowerCase()

  const STATUS_OPTIONS = ['draft', 'in_review', 'in_progress', 'published', 'archived', 'expired']

  return (
    <AdminLayout title="Content Management">
      <div className="cp-tabs">
        {TABS.map(t => <button key={t} className={`cp-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      <div className="cp-section-header">
        <h3>{tab}</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#6B7280', cursor: 'pointer' }}>
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
            Show inactive
          </label>
          <button className="cp-btn cp-btn-primary" onClick={() => { setForm({}); setSlugManuallyEdited(false); setShowForm(true) }}>+ Add</button>
        </div>
      </div>

      {showForm && (
        <div className="cp-modal-overlay" onClick={() => setShowForm(false)}>
          <div className="cp-modal" onClick={e => e.stopPropagation()}>
            <div className="cp-modal-header"><span>Add {tab.slice(0, -1)}</span><button className="cp-modal-close" onClick={() => setShowForm(false)}>✕</button></div>
            <form onSubmit={handleSubmit} className="cp-modal-body">
              {tab === 'Therapeutic Areas' && <>
                <div className="cp-field-row">
                  <div className="cp-field"><label>Name *</label><input required value={form.name||''} onChange={e=>{const val=e.target.value;setForm(f=>({...f,name:val,...(!slugManuallyEdited&&{slug:toSlug(val)})}))}} /></div>
                  <div className="cp-field"><label>Slug *</label><input required value={form.slug||''} onChange={e=>{setSlugManuallyEdited(true);setForm(f=>({...f,slug:e.target.value.toLowerCase().replace(/\s/g,'-')}))}} placeholder="nephrology" /></div>
                </div>
                <div className="cp-field"><label>Short Description</label><textarea rows={2} value={form.short_desc||''} onChange={e=>setForm(f=>({...f,short_desc:e.target.value}))} /></div>
                <div className="cp-field"><label>Image URL</label><input value={form.image_url||''} onChange={e=>setForm(f=>({...f,image_url:e.target.value}))} /></div>
              </>}
              {tab === 'Drugs' && <>
                <div className="cp-field-row">
                  <div className="cp-field"><label>Brand Name *</label><input required value={form.brand_name||''} onChange={e=>setForm(f=>({...f,brand_name:e.target.value}))} /></div>
                  <div className="cp-field"><label>Generic Name</label><input value={form.generic_name||''} onChange={e=>setForm(f=>({...f,generic_name:e.target.value}))} /></div>
                </div>
                <div className="cp-field"><label>Indication</label><textarea rows={2} value={form.indication||''} onChange={e=>setForm(f=>({...f,indication:e.target.value}))} /></div>
                <div className="cp-field-row">
                  <div className="cp-field"><label>Prescribing Info URL</label><input value={form.prescribing_info_url||''} onChange={e=>setForm(f=>({...f,prescribing_info_url:e.target.value}))} /></div>
                  <div className="cp-field"><label>Storage Conditions</label><input value={form.storage_conditions||''} onChange={e=>setForm(f=>({...f,storage_conditions:e.target.value}))} /></div>
                </div>
              </>}
              {tab === 'Events' && <>
                <div className="cp-field"><label>Title *</label><input required value={form.title||''} onChange={e=>setForm(f=>({...f,title:e.target.value}))} /></div>
                <div className="cp-field-row">
                  <div className="cp-field"><label>Type</label><select value={form.event_type||'conference'} onChange={e=>setForm(f=>({...f,event_type:e.target.value}))}><option value="conference">Conference</option><option value="webinar">Webinar</option><option value="symposium">Symposium</option><option value="workshop">Workshop</option></select></div>
                  <div className="cp-field"><label>City</label><input value={form.city||''} onChange={e=>setForm(f=>({...f,city:e.target.value}))} /></div>
                  <div className="cp-field"><label>Country</label><input value={form.country||''} onChange={e=>setForm(f=>({...f,country:e.target.value}))} /></div>
                </div>
                <div className="cp-field-row">
                  <div className="cp-field"><label>Start Date</label><input type="date" value={form.start_date||''} onChange={e=>setForm(f=>({...f,start_date:e.target.value}))} /></div>
                  <div className="cp-field"><label>End Date</label><input type="date" value={form.end_date||''} onChange={e=>setForm(f=>({...f,end_date:e.target.value}))} /></div>
                </div>
                <div className="cp-field"><label>Registration URL</label><input value={form.registration_url||''} onChange={e=>setForm(f=>({...f,registration_url:e.target.value}))} /></div>
              </>}
              {tab === 'Resources' && <>
                <div className="cp-field"><label>Title *</label><input required value={form.title||''} onChange={e=>setForm(f=>({...f,title:e.target.value}))} /></div>
                <div className="cp-field-row">
                  <div className="cp-field"><label>Type</label><select value={form.resource_type||'document'} onChange={e=>setForm(f=>({...f,resource_type:e.target.value}))}><option value="document">Document</option><option value="video">Video</option><option value="link">Link</option><option value="publication">Publication</option><option value="guideline">Guideline</option></select></div>
                  <div className="cp-field"><label>Category</label><input value={form.category||''} onChange={e=>setForm(f=>({...f,category:e.target.value}))} /></div>
                </div>
                <div className="cp-field"><label>URL</label><input value={form.url||''} onChange={e=>setForm(f=>({...f,url:e.target.value}))} /></div>
                <div className="cp-field"><label>Description</label><textarea rows={2} value={form.description||''} onChange={e=>setForm(f=>({...f,description:e.target.value}))} /></div>
              </>}
              <div className="cp-modal-footer">
                <button type="submit" className="cp-btn cp-btn-primary" disabled={saving}>{saving?'Adding…':'Add'}</button>
                <button type="button" className="cp-btn cp-btn-outline" onClick={()=>setShowForm(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditForm && editItem && (
        <div className="cp-modal-overlay" onClick={() => setShowEditForm(false)}>
          <div className="cp-modal" onClick={e => e.stopPropagation()}>
            <div className="cp-modal-header"><span>Edit {tab.slice(0, -1)}</span><button className="cp-modal-close" onClick={() => setShowEditForm(false)}>✕</button></div>
            <form onSubmit={handleEdit} className="cp-modal-body">
              {tab === 'Therapeutic Areas' && <>
                <div className="cp-field-row">
                  <div className="cp-field"><label>Name</label><input value={editForm.name||''} onChange={e=>setEditForm(f=>({...f,name:e.target.value}))} /></div>
                  <div className="cp-field"><label>Slug</label><input value={editForm.slug||''} onChange={e=>setEditForm(f=>({...f,slug:e.target.value}))} /></div>
                </div>
                <div className="cp-field"><label>Short Description</label><textarea rows={2} value={editForm.short_desc||''} onChange={e=>setEditForm(f=>({...f,short_desc:e.target.value}))} /></div>
                <div className="cp-field"><label>Image URL</label><input value={editForm.image_url||''} onChange={e=>setEditForm(f=>({...f,image_url:e.target.value}))} /></div>
              </>}
              {tab === 'Drugs' && <>
                <div className="cp-field-row">
                  <div className="cp-field"><label>Brand Name</label><input value={editForm.brand_name||''} onChange={e=>setEditForm(f=>({...f,brand_name:e.target.value}))} /></div>
                  <div className="cp-field"><label>Generic Name</label><input value={editForm.generic_name||''} onChange={e=>setEditForm(f=>({...f,generic_name:e.target.value}))} /></div>
                </div>
                <div className="cp-field"><label>Indication</label><textarea rows={2} value={editForm.indication||''} onChange={e=>setEditForm(f=>({...f,indication:e.target.value}))} /></div>
                <div className="cp-field-row">
                  <div className="cp-field"><label>Prescribing Info URL</label><input value={editForm.prescribing_info_url||''} onChange={e=>setEditForm(f=>({...f,prescribing_info_url:e.target.value}))} /></div>
                  <div className="cp-field"><label>Storage Conditions</label><input value={editForm.storage_conditions||''} onChange={e=>setEditForm(f=>({...f,storage_conditions:e.target.value}))} /></div>
                </div>
              </>}
              {tab === 'Events' && <>
                <div className="cp-field"><label>Title</label><input value={editForm.title||''} onChange={e=>setEditForm(f=>({...f,title:e.target.value}))} /></div>
                <div className="cp-field-row">
                  <div className="cp-field"><label>Type</label><select value={editForm.event_type||'conference'} onChange={e=>setEditForm(f=>({...f,event_type:e.target.value}))}><option value="conference">Conference</option><option value="webinar">Webinar</option><option value="symposium">Symposium</option><option value="workshop">Workshop</option></select></div>
                  <div className="cp-field"><label>City</label><input value={editForm.city||''} onChange={e=>setEditForm(f=>({...f,city:e.target.value}))} /></div>
                  <div className="cp-field"><label>Country</label><input value={editForm.country||''} onChange={e=>setEditForm(f=>({...f,country:e.target.value}))} /></div>
                </div>
                <div className="cp-field-row">
                  <div className="cp-field"><label>Start Date</label><input type="date" value={editForm.start_date||''} onChange={e=>setEditForm(f=>({...f,start_date:e.target.value}))} /></div>
                  <div className="cp-field"><label>End Date</label><input type="date" value={editForm.end_date||''} onChange={e=>setEditForm(f=>({...f,end_date:e.target.value}))} /></div>
                </div>
                <div className="cp-field"><label>Registration URL</label><input value={editForm.registration_url||''} onChange={e=>setEditForm(f=>({...f,registration_url:e.target.value}))} /></div>
              </>}
              {tab === 'Resources' && <>
                <div className="cp-field"><label>Title</label><input value={editForm.title||''} onChange={e=>setEditForm(f=>({...f,title:e.target.value}))} /></div>
                <div className="cp-field-row">
                  <div className="cp-field"><label>Type</label><select value={editForm.resource_type||'document'} onChange={e=>setEditForm(f=>({...f,resource_type:e.target.value}))}><option value="document">Document</option><option value="video">Video</option><option value="link">Link</option><option value="publication">Publication</option><option value="guideline">Guideline</option></select></div>
                  <div className="cp-field"><label>Category</label><input value={editForm.category||''} onChange={e=>setEditForm(f=>({...f,category:e.target.value}))} /></div>
                </div>
                <div className="cp-field"><label>URL</label><input value={editForm.url||''} onChange={e=>setEditForm(f=>({...f,url:e.target.value}))} /></div>
                <div className="cp-field"><label>Description</label><textarea rows={2} value={editForm.description||''} onChange={e=>setEditForm(f=>({...f,description:e.target.value}))} /></div>
              </>}
              <div className="cp-field">
                <label>Status</label>
                <select value={editForm.status||'draft'} onChange={e=>setEditForm(f=>({...f,status:e.target.value}))}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="cp-modal-footer">
                <button type="submit" className="cp-btn cp-btn-primary" disabled={saving}>{saving?'Saving…':'Save'}</button>
                <button type="button" className="cp-btn cp-btn-outline" onClick={()=>setShowEditForm(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? <div className="cp-loading">Loading…</div> : (
        <div className="cp-content-list">
          {(() => {
            const items = (data[tabKey] || []).filter(item => showInactive || item.is_active !== 0)
            if (items.length === 0) return <div className="cp-empty"><p>No {tab.toLowerCase()} {showInactive ? '' : 'active '}yet.</p></div>
            return items.map(item => {
            return (
              <div key={item.id} className="cp-content-row">
                <div className="cp-content-info">
                  <div className="cp-content-name">{item.name || item.brand_name || item.title}</div>
                  <div className="cp-content-sub">{item.slug || item.generic_name || item.city || item.resource_type}</div>
                </div>
                {statusBadge(item)}
                <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => openEdit(item)}>Edit</button>
                {item.is_active !== 0
                  ? <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => deactivate(endpoints[tab], item.id)}>Deactivate</button>
                  : <button className="cp-btn cp-btn-sm cp-btn-outline" style={{ color: '#16A34A', borderColor: '#16A34A' }} onClick={() => reactivate(endpoints[tab], item.id)}>Reactivate</button>
                }
              </div>
            )
          })
          })()}
        </div>
      )}
    </AdminLayout>
  )
}
