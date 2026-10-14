// The document types, in one place for the document screen and its filter (the
// filter had its own list and missed Prescribing Information).
export const DOC_TYPES = ['SRD', 'Prescribing Information', 'Enclosure', 'Information Document', 'Internal Document']

export function parseMaybeJson(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'string') {
    try { return JSON.parse(value) } catch { return fallback }
  }
  return value
}

export function normalizeSelectedModules(value) {
  let parsed = value
  for (let i = 0; i < 2; i += 1) {
    parsed = parseMaybeJson(parsed, parsed)
    if (typeof parsed !== 'string') break
  }
  if (!Array.isArray(parsed)) return []
  const normalized = parsed
    .map(id => Number(id))
    .filter(id => Number.isInteger(id) && id > 0)
  return Array.from(new Set(normalized))
}
