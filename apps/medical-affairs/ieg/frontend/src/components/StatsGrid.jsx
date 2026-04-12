export default function StatsGrid({ authType, tasks, grants, iit, eap, notifications, submissions }) {
  const tiles = authType === 'internal'
    ? [
        { label: 'Pending Tasks', value: tasks.filter((task) => task.status === 'pending').length, note: 'Action queue now' },
        { label: 'Grant Cases', value: grants.length, note: 'Lifecycle records' },
        { label: 'IIT Proposals', value: iit.length, note: 'Scientific pipeline' },
        { label: 'EAP Requests', value: eap.length, note: 'Expanded access operations' }
      ]
    : [
        { label: 'My Submissions', value: submissions.length, note: 'Grant + IIT + EAP requests' },
        { label: 'In Review', value: submissions.filter((item) => String(item.status).includes('review')).length, note: 'Currently being reviewed' },
        { label: 'Approved / Active', value: submissions.filter((item) => String(item.status).includes('approved') || String(item.status).includes('active')).length, note: 'Positive outcomes' },
        { label: 'Notifications', value: notifications.length, note: 'Communication feed' }
      ]

  return (
    <section className="stats-grid reveal-up delay-1">
      {tiles.map((tile) => (
        <article className="stat-tile" key={tile.label}>
          <div className="stat-label">{tile.label}</div>
          <div className="stat-value">{tile.value}</div>
          <div className="stat-note">{tile.note}</div>
        </article>
      ))}
    </section>
  )
}
