/**
 * FieldPresenceBadge — Theme 5 small chip showing who's focused on a field
 * right now. Drop next to any input alongside FieldHistoryPopover.
 *
 * Props:
 *   field         — field name (must match the value sent via actions.focus())
 *   presence      — output of useCasePresence(caseId)
 *   currentUserId — your user id (to suppress your own focus marker)
 */

export default function FieldPresenceBadge({ field, presence, currentUserId }) {
  if (!presence?.enabled || !field) return null
  const focusedBy = presence.focus.get(field)
  const typing    = presence.typing.get(field)
  if (!focusedBy && !typing) return null

  const otherUid = focusedBy && focusedBy !== currentUserId ? focusedBy : (typing && typing.userId !== currentUserId ? typing.userId : null)
  if (!otherUid) return null
  const user = presence.users.find(u => u.userId === otherUid)
  if (!user) return null

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      marginLeft: 6, padding: '1px 7px', borderRadius: 10,
      background: 'var(--accent-soft,#eaf2ff)', color: 'var(--accent,#1a4f9c)',
      fontSize: 10, fontWeight: 700,
    }} title={`${user.name || user.email} is ${typing ? 'typing' : 'editing'} this field`}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#1a7a3f',
        animation: typing ? 'pulse 1s infinite' : 'none' }} />
      {(user.initials || (user.name || '?').slice(0, 2).toUpperCase())}
      {typing ? '⋯' : ''}
    </span>
  )
}
