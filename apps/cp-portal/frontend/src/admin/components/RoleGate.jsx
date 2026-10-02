import { useAdminAuth } from '../context/AdminAuthContext'

// CPPM-60 — screens offer only what the person's role may change.
//
// The server decides (middleware/adminWritePolicy.js) and sends its table with the
// session; these two wrappers read it, so a screen never shows a button the server
// would refuse.
//
//   <CanChange area="faq">…buttons…</CanChange>
//       shows its children only if the role may change that area.
//   <ReadOnlyUnless area="branding">…a whole settings form…</ReadOnlyUnless>
//       leaves the form readable but turns every field and button inside it off,
//       with one line saying why. For a viewer the line is not repeated: the layout
//       already says the whole console is view-only.

export function CanChange({ area, children }) {
  const { canChange } = useAdminAuth()
  return canChange(area) ? children : null
}

export function ReadOnlyUnless({ area, what, children }) {
  const { canChange, hasRole } = useAdminAuth()
  const allowed = canChange(area)
  return (
    <>
      {!allowed && !hasRole('viewer') && (
        <div role="note" style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 6, background: '#F0F9FF', border: '1px solid #BAE6FD', color: '#0369A1', fontSize: 13 }}>
          Your role can see {what || 'these settings'}, but cannot make changes here. Ask an admin if something needs changing.
        </div>
      )}
      <fieldset disabled={!allowed} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        {children}
      </fieldset>
    </>
  )
}
