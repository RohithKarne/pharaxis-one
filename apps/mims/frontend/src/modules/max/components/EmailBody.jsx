const EMAIL_URL_PATTERN = /<?https?:\/\/[^\s<>]+>?/gi

function normalizeEmailUrl(rawUrl) {
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

function getEmailLinkLabel(href) {
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

function renderEmailBodySegments(text) {
  const urlPattern = new RegExp(EMAIL_URL_PATTERN.source, 'gi')
  const segments = []
  let lastIndex = 0

  for (const match of text.matchAll(urlPattern)) {
    const rawUrl = match[0]
    const matchIndex = match.index ?? 0
    if (matchIndex > lastIndex) {
      segments.push(text.slice(lastIndex, matchIndex))
    }

    const { href, suffix } = normalizeEmailUrl(rawUrl)
    segments.push(
      <a
        key={`email-link-${matchIndex}`}
        className="email-body-link"
        href={href}
        target="_blank"
        rel="noreferrer"
        title={href}
      >
        {getEmailLinkLabel(href)}
      </a>
    )
    if (suffix) segments.push(suffix)
    lastIndex = matchIndex + rawUrl.length
  }

  if (lastIndex < text.length) {
    segments.push(text.slice(lastIndex))
  }

  return segments
}

export default function EmailBody({ body }) {
  const normalized = normalizeEmailBodyText(body)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{3,}/g, ' ')
    .trim()

  if (!normalized) {
    return <div className="inbox-detail-body inbox-detail-body-empty">No email body available.</div>
  }

  const blocks = normalized.split(/\n{2,}/).map(block => block.trim()).filter(Boolean)

  return (
    <div className="inbox-detail-body">
      {blocks.map((block, index) => (
        <p key={`email-body-block-${index}`} className="email-body-paragraph">
          {renderEmailBodySegments(block.replace(/\n/g, ' '))}
        </p>
      ))}
    </div>
  )
}
