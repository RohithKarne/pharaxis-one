import { EMAIL_URL_PATTERN, normalizeEmailUrl, getEmailLinkLabel, normalizeEmailBodyText } from './emailBodyText'

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
