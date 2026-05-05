export default function VaultPageHeader({
  kicker,
  title,
  note,
  statusLabel,
  dateLabel,
  secondaryNode,
  actions
}) {
  return (
    <section className="panel span-12 workspace-hero-card">
      <div>
        <p className="workspace-hero-kicker">{kicker}</p>
        <h2 className="workspace-hero-title">{title}</h2>
        {note ? <p className="panel-note">{note}</p> : null}
      </div>
      <div className="workspace-hero-right">
        {statusLabel ? <span className="workspace-status-pill">{statusLabel}</span> : null}
        {secondaryNode || null}
        {dateLabel ? <span className="workspace-hero-date">{dateLabel}</span> : null}
        {actions || null}
      </div>
    </section>
  )
}
