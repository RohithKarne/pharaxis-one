/**
 * ColorPicker — custom visual color picker
 * Shows a 2D saturation/brightness graph + hue slider + hex input + presets
 * No external dependencies — pure React + CSS
 */
import { useState, useEffect, useRef } from 'react'

// ── Color math helpers ──────────────────────────────────────────
function hsvToHex(h, s, v) {
  // h: 0–360, s: 0–100, v: 0–100
  s /= 100; v /= 100
  const f = n => {
    const k = (n + h / 60) % 6
    return v - v * s * Math.max(Math.min(k, 4 - k, 1), 0)
  }
  return '#' + [5, 3, 1].map(n =>
    Math.round(f(n) * 255).toString(16).padStart(2, '0')
  ).join('')
}

function hexToHsv(hex) {
  const clean = (hex || '').replace('#', '')
  if (clean.length !== 6) return { h: 270, s: 60, v: 63 }
  const r = parseInt(clean.slice(0, 2), 16) / 255
  const g = parseInt(clean.slice(2, 4), 16) / 255
  const b = parseInt(clean.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  let h = 0
  const s = max === 0 ? 0 : d / max
  const v = max
  if (d !== 0) {
    if (max === r)      h = ((g - b) / d + (g < b ? 6 : 0)) * 60
    else if (max === g) h = ((b - r) / d + 2) * 60
    else                h = ((r - g) / d + 4) * 60
  }
  return { h: Math.round(h), s: Math.round(s * 100), v: Math.round(v * 100) }
}

function isValidHex(str) { return /^#[0-9A-Fa-f]{6}$/.test(str) }

// ── Preset palette ──────────────────────────────────────────────
const PRESETS = [
  '#6B3FA0','#7C3AED','#2563EB','#0891B2',
  '#16A34A','#CA8A04','#DC2626','#BE185D',
  '#1A1A2E','#374151','#6B7280','#9CA3AF',
  '#FFFFFF','#F8F8FB','#F3F4F6','#000000',
]

// ── Main component ──────────────────────────────────────────────
export default function ColorPicker({ value, onChange, label }) {
  const safeHex     = isValidHex(value) ? value : '#6B3FA0'
  const [open, setOpen]       = useState(false)
  const [hsv, setHsv]         = useState(() => hexToHsv(safeHex))
  const [hexInput, setHexInput] = useState(safeHex)
  const [dragging, setDragging] = useState(false)

  const wrapperRef = useRef(null)
  const graphRef   = useRef(null)
  // Use refs to avoid stale closures during drag
  const hsvRef     = useRef(hsv)
  hsvRef.current   = hsv

  // Sync when external value changes
  useEffect(() => {
    if (isValidHex(value) && value !== hsvToHex(hsv.h, hsv.s, hsv.v)) {
      const next = hexToHsv(value)
      setHsv(next)
      setHexInput(value)
    }
  }, [value])

  // ── Graph interaction ─────────────────────────────────────────
  function pickFromGraph(clientX, clientY) {
    if (!graphRef.current) return
    const rect = graphRef.current.getBoundingClientRect()
    const s = Math.round(Math.max(0, Math.min(1, (clientX - rect.left)  / rect.width))  * 100)
    const v = Math.round(Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height)) * 100)
    const next = { ...hsvRef.current, s, v }
    const hex  = hsvToHex(next.h, s, v)
    setHsv(next)
    setHexInput(hex)
    onChange(hex)
  }

  function handleGraphMouseDown(e) {
    e.preventDefault()
    setDragging(true)
    pickFromGraph(e.clientX, e.clientY)
  }

  useEffect(() => {
    if (!dragging) return
    const onMove = e => pickFromGraph(e.clientX, e.clientY)
    const onUp   = () => setDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
  }, [dragging])

  // ── Hue slider ────────────────────────────────────────────────
  function handleHue(e) {
    const h   = Number(e.target.value)
    const next = { ...hsv, h }
    const hex  = hsvToHex(h, next.s, next.v)
    setHsv(next)
    setHexInput(hex)
    onChange(hex)
  }

  // ── Hex text input ────────────────────────────────────────────
  function handleHexChange(e) {
    const raw = e.target.value
    // Auto-prepend # if user starts typing without it
    const val = raw.startsWith('#') ? raw : '#' + raw
    setHexInput(val)
    if (isValidHex(val)) {
      const next = hexToHsv(val)
      setHsv(next)
      onChange(val)
    }
  }

  // ── Preset click ──────────────────────────────────────────────
  function pickPreset(hex) {
    const next = hexToHsv(hex)
    setHsv(next)
    setHexInput(hex)
    onChange(hex)
  }

  // ── Close on outside click ────────────────────────────────────
  useEffect(() => {
    if (!open) return
    function onOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  const currentHex  = hsvToHex(hsv.h, hsv.s, hsv.v)
  const hueBaseColor = `hsl(${hsv.h}, 100%, 50%)`
  // Cursor position on the graph (percentage)
  const cursorLeft   = `${hsv.s}%`
  const cursorTop    = `${100 - hsv.v}%`

  return (
    <div className="cp-cpk-wrapper" ref={wrapperRef}>
      {label && <label className="cp-cpk-label">{label}</label>}

      {/* Swatch trigger button */}
      <button type="button" className="cp-cpk-trigger" onClick={() => setOpen(o => !o)}>
        <span className="cp-cpk-swatch" style={{ background: currentHex }} />
        <span className="cp-cpk-hex-display">{currentHex.toUpperCase()}</span>
        <span className="cp-cpk-arrow">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="cp-cpk-popup">
          {/* 2D Color graph — saturation (x) × brightness (y) */}
          <div
            ref={graphRef}
            className="cp-cpk-graph"
            style={{ '--hue-base': hueBaseColor }}
            onMouseDown={handleGraphMouseDown}
          >
            <div className="cp-cpk-graph-sat"  />
            <div className="cp-cpk-graph-dark" />
            <div
              className="cp-cpk-cursor"
              style={{ left: cursorLeft, top: cursorTop }}
            />
          </div>

          {/* Hue rainbow slider */}
          <div className="cp-cpk-hue-row">
            <div className="cp-cpk-preview" style={{ background: currentHex }} />
            <input
              type="range"
              className="cp-cpk-hue-slider"
              min={0} max={360} step={1}
              value={hsv.h}
              onChange={handleHue}
              aria-label="Hue"
            />
          </div>

          {/* Hex text input */}
          <div className="cp-cpk-hex-row">
            <span className="cp-cpk-hex-label">HEX</span>
            <input
              type="text"
              className="cp-cpk-hex-input"
              value={hexInput}
              onChange={handleHexChange}
              maxLength={7}
              placeholder="#000000"
              spellCheck={false}
            />
            <span
              className="cp-cpk-hex-sample"
              style={{ background: isValidHex(hexInput) ? hexInput : '#ccc' }}
            />
          </div>

          {/* Preset swatches */}
          <div className="cp-cpk-presets-label">Presets</div>
          <div className="cp-cpk-presets">
            {PRESETS.map(c => (
              <button
                key={c}
                type="button"
                className={`cp-cpk-preset ${currentHex.toLowerCase() === c.toLowerCase() ? 'cp-cpk-preset-active' : ''}`}
                style={{ background: c }}
                onClick={() => pickPreset(c)}
                title={c}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
