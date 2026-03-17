import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { adminHeaders } from '../context/AdminAuthContext'

const TABS = ['Therapeutic Areas', 'Drugs', 'Events', 'Resources']

export default function ContentPage() {
  const { clientId }      = useParams()
  const [tab, setTab]     = useState('Therapeutic Areas')
  const [data, setData]   = useState({ therapeutic_areas: [], drugs: [], events: [], resources: [] })
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]   = useState({})
  const [saving, setSaving] = useState(false)
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)

  function toSlug(str) {
    return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  }

  useEffect(() => { loadAll() }, [clientId])

  async function loadAll() {
    setLoading(true)
    const [ta, dr, ev, re] = await Promise.all([
      fetch(`/api/admin/content/${clientId}/therapeutic-areas`, { headers: adminHeaders() }).then(r => r.json()),
      fetch(`/api/admin/content/${clientId}/drugs`,             { headers: adminHeaders() }).then(r => r.json()),
      fetch(`/api/admin/content/${clientId}/events`,            { headers: adminHeaders() }).then(r => r.json()),
      fetch(`/api/admin/content/${clientId}/resources`,         { headers: adminHeaders() }).then(r => r.json()),
    ])
    setData({ therapeutic_areas: ta.therapeutic_areas || [], drugs: dr.drugs || [], events: ev.events || [], resources: re.resources || [] })
    setLoading(false)
  }

  async function handleSubmit(e) {
    e.preventDefault(); setSaving(true)
    const endpoints = { 'Therapeutic Areas': 'therapeutic-areas', Drugs: 'drugs', Events: 'events', Resources: 'resources' }
    await fetch(`/api/admin/content/${clientId}/${endpoints[tab]}`, { method: 'POST', headers: adminHeaders(), body: JSON.stringify(form) })
    setSaving(false); setShowForm(false); setForm({}); loadAll()
  }

  async function deactivate(endpoint, id) {
    await fetch(`/api/admin/content/${clientId}/${endpoint}/${id}`, { method: 'DELETE', headers: adminHeaders() })
    loadAll()
  }

  const tabKey = tab === 'Therapeutic Areas' ? 'therapeutic_areas' : tab.toLowerCase()

  return (
    <AdminLayout title="Content Management">
      <div className="cp-tabs">
        {TABS.map(t => <button key={t} className={`cp-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      <div className="cp-section-header">
        <h3>{tab}</h3>
        <button className="cp-btn cp-btn-primary" onClick={() => { setForm({}); setSlugManuallyEdited(false); setShowForm(true) }}>+ Add</button>
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

      {loading ? <div className="cp-loading">Loading…</div> : (
        <div className="cp-content-list">
          {data[tabKey]?.length === 0 ? (
            <div className="cp-empty"><p>No {tab.toLowerCase()} yet.</p></div>
          ) : data[tabKey]?.map(item => {
            const endpoints = { 'Therapeutic Areas': 'therapeutic-areas', Drugs: 'drugs', Events: 'events', Resources: 'resources' }
            return (
              <div key={item.id} className="cp-content-row">
                <div className="cp-content-info">
                  <div className="cp-content-name">{item.name || item.brand_name || item.title}</div>
                  <div className="cp-content-sub">{item.slug || item.generic_name || item.city || item.resource_type}</div>
                </div>
                <span className={`cp-badge ${item.is_active!==0 ? 'badge-active':'badge-inactive'}`}>{item.is_active!==0?'Active':'Inactive'}</span>
                <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => deactivate(endpoints[tab], item.id)}>Remove</button>
              </div>
            )
          })}
        </div>
      )}
    </AdminLayout>
  )
}
