import { useEffect } from 'react';
import toast from '../utils/toast.js'

/**
 * ExceptionToast — surfaces high-severity API/runtime failures without
 * interrupting the user for every warning-level response.
 */
export default function ExceptionToast() {
  useEffect(() => {
    const recentKeys = new Map()
    let lastApiNotice = 0

    function onException(event) {
      const detail = event?.detail || {};
      const statusCode = Number(detail.status_code || 0)
      const shouldToast = statusCode === 0 || statusCode >= 500
      const key = `${detail.route || 'route'}:${statusCode}:${detail.message || 'error'}`
      const now = Date.now()
      const isApi = String(detail.route || '').includes('/api/')

      // A failed request gets one plain notice, however many fail together (a page that
      // loads ten things, or a poll that keeps failing, does not stack ten red boxes),
      // and it says whether a load or a save failed so neither is mistaken for success.
      if (isApi && shouldToast) {
        if (!detail.aborted && now - lastApiNotice >= 30000) {
          lastApiNotice = now
          const text = statusCode === 0
            ? 'Could not reach MIMS. Check your connection, then reload.'
            : detail.method && detail.method !== 'GET'
              ? 'The server reported an error, so your last change may not have been saved. Check it and try again.'
              : 'Could not load everything on this page: the server reported an error. Try again in a moment.'
          toast.error(detail.exception_id ? `${text} (Ref: ${detail.exception_id})` : text, 10000,
            { label: 'Reload', onClick: () => window.location.reload() })
        }
      } else if (shouldToast) {
        const lastSeen = recentKeys.get(key) || 0
        if (now - lastSeen > 8000) {
          recentKeys.set(key, now)
          toast.error(
            detail.exception_id
              ? `${detail.message || 'Request failed'} (Ref: ${detail.exception_id})`
              : (detail.message || 'Request failed')
          )
        }
      }

      console.warn(
        '[MIMS Exception]',
        `ID: ${detail.exception_id || 'N/A'}`,
        '|',
        detail.message || 'An unexpected exception occurred.'
      );
    }
    window.addEventListener('mims-api-exception', onException);
    return () => window.removeEventListener('mims-api-exception', onException);
  }, []);

  return null;
}
