export function parseUtcDate(s) {
  if (!s) return null
  const str = String(s).trim()
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(str)) {
    const [date, time] = str.split(' ')
    const [y, m, d] = date.split('-').map(Number)
    const [hh, mm, ss] = time.split(':').map(Number)
    return new Date(Date.UTC(y, m - 1, d, hh, mm, ss))
  }
  const d = new Date(str)
  return isNaN(d) ? null : d
}

export function fmtDateIST(s) {
  const d = parseUtcDate(s)
  if (!d) return s || '—'
  const istMs = d.getTime() + 330 * 60 * 1000
  const ist = new Date(istMs)
  const pad = n => String(n).padStart(2, '0')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${pad(ist.getUTCDate())} ${months[ist.getUTCMonth()]} ${ist.getUTCFullYear()}, ${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}:${pad(ist.getUTCSeconds())} IST`
}

export function exportCSV(data, filename) {
  if (!data.length) return
  const keys = Object.keys(data[0])
  const csv = [keys.join(','), ...data.map(row => keys.map(k => `"${String(row[k] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click()
}

export function SectionHeader({ title, desc, onExport, exportData, exportFile }) {
  return (
    <div className="admin-section-header">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2>{title}</h2>
          {desc && <p>{desc}</p>}
        </div>
        {onExport && <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={() => exportCSV(exportData, exportFile)}>⬇ Export CSV</button>}
      </div>
    </div>
  )
}

export function StatusPill({ active }) {
  return <span className={`status-pill ${active ? 'active' : 'inactive'}`}>{active ? 'Active' : 'Inactive'}</span>
}
