import { useEffect, useState } from 'react'
import { TABLES_NAV, findTableLabel } from '../configItems'
import PicklistsTable from './PicklistsTable'
import { useAuth } from '../../../../shared/context/AuthContext'
import AdminMiscSection from '../../../admin/components/AdminMiscSection'

// Product and Contact Masters had screens with no way in, so no organisation could
// add its products and every case's Product field offered only "None" (MIPM-154).
const MISC_SECTION = { 'tbl-product': 'products', 'tbl-contact-masters': 'contact-master' }

function MiscTable({ section }) {
  const { token } = useAuth()
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  const [flash, setFlash] = useState(null)
  useEffect(() => {
    if (!flash) return
    const id = setTimeout(() => setFlash(null), 3500)
    return () => clearTimeout(id)
  }, [flash])
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '20px 28px' }}>
      {flash && (
        <div role="status" style={{ padding: '10px 14px', marginBottom: 14, borderRadius: 7, fontSize: 13, fontWeight: 600,
          background: flash.type === 'error' ? '#fdecea' : '#e6f9ee', color: flash.type === 'error' ? '#b91c1c' : '#1a7a3f' }}>
          {flash.text}
        </div>
      )}
      <AdminMiscSection contentSection={section} H={H} flash={(text, type = 'success') => setFlash({ text, type })} />
    </div>
  )
}

function flattenNav(items, parent = []) {
  return items.flatMap((item) => {
    const lineage = [...parent, item.label]
    if (item.children) return flattenNav(item.children, lineage)
    return [{ label: item.label, value: item.value, lineage }]
  })
}

export default function Tables({ selectedItem, onSelect }) {
  if (selectedItem === 'tbl-general') return <PicklistsTable />
  if (MISC_SECTION[selectedItem]) return <MiscTable section={MISC_SECTION[selectedItem]} />
  const items = flattenNav(TABLES_NAV)

  return (
    <div className="ma-page" style={{ flex: 1, overflow: 'auto' }}>
      <div className="ma-page-header" style={{ marginBottom: 12 }}>
        <h1>Tables</h1>
        <p>Pick a table to maintain. General Tables holds the picklists used on case forms.</p>
      </div>
      <p style={{ margin: '0 0 12px' }}>
        <button type="button" className="btn btn-primary" onClick={() => onSelect?.('tbl-general')}>
          Open General Tables
        </button>
        {selectedItem && (
          <span style={{ marginLeft: 12, fontSize: 12 }}>
            Selected: <b>{findTableLabel(selectedItem)}</b>
          </span>
        )}
      </p>
      <table className="admin-table">
        <thead>
          <tr><th>Topic</th><th>Group</th></tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.value} style={selectedItem === item.value ? { background: '#fff8e6' } : undefined}>
              <td>
                <button type="button" className="btn btn-link" onClick={() => onSelect?.(item.value)}>
                  {item.label}
                </button>
              </td>
              <td>{item.lineage.slice(0, -1).join(' / ') || 'Tables'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
