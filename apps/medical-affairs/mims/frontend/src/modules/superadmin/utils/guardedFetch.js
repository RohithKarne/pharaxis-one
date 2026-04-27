let handleSessionExpiry = null

export function setSessionExpiryHandler(fn) {
  handleSessionExpiry = fn
}

export async function guardedFetch(input, init) {
  const response = await fetch(input, init)
  if (response.status === 401 && typeof handleSessionExpiry === 'function') {
    await handleSessionExpiry()
  }
  return response
}

export function downloadCsv(url) {
  window.open(url, '_blank', 'noopener,noreferrer')
}
