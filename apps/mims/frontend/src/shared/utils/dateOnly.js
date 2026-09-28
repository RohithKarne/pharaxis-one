// DATE columns reach the browser as '2026-09-22T00:00:00.000Z', but a date input
// only shows 'YYYY-MM-DD'. Trim exact UTC-midnight stamps so saved dates display.
const UTC_MIDNIGHT_STAMP = /^\d{4}-\d{2}-\d{2}T00:00:00(?:\.000)?Z$/

export function toDateInputValues(value) {
  if (Array.isArray(value)) return value.map(toDateInputValues)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toDateInputValues(v)]))
  }
  return typeof value === 'string' && UTC_MIDNIGHT_STAMP.test(value) ? value.slice(0, 10) : value
}
