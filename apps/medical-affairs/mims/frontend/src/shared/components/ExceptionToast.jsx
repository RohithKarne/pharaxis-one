import { useEffect, useState } from 'react';

export default function ExceptionToast() {
  const [eventData, setEventData] = useState(null);

  useEffect(() => {
    function onException(event) {
      const detail = event?.detail || {};
      setEventData({
        exception_id: detail.exception_id || 'N/A',
        message: detail.message || 'An unexpected exception occurred.',
      });
    }
    window.addEventListener('mims-api-exception', onException);
    return () => window.removeEventListener('mims-api-exception', onException);
  }, []);

  if (!eventData) return null;

  return (
    <div style={{
      position: 'fixed',
      right: 16,
      bottom: 16,
      zIndex: 1200,
      background: '#fff4f4',
      border: '1px solid #f2b8b5',
      color: '#7f1d1d',
      padding: '12px 14px',
      borderRadius: 8,
      width: 360,
      boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
    }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Exception captured</div>
      <div style={{ fontSize: 13, marginBottom: 8 }}>{eventData.message}</div>
      <div style={{ fontSize: 12, fontFamily: 'monospace', marginBottom: 10 }}>
        Exception ID: {eventData.exception_id}
      </div>
      <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={() => setEventData(null)}>
        Dismiss
      </button>
    </div>
  );
}
