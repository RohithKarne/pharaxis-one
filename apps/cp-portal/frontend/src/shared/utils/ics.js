/**
 * ics.js — a calendar file Outlook, Google and Apple Calendar all open (CPPM-90).
 *
 * A timed entry carries UTC start and end; an all-day entry carries the date
 * only. Text is escaped as the calendar format requires, lines end in CRLF,
 * and every entry has a UID and a stamp. Nothing is added that we do not know:
 * no location unless one is given, and the status is whatever the caller says.
 */

function esc(text) {
  return String(text ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

function utcStamp(d) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function dayStamp(ymd) {
  return String(ymd).slice(0, 10).replace(/-/g, '')
}

function nextDay(ymd) {
  const d = new Date(`${String(ymd).slice(0, 10)}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/**
 * @param {object} e
 * @param {string} e.title
 * @param {string} [e.description]
 * @param {string} [e.location]
 * @param {string|Date} [e.start]   an instant, for a timed entry
 * @param {string|Date} [e.end]     an instant; defaults to start + 1 hour
 * @param {string} [e.date]         YYYY-MM-DD, for an all-day entry
 * @param {'TENTATIVE'|'CONFIRMED'} [e.status]
 * @param {string} [e.url]
 */
export function buildIcs(e) {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Pharaxis//CP Portal//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${(globalThis.crypto?.randomUUID?.() || String(Date.now()))}@cp-portal`,
    `DTSTAMP:${utcStamp(new Date())}`,
  ]
  if (e.start) {
    const s = new Date(e.start)
    const end = e.end ? new Date(e.end) : new Date(s.getTime() + 3600e3)
    lines.push(`DTSTART:${utcStamp(s)}`, `DTEND:${utcStamp(end)}`)
  } else if (e.date) {
    lines.push(`DTSTART;VALUE=DATE:${dayStamp(e.date)}`, `DTEND;VALUE=DATE:${dayStamp(nextDay(e.date))}`)
  }
  lines.push(`SUMMARY:${esc(e.title)}`)
  if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`)
  if (e.location) lines.push(`LOCATION:${esc(e.location)}`)
  if (e.url) lines.push(`URL:${e.url}`)
  if (e.status) lines.push(`STATUS:${e.status}`)
  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}

export function downloadIcs(filename, content) {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
