import { httpFetch } from '../api/httpFetch.js'
const TELEMETRY_ENDPOINT = '/api/telemetry/client-error';

function randomId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `rid_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function safeText(value, limit = 1200) {
  const text = String(value || '');
  return text.length > limit ? text.slice(0, limit) : text;
}

export function sendClientError(payload = {}) {
  try {
    const exceptionId = payload.exception_id || `EX-CLIENT-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const body = JSON.stringify({
      app: payload.app || 'mims',
      severity: payload.severity || 'error',
      message: safeText(payload.message || 'Unknown client error'),
      stack: safeText(payload.stack || '', 4000),
      location: safeText(payload.location || window.location?.href || ''),
      route: safeText(payload.route || window.location?.pathname || ''),
      request_id: safeText(payload.request_id || ''),
      exception_id: exceptionId,
      user_agent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    });

    httpFetch(TELEMETRY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
    return exceptionId;
  } catch {
    // best effort only
    return null;
  }
}

function shouldSkipTelemetry(url) {
  return typeof url === 'string' && url.includes('/api/telemetry/client-error');
}

export function initClientObservability({ app = 'mims' } = {}) {
  if (window.__mims_observability_initialized) return;
  window.__mims_observability_initialized = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const req = typeof input === 'string' ? input : input?.url;
    const requestId = randomId();
    const start = Date.now();

    const headers = new Headers(init.headers || (typeof input !== 'string' ? input?.headers : undefined) || {});
    if (!headers.has('X-Request-Id')) headers.set('X-Request-Id', requestId);

    try {
      const response = await originalFetch(input, { ...init, headers });
      if (!response.ok && !shouldSkipTelemetry(req)) {
        let body = null;
        try {
          body = await response.clone().json();
        } catch {
          body = null;
        }
        const exceptionId = body?.exception_id || response.headers.get('X-Exception-Id') || null;
        sendClientError({
          app,
          severity: response.status >= 500 ? 'error' : 'warning',
          message: `API failure ${response.status} ${req || ''}`.trim(),
          request_id: requestId,
          exception_id: exceptionId || undefined,
          route: req || window.location.pathname,
          location: window.location.href,
          stack: `duration_ms=${Date.now() - start}`,
        });
        window.dispatchEvent(new CustomEvent('mims-api-exception', {
          detail: {
            exception_id: exceptionId,
            request_id: requestId,
            status_code: response.status,
            route: req || window.location.pathname,
            message: body?.error || 'API request failed',
          },
        }));
      }
      return response;
    } catch (err) {
      if (!shouldSkipTelemetry(req)) {
        const exceptionId = sendClientError({
          app,
          severity: 'error',
          message: err?.message || 'Network error',
          stack: err?.stack || '',
          request_id: requestId,
          route: req || window.location.pathname,
        });
        window.dispatchEvent(new CustomEvent('mims-api-exception', {
          detail: {
            exception_id: exceptionId,
            request_id: requestId,
            status_code: 0,
            route: req || window.location.pathname,
            message: err?.message || 'Network error',
          },
        }));
      }
      throw err;
    }
  };

  window.addEventListener('error', (event) => {
    const exceptionId = sendClientError({
      app,
      severity: 'error',
      message: event.message || 'Window error',
      stack: event.error?.stack || '',
      location: event.filename ? `${event.filename}:${event.lineno || 0}:${event.colno || 0}` : window.location.href,
    });
    window.dispatchEvent(new CustomEvent('mims-api-exception', {
      detail: {
        exception_id: exceptionId,
        request_id: null,
        status_code: 0,
        route: window.location.pathname,
        message: event.message || 'Window error',
      },
    }));
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const exceptionId = sendClientError({
      app,
      severity: 'error',
      message: reason?.message || String(reason || 'Unhandled promise rejection'),
      stack: reason?.stack || '',
    });
    window.dispatchEvent(new CustomEvent('mims-api-exception', {
      detail: {
        exception_id: exceptionId,
        request_id: null,
        status_code: 0,
        route: window.location.pathname,
        message: reason?.message || 'Unhandled promise rejection',
      },
    }));
  });
}
