import { useEffect, useMemo, useRef, useState } from 'react'

export default function VirtualizedTable({
  rows,
  colSpan,
  header,
  renderRow,
  rowHeight = 56,
  overscan = 6,
  minWidth = 900,
  className = '',
  tableStyle = {},
  containerStyle = {},
}) {
  const containerRef = useRef(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(560)

  useEffect(() => {
    const node = containerRef.current
    if (!node) return undefined
    const update = () => setViewportHeight(node.clientHeight || 560)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const { start, topPad, bottomPad, visibleRows } = useMemo(() => {
    const visibleCount = Math.max(1, Math.ceil(viewportHeight / rowHeight) + overscan * 2)
    const nextStart = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
    const nextEnd = Math.min(rows.length, nextStart + visibleCount)
    return {
      start: nextStart,
      topPad: nextStart * rowHeight,
      bottomPad: Math.max(0, (rows.length - nextEnd) * rowHeight),
      visibleRows: rows.slice(nextStart, nextEnd),
    }
  }, [overscan, rowHeight, rows, scrollTop, viewportHeight])

  return (
    <div
      ref={containerRef}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      style={{ flex: 1, minHeight: 0, overflow: 'auto', ...containerStyle }}
    >
      <table className={className} style={{ width: '100%', minWidth, borderCollapse: 'collapse', ...tableStyle }}>
        {header}
        <tbody>
          {topPad > 0 && (
            <tr aria-hidden="true">
              <td colSpan={colSpan} style={{ height: topPad, padding: 0, border: 'none' }} />
            </tr>
          )}
          {visibleRows.map((row, index) => renderRow(row, start + index))}
          {bottomPad > 0 && (
            <tr aria-hidden="true">
              <td colSpan={colSpan} style={{ height: bottomPad, padding: 0, border: 'none' }} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
