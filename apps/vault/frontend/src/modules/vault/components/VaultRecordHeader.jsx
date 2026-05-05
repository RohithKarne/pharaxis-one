import { Link } from 'react-router-dom'
import VaultLifecycleTracker from './VaultLifecycleTracker'
import { lifecycleBadgeClass } from '../../common/utils/session'

function VaultIcon({ name }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true'
  }

  if (name === 'view') {
    return (
      <svg {...common}>
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    )
  }

  if (name === 'certificate') {
    return (
      <svg {...common}>
        <path d="M7 3h10v18l-5-3-5 3V3z" />
        <path d="M9.5 8h5" />
        <path d="M9.5 12h5" />
      </svg>
    )
  }

  if (name === 'back') {
    return (
      <svg {...common}>
        <path d="M19 12H5" />
        <path d="M12 19l-7-7 7-7" />
      </svg>
    )
  }

  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </svg>
  )
}

export default function VaultRecordHeader({
  eyebrow,
  title,
  subtitle,
  lifecycleState,
  metadata = [],
  actions = []
}) {
  return (
    <section className="vault-record-shell panel span-12">
      <div className="vault-record-toolbar">
        <div>
          <p className="workspace-hero-kicker">{eyebrow}</p>
          <h2 className="vault-record-title">{title}</h2>
          {subtitle ? <p className="vault-record-subtitle">{subtitle}</p> : null}
        </div>
        <div className="vault-record-actions">
          {lifecycleState ? (
            <span className={lifecycleBadgeClass(lifecycleState)}>{lifecycleState}</span>
          ) : null}
          {actions.map(action => {
            if (action.to) {
              return (
                <Link className="vault-record-icon-action" key={action.label} to={action.to} title={action.label}>
                  <VaultIcon name={action.icon} />
                  <span className="sr-only">{action.label}</span>
                </Link>
              )
            }

            return (
              <button
                className="vault-record-icon-action"
                key={action.label}
                type="button"
                onClick={action.onClick}
                disabled={action.disabled}
                title={action.label}
              >
                <VaultIcon name={action.icon} />
                <span className="sr-only">{action.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {metadata.length ? (
        <div className="vault-record-meta-strip">
          {metadata.map(item => (
            <div className="vault-record-meta-item" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      ) : null}

      {lifecycleState ? <VaultLifecycleTracker currentState={lifecycleState} /> : null}
    </section>
  )
}
