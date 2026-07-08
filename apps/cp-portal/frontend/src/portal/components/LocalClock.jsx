import { useState, useEffect } from 'react'
import { formatTime } from '../../shared/utils/datetime'

// Compact header date: short month + day, no weekday/year, to keep the header
// from overflowing. The full date/time still lives on the page content.
function compactDate(d) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(d)
}

/**
 * LocalClock — persistent current date + time shown in the portal header on
 * every page. Rendered in the viewer's own timezone with the zone label (DST
 * handled automatically via Intl). Updates every 30s so the minute stays fresh.
 */
export default function LocalClock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="pp-clock" title="Your local date and time" aria-label="Current local date and time">
      <span className="pp-clock-date">{compactDate(now)}</span>
      <span className="pp-clock-sep" aria-hidden="true">·</span>
      <span className="pp-clock-time">{formatTime(now)}</span>
    </div>
  )
}
