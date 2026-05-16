/**
 * PresenceIndicator — Theme 5 (Wave 4) "who's looking at this case" avatar stack.
 *
 * Props:
 *   users — array from useCasePresence().users
 *   max?  — show up to N avatars, the rest as "+N"
 */

export default function PresenceIndicator({ users = [], max = 5 }) {
  if (!users.length) return null
  const shown = users.slice(0, max)
  const overflow = users.length - shown.length
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: -8 }}>
      {shown.map((u, i) => (
        <span
          key={u.userId}
          title={u.name || u.email}
          style={{
            width: 26, height: 26, borderRadius: '50%',
            background: colorFor(u.userId),
            color: '#fff', fontSize: 11, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid #fff', marginLeft: i ? -8 : 0,
            boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
          }}
        >
          {u.initials || (u.name || u.email || '?').slice(0, 2).toUpperCase()}
        </span>
      ))}
      {overflow > 0 && (
        <span style={{
          marginLeft: -8, padding: '0 8px', height: 26, borderRadius: 13,
          background: 'var(--surface-alt,#eee)', color: 'var(--text-secondary)',
          fontSize: 11, fontWeight: 700,
          display: 'flex', alignItems: 'center', border: '2px solid #fff',
        }}>+{overflow}</span>
      )}
    </div>
  )
}

const PALETTE = ['#1a4f9c', '#1a7a3f', '#8a3df3', '#c08300', '#b91c1c', '#0e6c8f', '#7a3a8a']
function colorFor(uid) { return PALETTE[Number(uid || 0) % PALETTE.length] }
