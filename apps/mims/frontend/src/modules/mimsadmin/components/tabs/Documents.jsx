import { DOCUMENTS_NAV, findDocumentLabel } from '../configItems'

export default function Documents({ selectedItem, onSelect }) {
  return (
    <div className="ma-page" style={{ flex: 1, overflow: 'auto' }}>
      <div className="ma-page-header" style={{ marginBottom: 12 }}>
        <h1>Documents</h1>
        <p>Letter templates, letter formats and custom letter review.</p>
      </div>
      {selectedItem && (
        <p style={{ margin: '0 0 12px', fontSize: 12 }}>
          Selected: <b>{findDocumentLabel(selectedItem)}</b>
        </p>
      )}
      <table className="admin-table">
        <thead>
          <tr><th>Topic</th></tr>
        </thead>
        <tbody>
          {DOCUMENTS_NAV.map((item) => (
            <tr key={item.value} style={selectedItem === item.value ? { background: '#fff8e6' } : undefined}>
              <td>
                <button type="button" className="btn btn-link" onClick={() => onSelect?.(item.value)}>
                  {item.label}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
