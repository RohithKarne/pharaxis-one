let _onSessionExpiry = null
let _onAuthIssue = null
let _handling = false

export function setSessionExpiryHandler(fn) {
  _onSessionExpiry = fn
}

export function setAuthIssueHandler(fn) {
  _onAuthIssue = fn
}

async function readResponseDetail(response) {
  try {
    const data = await response.clone().json()
    if (data && typeof data === 'object') return data
  } catch {
    // ignore JSON parse failures
  }
  try {
    const text = await response.clone().text()
    return text ? { error: text } : {}
  } catch {
    return {}
  }
}

export async function httpFetch(input, init) {
  // SECURITY (F14): the session JWT is no longer persisted in localStorage; the
  // httpOnly `mims_token` cookie carries authentication. Ensure that cookie is
  // sent on every request (defaults to same-origin, but be explicit so a
  // configured cross-origin VITE_API_URL still receives it). Callers may still
  // override credentials via init.
  const response = await globalThis.fetch(input, { credentials: 'include', ...init })
  const url = typeof input === 'string' ? input : (input?.url ?? '')

  // Sign-in routes are left alone so a wrong password does not sign anyone out —
  // except a switched-off account, which is acted on wherever it is reported,
  // including the session check a page makes when it loads (MIPM-32).
  const accessEnded = response.status === 401 && (await readResponseDetail(response))?.error_code === 'ACCESS_ENDED'
  if ((response.status === 401 || response.status === 403 || response.status === 503) && (!url.includes('/api/auth/') || accessEnded)) {
    const detail = await readResponseDetail(response)
    const payload = {
      url,
      status: response.status,
      error: detail?.error || 'Request failed.',
      error_code: detail?.error_code || '',
      should_logout: Boolean(detail?.should_logout),
    }

    if (payload.should_logout && response.status === 401 && !_handling && typeof _onSessionExpiry === 'function') {
      _handling = true
      try {
        await _onSessionExpiry(payload)
      } finally {
        _handling = false
      }
    } else if (!(accessEnded && _handling)) { // the sign-out the handler itself makes is refused too; it is not a second issue
      if (typeof _onAuthIssue === 'function') {
        _onAuthIssue(payload)
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mims-auth-issue', { detail: payload }))
      }
    }
  }
  return response
}
