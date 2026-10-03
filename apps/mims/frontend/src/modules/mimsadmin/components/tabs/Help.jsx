import { HELP_NAV, findHelpLabel } from '../configItems'
import HelpGuide from './HelpGuide'

export default function Help({ selectedItem, onSelect }) {
  if (selectedItem === 'help-guide') return <HelpGuide />

  return (
    <div className="ma-page" style={{ flex: 1, overflow: 'auto' }}>
      <div className="ma-page-header" style={{ marginBottom: 12 }}>
        <h1>Help</h1>
        <p>Administrator guide and support information.</p>
      </div>
      <p style={{ margin: '0 0 12px', fontSize: 12 }}>
        Showing: <b>{findHelpLabel(selectedItem || 'help-about')}</b>
      </p>
      <table className="admin-table">
        <thead>
          <tr><th>Topic</th></tr>
        </thead>
        <tbody>
          {HELP_NAV.map((item) => (
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
