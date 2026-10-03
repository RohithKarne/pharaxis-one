import { TABLES_NAV, findTableLabel } from '../configItems'
import PicklistsTable from './PicklistsTable'

function flattenNav(items, parent = []) {
  return items.flatMap((item) => {
    const lineage = [...parent, item.label]
    if (item.children) return flattenNav(item.children, lineage)
    return [{ label: item.label, value: item.value, lineage }]
  })
}

export default function Tables({ selectedItem, onSelect }) {
  if (selectedItem === 'tbl-general') return <PicklistsTable />
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
