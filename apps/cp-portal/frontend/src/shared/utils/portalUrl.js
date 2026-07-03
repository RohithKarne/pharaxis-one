/**
 * Build the public portal location for a client code.
 *
 * The admin console and the public portal are served by the same app, so the
 * portal lives at `<base>/portal/<code>/`. Vite sets import.meta.env.BASE_URL to
 * the configured base ('/' in dev, '/cp-portal/' in the production build), so
 * this resolves correctly in both environments with no extra config.
 */

export function clientPortalPath(code) {
  return `${import.meta.env.BASE_URL}portal/${code}/`
}

export function clientPortalUrl(code) {
  const path = clientPortalPath(code)
  if (typeof window === 'undefined') return path
  return `${window.location.origin}${path}`
}
