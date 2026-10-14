// Plain-text handling of an email body, shared by the email view and the Inbox list
// (moved out of EmailBody.jsx so that file exports only its component).
export const EMAIL_URL_PATTERN = /<?https?:\/\/[^\s<>]+>?/gi

export function normalizeEmailUrl(rawUrl) {
  let href = String(rawUrl || '').trim()
  let suffix = ''

  if (href.startsWith('<')) href = href.slice(1)
  if (href.endsWith('>')) href = href.slice(0, -1)

  while (/[.,;:!?)]$/.test(href)) {
    suffix = href.slice(-1) + suffix
    href = href.slice(0, -1)
  }

  return { href, suffix }
}

export function getEmailLinkLabel(href) {
  try {
    const url = new URL(href)
    const host = url.hostname.replace(/^www\./, '')
    return `${host} link`
  } catch {
    return 'email link'
  }
}

export function compactEmailBodyText(body) {
  const urlPattern = new RegExp(EMAIL_URL_PATTERN.source, 'gi')
  return normalizeEmailBodyText(body)
    .replace(/\r\n/g, '\n')
    .replace(urlPattern, rawUrl => {
      const { href, suffix } = normalizeEmailUrl(rawUrl)
      return ` [${getEmailLinkLabel(href)}]${suffix}`
    })
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function decodeEmailEntities(text) {
  if (typeof document === 'undefined') return String(text || '')
  const el = document.createElement('textarea')
  el.innerHTML = String(text || '')
  return el.value
}

export function normalizeEmailBodyText(body) {
  return decodeEmailEntities(body)
    .replace(/=\r?\n/g, '')
    .replace(/=3D/gi, '=')
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n/g, '\n')
}
