import { useEffect } from 'react';

/**
 * ExceptionToast — listens for mims-api-exception events and logs them silently.
 * Visual popup is intentionally suppressed; errors are written to the browser console only.
 */
export default function ExceptionToast() {
  useEffect(() => {
    function onException(event) {
      const detail = event?.detail || {};
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

  // No visual output — errors are console-only so they don't disrupt the UI
  return null;
}
