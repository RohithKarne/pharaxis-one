// CPPM-117: a link an admin typed is followed only if it is an ordinary web address.
// Anything else (javascript:, data:) is dropped rather than rendered as a link.
export function safeWebUrl(u) {
  try {
    const url = new URL(String(u || '').trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch { return null }
}
