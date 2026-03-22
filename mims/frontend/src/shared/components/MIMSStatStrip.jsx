/**
 * MIMSStatStrip.jsx — 5 metric tiles below the nav bar
 * Unprocessed Emails | Unassigned Cases | My Cases | My Checkouts (CM) | My Review Tasks (CM)
 * All dummy values for now. Clickable in Case Management sprint.
 */

export default function MIMSStatStrip() {
  const tiles = [
    { label: 'Unprocessed Emails', value: 0 },
    { label: 'Unassigned Cases',   value: 0 },
    { label: 'My Cases',           value: 0 },
    { label: 'My Checkouts (CM)',  value: 0 },
    { label: 'My Review Tasks (CM)', value: 0 },
  ]

  return (
    <div className="mims-stat-strip">
      {tiles.map((tile, i) => (
        <div key={i} className="mims-stat-tile">
          <span className="mims-stat-value">{tile.value}</span>
          <span className="mims-stat-label">{tile.label}</span>
        </div>
      ))}
    </div>
  )
}
