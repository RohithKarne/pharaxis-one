/**
 * datetime.js — timezone-aware date/time formatting for the portal.
 *
 * Principle: the API sends every timestamp as a UTC ISO-8601 instant (…Z).
 * We format it here using the *viewer's* browser timezone via Intl, so each
 * user sees times in their own local zone. Daylight-saving is handled
 * automatically because Intl uses the IANA timezone database (e.g. it applies
 * EDT in summer and EST in winter for America/New_York) — we never compute
 * offsets ourselves.
 *
 * Passing `undefined` as the locale/timeZone tells Intl to use the browser's
 * own locale and zone, which is exactly what we want.
 */

function toDate(value) {
  if (value == null || value === '') return null
  const d = value instanceof Date ? value : new Date(value)
  return isNaN(d.getTime()) ? null : d
}

/** Date only, e.g. "Jul 8, 2026". */
export function formatDate(value, opts = {}) {
  const d = toDate(value)
  if (!d) return '—'
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', ...opts,
  }).format(d)
}

/** Long date, e.g. "July 8, 2026". */
export function formatLongDate(value) {
  return formatDate(value, { month: 'long' })
}

/** Time only in the viewer's zone with zone label, e.g. "10:30 AM EDT". */
export function formatTime(value) {
  const d = toDate(value)
  if (!d) return '—'
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(d)
}

/**
 * Date + time in the viewer's zone with the zone label appended, e.g.
 * "Jul 8, 2026, 10:30 AM EDT" for a Toronto user — and the same instant shows
 * as "…7:30 AM PDT" for a California user, automatically.
 */
export function formatDateTime(value) {
  const d = toDate(value)
  if (!d) return '—'
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(d)
}

/** The viewer's detected IANA timezone, e.g. "America/Toronto". */
export function currentTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return 'UTC' }
}

/** Relative phrasing for recent activity, falling back to an absolute date. */
export function formatRelative(value) {
  const d = toDate(value)
  if (!d) return '—'
  const diffMs = Date.now() - d.getTime()
  const mins = Math.round(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`
  const days = Math.round(hrs / 24)
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`
  return formatDate(value)
}
