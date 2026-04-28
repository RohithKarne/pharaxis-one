let _onSessionExpiry = null
let _handling = false

export function setSessionExpiryHandler(fn) {
  _onSessionExpiry = fn
}

export async function httpFetch(input, init) {
  const response = await globalThis.fetch(input, init)
  if (response.status === 401 && !_handling && typeof _onSessionExpiry === 'function') {
    const url = typeof input === 'string' ? input : (input?.url ?? '')
    if (!url.includes('/api/auth/')) {
      _handling = true
      try {
        await _onSessionExpiry()
      } finally {
        _handling = false
      }
    }
  }
  return response
}
