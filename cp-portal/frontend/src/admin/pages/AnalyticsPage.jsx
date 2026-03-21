import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { adminHeaders } from '../context/AdminAuthContext'
import {
  ResponsiveContainer,
  AreaChart, Area,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell,
  LabelList,
} from 'recharts'

const COLORS = ['#6B3FA0', '#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6']

const TYPE_LABELS = {
  medical_inquiry:   'Medical Inquiry',
  adverse_event:     'Adverse Event',
  product_complaint: 'Product Complaint',
  other_inquiry:     'Other Inquiry',
}

function StatCard({ label, value, accent }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 12, padding: '20px 24px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.08)', flex: 1, minWidth: 130,
      borderTop: `3px solid ${accent || '#6B3FA0'}`,
    }}>
      <div style={{ fontSize: 30, fontWeight: 700, color: '#111827' }}>{value ?? '—'}</div>
      <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4, fontWeight: 500 }}>{label}</div>
    </div>
  )
}

function SectionCard({ title, children, style }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 12, padding: 24,
      boxShadow: '0 1px 4px rgba(0,0,0,0.08)', ...style,
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 20 }}>{title}</div>
      {children}
    </div>
  )
}

function EmptyState({ msg }) {
  return <div style={{ textAlign: 'center', color: '#9CA3AF', padding: '32px 0', fontSize: 13 }}>{msg}</div>
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#1F2937', borderRadius: 8, padding: '8px 14px', color: '#fff', fontSize: 13 }}>
      {label && <div style={{ marginBottom: 4, fontWeight: 600 }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || '#fff' }}>{p.name}: <strong>{p.value}</strong></div>
      ))}
    </div>
  )
}

export default function AnalyticsPage() {
  const { clientId }      = useParams()
  const [data, setData]   = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true); setError('')
      try {
        const res = await fetch(`/api/admin/analytics/${clientId}`, { headers: adminHeaders() })
        if (!res.ok) throw new Error()
        setData(await res.json())
      } catch {
        setError('Unable to load analytics data.')
      }
      setLoading(false)
    }
    load()
  }, [clientId])

  async function handleExport() {
    setExporting(true)
    try {
      const res = await fetch(`/api/admin/analytics/${clientId}/export`, { headers: adminHeaders() })
      if (!res.ok) { alert('Export failed.'); return }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = `analytics-${clientId}.csv`
      document.body.appendChild(a); a.click()
      document.body.removeChild(a); URL.revokeObjectURL(url)
    } catch { alert('Export failed.') }
    setExporting(false)
  }

  if (loading) return <AdminLayout title="Analytics"><div className="cp-loading">Loading…</div></AdminLayout>
  if (error)   return <AdminLayout title="Analytics"><div className="cp-error">{error}</div></AdminLayout>

  const stats           = data?.stats            || {}
  const submissionTypes = (data?.submission_types || []).map(r => ({
    ...r, name: TYPE_LABELS[r.form_type] || r.form_type,
  }))
  const topDocuments   = data?.top_documents     || []
  const topSafety      = data?.top_safety        || []
  const trend          = (data?.submissions_trend || []).map(r => ({ ...r, Submissions: r.count }))
  const recentActivity = data?.recent_activity   || []

  const topDocsChart   = topDocuments.map(d => ({
    name: d.title?.length > 28 ? d.title.slice(0, 28) + '…' : d.title,
    Downloads: d.downloads ?? d.download_count ?? 0,
  }))
  const topSafetyChart = topSafety.map(s => ({
    name: s.title?.length > 28 ? s.title.slice(0, 28) + '…' : s.title,
    Views: s.views ?? 0,
  }))

  return (
    <AdminLayout title="Analytics">

      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
        <button className="cp-btn cp-btn-outline" onClick={handleExport} disabled={exporting}>
          {exporting ? 'Exporting…' : '⬇ Export CSV'}
        </button>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <StatCard label="Portal Users"      value={stats.portal_users}      accent="#6B3FA0" />
        <StatCard label="Total Submissions" value={stats.total_submissions}  accent="#2563EB" />
        <StatCard label="Total Downloads"   value={stats.total_downloads}    accent="#10B981" />
        <StatCard label="Published News"    value={stats.published_news}     accent="#F59E0B" />
        <StatCard label="Published Docs"    value={stats.published_docs}     accent="#8B5CF6" />
        <StatCard label="Active Safety"     value={stats.active_safety}      accent="#EF4444" />
      </div>

      {/* Row 1: Trend + Pie */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, marginBottom: 20 }}>

        {/* Submissions Trend — Area chart */}
        <SectionCard title="Submissions Trend (Last 6 Months)">
          {trend.length === 0 ? <EmptyState msg="No trend data yet." /> : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trend} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="subGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#6B3FA0" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#6B3FA0" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6B7280' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#6B7280' }} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="Submissions" stroke="#6B3FA0" strokeWidth={2}
                  fill="url(#subGrad)" dot={{ r: 4, fill: '#6B3FA0' }} activeDot={{ r: 6 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        {/* Submissions by Type — Donut */}
        <SectionCard title="Submissions by Type">
          {submissionTypes.length === 0 ? <EmptyState msg="No submissions yet." /> : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={submissionTypes} dataKey="count" nameKey="name"
                    cx="50%" cy="50%" innerRadius={48} outerRadius={72}
                    paddingAngle={3} strokeWidth={0}>
                    {submissionTypes.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {submissionTypes.map((row, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                    <span style={{ color: '#374151', flex: 1 }}>{row.name}</span>
                    <span style={{ fontWeight: 700, color: '#111827' }}>{row.count}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </SectionCard>

      </div>

      {/* Row 2: Top Docs + Top Safety */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>

        {/* Top Documents — Horizontal bar */}
        <SectionCard title="Top Documents by Downloads">
          {topDocsChart.length === 0 ? <EmptyState msg="No downloads recorded yet." /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topDocsChart} layout="vertical" margin={{ top: 0, right: 40, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#6B7280' }} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: '#374151' }} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: '#F3F4F6' }} />
                <Bar dataKey="Downloads" fill="#2563EB" radius={[0, 4, 4, 0]} barSize={18}>
                  <LabelList dataKey="Downloads" position="right" style={{ fontSize: 11, fill: '#374151', fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        {/* Top Safety — Horizontal bar */}
        <SectionCard title="Top Safety Alerts by Views">
          {topSafetyChart.length === 0 ? <EmptyState msg="No safety view data yet." /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topSafetyChart} layout="vertical" margin={{ top: 0, right: 40, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#6B7280' }} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: '#374151' }} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: '#F3F4F6' }} />
                <Bar dataKey="Views" fill="#EF4444" radius={[0, 4, 4, 0]} barSize={18}>
                  <LabelList dataKey="Views" position="right" style={{ fontSize: 11, fill: '#374151', fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

      </div>

      {/* Recent Activity */}
      <SectionCard title="Recent Activity">
        {recentActivity.length === 0 ? <EmptyState msg="No recent activity." /> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {recentActivity.map((row, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '10px 0', borderBottom: i < recentActivity.length - 1 ? '1px solid #F1F5F9' : 'none',
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', background: '#F3F4F6',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, flexShrink: 0,
                }}>
                  {row.action === 'CREATE' ? '✚' : row.action === 'DELETE' ? '✕' : row.action === 'UPDATE' ? '✎' : '●'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>{row.action}</span>
                  {' '}
                  <span style={{ fontSize: 13, color: '#6B7280' }}>{row.entity || ''}</span>
                  {row.admin_name && (
                    <span style={{ fontSize: 12, color: '#9CA3AF' }}> · {row.admin_name}</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#9CA3AF', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {row.created_at ? new Date(row.created_at).toLocaleString() : '—'}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

    </AdminLayout>
  )
}
