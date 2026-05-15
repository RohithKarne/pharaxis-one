export { setSessionExpiryHandler } from '../../../shared/api/httpFetch.js'
import { httpFetch } from '../../../shared/api/httpFetch.js'

export const guardedFetch = httpFetch

export function downloadCsv(url) {
  window.open(url, '_blank', 'noopener,noreferrer')
}
