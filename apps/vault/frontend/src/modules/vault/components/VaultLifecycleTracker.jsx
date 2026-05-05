const DEFAULT_STAGES = [
  { key: 'draft', label: 'Draft' },
  { key: 'in_review', label: 'In Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'published', label: 'Published' },
  { key: 'archived', label: 'Archived' }
]

export default function VaultLifecycleTracker({ currentState, stages = DEFAULT_STAGES }) {
  const currentIndex = Math.max(0, stages.findIndex(stage => stage.key === currentState))

  return (
    <div className="vault-lifecycle-tracker" aria-label="Document lifecycle">
      {stages.map((stage, index) => {
        const stateClass = index < currentIndex
          ? 'complete'
          : index === currentIndex
            ? 'active'
            : 'pending'

        return (
          <div className={`vault-lifecycle-stage ${stateClass}`} key={stage.key}>
            <span>{stage.label}</span>
          </div>
        )
      })}
    </div>
  )
}
