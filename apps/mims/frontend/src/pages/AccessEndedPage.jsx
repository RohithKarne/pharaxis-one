// MIPM-32: the one screen a switched-off person sees. Nothing else from MIMS
// is shown with it, and there is no way on from here.
export default function AccessEndedPage() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: 'var(--bg-primary)', gap: 16, padding: 24
    }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
        padding: '40px 48px', textAlign: 'center', maxWidth: 440
      }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
          Your access has ended.
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Please contact your administrator.
        </div>
      </div>
    </div>
  )
}
