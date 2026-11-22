import { useEffect, useState } from 'react'
import { httpFetch } from '../../../shared/api/httpFetch.js'

const STATUS_LABELS = {
  queued: 'Queued',
  delivered: 'Delivered',
  retrying: 'Awaiting retry',
  exhausted: 'Retries exhausted',
  paused: 'Subscription paused',
  revoked: 'Subscription revoked',
}

function formatResult(responseStatus) {
  if (responseStatus == null) return '—'
  return responseStatus === 0 ? 'No HTTP response' : `HTTP ${responseStatus}`
}

export default function AdminWebhookDeliveries() {
  const [before, setBefore] = useState(null)
  const [page, setPage] = useState(null)
  const currentPage = page?.before === before ? page : null

  useEffect(() => {
    let active = true

    async function loadDeliveries() {
      try {
        const query = before == null ? '' : `?before=${encodeURIComponent(before)}`
        const response = await httpFetch(`/api/admin/integrations/webhook-deliveries${query}`)
        const data = await response.json().catch(() => ({}))
        if (!response.ok || !Array.isArray(data.deliveries)) {
          throw new Error(data.error || 'Failed to load webhook delivery history.')
        }
        if (active) setPage({ ...data, before })
      } catch (error) {
        if (active) setPage({ error: error.message, before })
      }
    }

    loadDeliveries()
    return () => { active = false }
  }, [before])

  return (
    <section aria-labelledby="outbound-webhooks-heading" style={{ marginTop: 28 }}>
      <h3 id="outbound-webhooks-heading" style={{ margin: '0 0 12px', fontSize: 16 }}>Outbound webhooks</h3>
      {!currentPage ? (
        <p role="status">Loading webhook deliveries…</p>
      ) : currentPage.error ? (
        <p role="alert">{currentPage.error}</p>
      ) : currentPage.deliveries.length === 0 ? (
        <p role="status">{before == null ? 'No webhook deliveries for this organisation.' : 'No older webhook deliveries.'}</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="cm-table" aria-labelledby="outbound-webhooks-heading">
            <thead>
              <tr>
                <th scope="col">Event</th>
                <th scope="col">API client</th>
                <th scope="col">Status</th>
                <th scope="col">Attempts</th>
                <th scope="col">Latest result</th>
                <th scope="col">Next retry</th>
              </tr>
            </thead>
            <tbody>
              {currentPage.deliveries.map(delivery => (
                <tr key={delivery.id}>
                  <td>{delivery.event}</td>
                  <td>{delivery.clientName}</td>
                  <td>{STATUS_LABELS[delivery.status] || 'Unknown'}</td>
                  <td>{delivery.attemptCount}</td>
                  <td>{formatResult(delivery.responseStatus)}</td>
                  <td>{delivery.nextRetryAt ? (
                    <time dateTime={delivery.nextRetryAt}>{new Date(delivery.nextRetryAt).toLocaleString()}</time>
                  ) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {currentPage && (before != null || currentPage.nextCursor != null) && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {before != null && (
            <button type="button" className="btn btn-outline" onClick={() => setBefore(null)}>Newest deliveries</button>
          )}
          {currentPage.nextCursor != null && (
            <button type="button" className="btn btn-outline" onClick={() => setBefore(currentPage.nextCursor)}>Older deliveries</button>
          )}
        </div>
      )}
    </section>
  )
}
