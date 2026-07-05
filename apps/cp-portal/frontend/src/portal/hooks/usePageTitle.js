import { useEffect } from 'react'
import { usePortal } from '../context/PortalContext'

/**
 * Sets the browser tab title as `${label} | ${brand}`, where the brand is the
 * client's configured portal name (falling back to the custom domain, then the
 * client name, then "CP Portal"). Keeps the tab in sync with the portal's
 * branding instead of the generic product name.
 *
 * @param {string} [label] page label, e.g. "Home". Omit for the brand alone.
 */
export default function usePageTitle(label) {
  const { portalConfig } = usePortal()
  const b = portalConfig?.branding || {}
  const brand = b.portal_name || b.custom_domain || portalConfig?.client?.name || 'CP Portal'
  useEffect(() => {
    document.title = label ? `${label} | ${brand}` : brand
    return () => { document.title = brand }
  }, [label, brand])
}
