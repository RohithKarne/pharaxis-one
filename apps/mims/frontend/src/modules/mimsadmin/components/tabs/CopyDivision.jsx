import { useState, useEffect } from 'react'
import { useAuth } from '../../../../shared/context/AuthContext'
import { httpFetch } from '../../../../shared/api/httpFetch.js'
import toast from '../../../../shared/utils/toast.js'

export default function CopyDivision() {
  const { token } = useAuth()
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  const [orgs,       setOrgs]       = useState([])
  const [categories, setCategories] = useState([])
  const [sourceOrg,  setSourceOrg]  = useState('')
  const [targetOrg,  setTargetOrg]  = useState('')
  const [selected,   setSelected]   = useState({})
  const [overwrite,  setOverwrite]  = useState(false)
  const [preview,    setPreview]    = useState(null)
  const [previewing, setPreviewing] = useState(false)
  const [executing,  setExecuting]  = useState(false)
  const [result,     setResult]     = useState(null)
  const [err,        setErr]        = useState(null)
  const [confirmed,  setConfirmed]  = useState(false)

  useEffect(() => {
    Promise.all([
      httpFetch('/api/admin/copy-division/orgs',       { headers: H }).then(r => r.json()),
      httpFetch('/api/admin/copy-division/categories', { headers: H }).then(r => r.json()),
    ]).then(([o, c]) => {
      setOrgs(o.orgs || [])
      const cats = c.categories || []
      setCategories(cats)
      const init = {}; cats.forEach(cat => { init[cat.key] = true }); setSelected(init)
    }).catch(() => setErr('Failed to load data.'))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedKeys = Object.keys(selected).filter(k => selected[k])
  const canPreview   = sourceOrg && targetOrg && sourceOrg !== targetOrg && selectedKeys.length > 0
  const totalRows    = preview ? Object.values(preview).flatMap(t => Object.values(t)).reduce((a,b)=>a+b,0) : 0
  const sourceOrgName = orgs.find(o => String(o.id) === String(sourceOrg))?.name || ''
  const targetOrgName = orgs.find(o => String(o.id) === String(targetOrg))?.name || ''

  async function handlePreview() {
    setPreviewing(true); setErr(null); setPreview(null); setResult(null); setConfirmed(false)
    try {
      const res  = await httpFetch('/api/admin/copy-division/preview', {
        method:'POST', headers: H,
        body: JSON.stringify({ source_org_id: parseInt(sourceOrg), categories: selectedKeys }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error); return }
      setPreview(data.preview)
    } catch { setErr('Network error.') } finally { setPreviewing(false) }
  }

  async function handleExecute() {
    setExecuting(true); setErr(null); setResult(null)
    try {
      const res  = await httpFetch('/api/admin/copy-division/execute', {
        method:'POST', headers: H,
        body: JSON.stringify({ source_org_id: parseInt(sourceOrg), target_org_id: parseInt(targetOrg), categories: selectedKeys, overwrite }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error); return }
      setResult(data.results); setPreview(null); setConfirmed(false)
      toast.success('Copy completed successfully.')
    } catch { setErr('Network error.') } finally { setExecuting(false) }
  }

  const cardS = { background:'#fff', border:'1px solid var(--border)', padding:'10px 12px', marginBottom:10 }
  const labelS = { fontSize:12, fontWeight:'bold', color:'#334155', display:'block', marginBottom:4 }
  const selectS = { height:26, padding:'2px 6px', border:'1px solid #a9b2bd', fontSize:12, width:'100%', maxWidth:320 }

  return (
    <div style={{ padding:'12px 16px', maxWidth:900 }}>
      <div style={{ marginBottom:8, padding:'6px 10px', background:'var(--panel-head)', border:'1px solid var(--border)' }}>
        <h2 style={{ fontSize:15, fontWeight:'bold', color:'var(--primary)', margin:0 }}>Copy Division</h2>
        <p style={{ fontSize:12, color:'#64748b', margin:'2px 0 0' }}>Copy all selected configuration from one organisation to another. This action is recorded in the audit log.</p>
      </div>

      {err    && <div style={{ padding:'12px 16px', background:'#fee2e2', color:'#dc2626', borderRadius:8, marginBottom:14, fontSize:13 }}>{err}</div>}
      {result && (
        <div style={{ padding:'14px 18px', background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:8, marginBottom:14 }}>
          <div style={{ fontWeight:700, color:'#15803d', marginBottom:8 }}>Copy completed</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
            {Object.entries(result).map(([k,n]) => {
              const cat = categories.find(c => c.key === k)
              return <span key={k} style={{ padding:'3px 10px', background:'#dcfce7', color:'#15803d', borderRadius:20, fontSize:12 }}>{cat?.label}: <strong>{n}</strong></span>
            })}
          </div>
        </div>
      )}

      <div style={cardS}>
        <div style={{ fontWeight:700, fontSize:13, color:'#0f172a', marginBottom:8 }}>Step 1 — Select Organisations</div>
        <div style={{ display:'flex', alignItems:'flex-end', gap:20, flexWrap:'wrap' }}>
          <div>
            <label style={labelS}>Copy from</label>
            <select style={selectS} value={sourceOrg} onChange={e => { setSourceOrg(e.target.value); setPreview(null); setResult(null); setConfirmed(false) }}>
              <option value="">— Select source org —</option>
              {orgs.map(o => <option key={o.id} value={o.id} disabled={String(o.id)===String(targetOrg)}>{o.name}</option>)}
            </select>
          </div>
          <div>
            <label style={labelS}>Copy to</label>
            <select style={selectS} value={targetOrg} onChange={e => { setTargetOrg(e.target.value); setPreview(null); setResult(null); setConfirmed(false) }}>
              <option value="">— Select target org —</option>
              {orgs.map(o => <option key={o.id} value={o.id} disabled={String(o.id)===String(sourceOrg)}>{o.name}</option>)}
            </select>
          </div>
        </div>
        {sourceOrg && targetOrg && sourceOrg === targetOrg && (
          <div style={{ marginTop:10, fontSize:12, color:'#dc2626' }}>Source and target cannot be the same organisation.</div>
        )}
      </div>

      <div style={cardS}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
          <div style={{ fontWeight:700, fontSize:13, color:'#0f172a' }}>Step 2 — Select Categories</div>
          <div style={{ display:'flex', gap:12 }}>
            <button onClick={() => { const s={}; categories.forEach(c=>{s[c.key]=true}); setSelected(s) }} style={{ background:'none', border:'none', color:'var(--primary)', fontSize:12, fontWeight:600, cursor:'pointer' }}>Select all</button>
            <button onClick={() => { const s={}; categories.forEach(c=>{s[c.key]=false}); setSelected(s) }} style={{ background:'none', border:'none', color:'var(--primary)', fontSize:12, fontWeight:600, cursor:'pointer' }}>Clear all</button>
          </div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px,1fr))', gap:'4px 16px' }}>
          {categories.map(cat => (
            <label key={cat.key} style={{ display:'flex', alignItems:'flex-start', gap:6, padding:'2px 0', cursor:'pointer' }}>
              <input type="checkbox" checked={!!selected[cat.key]} style={{ marginTop:2, accentColor:'var(--primary)' }}
                onChange={e => { setSelected(s=>({...s,[cat.key]:e.target.checked})); setPreview(null); setConfirmed(false) }} />
              <span>
                <span style={{ display:'block', fontSize:12, fontWeight:'bold', color:'#0f172a' }}>{cat.label}</span>
                <span style={{ display:'block', fontSize:11, color:'#64748b' }}>{cat.description}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div style={cardS}>
        <div style={{ fontWeight:700, fontSize:13, color:'#0f172a', marginBottom:12 }}>Step 3 — Options</div>
        <label style={{ display:'flex', alignItems:'flex-start', gap:10, cursor:'pointer', fontSize:13, color:'#334155' }}>
          <input type="checkbox" checked={overwrite} style={{ marginTop:2, accentColor:'#dc2626' }} onChange={e => { setOverwrite(e.target.checked); setPreview(null); setConfirmed(false) }} />
          <span><strong>Overwrite existing records</strong> — deletes all existing config in selected categories for the target org before copying.</span>
        </label>
        {overwrite && <div style={{ marginTop:10, padding:'10px 14px', background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:8, fontSize:13, color:'#c2410c' }}>Overwrite mode: existing config in selected categories for <strong>{targetOrgName||'the target'}</strong> will be deleted first.</div>}
      </div>

      {preview && (
        <div style={{ ...cardS, background:'#f8fafc' }}>
          <div style={{ fontWeight:700, fontSize:13, color:'#0f172a', marginBottom:12 }}>Preview — {totalRows} rows will be copied</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px,1fr))', gap:10, marginBottom:16 }}>
            {Object.entries(preview).map(([key, tables]) => {
              const cat = categories.find(c => c.key === key)
              return (
                <div key={key} style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px' }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'#0f172a', marginBottom:6 }}>{cat?.label}</div>
                  {Object.entries(tables).map(([tbl,n]) => (
                    <div key={tbl} style={{ display:'flex', justifyContent:'space-between', fontSize:11, padding:'2px 0', borderTop:'1px solid #f1f5f9' }}>
                      <span style={{ color:'#64748b', fontFamily:'monospace' }}>{tbl}</span>
                      <span style={{ color:'var(--primary)', fontWeight:700 }}>{n}</span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
          {totalRows > 0 && (
            <label style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'12px 14px', background:'#fffbeb', border:'1px solid #fde68a', borderRadius:8, cursor:'pointer', fontSize:13, color:'#334155' }}>
              <input type="checkbox" checked={confirmed} style={{ marginTop:2, accentColor:'var(--primary)' }} onChange={e => setConfirmed(e.target.checked)} />
              <span>I confirm copying <strong>{totalRows} rows</strong> from <strong>{sourceOrgName}</strong> to <strong>{targetOrgName}</strong>{overwrite?' (overwrite mode)':''}.</span>
            </label>
          )}
        </div>
      )}

      <div style={{ display:'flex', gap:12, alignItems:'center' }}>
        <button
          onClick={handlePreview}
          disabled={!canPreview || previewing}
          style={{ padding:'3px 14px', background:'#f3f4f6', color:'#334155', border:'1px solid #a9b2bd', borderRadius:2, fontSize:12, fontWeight:'bold', cursor: canPreview&&!previewing?'pointer':'not-allowed', opacity: canPreview&&!previewing?1:.5 }}
        >{previewing ? 'Loading…' : 'Preview'}</button>
        {preview && totalRows > 0 && (
          <button
            onClick={handleExecute}
            disabled={!confirmed || executing}
            style={{ padding:'3px 14px', background:'var(--primary)', color:'#fff', border:'1px solid var(--primary)', borderRadius:2, fontSize:12, fontWeight:'bold', cursor: confirmed&&!executing?'pointer':'not-allowed', opacity: confirmed&&!executing?1:.5 }}
          >{executing ? 'Copying…' : `Execute Copy (${totalRows} rows)`}</button>
        )}
      </div>
    </div>
  )
}
