/**
 * Stack — flexbox layout primitive. Replaces inline
 * { display:'flex', gap, alignItems, ... } blocks with a consistent API.
 */

export default function Stack({
  direction = 'column',
  gap = 12,
  align,
  justify,
  wrap = false,
  style,
  children,
  ...rest
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: direction,
        gap,
        alignItems: align,
        justifyContent: justify,
        flexWrap: wrap ? 'wrap' : 'nowrap',
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  )
}
