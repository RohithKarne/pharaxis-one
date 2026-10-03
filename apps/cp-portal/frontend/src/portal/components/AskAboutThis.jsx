import { Link } from 'react-router-dom'
import { usePortal } from '../context/PortalContext'

// CPPM-110: "Ask about this" on a drug, document, news post or safety letter. Opens
// the medical question form with the product and the item already filled in. Shows
// nothing when the client has the question form switched off.
export default function AskAboutThis({ product, about, className = 'pp-btn pp-btn-outline pp-btn-sm' }) {
  const { clientCode, isFeatureEnabled } = usePortal()
  if (!isFeatureEnabled('medical_inquiry')) return null
  const q = new URLSearchParams({ type: 'medical_inquiry' })
  if (product) q.set('product', product)
  if (about) q.set('about', about)
  return (
    <Link to={`/portal/${clientCode}/submit?${q}`} className={className} aria-label={`Ask a question about ${about || product}`}>
      Ask about this
    </Link>
  )
}
