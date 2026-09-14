/**
 * Shown when the client code in the address does not belong to a portal.
 *
 * The API already refuses these with a 404. Before this page existed the
 * refusal was stored in PortalContext's `error` and read by nothing, so an
 * invented code rendered the default portal shell — header, safety panel,
 * chat widget — as though it were a real client's site.
 *
 * Deliberately standalone: it renders instead of PortalLayout, so nothing
 * belonging to a real portal appears around it.
 */
export default function PortalUnavailablePage() {
  return (
    <div className="pp-container pp-page-content">
      <div className="pp-empty-state">
        <h1>Portal not available</h1>
        <p>This address does not belong to a portal. Check the link you were given.</p>
      </div>
    </div>
  )
}
