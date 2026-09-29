// Inquiry times (received_at) come from the server as a bare UTC
// 'YYYY-MM-DD HH:MM:SS'. new Date() reads that form as local time, which put
// every received time 5.5 hours early in India (360 walk M-81). Read the bare
// form as UTC; anything else (ISO with a zone, a Date) is used as it is.
export function parseServerTime(value) {
  if (value == null || value === '') return null
  if (value instanceof Date) return value
  const text = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) return new Date(`${text.replace(' ', 'T')}Z`)
  return new Date(text)
}
