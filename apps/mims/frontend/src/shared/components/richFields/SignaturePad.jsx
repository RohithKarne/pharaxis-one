/**
 * SignaturePad — Theme 1 Rich Field (Wave 3).
 *
 * Canvas signature capture for inspector-ready cases. Touch + mouse. Saves
 * the canvas as a PNG dataURL plus signer name + intent + timestamp.
 *
 * Value shape: { png_data_url, signer_name, signed_at, intent }
 */

import { useEffect, useRef, useState } from 'react'

export default function SignaturePad({ value = {}, onChange, label, readOnly, width = 360, height = 120 }) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const last = useRef({ x: 0, y: 0 })
  const [signerName, setSignerName] = useState(value.signer_name || '')
  const [intent, setIntent] = useState(value.intent || 'sign')
  const [hasSignature, setHasSignature] = useState(!!value.png_data_url)  // WP6: track whether a signature exists

  // Draw saved PNG when mounted / value changes
  useEffect(() => {
    const cnv = canvasRef.current
    if (!cnv) return
    const ctx = cnv.getContext('2d')
    ctx.clearRect(0, 0, cnv.width, cnv.height)
    if (value.png_data_url) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0, cnv.width, cnv.height)
      img.src = value.png_data_url
    }
  }, [value.png_data_url])

  function pt(e) {
    const c = canvasRef.current.getBoundingClientRect()
    const t = e.touches?.[0]
    return { x: (t ? t.clientX : e.clientX) - c.left, y: (t ? t.clientY : e.clientY) - c.top }
  }
  function start(e) { if (readOnly) return; drawing.current = true; last.current = pt(e) }
  function move(e) {
    if (!drawing.current) return
    const ctx = canvasRef.current.getContext('2d')
    const p = pt(e)
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#111'
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke()
    last.current = p
  }
  function end() {
    if (!drawing.current) return
    drawing.current = false
    const png = canvasRef.current.toDataURL('image/png')
    setHasSignature(true)
    onChange?.({
      png_data_url: png, signer_name: signerName, intent,
      signed_at: new Date().toISOString(),
    })
  }
  function clear() {
    const cnv = canvasRef.current
    cnv.getContext('2d').clearRect(0, 0, cnv.width, cnv.height)
    setHasSignature(false)
    onChange?.({})
  }

  // WP6: re-emit when signer name / intent change AFTER a signature is drawn — previously
  // those edits were only captured if the user drew another stroke afterward, so typing the
  // signer name then saving persisted a stale/empty attribution on a 21 CFR-style signature.
  useEffect(() => {
    if (!hasSignature || !canvasRef.current) return
    onChange?.({
      png_data_url: canvasRef.current.toDataURL('image/png'),
      signer_name: signerName, intent,
      signed_at: new Date().toISOString(),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signerName, intent])

  return (
    <div>
      {label && <div style={lbl}>{label}</div>}
      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
        <input placeholder="Signer name" disabled={readOnly}
          value={signerName} onChange={e => setSignerName(e.target.value)}
          style={{ ...ipt, flex: 1 }} />
        <select value={intent} onChange={e => setIntent(e.target.value)} disabled={readOnly} style={ipt}>
          <option value="sign">Sign</option>
          <option value="approve">Approve</option>
          <option value="witness">Witness</option>
        </select>
      </div>
      <canvas
        ref={canvasRef} width={width} height={height}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end}
        style={{
          border: '1px dashed var(--border)', borderRadius: 6,
          background: 'repeating-linear-gradient(45deg, #fafafa, #fafafa 6px, #fff 6px, #fff 12px)',
          touchAction: 'none', cursor: readOnly ? 'default' : 'crosshair',
        }}
      />
      <div style={{ marginTop: 6, display: 'flex', gap: 6, alignItems: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
        {value.signed_at && <>Signed {new Date(value.signed_at).toLocaleString()} as {intent}</>}
        <span style={{ flex: 1 }} />
        {!readOnly && <button onClick={clear} style={clearBtn}>Clear</button>}
      </div>
    </div>
  )
}

const lbl = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }
const ipt = { padding: '6px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6 }
const clearBtn = {
  padding: '3px 9px', border: '1px solid #c44', borderRadius: 4,
  fontSize: 11, fontWeight: 600, color: '#c44', background: '#fff', cursor: 'pointer',
}
