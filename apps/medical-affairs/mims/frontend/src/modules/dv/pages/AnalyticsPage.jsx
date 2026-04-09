import MIMSLayout from '../../../shared/components/MIMSLayout'

export default function AnalyticsPage() {
  return (
    <MIMSLayout>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📈</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Analytics</h2>
          <p style={{ fontSize: 14 }}>Reports, charts and dashboards — coming in a future sprint</p>
        </div>
      </div>
    </MIMSLayout>
  )
}
