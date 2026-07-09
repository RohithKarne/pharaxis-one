/**
 * Skeleton — shimmer placeholders shown while list/detail data loads (CP-30).
 * Decorative only (aria-hidden); the shimmer respects prefers-reduced-motion
 * via the global rule in index.css.
 */

export default function Skeleton({ rows = 3, height = 14, style = {} }) {
  return (
    <div className="pp-skeleton-group" aria-hidden="true" style={style}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="pp-skeleton" style={{ height, width: i === rows - 1 ? '70%' : '100%' }} />
      ))}
    </div>
  )
}

/** A grid of card-shaped skeletons for tile/card lists. */
export function SkeletonCards({ count = 6 }) {
  return (
    <div className="pp-skeleton-cards" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="pp-skeleton-card">
          <div className="pp-skeleton" style={{ height: 18, width: '60%', marginBottom: 12 }} />
          <div className="pp-skeleton" style={{ height: 12, width: '100%', marginBottom: 8 }} />
          <div className="pp-skeleton" style={{ height: 12, width: '85%' }} />
        </div>
      ))}
    </div>
  )
}
