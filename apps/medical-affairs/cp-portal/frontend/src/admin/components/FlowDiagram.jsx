/**
 * FlowDiagram.jsx
 * Dark-theme animated sequence diagram — learning module.
 * Top actor boxes, concept tags and API routes on arrows,
 * rich 12-field detail drawer on step click.
 */

import { useState, useEffect, useMemo } from 'react'
import { normalizeFlowTemplate } from '../utils/flowTemplates'

// ── Layout constants ──────────────────────────────────────────────────────────
const LANE_W   = 220
const PAD_X    = 36
const HEADER_H = 46
const BOX_H    = 34
const BOX_W    = 140
const STEP_H   = 110   // compact: label + route + arrow + fileref + concept tag
const LOOP_W   = 56
const TOP_STEP_GAP = 42
const FOOTER_PAD = 24
const HEADER_BLOCK_H = HEADER_H + BOX_H


// ── Dark colour palette ───────────────────────────────────────────────────────
const C = {
  bg:        '#0F172A',
  bgMid:     '#1E293B',
  boxFill:   '#FFFFFF',
  boxBorder: '#475569',
  boxText:   '#0F172A',
  lifeline:  'rgba(255,255,255,0.13)',
  idle:      'rgba(255,255,255,0.30)',
  active:    '#60A5FA',
  success:   '#34D399',
  error:     '#F87171',
  sublabel:  'rgba(255,255,255,0.45)',
  label:     'rgba(255,255,255,0.90)',
  fileref:   '#A78BFA',
  panelText: '#E2E8F0',
  panelDim:  '#94A3B8',
  border:    'rgba(255,255,255,0.08)',
}

// Concept pill colours
const CONCEPT_C = {
  '🔐': { bg: 'rgba(251,191,36,0.18)',  fg: '#FCD34D' },
  '💾': { bg: 'rgba(52,211,153,0.18)',  fg: '#34D399' },
  '🌐': { bg: 'rgba(96,165,250,0.18)',  fg: '#93C5FD' },
  '🔄': { bg: 'rgba(249,115,22,0.18)',  fg: '#FB923C' },
  '📧': { bg: 'rgba(167,139,250,0.18)', fg: '#C4B5FD' },
  '🖥': { bg: 'rgba(148,163,184,0.18)', fg: '#CBD5E1' },
  '⚡': { bg: 'rgba(251,191,36,0.18)',  fg: '#FCD34D' },
  '🗄': { bg: 'rgba(52,211,153,0.18)',  fg: '#6EE7B7' },
}

const WORKSPACE_ROOT = '/Users/rohithkarne/MIMS-CP Portal'
const STANDARD_LANES = [
  'Admin',
  'Frontend',
  'API Gateway / Router',
  'Middleware',
  'Backend',
  'Auth',
  'Cache (Redis)',
  'Database',
  'Queue / Jobs',
  'External Services',
  'File Storage',
]
const ENRICH_FLOW_TITLES = new Set(['Admin Login', 'Error — 401 Unauthorized'])
const VIRTUAL_LANE_TITLES = new Set(['Admin Login'])
const VIRTUAL_LANES = [
  'Admin',
  'Frontend',
  'API Gateway',
  'Middleware',
  'Backend',
  'Auth',
  'Cache',
  'Database',
  'Queue',
  'External',
  'File Storage',
]

function conceptStyle(tag) {
  if (!tag) return CONCEPT_C['🖥']
  for (const [emoji, s] of Object.entries(CONCEPT_C)) {
    if (tag.startsWith(emoji)) return s
  }
  return { bg: 'rgba(255,255,255,0.1)', fg: '#CBD5E1' }
}

function toVscodeLink(filePath, line) {
  if (!filePath) return null
  const abs = filePath.startsWith('/') ? filePath : `${WORKSPACE_ROOT}/${filePath}`
  return `vscode://file/${abs}${line ? `:${line}` : ''}`
}

function truncate(text, max) {
  if (!text) return '-'
  return text.length > max ? text.slice(0, max - 1) + '…' : text
}

function mapLaneName(name) {
  if (!name) return 'External Services'
  const n = name.toLowerCase()
  if (n.includes('admin') || n.includes('user')) return 'Admin'
  if (n.includes('front')) return 'Frontend'
  if (n.includes('gateway') || n.includes('router') || n.includes('api')) return 'API Gateway / Router'
  if (n.includes('middleware')) return 'Middleware'
  if (n.includes('back')) return 'Backend'
  if (n.includes('auth')) return 'Auth'
  if (n.includes('cache') || n.includes('redis')) return 'Cache (Redis)'
  if (n.includes('db') || n.includes('database')) return 'Database'
  if (n.includes('queue') || n.includes('job') || n.includes('scheduler')) return 'Queue / Jobs'
  if (n.includes('file') || n.includes('storage') || n.includes('document')) return 'File Storage'
  if (n.includes('external') || n.includes('email') || n.includes('notify') || n.includes('notification')) return 'External Services'
  return 'External Services'
}

function standardLaneIndex(name) {
  const mapped = mapLaneName(name)
  const idx = STANDARD_LANES.indexOf(mapped)
  return idx >= 0 ? idx : STANDARD_LANES.indexOf('External Services')
}

function inferTypeIcon(step) {
  const concept = step.concept || ''
  if (concept.startsWith('🔐')) return '🔐'
  if (concept.startsWith('💾')) return '🗄'
  if (concept.startsWith('🌐')) return '🌐'
  if (concept.startsWith('🔄')) return '🔄'
  if (concept.startsWith('🖥')) return '🖥'
  if (concept.startsWith('⚡')) return '⚡'
  if (concept.startsWith('📧')) return '✉️'
  return '🔧'
}

function inferStepType(step) {
  const concept = step.concept || ''
  if (concept.includes(' ')) return concept.split(' ').slice(1).join(' ')
  if (step.dbQuery) return 'DB'
  if (step.apiRoute) return 'API'
  return 'Step'
}

function inferStatus(step, logEntry) {
  const m = step.statusMeaning || ''
  const label = step.label || ''
  const hit = (m + ' ' + label).match(/\\b(401|403|404|422|500)\\b/)
  if (hit) return hit[1]
  if (step.type === 'dashed' && logEntry?.status_code) return String(logEntry.status_code)
  if (step.type === 'dashed') return '200'
  return '--'
}

function buildEnrichment(step, logEntry) {
  const status = inferStatus(step, logEntry)
  const latency = step.duration_ms != null ? `${step.duration_ms}ms`
    : logEntry?.duration_ms != null ? `${logEntry.duration_ms}ms` : (step.type === 'dashed' ? '8ms' : '15ms')
  const typeIcon = inferTypeIcon(step)
  const stepType = inferStepType(step)
  const req = truncate(step.requestBody || step.apiRoute || '', 28)
  const res = truncate(step.responseBody || step.statusMeaning || '', 28)
  const db  = truncate(step.dbQuery || '', 28)
  const failure = Number(status) >= 400 ? 'FAILED' : null
  return { latency, status, typeIcon, stepType, req, res, db, failure }
}

function stepColor(state) {
  return C[state] || C.idle
}

// ── Layout helpers ─────────────────────────────────────────────────────────────
function laneX(i)        { return PAD_X + i * LANE_W + LANE_W / 2 }
function totalWidth(n)   { return PAD_X * 2 + n * LANE_W }
function totalHeight(n)  { return TOP_STEP_GAP + n * STEP_H + FOOTER_PAD }
function stepY(i)        { return TOP_STEP_GAP + i * STEP_H }
function lifelineBottomY(svgH) { return svgH - FOOTER_PAD }


// ── SVG arrowhead markers ─────────────────────────────────────────────────────
function Defs() {
  return (
    <defs>
      {['idle','active','success','error'].map(s => (
        <marker key={s} id={`arr-${s}`} markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto">
          <path d="M0,0 L0,8 L10,4 z" fill={C[s]} />
        </marker>
      ))}
      {['idle','active','success','error'].map(s => (
        <marker key={`o-${s}`} id={`arr-open-${s}`} markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto">
          <path d="M0,0 L10,4 L0,8" fill="none" stroke={C[s]} strokeWidth="2" />
        </marker>
      ))}
    </defs>
  )
}

function shortFile(p) {
  if (!p) return null
  const parts = p.split('/')
  return parts.length >= 2 ? parts.slice(-2).join('/') : parts[parts.length - 1]
}

function wrapLabel(text, max) {
  if (!text || text.length <= max) return text ? [text] : []
  const words = text.split(' '); const lines = []; let cur = ''
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max) { if (cur) lines.push(cur); cur = w }
    else cur = (cur + ' ' + w).trim()
  }
  if (cur) lines.push(cur)
  return lines
}

// ── Single arrow ──────────────────────────────────────────────────────────────
function StepArrow({ step, idx, state, onClick, enrich, laneMap, yOverride }) {
  const rawFrom = Number.isInteger(step.from) ? step.from : 0
  const rawTo   = Number.isInteger(step.to) ? step.to : 0
  const fromIdx = laneMap ? (laneMap.get(rawFrom) ?? 0) : rawFrom
  const toIdx   = laneMap ? (laneMap.get(rawTo) ?? 0) : rawTo
  const fx    = laneX(fromIdx)
  const tx    = laneX(toIdx)
  const y     = yOverride != null ? yOverride : stepY(idx)
  const color = stepColor(state)
  const markerId = step.type === 'dashed'
    ? `url(#arr-open-${state})` : `url(#arr-${state})`

  const isSelf     = fromIdx === toIdx
  const labelLines = wrapLabel(step.label, 26)
  const routeLines = step.apiRoute ? wrapLabel(step.apiRoute, 32) : []
  const totalAbove = labelLines.length + routeLines.length
  const labelX     = isSelf ? fx + LOOP_W / 2 + 8 : (fx + tx) / 2
  const topY       = y - 14 - (totalAbove - 1) * 15
  const fileTag    = step.file ? `${shortFile(step.file)}${step.line ? ':'+step.line : ''}` : null
  const concept    = step.concept || null

  if (isSelf) {
    const path = `M ${fx} ${y} L ${fx + LOOP_W} ${y} L ${fx + LOOP_W} ${y + 34} L ${fx} ${y + 34}`
    let textY = y + 2
    return (
      <g onClick={onClick} style={{ cursor: 'pointer' }}>
        <path d={path} fill="none" stroke={color}
          strokeWidth={state === 'active' ? 3 : 2}
          strokeDasharray={step.type === 'dashed' ? '6,4' : undefined}
          markerEnd={markerId}
        />
        {labelLines.map((l, i) => (
          <text key={i} x={fx + LOOP_W + 8} y={textY + i * 14}
            fontSize="11" fill={state === 'idle' ? C.sublabel : color}
            fontWeight={state === 'active' ? 700 : 500}>{l}</text>
        ))}
        {routeLines.map((l, i) => (
          <text key={`r${i}`} x={fx + LOOP_W + 8} y={textY + (labelLines.length + i) * 14}
            fontSize="9" fill={state === 'idle' ? 'rgba(255,255,255,0.2)' : 'rgba(96,165,250,0.8)'}
            fontFamily="monospace">{l}</text>
        ))}
        {fileTag && (
          <a href={toVscodeLink(step.file, step.line)} target="_self" rel="noreferrer">
            <text x={fx + LOOP_W + 8} y={y + 40}
              fontSize="9" fill={state === 'idle' ? 'rgba(167,139,250,0.4)' : C.fileref}
              fontStyle="italic" style={{ cursor: 'pointer' }}>📄 {fileTag}</text>
          </a>
        )}
        {concept && (
          <text x={fx + LOOP_W + 8} y={y + 54}
            fontSize="9" fill={conceptStyle(concept).fg} opacity={state === 'idle' ? 0.5 : 1}>
            {concept}
          </text>
        )}
        {enrich && (
          <>
            <text x={fx + LOOP_W + 8} y={y + 68} fontSize="8" fill={C.sublabel}>
              ⏱ {enrich.latency} • {enrich.status} • {enrich.typeIcon} {enrich.stepType}
            </text>
            <text x={fx + LOOP_W + 8} y={y + 80} fontSize="8" fill={C.sublabel}>
              REQ {enrich.req} | RES {enrich.res} | DB {enrich.db}{enrich.failure ? ` | ${enrich.failure}` : ''}
            </text>
          </>
        )}
        <rect x={fx - 4} y={y - 6} width={LOOP_W + 140} height={68} fill="transparent" />
      </g>
    )
  }

  const sw = state === 'active' ? 3 : 2

  return (
    <g onClick={onClick} style={{ cursor: 'pointer' }}>
      {/* Active step highlight */}
      {state === 'active' && (
        <rect x={0} y={y - 38} width={totalWidth(20)} height={STEP_H - 20}
          fill="rgba(96,165,250,0.05)" style={{ pointerEvents: 'none' }} />
      )}

      {/* Arrow line */}
      <line x1={fx} y1={y} x2={tx} y2={y}
        stroke={color} strokeWidth={sw}
        strokeDasharray={step.type === 'dashed' ? '6,4' : undefined}
        markerEnd={markerId}
        style={state === 'active' ? { filter: `drop-shadow(0 0 6px ${color})` } : undefined}
      />

      {/* Label lines */}
      {labelLines.map((l, i) => (
        <text key={i} x={labelX} y={topY + i * 14}
          textAnchor="middle" fontSize="11"
          fill={state === 'idle' ? C.sublabel : color}
          fontWeight={state === 'active' ? 700 : 500}>{l}</text>
      ))}

      {/* API route — smaller monospace below label */}
      {routeLines.map((l, i) => (
        <text key={`r${i}`}
          x={labelX} y={topY + labelLines.length * 15 + i * 13}
          textAnchor="middle" fontSize="9"
          fill={state === 'idle' ? 'rgba(255,255,255,0.18)' : 'rgba(96,165,250,0.85)'}
          fontFamily="monospace">{l}</text>
      ))}

      {/* File reference */}
      {fileTag && (
        <a href={toVscodeLink(step.file, step.line)} target="_self" rel="noreferrer">
          <text x={labelX} y={y + 18}
          textAnchor="middle" fontSize="9"
          fill={state === 'idle' ? 'rgba(167,139,250,0.35)' : C.fileref}
          fontStyle="italic" style={{ cursor: 'pointer' }}>📄 {fileTag}</text>
        </a>
      )}

      {/* Concept tag */}
      {concept && (
        <text x={labelX} y={y + 32}
          textAnchor="middle" fontSize="9"
          fill={conceptStyle(concept).fg}
          opacity={state === 'idle' ? 0.4 : 0.9}>{concept}</text>
      )}
      {enrich && (
        <>
          <text x={labelX} y={y + 46} textAnchor="middle" fontSize="8" fill={C.sublabel}>
            ⏱ {enrich.latency} • {enrich.status} • {enrich.typeIcon} {enrich.stepType}
          </text>
          <text x={labelX} y={y + 58} textAnchor="middle" fontSize="8" fill={C.sublabel}>
            REQ {enrich.req} | RES {enrich.res} | DB {enrich.db}{enrich.failure ? ` | ${enrich.failure}` : ''}
          </text>
        </>
      )}

      {/* Step number badge */}
      {state !== 'idle' && (
        <>
          <circle cx={tx < fx ? tx + 16 : tx - 16} cy={y} r={11} fill={color} />
          <text x={tx < fx ? tx + 16 : tx - 16} y={y + 4}
            textAnchor="middle" fontSize="11" fill="#fff" fontWeight="700">{idx + 1}</text>
        </>
      )}

      {/* Success checkmark on completed steps */}
      {state === 'success' && (
        <text x={tx < fx ? tx + 16 : tx - 16} y={y + 4}
          textAnchor="middle" fontSize="10" fill="#fff" fontWeight="700">✓</text>
      )}

      {/* Click area */}
      <rect x={Math.min(fx, tx)} y={y - 36}
        width={Math.abs(tx - fx)} height={STEP_H - 10} fill="transparent" />
    </g>
  )
}

// (Flow/Component views removed — single Sequence view)

// ── Narrative builder ─────────────────────────────────────────────────────────
function buildNarrative(flow, upToIdx) {
  const steps = Array.isArray(flow?.steps) ? flow.steps : []
  const lanes = Array.isArray(flow?.swimlanes) ? flow.swimlanes : []
  return steps.slice(0, upToIdx + 1).map((step, i) => {
    const from = lanes[Number.isInteger(step.from) ? step.from : 0] || 'Actor'
    const to   = lanes[Number.isInteger(step.to) ? step.to : 0] || 'Actor'
    const isCurrent = i === upToIdx
    const isSelf    = step.from === step.to
    const isResp    = step.type === 'dashed'
    let sentence = ''
    if (from === 'User' || from === 'Admin') {
      sentence = `You (${from}) triggered — "${step.label}".`
    } else if (isSelf) {
      sentence = `${from} internally processes: ${step.label}.`
    } else if (isResp) {
      sentence = `${from} sends the result back to ${to}: ${step.label}.`
    } else {
      sentence = `${from} communicates to ${to}: ${step.label}.`
    }
    return { stepNum: i + 1, sentence, isCurrent, isResp }
  })
}

// ── Actor box (top only) ──────────────────────────────────────────────────────
function ActorBox({ name, cx, by }) {
  const bx = cx - BOX_W / 2
  return (
    <g>
      <rect x={bx} y={by} width={BOX_W} height={BOX_H} rx="8"
        fill={C.boxFill} stroke={C.boxBorder} strokeWidth="1.5" />
      <text x={cx} y={by + BOX_H / 2 + 4}
        textAnchor="middle" fontSize="11" fontWeight="700" fill={C.boxText}>{name}</text>
      {/* Connector dot */}
      <circle cx={cx} cy={by + BOX_H} r={4} fill={C.boxBorder} />
    </g>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function FlowDiagram({ flow: rawFlow, logEntry, onClose }) {
  const flow = useMemo(() => normalizeFlowTemplate(rawFlow), [rawFlow])
  const rawSteps = Array.isArray(flow?.steps) ? flow.steps : []
  const rawSwimlanes = Array.isArray(flow?.swimlanes) ? flow.swimlanes : []
  const remappedSteps = useMemo(() => {
    if (!rawSteps.length) return []
    return rawSteps.map(s => {
      const fromIdx = Number.isInteger(s?.from) ? s.from : 0
      const toIdx   = Number.isInteger(s?.to) ? s.to : 0
      const fromName = rawSwimlanes[fromIdx]
      const toName   = rawSwimlanes[toIdx]
      return {
        ...s,
        from: standardLaneIndex(fromName),
        to:   standardLaneIndex(toName),
      }
    })
  }, [rawSteps, rawSwimlanes])
  const steps = remappedSteps
  const swimlanes = STANDARD_LANES
  const [activeStep, setActiveStep] = useState(-1)
  const [detailStep, setDetailStep] = useState(null)

  const numSteps = steps.length
  const usedLaneSet = new Set()
  for (const s of steps) {
    if (Number.isInteger(s?.from)) usedLaneSet.add(s.from)
    if (Number.isInteger(s?.to))   usedLaneSet.add(s.to)
  }
  const usedLanes = Array.from(usedLaneSet).filter(i => i >= 0 && i < swimlanes.length).sort((a, b) => a - b)
  const compactLanes = usedLanes.length > 0 && usedLanes.length < swimlanes.length
  const renderLanes = compactLanes ? usedLanes.map(i => swimlanes[i]) : swimlanes
  const laneMap = compactLanes
    ? new Map(usedLanes.map((orig, idx) => [orig, idx]))
    : null

  const numLanes = renderLanes.length
  const seqW     = totalWidth(numLanes)
  const isError  = logEntry && logEntry.status_code >= 400
  const showEnrich = ENRICH_FLOW_TITLES.has(flow?.title || '')
  const showVirtualLanes = VIRTUAL_LANE_TITLES.has(flow?.title || '')
  const stepLayout = useMemo(() => {
    const layout = []
    let cur = TOP_STEP_GAP + 12
    for (const step of steps) {
      const labelLines = wrapLabel(step.label, 26)
      const routeLines = step.apiRoute ? wrapLabel(step.apiRoute, 32) : []
      const totalAbove = labelLines.length + routeLines.length
      const above = 14 + Math.max(0, totalAbove - 1) * 15
      let below = 18
      if (step.file) below = Math.max(below, 18)
      if (step.concept) below = Math.max(below, 32)
      if (showEnrich) below = Math.max(below, 58)
      const y = cur + above
      layout.push({ y, above, below, height: above + below })
      cur = y + below + 18
    }
    return { layout, height: cur + FOOTER_PAD }
  }, [steps, showEnrich])
  const seqH = stepLayout.height

  useEffect(() => { reset() }, [rawFlow])

  function stepState(i) {
    if (activeStep === -1) return 'idle'
    if (i < activeStep)   return isError && i === numSteps - 1 ? 'error' : 'success'
    if (i === activeStep) return isError && i === numSteps - 1 ? 'error' : 'active'
    return 'idle'
  }

  function reset()   { setActiveStep(-1); setDetailStep(null) }
  function stepFwd() { if (activeStep < numSteps - 1) setActiveStep(s => s + 1) }
  function stepBwd() { if (activeStep > 0) setActiveStep(s => s - 1) }
  function handleStepClick(i) { setActiveStep(i); setDetailStep(i) }

  // ── Export removed per UI requirements ─────────────────────────────────────

  const narrative    = detailStep !== null && flow ? buildNarrative(flow, detailStep) : null
  const selectedStep = detailStep !== null ? steps[detailStep] : null
  const selConcept   = selectedStep?.concept
  const selCS        = selConcept ? conceptStyle(selConcept) : null
  const derivedFiles = (() => {
    if (flow?.files && flow.files.length) return flow.files
    const uniq = new Map()
    for (const s of steps) {
      if (!s?.file) continue
      const key = `${s.file}:${s.line || ''}`
      if (!uniq.has(key)) {
        uniq.set(key, { path: s.file, role: 'Step source', lines: s.line ? String(s.line) : undefined })
      }
    }
    return Array.from(uniq.values())
  })()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.bg }}>

      {/* ── Header ── */}
      <div style={{ padding: '10px 16px 8px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 3,
                background: flow?.source === 'portal' ? 'rgba(59,130,246,0.2)' : 'rgba(107,63,160,0.2)',
                color:      flow?.source === 'portal' ? '#93C5FD' : '#C4B5FD' }}>
                {flow?.source === 'portal' ? 'PORTAL' : 'ADMIN'}
              </span>
              {flow?.isAutoGenerated && (
                <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 3,
                  background: 'rgba(251,191,36,0.15)', color: '#FCD34D' }}>AUTO-GENERATED</span>
              )}
              {isError && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 3,
                  background: 'rgba(248,113,113,0.2)', color: '#FCA5A5' }}>⚠ ERROR RESPONSE</span>
              )}
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#F1F5F9' }}>{flow?.title || 'Process Flow'}</h3>
            </div>
            <p style={{ margin: '3px 0 0', fontSize: 11, color: C.panelDim }}>{flow?.description || ''}</p>

            {logEntry && (
              <div style={{ display: 'flex', gap: 6, marginTop: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                  background: logEntry.method === 'GET' ? 'rgba(52,211,153,0.2)' : logEntry.method === 'DELETE' ? 'rgba(248,113,113,0.2)' : 'rgba(251,191,36,0.2)',
                  color:      logEntry.method === 'GET' ? '#34D399' : logEntry.method === 'DELETE' ? '#F87171' : '#FCD34D' }}>
                  {logEntry.method}
                </span>
                <span style={{ fontSize: 10, color: '#94A3B8', fontFamily: 'monospace',
                  background: 'rgba(255,255,255,0.07)', padding: '1px 6px', borderRadius: 3 }}>{logEntry.path}</span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                  background: logEntry.status_code < 400 ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)',
                  color:      logEntry.status_code < 400 ? '#34D399' : '#F87171' }}>
                  {logEntry.status_code}
                </span>
                {logEntry.duration_ms != null && (
                  <span style={{ fontSize: 10, color: C.panelDim }}>{logEntry.duration_ms}ms</span>
                )}
                {logEntry.created_at && (
                  <span style={{ fontSize: 10, color: C.panelDim }}>
                    {new Date(logEntry.created_at.includes('T') ? logEntry.created_at : logEntry.created_at.replace(' ', 'T') + 'Z')
                      .toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true })} IST
                  </span>
                )}
                {logEntry.error_message && (
                  <span style={{ fontSize: 10, color: '#F87171', fontFamily: 'monospace',
                    background: 'rgba(248,113,113,0.1)', padding: '1px 5px', borderRadius: 3 }}>
                    {logEntry.error_message}
                  </span>
                )}
              </div>
            )}
          </div>
          {onClose && (
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18,
              cursor: 'pointer', color: C.panelDim, padding: '0 2px', marginLeft: 8 }}>✕</button>
          )}
        </div>

        {derivedFiles.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: C.panelDim, fontWeight: 600, marginRight: 2 }}>FILES</span>
            {derivedFiles.map((f, i) => (
              <a key={i} href={toVscodeLink(f.path)} target="_self" rel="noreferrer"
                style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4,
                background: 'rgba(167,139,250,0.1)', color: '#A78BFA', fontFamily: 'monospace',
                border: '1px solid rgba(167,139,250,0.2)', textDecoration: 'none', cursor: 'pointer' }}>
                📄 {shortFile(f.path)}{f.lines ? `:${f.lines}` : ''}
                <span style={{ color: C.panelDim, fontFamily: 'sans-serif', fontStyle: 'italic' }}> · {f.role}</span>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* ── Controls ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px',
        borderBottom: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.2)', flexWrap: 'wrap', flexShrink: 0 }}>
        <button onClick={reset}   style={btn('rgba(255,255,255,0.08)','#CBD5E1')}>↺ Reset</button>
        <button onClick={stepBwd} disabled={activeStep <= 0} style={btn('rgba(255,255,255,0.08)','#CBD5E1')}>‹ Prev</button>
        <button onClick={stepFwd} disabled={activeStep >= numSteps - 1} style={btn('rgba(255,255,255,0.08)','#CBD5E1')}>Next ›</button>
        <span style={{ fontSize: 11, color: C.panelDim, fontWeight: 500 }}>
          {activeStep === -1 ? '💡 Click any step' : `Step ${activeStep + 1} / ${numSteps}`}
        </span>
      </div>

      {/* ── Diagram + Right Drawer ── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* SVG Diagram */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', background: C.bg }}>
          <div style={{ position: 'sticky', top: 0, zIndex: 2, background: C.bg, borderBottom: `1px solid ${C.border}` }}>
            <svg width={seqW} height={HEADER_BLOCK_H}
              style={{ display: 'block', minWidth: seqW }}
              fontFamily="Inter, system-ui, sans-serif">
              <rect width={seqW} height={HEADER_BLOCK_H} fill={C.bg} />
              {showVirtualLanes && (
                <>
                  {VIRTUAL_LANES.map((label, i) => {
                    const count = VIRTUAL_LANES.length
                    const x = PAD_X + (i * (seqW - PAD_X * 2)) / Math.max(count - 1, 1)
                    return (
                      <text key={label} x={x} y={12} textAnchor="middle"
                        fontSize="9" fill="rgba(148,163,184,0.7)">
                        {label}
                      </text>
                    )
                  })}
                </>
              )}
              {/* ── TOP actor boxes ── */}
              {renderLanes.map((name, i) => {
                const cx = laneX(i)
                const by = HEADER_H - BOX_H / 2
                return <ActorBox key={`top-${i}`} name={name} cx={cx} by={by} />
              })}
            </svg>
          </div>

          <div style={{ padding: '8px 0 0' }}>
            <svg width={seqW} height={seqH}
              style={{ display: 'block', minWidth: seqW }}
              fontFamily="Inter, system-ui, sans-serif">
              <Defs />
              <rect width={seqW} height={seqH} fill={C.bg} />

              {/* Subtle grid lines */}
              {renderLanes.map((_, i) => {
                const x = laneX(i)
                return (
                  <g key={i}>
                    {/* Column background stripe */}
                    <rect x={x - LANE_W/2} y={0} width={LANE_W} height={seqH}
                      fill={i % 2 === 0 ? 'rgba(255,255,255,0.012)' : 'transparent'} />
                    {/* Lifeline */}
                    <line x1={x} y1={0} x2={x} y2={lifelineBottomY(seqH)}
                      stroke={C.lifeline} strokeWidth={1.5} strokeDasharray="5,5" />
                  </g>
                )
              })}

              {/* ── Active step row highlight ── */}
              {activeStep >= 0 && stepLayout.layout[activeStep] && (
                <rect x={0}
                  y={stepLayout.layout[activeStep].y - stepLayout.layout[activeStep].above - 8}
                  width={seqW}
                  height={stepLayout.layout[activeStep].height + 16}
                  fill={isError && activeStep === numSteps - 1 ? 'rgba(248,113,113,0.05)' : 'rgba(96,165,250,0.05)'}
                  style={{ pointerEvents: 'none' }} />
              )}

              {/* ── Step arrows ── */}
              {steps.map((step, i) => (
                <StepArrow key={i} step={step} idx={i}
                  state={stepState(i)} onClick={() => handleStepClick(i)}
                  enrich={showEnrich ? buildEnrichment(step, logEntry) : null}
                  laneMap={laneMap}
                  yOverride={stepLayout.layout[i]?.y} />
              ))}
            </svg>
          </div>
        </div>

        {/* ── Detail Drawer (Right Side) ── */}
        <div style={{ width: 360, borderLeft: `2px solid ${C.border}`, flexShrink: 0,
          display: 'flex', flexDirection: 'column', background: C.bgMid, overflow: 'hidden',
          height: '100%', minHeight: 0 }}>

          {/* Drawer header (sticky) */}
          <div style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 14px 8px', borderBottom: `1px solid ${C.border}`, background: C.bgMid }}>
            {selectedStep ? (
              <>
                <span style={{
                  background: isError && detailStep === numSteps - 1 ? 'rgba(248,113,113,0.3)' : 'rgba(107,63,160,0.4)',
                  color: isError && detailStep === numSteps - 1 ? '#FCA5A5' : '#DDD6FE',
                  borderRadius: 12, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>
                  Step {detailStep + 1} of {numSteps}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#F1F5F9' }}>{selectedStep.label}</span>
              </>
            ) : (
              <span style={{ fontSize: 13, fontWeight: 700, color: '#F1F5F9' }}>Step Details</span>
            )}
          </div>

          <div style={{ padding: '12px 14px 48px', display: 'flex', flexDirection: 'column', gap: 14,
            overflowY: 'auto', flex: 1, minHeight: 0 }}>
            {!selectedStep && (
              <div style={{ fontSize: 12, color: C.panelDim }}>
                select a step to view the detailed overview
              </div>
            )}

            {selectedStep && (
              <>
                <div>
                  {selConcept && (
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                      background: selCS.bg, color: selCS.fg }}>{selConcept}</span>
                  )}
                  {isError && detailStep === numSteps - 1 && (
                    <div style={{ marginTop: 6, fontSize: 11, color: '#F87171', fontWeight: 600 }}>⚠ This step failed</div>
                  )}
                </div>

              <div>
                <div style={sectionLabel}>Journey so far</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {narrative.map(({ stepNum, sentence, isCurrent }) => (
                    <div
                      key={stepNum}
                      onClick={() => handleStepClick(stepNum - 1)}
                      style={{
                        display: 'flex', gap: 8, alignItems: 'flex-start',
                        cursor: 'pointer', padding: '2px 0'
                      }}
                    >
                      <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', fontSize: 10,
                        fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: isCurrent ? '#6B3FA0' : 'rgba(52,211,153,0.2)',
                        color: isCurrent ? '#fff' : '#34D399',
                        border: `2px solid ${isCurrent ? '#8B5CF6' : '#34D399'}` }}>
                        {isCurrent ? stepNum : '✓'}
                      </span>
                      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6,
                        color: isCurrent ? '#F1F5F9' : '#64748B',
                        fontWeight: isCurrent ? 700 : 400 }}>{sentence}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div style={sectionLabel}>What's happening</div>
                <p style={{ margin: '0 0 10px', fontSize: 13, color: '#CBD5E1', lineHeight: 1.7 }}>
                  {selectedStep.detail || 'No detail available for this step.'}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {selectedStep.apiRoute && (
                    <div style={infoRow}>
                      <span style={infoLabel}>🛣 Route</span>
                      <code style={codeTag}>{selectedStep.apiRoute}</code>
                    </div>
                  )}
                  {selectedStep.requestBody && (
                    <div style={infoRow}>
                      <span style={infoLabel}>📤 Request</span>
                      <code style={codeTag}>{selectedStep.requestBody}</code>
                    </div>
                  )}
                  {selectedStep.responseBody && (
                    <div style={infoRow}>
                      <span style={infoLabel}>📥 Response</span>
                      <code style={codeTag}>{selectedStep.responseBody}</code>
                    </div>
                  )}
                  {selectedStep.statusMeaning && (
                    <div style={infoRow}>
                      <span style={infoLabel}>✅ Status</span>
                      <span style={{ fontSize: 12, color: '#A7F3D0' }}>{selectedStep.statusMeaning}</span>
                    </div>
                  )}
                  {selectedStep.dbQuery && (
                    <div style={infoRow}>
                      <span style={infoLabel}>🗄 DB Query</span>
                      <code style={{ ...codeTag, color: '#6EE7B7' }}>{selectedStep.dbQuery}</code>
                    </div>
                  )}
                </div>

                {isError && detailStep === numSteps - 1 && logEntry?.error_message && (
                  <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(248,113,113,0.1)',
                    borderRadius: 6, border: '1px solid rgba(248,113,113,0.2)' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#F87171', marginBottom: 3 }}>Error Message</div>
                    <code style={{ fontSize: 12, color: '#FCA5A5' }}>{logEntry.error_message}</code>
                  </div>
                )}

                {selectedStep.file && (
                  <a href={toVscodeLink(selectedStep.file, selectedStep.line)} target="_self" rel="noreferrer"
                    style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '4px 10px', background: 'rgba(167,139,250,0.1)',
                      border: '1px solid rgba(167,139,250,0.2)', borderRadius: 6,
                      textDecoration: 'none', cursor: 'pointer' }}>
                    <span>📄</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#A78BFA', fontWeight: 600 }}>
                      {selectedStep.file}
                    </span>
                    {selectedStep.line && (
                      <span style={{ fontSize: 12, color: C.panelDim }}>· line {selectedStep.line}</span>
                    )}
                  </a>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {selectedStep.whyItExists && (
                  <div>
                    <div style={sectionLabel}>❓ Why this step exists</div>
                    <p style={learnText}>{selectedStep.whyItExists}</p>
                  </div>
                )}
                {selectedStep.whatCouldGoWrong && (
                  <div>
                    <div style={sectionLabel}>⚠ What could go wrong</div>
                    <p style={{ ...learnText, color: '#FCA5A5' }}>{selectedStep.whatCouldGoWrong}</p>
                  </div>
                )}
                {selectedStep.securityNote && (
                  <div>
                    <div style={sectionLabel}>🔒 Security note</div>
                    <p style={{ ...learnText, color: '#FCD34D' }}>{selectedStep.securityNote}</p>
                  </div>
                )}
                {selectedStep.beforeAfter && (
                  <div>
                    <div style={sectionLabel}>🔄 Before / After</div>
                    <p style={learnText}>
                      <span style={{ color: C.panelDim }}>Before: </span>{selectedStep.beforeAfter.before}<br />
                      <span style={{ color: '#34D399' }}>After: </span>{selectedStep.beforeAfter.after}
                    </p>
                  </div>
                )}
                {selectedStep.beginnerTip && (
                  <div>
                    <div style={sectionLabel}>💡 Beginner tip</div>
                    <p style={{ ...learnText, color: '#93C5FD' }}>{selectedStep.beginnerTip}</p>
                  </div>
                )}
                {selectedStep.commonMistake && (
                  <div>
                    <div style={sectionLabel}>❌ Common mistake</div>
                    <p style={{ ...learnText, color: '#F87171' }}>{selectedStep.commonMistake}</p>
                  </div>
                )}
              </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Style helpers ─────────────────────────────────────────────────────────────
function btn(bg, fg) {
  return { background: bg, color: fg, border: 'none', borderRadius: 5,
    padding: '5px 11px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }
}
const sectionLabel = {
  fontSize: 10, fontWeight: 700, color: '#64748B',
  textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6,
}
const learnText = {
  margin: 0, fontSize: 12, lineHeight: 1.65, color: '#CBD5E1',
}
const infoRow = {
  display: 'flex', alignItems: 'flex-start', gap: 8,
}
const infoLabel = {
  fontSize: 11, color: '#64748B', fontWeight: 600, flexShrink: 0, width: 72, paddingTop: 1,
}
const codeTag = {
  fontSize: 11, color: '#A78BFA', fontFamily: 'monospace',
  background: 'rgba(167,139,250,0.08)', padding: '2px 6px', borderRadius: 4,
  wordBreak: 'break-all',
}
