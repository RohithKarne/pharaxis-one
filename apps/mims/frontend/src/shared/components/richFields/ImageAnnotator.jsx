/**
 * ImageAnnotator — Theme 1 Rich Field (Wave 3).
 *
 * Loads a base image (from an attachments.id) and lets the user draw
 * freehand strokes plus drop numbered comment pins. Used for AE injury
 * site marks, product complaint defect locations, etc.
 *
 * Value shape:
 *   { attachment_id, strokes: [{points:[[x,y],...], color}], comments: [{x,y,text}], width, height }
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export default function ImageAnnotator({
  value = {}, onChange, label, readOnly, baseImageUrl, attachmentId,
  width = 480, height = 320,
}) {
  const cnvRef = useRef(null)
  const imgRef = useRef(null)
  const drawing = useRef(false)
  const [tool, setTool]   = useState('pen')   // 'pen' | 'pin' | 'erase'
  const [color, setColor] = useState('#d33')
  const [strokes, setStrokes]   = useState(value.strokes || [])
  const [comments, setComments] = useState(value.comments || [])
  const [current, setCurrent]   = useState(null)

  const drawStroke = useCallback((ctx, s) => {
    if (!s.points?.length) return
    ctx.strokeStyle = s.color || '#d33'; ctx.lineWidth = 2; ctx.lineCap = 'round'
    ctx.beginPath()
    s.points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))
    ctx.stroke()
  }, [])

  const drawPin = useCallback((ctx, c, n) => {
    ctx.fillStyle = '#1a4f9c'; ctx.strokeStyle = '#fff'
    ctx.beginPath(); ctx.arc(c.x, c.y, 11, 0, Math.PI * 2); ctx.fill()
    ctx.lineWidth = 2; ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.font = '700 11px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(String(n), c.x, c.y)
  }, [])

  const redraw = useCallback(() => {
    const cnv = cnvRef.current; if (!cnv) return
    const ctx = cnv.getContext('2d')
    ctx.clearRect(0, 0, cnv.width, cnv.height)
    if (imgRef.current) ctx.drawImage(imgRef.current, 0, 0, cnv.width, cnv.height)
    for (const s of strokes) drawStroke(ctx, s)
    if (current) drawStroke(ctx, current)
    comments.forEach((c, i) => drawPin(ctx, c, i + 1))
  }, [comments, current, drawPin, drawStroke, strokes])

  // load base image
  useEffect(() => {
    if (!baseImageUrl) return
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => { imgRef.current = img; redraw() }
    img.src = baseImageUrl
  }, [baseImageUrl, redraw])

  useEffect(() => { redraw() }, [redraw])
  function pt(e) {
    const c = cnvRef.current.getBoundingClientRect()
    return { x: e.clientX - c.left, y: e.clientY - c.top }
  }
  function commit(next) {
    onChange?.({
      attachment_id: attachmentId ?? value.attachment_id ?? null,
      strokes: next.strokes ?? strokes,
      comments: next.comments ?? comments,
      width, height,
    })
  }
  function start(e) {
    if (readOnly) return
    const p = pt(e)
    if (tool === 'pin') {
      const text = prompt('Pin comment:')
      if (text) {
        const next = [...comments, { x: p.x, y: p.y, text }]
        setComments(next); commit({ comments: next })
      }
      return
    }
    drawing.current = true
    setCurrent({ points: [[p.x, p.y]], color: tool === 'erase' ? '#fff' : color })
  }
  function move(e) {
    if (!drawing.current || !current) return
    const p = pt(e)
    setCurrent(c => ({ ...c, points: [...c.points, [p.x, p.y]] }))
  }
  function end() {
    if (!drawing.current) return
    drawing.current = false
    if (current && current.points.length > 1) {
      const next = [...strokes, current]
      setStrokes(next); commit({ strokes: next })
    }
    setCurrent(null)
  }
  function undo() {
    const next = strokes.slice(0, -1)
    setStrokes(next); commit({ strokes: next })
  }
  function clearAll() {
    setStrokes([]); setComments([]); commit({ strokes: [], comments: [] })
  }

  return (
    <div>
      {label && <div style={lbl}>{label}</div>}
      {!readOnly && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
          <Btn label="✏ Pen"   active={tool==='pen'}   onClick={() => setTool('pen')} />
          <Btn label="📍 Pin"  active={tool==='pin'}   onClick={() => setTool('pin')} />
          <Btn label="🩹 Erase" active={tool==='erase'} onClick={() => setTool('erase')} />
          <input type="color" value={color} onChange={e => setColor(e.target.value)}
            style={{ width: 28, height: 24, padding: 0, border: '1px solid var(--border)' }} />
          <span style={{ flex: 1 }} />
          <button onClick={undo}    style={ghost}>↶ Undo</button>
          <button onClick={clearAll} style={ghost}>Clear</button>
        </div>
      )}
      <canvas
        ref={cnvRef} width={width} height={height}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        style={{
          border: '1px solid var(--border)', borderRadius: 6,
          background: '#fff', cursor: readOnly ? 'default' : 'crosshair',
          maxWidth: '100%',
        }}
      />
      {comments.length > 0 && (
        <ol style={{ marginTop: 8, paddingLeft: 18, fontSize: 12, color: 'var(--text-secondary)' }}>
          {comments.map((c, i) => <li key={i}>{c.text}</li>)}
        </ol>
      )}
    </div>
  )
}

function Btn({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '4px 9px', fontSize: 12, fontWeight: 600,
      borderRadius: 4, cursor: 'pointer',
      border: `1px solid ${active ? '#1a4f9c' : 'var(--border)'}`,
      background: active ? '#1a4f9c' : '#fff',
      color: active ? '#fff' : '#1a4f9c',
    }}>{label}</button>
  )
}
const ghost = { padding: '4px 9px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 4, background: '#fff', cursor: 'pointer' }
const lbl = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }
