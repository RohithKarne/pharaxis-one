import { useEffect } from 'react';
import toast from '../utils/toast.js'

/**
 * ExceptionToast — surfaces high-severity API/runtime failures without
 * interrupting the user for every warning-level response.
 */
export default function ExceptionToast() {
  useEffect(() => {
    const recentKeys = new Map()

    function onException(event) {
      const detail = event?.detail || {};
      const statusCode = Number(detail.status_code || 0)
      const shouldToast = statusCode === 0 || statusCode >= 500
      const key = `${detail.route || 'route'}:${statusCode}:${detail.message || 'error'}`
      const now = Date.now()

      if (shouldToast) {
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
