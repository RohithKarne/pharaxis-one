/**
 * FlowDiagram.jsx
 * Dark-theme animated sequence diagram — learning module.
 * Top actor boxes, concept tags and API routes on arrows,
 * rich 12-field detail drawer on step click.
 */

import { useState, useEffect, useMemo } from 'react'
import { normalizeFlowTemplate, buildSqlPlaybook } from './flowTemplates'
import { httpFetch } from '../../../shared/api/httpFetch.js'
import {
  buildEnrichment,
  conceptStyle,
  ENRICH_FLOW_TITLES,
  highlightSqlHtml,
  parseMethodAndPath,
  shortFile,
  sqlStatementType,
  standardLaneIndex,
  STANDARD_LANES,
  toVscodeLink,
  VIRTUAL_LANES,
  VIRTUAL_LANE_TITLES,
  wrapLabel,
} from './flowDiagramUtils'

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
  const stepFileLink = step.file ? toVscodeLink(step.file, step.line) : null

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
        {fileTag && stepFileLink && (
          <a href={stepFileLink} target="_self" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
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
      {fileTag && stepFileLink && (
        <a href={stepFileLink} target="_self" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
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
export default function FlowDiagram({ flow: rawFlow, flowKey, logEntry, authHeaders = null, sqlPolicy = null, onClose }) {
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
  const [showSqlModal, setShowSqlModal] = useState(false)
  const [sqlTab, setSqlTab] = useState('select')
  const [sqlEditor, setSqlEditor] = useState('')
  const [sqlParamsText, setSqlParamsText] = useState('{}')
  const [sqlConfirmationText, setSqlConfirmationText] = useState('')
  const [sqlTimeoutMs, setSqlTimeoutMs] = useState(5000)
  const [sqlLimitRows, setSqlLimitRows] = useState(200)
  const [sqlBusy, setSqlBusy] = useState(false)
  const [sqlResult, setSqlResult] = useState(null)
  const [sqlError, setSqlError] = useState('')
  const [sqlExplainResult, setSqlExplainResult] = useState(null)
  const [sqlValidationResult, setSqlValidationResult] = useState(null)
  const [sqlSavedQueries, setSqlSavedQueries] = useState([])
  const [sqlSavedName, setSqlSavedName] = useState('')
  const [sqlSavedDescription, setSqlSavedDescription] = useState('')
  const [sqlSavedCategory, setSqlSavedCategory] = useState('general')
  const [sqlSavedShared, setSqlSavedShared] = useState(false)
  const [sqlSelectedSavedId, setSqlSelectedSavedId] = useState('')
  const [sqlSchemaSummary, setSqlSchemaSummary] = useState(null)
  const [sqlSuggestResult, setSqlSuggestResult] = useState(null)
  const [sqlSuggestText, setSqlSuggestText] = useState('')
  const [sqlNlPrompt, setSqlNlPrompt] = useState('')
  const [sqlNlResult, setSqlNlResult] = useState(null)
  const [sqlAuditLogs, setSqlAuditLogs] = useState([])
  const [flowMapData, setFlowMapData] = useState(null)
  const [flowMapBusy, setFlowMapBusy] = useState(false)
  const [flowMapError, setFlowMapError] = useState('')
  const [opsRequests, setOpsRequests] = useState([])
  const [opsActionType, setOpsActionType] = useState('retry')
  const [opsEntityId, setOpsEntityId] = useState('')
  const [opsReason, setOpsReason] = useState('')
  const [opsRollbackSql, setOpsRollbackSql] = useState('')
  const [opsRollbackParamsText, setOpsRollbackParamsText] = useState('{}')
  const [opsConfirmationText, setOpsConfirmationText] = useState('')
  const [opsBusy, setOpsBusy] = useState(false)
  const [opsError, setOpsError] = useState('')
  const [opsSuccess, setOpsSuccess] = useState('')
  const [opsMetrics, setOpsMetrics] = useState(null)
  const [opsAnalytics, setOpsAnalytics] = useState(null)
  const [opsSnapshotRequestId, setOpsSnapshotRequestId] = useState('')
  const [opsSnapshots, setOpsSnapshots] = useState([])
  const [showSqlConfirmModal, setShowSqlConfirmModal] = useState(false)
  const [pendingSqlMode, setPendingSqlMode] = useState('')
  const [sqlConfirmPhrase, setSqlConfirmPhrase] = useState('')
  const [sqlGraphData, setSqlGraphData] = useState(null)
  const [sqlAutocompleteItems, setSqlAutocompleteItems] = useState([])

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

  useEffect(() => { reset() }, [flowKey])

  useEffect(() => {
    setFlowMapData(null)
    setFlowMapError('')
    setOpsRequests([])
    setOpsError('')
    setOpsSuccess('')
  }, [flowKey])

  useEffect(() => {
    if (!authHeaders) return
    loadOpsRequests()
    loadOpsMetrics()
    loadOpsAnalytics()
  }, [flowKey, authHeaders])

  useEffect(() => {
    if (!authHeaders) return
    loadOpsSnapshots()
  }, [authHeaders, opsSnapshotRequestId])

  function stepState(i) {
    if (activeStep === -1) return 'idle'
    if (i < activeStep)   return isError && i === numSteps - 1 ? 'error' : 'success'
    if (i === activeStep) return isError && i === numSteps - 1 ? 'error' : 'active'
    return 'idle'
  }

  function reset()   {
    if (numSteps > 0) { setActiveStep(0); setDetailStep(0) }
    else { setActiveStep(-1); setDetailStep(null) }
  }
  function stepFwd() {
    if (activeStep < numSteps - 1) {
      setActiveStep(s => {
        const next = s + 1
        setDetailStep(next)
        return next
      })
    }
  }
  function stepBwd() {
    if (activeStep > 0) {
      setActiveStep(s => {
        const next = s - 1
        setDetailStep(next)
        return next
      })
    }
  }
  function handleStepClick(i) { setActiveStep(i); setDetailStep(i) }

  // ── Export removed per UI requirements ─────────────────────────────────────

  const narrative    = detailStep !== null && flow ? buildNarrative(flow, detailStep) : null
  const selectedStep = detailStep !== null ? steps[detailStep] : null
  const sqlPlaybook = useMemo(() => buildSqlPlaybook(flow, logEntry), [flow, logEntry])
  const sqlTabs = Array.isArray(sqlPlaybook?.tabs) ? sqlPlaybook.tabs : []
  const activeSqlTab = sqlTabs.find((t) => t.key === sqlTab) || sqlTabs[0] || null
  const activeSqlEntries = Array.isArray(activeSqlTab?.entries) ? activeSqlTab.entries : []
  const sqlPreview = activeSqlEntries[0]?.sql || ''
  const editorStatementType = sqlStatementType(sqlEditor)
  const isEditorWrite = editorStatementType === 'INSERT' || editorStatementType === 'UPDATE'
  const dryRunBlocked = Boolean(
    sqlPolicy &&
    (
      (editorStatementType === 'SELECT' && !sqlPolicy.can_dry_run_select) ||
      (isEditorWrite && !sqlPolicy.can_dry_run_write)
    )
  )
  const executeBlocked = Boolean(
    sqlPolicy &&
    (
      (editorStatementType === 'SELECT' && !sqlPolicy.can_execute_select) ||
      (isEditorWrite && !sqlPolicy.can_execute_write)
    )
  )
  const sqlLineNumbers = useMemo(() => {
    const count = Math.max(1, String(sqlEditor || '').split('\n').length)
    return Array.from({ length: count }, (_v, i) => i + 1)
  }, [sqlEditor])

  useEffect(() => {
    if (showSqlModal) {
      setSqlEditor(sqlPreview)
      setSqlResult(null)
      setSqlError('')
      setSqlExplainResult(null)
      setSqlValidationResult(null)
      setSqlNlResult(null)
    }
  }, [showSqlModal, sqlPreview])

  useEffect(() => {
    if (!showSqlModal) return
    setSqlEditor(sqlPreview)
    setSqlResult(null)
    setSqlError('')
    setSqlExplainResult(null)
    setSqlValidationResult(null)
    setSqlNlResult(null)
  }, [sqlTab, sqlPreview, showSqlModal])

  useEffect(() => {
    if (!showSqlModal || !authHeaders) return
    let cancelled = false
    ;(async () => {
      try {
        const [savedRes, schemaRes, auditRes, graphRes] = await Promise.all([
          httpFetch('/api/admin/process-logs/sql/saved', { headers: authHeaders }),
          httpFetch('/api/admin/process-logs/sql/schema', { headers: authHeaders }),
          httpFetch('/api/admin/process-logs/sql/audit?limit=12', { headers: authHeaders }),
          httpFetch('/api/admin/process-logs/sql/graph', { headers: authHeaders }),
        ])
        const savedData = await savedRes.json()
        const schemaData = await schemaRes.json()
        const auditData = await auditRes.json()
        const graphData = await graphRes.json()
        if (cancelled) return
        if (savedRes.ok) {
          const rows = Array.isArray(savedData.saved_queries) ? savedData.saved_queries : []
          setSqlSavedQueries(rows)
          if (rows.length > 0 && !sqlSelectedSavedId) setSqlSelectedSavedId(String(rows[0].id))
        }
        if (schemaRes.ok) {
          const tables = Array.isArray(schemaData.tables) ? schemaData.tables : []
          const columns = Array.isArray(schemaData.columns) ? schemaData.columns : []
          const relationships = Array.isArray(schemaData.relationships) ? schemaData.relationships : []
          setSqlSchemaSummary({
            dbName: schemaData.db_name || 'pharaxis_mims_dev',
            tableCount: tables.length,
            columnCount: columns.length,
            relationshipCount: relationships.length,
          })
        }
        if (auditRes.ok) {
          setSqlAuditLogs(Array.isArray(auditData.logs) ? auditData.logs : [])
        }
        if (graphRes.ok) {
          setSqlGraphData(graphData || null)
        }
      } catch (_) {
        if (!cancelled) {
          setSqlSavedQueries([])
          setSqlSchemaSummary(null)
          setSqlAuditLogs([])
          setSqlGraphData(null)
        }
      }
    })()
    return () => { cancelled = true }
  }, [showSqlModal, authHeaders, sqlSelectedSavedId])

  useEffect(() => {
    if (!showSqlModal || !authHeaders) return
    const q = String(sqlEditor || '').trim().split(/\s+/).slice(-1)[0] || ''
    if (q.length < 2) {
      setSqlAutocompleteItems([])
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const res = await httpFetch(`/api/admin/process-logs/sql/suggest?q=${encodeURIComponent(q)}`, { headers: authHeaders })
        const data = await res.json()
        if (cancelled || !res.ok) return
        const items = []
        for (const t of (data.tables || [])) items.push({ type: 'table', value: t.table_name })
        for (const c of (data.columns || [])) items.push({ type: 'column', value: `${c.table_name}.${c.column_name}` })
        setSqlAutocompleteItems(items.slice(0, 10))
      } catch (_) {
        if (!cancelled) setSqlAutocompleteItems([])
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [showSqlModal, sqlEditor, authHeaders])

  async function runSql(mode) {
    setSqlError('')
    setSqlResult(null)
    const stmt = sqlStatementType(sqlEditor)
    if (!stmt) {
      setSqlError('Please enter SQL before running.')
      return
    }
    if (mode === 'dry_run' && dryRunBlocked) {
      setSqlError(`Dry run is blocked by SQL policy for ${stmt}.`)
      return
    }
    if (mode === 'execute' && executeBlocked) {
      setSqlError(`Execute is blocked by SQL policy for ${stmt}.`)
      return
    }
    let parsedParams = {}
    try {
      parsedParams = sqlParamsText.trim() ? JSON.parse(sqlParamsText) : {}
    } catch (_) {
      setSqlError('Invalid JSON in SQL params. Please provide valid JSON.')
      return
    }

    setSqlBusy(true)
    try {
      const res = await httpFetch('/api/admin/process-logs/sql/execute', {
        method: 'POST',
        headers: authHeaders || { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sql: sqlEditor,
          params: parsedParams,
          mode,
          timeout_ms: Number(sqlTimeoutMs) || 5000,
          limit_rows: Number(sqlLimitRows) || 200,
          confirmation_text: sqlConfirmationText,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSqlError(data.error || `SQL ${mode} failed.`)
        await refreshSqlAuditLogs()
        return
      }
      setSqlResult(data)
      await refreshSqlAuditLogs()
    } catch (_) {
      setSqlError('SQL request failed. Please check backend/server connectivity.')
    } finally {
      setSqlBusy(false)
    }
  }

  async function executeSql(mode) {
    const stmt = sqlStatementType(sqlEditor)
    if (!stmt) {
      setSqlError('Please enter SQL before running.')
      return
    }
    if (mode === 'execute' && (stmt === 'UPDATE' || stmt === 'INSERT')) {
      setPendingSqlMode(mode)
      setSqlConfirmPhrase('')
      setShowSqlConfirmModal(true)
      return
    }
    await runSql(mode)
  }

  async function refreshSqlAuditLogs() {
    try {
      const res = await httpFetch('/api/admin/process-logs/sql/audit?limit=12', { headers: authHeaders || { 'Content-Type': 'application/json' } })
      const data = await res.json()
      if (res.ok) {
        setSqlAuditLogs(Array.isArray(data.logs) ? data.logs : [])
      }
    } catch (_) {
      // ignore
    }
  }

  function inferRoutePayload() {
    if (logEntry?.method && logEntry?.path) {
      return { method: String(logEntry.method).toUpperCase(), path_pattern: String(logEntry.path).split('?')[0] }
    }
    for (const step of steps) {
      const parsed = parseMethodAndPath(step?.apiRoute)
      if (parsed) return { method: parsed.method, path_pattern: parsed.path }
    }
    return null
  }

  async function loadFlowMap() {
    setFlowMapError('')
    const payload = inferRoutePayload()
    if (!payload) {
      setFlowMapError('No route detected for this flow yet.')
      return
    }
    setFlowMapBusy(true)
    try {
      const res = await httpFetch('/api/admin/process-logs/flow-map', {
        method: 'POST',
        headers: authHeaders || { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        setFlowMapError(data.error || 'Failed to load flow map.')
        return
      }
      setFlowMapData(data)
    } catch (_) {
      setFlowMapError('Flow map request failed.')
    } finally {
      setFlowMapBusy(false)
    }
  }

  async function loadOpsRequests() {
    try {
      const res = await httpFetch('/api/admin/process-logs/ops/requests?limit=20', {
        headers: authHeaders || { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (res.ok) {
        const rows = Array.isArray(data.requests) ? data.requests : []
        setOpsRequests(rows)
        if (rows.length > 0 && !opsSnapshotRequestId) setOpsSnapshotRequestId(String(rows[0].id))
      }
    } catch (_) {
      // ignore
    }
  }

  async function loadOpsMetrics() {
    try {
      const res = await httpFetch('/api/admin/process-logs/ops/metrics', {
        headers: authHeaders || { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (res.ok) setOpsMetrics(data)
    } catch (_) {
      // ignore
    }
  }

  async function loadOpsAnalytics() {
    try {
      const res = await httpFetch('/api/admin/process-logs/ops/analytics', {
        headers: authHeaders || { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (res.ok) setOpsAnalytics(data)
    } catch (_) {
      // ignore
    }
  }

  async function loadOpsSnapshots() {
    if (!opsSnapshotRequestId) return
    try {
      const res = await httpFetch(`/api/admin/process-logs/ops/requests/${opsSnapshotRequestId}/snapshots`, {
        headers: authHeaders || { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (res.ok) setOpsSnapshots(Array.isArray(data.snapshots) ? data.snapshots : [])
    } catch (_) {
      setOpsSnapshots([])
    }
  }

  async function createOpsRequest() {
    setOpsError('')
    setOpsSuccess('')
    const routeInfo = inferRoutePayload()
    if (!routeInfo) {
      setOpsError('Route context missing for this flow.')
      return
    }
    if (String(opsReason || '').trim().length < 10) {
      setOpsError('Reason must be at least 10 characters.')
      return
    }
    let rollbackParams = {}
    try {
      rollbackParams = opsRollbackParamsText.trim() ? JSON.parse(opsRollbackParamsText) : {}
    } catch (_) {
      setOpsError('Rollback params JSON is invalid.')
      return
    }
    setOpsBusy(true)
    try {
      const res = await httpFetch('/api/admin/process-logs/ops/request', {
        method: 'POST',
        headers: authHeaders || { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action_type: opsActionType,
          route_method: routeInfo.method,
          route_path_pattern: routeInfo.path_pattern,
          entity_type: 'flow',
          entity_id: opsEntityId || null,
          reason: opsReason,
          request_payload: {
            flow_title: flow?.title || 'Flow',
            flow_key: flowKey || null,
            rollback_sql: opsActionType === 'rollback' ? String(opsRollbackSql || '') : null,
            rollback_params: opsActionType === 'rollback' ? rollbackParams : {},
          },
          confirmation_text: opsConfirmationText,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setOpsError(data.error || 'Failed to create safe operation request.')
        return
      }
      setOpsSuccess(`Request #${data.request_id} created (${data.status}).`)
      setOpsReason('')
      setOpsRollbackSql('')
      await loadOpsRequests()
      await loadOpsMetrics()
      await loadOpsAnalytics()
    } catch (_) {
      setOpsError('Safe operation request failed.')
    } finally {
      setOpsBusy(false)
    }
  }

  async function approveOpsRequest(id) {
    setOpsError('')
    setOpsSuccess('')
    setOpsBusy(true)
    try {
      const res = await httpFetch(`/api/admin/process-logs/ops/requests/${id}/approve`, {
        method: 'POST',
        headers: authHeaders || { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation_text: opsConfirmationText }),
      })
      const data = await res.json()
      if (!res.ok) {
        setOpsError(data.error || 'Approve failed.')
        return
      }
      setOpsSuccess(`Request #${id} status updated to ${data.status || 'approved'}.`)
      await loadOpsRequests()
      await loadOpsMetrics()
      await loadOpsAnalytics()
      setOpsSnapshotRequestId(String(id))
      await loadOpsSnapshots()
    } catch (_) {
      setOpsError('Approve request failed.')
    } finally {
      setOpsBusy(false)
    }
  }

  async function rejectOpsRequest(id) {
    setOpsError('')
    setOpsSuccess('')
    setOpsBusy(true)
    try {
      const rejectReason = String(opsReason || '').trim() || 'Rejected from Process Explorer UI'
      const res = await httpFetch(`/api/admin/process-logs/ops/requests/${id}/reject`, {
        method: 'POST',
        headers: authHeaders || { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason }),
      })
      const data = await res.json()
      if (!res.ok) {
        setOpsError(data.error || 'Reject failed.')
        return
      }
      setOpsSuccess(`Request #${id} rejected.`)
      await loadOpsRequests()
      await loadOpsMetrics()
      await loadOpsAnalytics()
    } catch (_) {
      setOpsError('Reject request failed.')
    } finally {
      setOpsBusy(false)
    }
  }

  async function runSqlExplain() {
    setSqlError('')
    setSqlExplainResult(null)
    try {
      const res = await httpFetch('/api/admin/process-logs/sql/explain', {
        method: 'POST',
        headers: authHeaders || { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: sqlEditor }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSqlError(data.error || 'SQL explain failed.')
        return
      }
      setSqlExplainResult(data)
    } catch (_) {
      setSqlError('Explain request failed.')
    }
  }

  async function runSqlValidate() {
    setSqlError('')
    setSqlValidationResult(null)
    try {
      const res = await httpFetch('/api/admin/process-logs/sql/validate', {
        method: 'POST',
        headers: authHeaders || { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: sqlEditor }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSqlError(data.error || 'SQL validation failed.')
        return
      }
      setSqlValidationResult(data)
    } catch (_) {
      setSqlError('Validation request failed.')
    }
  }

  async function runSqlSuggest() {
    try {
      const q = encodeURIComponent(sqlSuggestText || '')
      const res = await httpFetch(`/api/admin/process-logs/sql/suggest?q=${q}`, { headers: authHeaders || { 'Content-Type': 'application/json' } })
      const data = await res.json()
      if (!res.ok) {
        setSqlError(data.error || 'Suggestion fetch failed.')
        return
      }
      setSqlSuggestResult(data)
    } catch (_) {
      setSqlError('Suggestion request failed.')
    }
  }

  async function runNlToSql() {
    setSqlError('')
    setSqlNlResult(null)
    try {
      const res = await httpFetch('/api/admin/process-logs/sql/nl2sql', {
        method: 'POST',
        headers: authHeaders || { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: sqlNlPrompt }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSqlError(data.error || 'NL-to-SQL generation failed.')
        return
      }
      setSqlNlResult(data)
    } catch (_) {
      setSqlError('NL-to-SQL request failed.')
    }
  }

  async function saveCurrentSql() {
    setSqlError('')
    const name = String(sqlSavedName || '').trim()
    if (!name) {
      setSqlError('Saved query name is required.')
      return
    }
    try {
      const res = await httpFetch('/api/admin/process-logs/sql/saved', {
        method: 'POST',
        headers: authHeaders || { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: sqlSavedDescription,
          category: sqlSavedCategory || 'general',
          sql_text: sqlEditor,
          is_shared: sqlSavedShared,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSqlError(data.error || 'Save SQL query failed.')
        return
      }
      const listRes = await httpFetch('/api/admin/process-logs/sql/saved', { headers: authHeaders || { 'Content-Type': 'application/json' } })
      const listData = await listRes.json()
      if (listRes.ok) {
        const rows = Array.isArray(listData.saved_queries) ? listData.saved_queries : []
        setSqlSavedQueries(rows)
        if (data.id) setSqlSelectedSavedId(String(data.id))
      }
      await refreshSqlAuditLogs()
    } catch (_) {
      setSqlError('Save query request failed.')
    }
  }

  function loadSelectedSavedQuery() {
    const row = sqlSavedQueries.find((r) => String(r.id) === String(sqlSelectedSavedId))
    if (!row) return
    setSqlEditor(String(row.sql_text || ''))
    setSqlSavedName(String(row.name || ''))
    setSqlSavedDescription(String(row.description || ''))
    setSqlSavedCategory(String(row.category || 'general'))
    setSqlSavedShared(Boolean(row.is_shared))
  }
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
                background: flow?.source === 'mims'
                    ? 'rgba(16,185,129,0.18)'
                    : 'rgba(107,63,160,0.2)',
                color: flow?.source === 'mims'
                    ? '#6EE7B7'
                    : '#C4B5FD' }}>
                {flow?.source === 'mims' ? 'MIMS' : 'ADMIN'}
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
              <button
                onClick={() => {
                  setSqlTab(sqlTabs[0]?.key || 'select')
                  setShowSqlModal(true)
                }}
                style={{
                  border: '1px solid rgba(59,130,246,0.45)',
                  background: 'rgba(59,130,246,0.15)',
                  color: '#93C5FD',
                  borderRadius: 5,
                  padding: '2px 8px',
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: 'pointer',
                  letterSpacing: '0.06em',
                }}
              >
                SQL
              </button>
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
            {derivedFiles.map((f, i) => {
              const link = toVscodeLink(f.path)
              if (!link) return null
              return (
                <a key={i} href={link} target="_self" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                  style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4,
                  background: 'rgba(167,139,250,0.1)', color: '#A78BFA', fontFamily: 'monospace',
                  border: '1px solid rgba(167,139,250,0.2)', textDecoration: 'none', cursor: 'pointer' }}>
                  📄 {shortFile(f.path)}{f.lines ? `:${f.lines}` : ''}
                  <span style={{ color: C.panelDim, fontFamily: 'sans-serif', fontStyle: 'italic' }}> · {f.role}</span>
                </a>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Controls ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px',
        borderBottom: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.2)', flexWrap: 'wrap', flexShrink: 0 }}>
        <button onClick={reset}   style={btn('rgba(255,255,255,0.08)','#CBD5E1')}>↺ Reset</button>
        <button onClick={stepBwd} disabled={activeStep <= 0} style={btn('rgba(255,255,255,0.08)','#CBD5E1')}>‹ Prev</button>
        <button onClick={stepFwd} disabled={activeStep >= numSteps - 1} style={btn('rgba(255,255,255,0.08)','#CBD5E1')}>Next ›</button>
        <button
          onClick={loadFlowMap}
          disabled={flowMapBusy}
          style={btn('rgba(14,165,233,0.18)', '#67E8F9')}
        >
          {flowMapBusy ? 'Loading Map…' : 'Flow Data Overlay'}
        </button>
        <span style={{ fontSize: 11, color: C.panelDim, fontWeight: 500 }}>
          {activeStep === -1 ? '💡 Click any step' : `Step ${activeStep + 1} / ${numSteps}`}
        </span>
      </div>

      {(flowMapData || flowMapError) && (
        <div style={{
          padding: '8px 16px',
          borderBottom: `1px solid ${C.border}`,
          background: 'rgba(8,47,73,0.38)',
          display: 'grid',
          gridTemplateColumns: '2fr 1fr',
          gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#7DD3FC', marginBottom: 4 }}>
              Flow Mapping
            </div>
            {flowMapError && <div style={{ fontSize: 11, color: '#FCA5A5' }}>{flowMapError}</div>}
            {flowMapData && (
              <>
                <div style={{ fontSize: 11, color: '#E2E8F0' }}>
                  {flowMapData.route?.method} {flowMapData.route?.path_pattern} · {flowMapData.route?.source_module || 'module n/a'}
                </div>
                <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 3 }}>
                  Route file: {flowMapData.route?.route_file || 'derived'} · Events(30d): {flowMapData.telemetry?.events_30d || 0}
                </div>
                <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(flowMapData.mapped_tables || []).slice(0, 10).map((t) => (
                    <span
                      key={t.table_name}
                      style={{
                        fontSize: 10,
                        color: '#BAE6FD',
                        background: 'rgba(14,116,144,0.25)',
                        border: '1px solid rgba(103,232,249,0.35)',
                        borderRadius: 10,
                        padding: '2px 7px',
                      }}
                    >
                      {t.table_name} ({t.approx_rows ?? 0})
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#7DD3FC', marginBottom: 4 }}>
              Services
            </div>
            {(flowMapData?.service_stages || []).map((s) => (
              <div key={s.key} style={{ fontSize: 10, color: '#E2E8F0', marginBottom: 3 }}>
                {s.label} · {s.status}
              </div>
            ))}
            {flowMapData?.relationships && (
              <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 4 }}>
                Relationships: {flowMapData.relationships.length}
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{
        padding: '8px 16px',
        borderBottom: `1px solid ${C.border}`,
        background: 'rgba(30,41,59,0.45)',
        display: 'grid',
        gridTemplateColumns: '1.4fr 1fr',
        gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#A7F3D0', marginBottom: 6 }}>
            One-Click Safe Ops (Approval Workflow)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 140px 1fr 180px 190px', gap: 6 }}>
            <select
              value={opsActionType}
              onChange={(e) => setOpsActionType(e.target.value)}
              style={{ border: '1px solid #334155', borderRadius: 6, background: '#0F172A', color: '#E2E8F0', padding: '6px 8px', fontSize: 11 }}
            >
              <option value='retry'>retry</option>
              <option value='reprocess'>reprocess</option>
              <option value='rollback'>rollback</option>
            </select>
            <input
              value={opsEntityId}
              onChange={(e) => setOpsEntityId(e.target.value)}
              placeholder='Entity ID (optional)'
              style={{ border: '1px solid #334155', borderRadius: 6, background: '#0F172A', color: '#E2E8F0', padding: '6px 8px', fontSize: 11 }}
            />
            <input
              value={opsReason}
              onChange={(e) => setOpsReason(e.target.value)}
              placeholder='Reason (mandatory, min 10 chars)'
              style={{ border: '1px solid #334155', borderRadius: 6, background: '#0F172A', color: '#E2E8F0', padding: '6px 8px', fontSize: 11 }}
            />
            <input
              value={opsConfirmationText}
              onChange={(e) => setOpsConfirmationText(e.target.value)}
              placeholder='CONFIRM SAFE OPS'
              style={{ border: '1px solid #334155', borderRadius: 6, background: '#0F172A', color: '#E2E8F0', padding: '6px 8px', fontSize: 11 }}
            />
            <button
              onClick={createOpsRequest}
              disabled={opsBusy}
              style={{
                border: '1px solid #22C55E',
                borderRadius: 6,
                background: 'rgba(34,197,94,0.16)',
                color: '#86EFAC',
                padding: '6px 8px',
                fontSize: 11,
                fontWeight: 700,
                cursor: opsBusy ? 'default' : 'pointer',
                opacity: opsBusy ? 0.65 : 1,
              }}
            >
              {opsBusy ? 'Submitting…' : 'Create Ops Request'}
            </button>
          </div>
          {opsActionType === 'rollback' && (
            <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <input
                value={opsRollbackSql}
                onChange={(e) => setOpsRollbackSql(e.target.value)}
                placeholder='Optional rollback SQL (UPDATE ... WHERE ...)'
                style={{ border: '1px solid #334155', borderRadius: 6, background: '#0F172A', color: '#E2E8F0', padding: '6px 8px', fontSize: 11 }}
              />
              <input
                value={opsRollbackParamsText}
                onChange={(e) => setOpsRollbackParamsText(e.target.value)}
                placeholder='Rollback params JSON, e.g. {"id":10,"org_id":1}'
                style={{ border: '1px solid #334155', borderRadius: 6, background: '#0F172A', color: '#E2E8F0', padding: '6px 8px', fontSize: 11 }}
              />
            </div>
          )}
          {opsError && <div style={{ marginTop: 6, fontSize: 11, color: '#FCA5A5' }}>{opsError}</div>}
          {opsSuccess && <div style={{ marginTop: 6, fontSize: 11, color: '#86EFAC' }}>{opsSuccess}</div>}
          <div style={{ marginTop: 5, fontSize: 10, color: '#94A3B8' }}>
            Non-prod confirmation: <strong>CONFIRM SAFE OPS</strong> · Prod confirmation: <strong>CONFIRM SAFE OPS PROD</strong>
          </div>
          <div style={{ marginTop: 5, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              onClick={() => setOpsRollbackSql('UPDATE picklists SET is_active = 1, updated_at = NOW() WHERE id = :id AND org_id = :org_id')}
              style={{ border: '1px solid #475569', background: 'rgba(148,163,184,0.12)', color: '#CBD5E1', borderRadius: 4, padding: '3px 7px', fontSize: 10, cursor: 'pointer' }}
            >
              Script: Rollback Picklist
            </button>
            <button
              onClick={() => setOpsRollbackSql('UPDATE cases SET status = :status, updated_at = NOW() WHERE id = :id AND org_id = :org_id')}
              style={{ border: '1px solid #475569', background: 'rgba(148,163,184,0.12)', color: '#CBD5E1', borderRadius: 4, padding: '3px 7px', fontSize: 10, cursor: 'pointer' }}
            >
              Script: Rollback Case Status
            </button>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#A7F3D0', marginBottom: 6 }}>
            Ops Requests (Latest)
          </div>
          <div style={{ maxHeight: 116, overflow: 'auto', border: '1px solid rgba(148,163,184,0.25)', borderRadius: 6, padding: 6 }}>
            {(opsRequests || []).length === 0 && (
              <div style={{ fontSize: 10, color: '#94A3B8' }}>No requests yet.</div>
            )}
            {(opsRequests || []).slice(0, 12).map((r) => (
              <div key={r.id} style={{ fontSize: 10, color: '#E2E8F0', padding: '3px 0', borderBottom: '1px solid rgba(148,163,184,0.12)' }}>
                #{r.id} · {r.action_type} · {r.status}
                {String(sqlPolicy?.role || '').toLowerCase() === 'superadmin' && String(r.status || '').includes('pending') && (
                  <span style={{ marginLeft: 6, display: 'inline-flex', gap: 4 }}>
                    <button
                      onClick={() => approveOpsRequest(r.id)}
                      style={{ border: '1px solid #22C55E', background: 'rgba(34,197,94,0.14)', color: '#86EFAC', borderRadius: 4, padding: '1px 6px', fontSize: 10, cursor: 'pointer' }}
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => rejectOpsRequest(r.id)}
                      style={{ border: '1px solid #F87171', background: 'rgba(248,113,113,0.14)', color: '#FCA5A5', borderRadius: 4, padding: '1px 6px', fontSize: 10, cursor: 'pointer' }}
                    >
                      Reject
                    </button>
                  </span>
                )}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 6, border: '1px solid rgba(148,163,184,0.25)', borderRadius: 6, padding: 6 }}>
            <div style={{ fontSize: 10, color: '#A7F3D0', marginBottom: 4, fontWeight: 700 }}>Ops Metrics (30d)</div>
            <div style={{ fontSize: 10, color: '#E2E8F0' }}>
              Total: {opsMetrics?.totals?.total || 0} · Executed: {opsMetrics?.totals?.executed || 0} · Rejected: {opsMetrics?.totals?.rejected || 0}
            </div>
            <div style={{ marginTop: 4, fontSize: 10, color: '#94A3B8' }}>
              {(opsMetrics?.action_breakdown || []).map((x) => `${x.action_type}:${x.total}`).join(' · ') || 'No action data'}
            </div>
            <div style={{ marginTop: 4, fontSize: 10, color: '#94A3B8' }}>
              {(opsAnalytics?.resolution_by_action || []).map((x) => `${x.action_type}:${Math.round(Number(x.avg_resolution_seconds || 0))}s`).join(' · ') || 'No resolution data'}
            </div>
            <div style={{ marginTop: 4, maxHeight: 44, overflow: 'auto', fontSize: 10, color: '#CBD5E1' }}>
              {(opsAnalytics?.daily || []).slice(-5).map((d) => (
                <div key={`ops-day-${d.day}`}>
                  {String(d.day).slice(0, 10)} total:{d.total} exec:{d.executed} rej:{d.rejected} pend:{d.pending}
                </div>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 6, border: '1px solid rgba(148,163,184,0.25)', borderRadius: 6, padding: 6 }}>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: '#A7F3D0', fontWeight: 700 }}>Time-Travel Snapshot</span>
              <select
                value={opsSnapshotRequestId}
                onChange={(e) => setOpsSnapshotRequestId(e.target.value)}
                style={{ flex: 1, border: '1px solid #334155', borderRadius: 4, background: '#0F172A', color: '#E2E8F0', fontSize: 10, padding: '2px 4px' }}
              >
                {(opsRequests || []).map((r) => (
                  <option key={`snap-${r.id}`} value={String(r.id)}>#{r.id} {r.action_type}</option>
                ))}
              </select>
              <button
                onClick={loadOpsSnapshots}
                style={{ border: '1px solid #334155', background: 'rgba(148,163,184,0.15)', color: '#CBD5E1', borderRadius: 4, padding: '2px 6px', fontSize: 10, cursor: 'pointer' }}
              >
                Load
              </button>
            </div>
            <div style={{ marginTop: 4, maxHeight: 74, overflow: 'auto' }}>
              {(opsSnapshots || []).slice(-10).map((s) => (
                <div key={`snap-row-${s.id}`} style={{ fontSize: 10, color: '#CBD5E1' }}>
                  {s.snapshot_phase} · {s.table_name} · rows={s.row_count}
                </div>
              ))}
            </div>
          </div>
        </div>
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

              {/* ── Row click hotspots (top layer for reliable step selection) ── */}
              {steps.map((_, i) => {
                const slot = stepLayout.layout[i]
                if (!slot) return null
                const top = slot.y - slot.above - 8
                const height = slot.height + 16
                return (
                  <rect
                    key={`hotspot-${i}`}
                    x={0}
                    y={top}
                    width={seqW}
                    height={height}
                    fill="transparent"
                    style={{ cursor: 'pointer', pointerEvents: 'all' }}
                    onClick={() => handleStepClick(i)}
                  />
                )
              })}
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

                {selectedStep.file && toVscodeLink(selectedStep.file, selectedStep.line) && (
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

      {showSqlModal && (
        <div
          onClick={() => setShowSqlModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(2,6,23,0.72)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(1560px, 99vw)',
              height: 'min(920px, 97vh)',
              background: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: 10,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 14px',
              borderBottom: `1px solid ${C.border}`,
              background: '#F8FAFC',
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>
                  SQL Playbook · {sqlPlaybook?.title || 'MIMS Flow'}
                </div>
                <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>
                  Route: {sqlPlaybook?.route || 'Derived route'} · Primary table: {sqlPlaybook?.primaryTable || 'resource_items'}
                </div>
              </div>
              <button
                onClick={() => setShowSqlModal(false)}
                style={{
                  border: '1px solid #CBD5E1',
                  background: 'transparent',
                  color: '#334155',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>

            <div style={{
              display: 'flex',
              gap: 6,
              padding: '10px 12px 8px',
              borderBottom: `1px solid ${C.border}`,
              background: '#F1F5F9',
              overflowX: 'auto',
              flexShrink: 0,
            }}>
              <button
                onClick={() => {
                  setSqlEditor(sqlPreview)
                  setSqlResult(null)
                  setSqlError('')
                }}
                style={{
                  border: '1px solid #CBD5E1',
                  background: '#FFFFFF',
                  color: '#334155',
                  borderRadius: 6,
                  padding: '5px 10px',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Use First Query
              </button>
              {sqlTabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setSqlTab(tab.key)}
                  style={{
                    border: `1px solid ${sqlTab === tab.key ? '#3B82F6' : '#CBD5E1'}`,
                    background: sqlTab === tab.key ? '#DBEAFE' : '#FFFFFF',
                    color: sqlTab === tab.key ? '#1E40AF' : '#334155',
                    borderRadius: 18,
                    padding: '5px 11px',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div style={{
              padding: 12,
              borderBottom: '1px solid #E2E8F0',
              background: '#FFFFFF',
              display: 'grid',
              gridTemplateColumns: '1fr',
              gap: 8,
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 0.8fr', gap: 8 }}>
                <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 8, background: '#F8FAFC' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>Saved Queries</div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <select
                      value={sqlSelectedSavedId}
                      onChange={(e) => setSqlSelectedSavedId(e.target.value)}
                      style={{
                        flex: 1,
                        border: '1px solid #CBD5E1',
                        borderRadius: 6,
                        padding: '6px 8px',
                        fontSize: 12,
                        background: '#FFFFFF',
                      }}
                    >
                      {(sqlSavedQueries || []).map((row) => (
                        <option key={row.id} value={String(row.id)}>{row.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={loadSelectedSavedQuery}
                      style={{
                        border: '1px solid #CBD5E1',
                        background: '#FFFFFF',
                        color: '#334155',
                        borderRadius: 6,
                        padding: '6px 10px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Load
                    </button>
                  </div>
                  <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <input
                      value={sqlSavedName}
                      onChange={(e) => setSqlSavedName(e.target.value)}
                      placeholder='Query name'
                      style={{ border: '1px solid #CBD5E1', borderRadius: 6, padding: '6px 8px', fontSize: 12 }}
                    />
                    <input
                      value={sqlSavedCategory}
                      onChange={(e) => setSqlSavedCategory(e.target.value)}
                      placeholder='Category'
                      style={{ border: '1px solid #CBD5E1', borderRadius: 6, padding: '6px 8px', fontSize: 12 }}
                    />
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                    <input
                      value={sqlSavedDescription}
                      onChange={(e) => setSqlSavedDescription(e.target.value)}
                      placeholder='Short description'
                      style={{ flex: 1, border: '1px solid #CBD5E1', borderRadius: 6, padding: '6px 8px', fontSize: 12 }}
                    />
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#334155' }}>
                      <input type='checkbox' checked={sqlSavedShared} onChange={(e) => setSqlSavedShared(e.target.checked)} />
                      Shared
                    </label>
                    <button
                      onClick={saveCurrentSql}
                      style={{
                        border: '1px solid #2563EB',
                        background: '#DBEAFE',
                        color: '#1E40AF',
                        borderRadius: 6,
                        padding: '6px 10px',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Save
                    </button>
                  </div>
                </div>
                <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 8, background: '#F8FAFC' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>Schema Awareness</div>
                  {sqlSchemaSummary ? (
                    <div style={{ fontSize: 11, color: '#334155', lineHeight: 1.5 }}>
                      <div>DB: <strong>{sqlSchemaSummary.dbName}</strong></div>
                      <div>Tables: <strong>{sqlSchemaSummary.tableCount}</strong></div>
                      <div>Columns: <strong>{sqlSchemaSummary.columnCount}</strong></div>
                      <div>Relationships: <strong>{sqlSchemaSummary.relationshipCount}</strong></div>
                      <div style={{ marginTop: 4, color: '#475569' }}>
                        Join Graph Nodes: <strong>{sqlGraphData?.nodes?.length || 0}</strong>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: '#64748B' }}>Loading schema metadata...</div>
                  )}
                </div>
                <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 8, background: '#F8FAFC' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>NL to SQL</div>
                  <input
                    value={sqlNlPrompt}
                    onChange={(e) => setSqlNlPrompt(e.target.value)}
                    placeholder='e.g. show failed cases today'
                    style={{ width: '100%', border: '1px solid #CBD5E1', borderRadius: 6, padding: '6px 8px', fontSize: 12 }}
                  />
                  <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                    <button
                      onClick={runNlToSql}
                      style={{
                        border: '1px solid #0EA5E9',
                        background: '#E0F2FE',
                        color: '#075985',
                        borderRadius: 6,
                        padding: '6px 10px',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Generate
                    </button>
                    <button
                      onClick={() => {
                        if (sqlNlResult?.sql) setSqlEditor(sqlNlResult.sql)
                      }}
                      style={{
                        border: '1px solid #CBD5E1',
                        background: '#FFFFFF',
                        color: '#334155',
                        borderRadius: 6,
                        padding: '6px 10px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Use SQL
                    </button>
                  </div>
                </div>
              </div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#334155' }}>SQL Executor</label>
              {sqlPolicy && (
                <div style={{
                  border: '1px solid #BFDBFE',
                  background: '#EFF6FF',
                  color: '#1E3A8A',
                  borderRadius: 6,
                  padding: '8px 10px',
                  fontSize: 11,
                  lineHeight: 1.4,
                }}>
                  Role: <strong>{sqlPolicy.role || 'unknown'}</strong> · Env: <strong>{sqlPolicy.environment || 'dev'}</strong> ·
                  Types: <strong>{Array.isArray(sqlPolicy.statement_types) ? sqlPolicy.statement_types.join(', ') : 'SELECT, INSERT, UPDATE'}</strong> ·
                  Execute write: <strong>{sqlPolicy.can_execute_write ? 'allowed' : 'blocked'}</strong>
                </div>
              )}
              <div style={{ border: '1px solid #CBD5E1', borderRadius: 8, overflow: 'hidden', background: '#F8FAFC' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '46px 1fr', minHeight: 176 }}>
                  <div style={{ borderRight: '1px solid #E2E8F0', background: '#EEF2FF', padding: '8px 6px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11, color: '#64748B', textAlign: 'right', userSelect: 'none' }}>
                    {sqlLineNumbers.map((n) => (
                      <div key={`sql-line-${n}`} style={{ lineHeight: 1.45 }}>{n}</div>
                    ))}
                  </div>
                  <textarea
                    value={sqlEditor}
                    onChange={(e) => setSqlEditor(e.target.value)}
                    rows={8}
                    spellCheck={false}
                    style={{
                      width: '100%',
                      border: 'none',
                      padding: 10,
                      fontSize: 12,
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      color: '#0F172A',
                      background: '#F8FAFC',
                      resize: 'vertical',
                      boxSizing: 'border-box',
                      outline: 'none',
                    }}
                  />
                </div>
                <div style={{ borderTop: '1px solid #E2E8F0', padding: '6px 8px', background: '#FFFFFF' }}>
                  <div style={{ fontSize: 10, color: '#64748B', marginBottom: 4 }}>Syntax Preview</div>
                  <div
                    style={{ fontSize: 11, lineHeight: 1.45, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: '#0F172A', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                    dangerouslySetInnerHTML={{ __html: highlightSqlHtml(sqlEditor || '-- enter SQL to see highlighted preview') }}
                  />
                </div>
              </div>
              {sqlAutocompleteItems.length > 0 && (
                <div style={{ border: '1px solid #BFDBFE', background: '#EFF6FF', borderRadius: 6, padding: '6px 8px' }}>
                  <div style={{ fontSize: 10, color: '#1E3A8A', marginBottom: 4 }}>Autocomplete Suggestions</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {sqlAutocompleteItems.map((item, idx) => (
                      <button
                        key={`${item.type}-${item.value}-${idx}`}
                        onClick={() => setSqlEditor((prev) => `${String(prev || '').trimEnd()} ${item.value}`.trim())}
                        style={{
                          border: '1px solid #BFDBFE',
                          background: '#FFFFFF',
                          color: '#1D4ED8',
                          borderRadius: 12,
                          padding: '3px 8px',
                          fontSize: 10,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {item.type === 'table' ? 'T:' : 'C:'} {item.value}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 180px 140px', gap: 8 }}>
                <input
                  value={sqlParamsText}
                  onChange={(e) => setSqlParamsText(e.target.value)}
                  placeholder='SQL params JSON, e.g. {"org_id":1}'
                  style={{
                    border: '1px solid #CBD5E1',
                    borderRadius: 6,
                    padding: '7px 8px',
                    fontSize: 12,
                    color: '#0F172A',
                    background: '#FFFFFF',
                  }}
                />
                <input
                  value={sqlConfirmationText}
                  onChange={(e) => setSqlConfirmationText(e.target.value)}
                  placeholder='CONFIRM (write execute)'
                  style={{
                    border: '1px solid #CBD5E1',
                    borderRadius: 6,
                    padding: '7px 8px',
                    fontSize: 12,
                    color: '#0F172A',
                    background: '#FFFFFF',
                  }}
                />
                <input
                  value={sqlTimeoutMs}
                  onChange={(e) => setSqlTimeoutMs(e.target.value)}
                  placeholder='Timeout ms'
                  style={{
                    border: '1px solid #CBD5E1',
                    borderRadius: 6,
                    padding: '7px 8px',
                    fontSize: 12,
                    color: '#0F172A',
                    background: '#FFFFFF',
                  }}
                />
                <input
                  value={sqlLimitRows}
                  onChange={(e) => setSqlLimitRows(e.target.value)}
                  placeholder='Limit rows'
                  style={{
                    border: '1px solid #CBD5E1',
                    borderRadius: 6,
                    padding: '7px 8px',
                    fontSize: 12,
                    color: '#0F172A',
                    background: '#FFFFFF',
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={runSqlExplain}
                  style={{
                    border: '1px solid #7C3AED',
                    background: '#F3E8FF',
                    color: '#5B21B6',
                    borderRadius: 6,
                    padding: '6px 10px',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Explain
                </button>
                <button
                  onClick={runSqlValidate}
                  style={{
                    border: '1px solid #EA580C',
                    background: '#FFEDD5',
                    color: '#9A3412',
                    borderRadius: 6,
                    padding: '6px 10px',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Validate
                </button>
                <button
                  onClick={() => executeSql('dry_run')}
                  disabled={sqlBusy || dryRunBlocked}
                  style={{
                    border: '1px solid #2563EB',
                    background: '#DBEAFE',
                    color: '#1E40AF',
                    borderRadius: 6,
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: sqlBusy || dryRunBlocked ? 'default' : 'pointer',
                    opacity: sqlBusy || dryRunBlocked ? 0.6 : 1,
                  }}
                >
                  {sqlBusy ? 'Running…' : 'Dry Run'}
                </button>
                <button
                  onClick={() => executeSql('execute')}
                  disabled={sqlBusy || executeBlocked}
                  style={{
                    border: '1px solid #15803D',
                    background: '#DCFCE7',
                    color: '#166534',
                    borderRadius: 6,
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: sqlBusy || executeBlocked ? 'default' : 'pointer',
                    opacity: sqlBusy || executeBlocked ? 0.6 : 1,
                  }}
                >
                  {sqlBusy ? 'Running…' : 'Execute'}
                </button>
                <button
                  onClick={() => navigator.clipboard?.writeText(sqlEditor || '')}
                  style={{
                    border: '1px solid #CBD5E1',
                    background: '#FFFFFF',
                    color: '#334155',
                    borderRadius: 6,
                    padding: '6px 10px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Copy SQL
                </button>
                <span style={{ fontSize: 11, color: '#64748B' }}>
                  Write execute confirmation: <strong>{sqlPolicy?.write_execute_confirmation || 'CONFIRM'}</strong>.
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  value={sqlSuggestText}
                  onChange={(e) => setSqlSuggestText(e.target.value)}
                  placeholder='Search table/column suggestions'
                  style={{
                    border: '1px solid #CBD5E1',
                    borderRadius: 6,
                    padding: '6px 8px',
                    fontSize: 12,
                    minWidth: 260,
                  }}
                />
                <button
                  onClick={runSqlSuggest}
                  style={{
                    border: '1px solid #0891B2',
                    background: '#ECFEFF',
                    color: '#155E75',
                    borderRadius: 6,
                    padding: '6px 10px',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Suggestions
                </button>
              </div>
              {dryRunBlocked && (
                <div style={{ fontSize: 11, color: '#B45309' }}>
                  Dry run is blocked for statement type: <strong>{editorStatementType || 'N/A'}</strong>.
                </div>
              )}
              {executeBlocked && (
                <div style={{ fontSize: 11, color: '#B45309' }}>
                  Execute is blocked for statement type: <strong>{editorStatementType || 'N/A'}</strong>.
                </div>
              )}
              {sqlError && (
                <div style={{
                  border: '1px solid #FCA5A5',
                  background: '#FEF2F2',
                  color: '#991B1B',
                  borderRadius: 6,
                  padding: '8px 10px',
                  fontSize: 12,
                }}>
                  {sqlError}
                </div>
              )}
              {sqlResult && (
                <div style={{
                  border: '1px solid #BFDBFE',
                  background: '#EFF6FF',
                  color: '#1E3A8A',
                  borderRadius: 6,
                  padding: '8px 10px',
                  fontSize: 12,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#1E3A8A', marginBottom: 6 }}>
                    Raw Result
                  </div>
                  <div
                    style={{
                      maxHeight: 240,
                      overflow: 'auto',
                      overscrollBehavior: 'contain',
                      border: '1px solid #BFDBFE',
                      borderRadius: 6,
                      background: '#FFFFFF',
                      padding: 8,
                    }}
                  >
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                      {JSON.stringify(sqlResult, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
              {sqlExplainResult && (
                <div style={{ border: '1px solid #DDD6FE', background: '#F5F3FF', borderRadius: 6, padding: '8px 10px', fontSize: 12, color: '#4C1D95' }}>
                  <div><strong>Explain:</strong> {sqlExplainResult.summary}</div>
                  <div style={{ marginTop: 4 }}>{sqlExplainResult.detail}</div>
                </div>
              )}
              {sqlValidationResult && (
                <div style={{ border: '1px solid #FDBA74', background: '#FFF7ED', borderRadius: 6, padding: '8px 10px', fontSize: 12, color: '#7C2D12' }}>
                  <div>
                    <strong>Risk:</strong> {sqlValidationResult.risk_band} ({sqlValidationResult.risk_score}/100)
                  </div>
                  {Array.isArray(sqlValidationResult.issues) && sqlValidationResult.issues.length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      <strong>Issues:</strong> {sqlValidationResult.issues.join(' | ')}
                    </div>
                  )}
                  {Array.isArray(sqlValidationResult.recommendations) && sqlValidationResult.recommendations.length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      <strong>Recommendations:</strong> {sqlValidationResult.recommendations.join(' | ')}
                    </div>
                  )}
                </div>
              )}
              {sqlNlResult && (
                <div style={{ border: '1px solid #BAE6FD', background: '#F0F9FF', borderRadius: 6, padding: '8px 10px', fontSize: 12, color: '#0C4A6E' }}>
                  <div><strong>NL Prompt:</strong> {sqlNlResult.prompt}</div>
                  <div style={{ marginTop: 3 }}><strong>Rationale:</strong> {sqlNlResult.rationale}</div>
                  <pre style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                    {sqlNlResult.sql}
                  </pre>
                </div>
              )}
              {sqlSuggestResult && (
                <div style={{ border: '1px solid #A5F3FC', background: '#ECFEFF', borderRadius: 6, padding: '8px 10px', fontSize: 12, color: '#164E63' }}>
                  <div><strong>Tables:</strong> {(sqlSuggestResult.tables || []).map((t) => t.table_name).join(', ') || 'None'}</div>
                  <div style={{ marginTop: 4 }}><strong>Columns:</strong> {(sqlSuggestResult.columns || []).slice(0, 12).map((c) => `${c.table_name}.${c.column_name}`).join(', ') || 'None'}</div>
                </div>
              )}
              {sqlGraphData && (
                <div style={{ border: '1px solid #DDD6FE', background: '#F5F3FF', borderRadius: 6, padding: '8px 10px', fontSize: 12, color: '#4C1D95' }}>
                  <div><strong>Join Graph:</strong> nodes {sqlGraphData.nodes?.length || 0} · edges {sqlGraphData.edges?.length || 0}</div>
                  <div style={{ marginTop: 4 }}>
                    <strong>Top related tables:</strong> {(sqlGraphData.nodes || []).slice(0, 8).map((n) => `${n.table_name}(${n.degree})`).join(', ') || 'None'}
                  </div>
                </div>
              )}
              {Array.isArray(sqlResult?.rows) && sqlResult.rows.length > 0 && (
                <div style={{
                  border: '1px solid #BFDBFE',
                  background: '#FFFFFF',
                  borderRadius: 6,
                  overflow: 'auto',
                  maxHeight: 240,
                }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 480 }}>
                    <thead>
                      <tr>
                        {Object.keys(sqlResult.rows[0]).map((k) => (
                          <th key={k} style={{
                            textAlign: 'left',
                            fontSize: 11,
                            color: '#0F172A',
                            padding: '8px 10px',
                            borderBottom: '1px solid #E2E8F0',
                            background: '#F8FAFC',
                          }}>
                            {k}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sqlResult.rows.slice(0, 100).map((row, idx) => (
                        <tr key={`sql-row-${idx}`}>
                          {Object.keys(sqlResult.rows[0]).map((k) => (
                            <td key={`${idx}-${k}`} style={{
                              fontSize: 11,
                              color: '#334155',
                              padding: '7px 10px',
                              borderBottom: '1px solid #F1F5F9',
                              verticalAlign: 'top',
                            }}>
                              {String(row[k] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div style={{ border: '1px solid #E2E8F0', background: '#FFFFFF', borderRadius: 6, padding: '8px 10px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>
                  SQL Audit (latest)
                </div>
                {(sqlAuditLogs || []).length === 0 ? (
                  <div style={{ fontSize: 11, color: '#64748B' }}>No SQL audit logs yet.</div>
                ) : (
                  <div style={{ maxHeight: 140, overflow: 'auto' }}>
                    {(sqlAuditLogs || []).map((row) => (
                      <div key={row.id} style={{ fontSize: 11, color: '#334155', padding: '3px 0', borderBottom: '1px solid #F1F5F9' }}>
                        <strong>{row.statement_type}</strong> · {row.mode} · {row.status} · {row.created_at}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
              {activeSqlTab && activeSqlEntries.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {activeSqlEntries.map((entry, idx) => (
                    <div
                      key={`${activeSqlTab.key}-${idx}`}
                      style={{
                        background: '#FFFFFF',
                        border: '1px solid #E2E8F0',
                        borderRadius: 8,
                        overflow: 'hidden',
                      }}
                    >
                      <div style={{
                        padding: '10px 12px',
                        borderBottom: '1px solid #E2E8F0',
                        background: '#F8FAFC',
                      }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{entry.title}</div>
                        <div style={{ marginTop: 4, fontSize: 12, color: '#475569' }}>{entry.explanation}</div>
                      </div>

                      <pre style={{
                        margin: 0,
                        padding: 14,
                        color: '#0F172A',
                        fontSize: 12,
                        lineHeight: 1.55,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        background: '#F8FAFC',
                      }}>
                        {entry.sql}
                      </pre>

                      <div style={{
                        padding: '0 12px 12px',
                        display: 'grid',
                        gridTemplateColumns: '1fr',
                        gap: 4,
                      }}>
                        <div style={{ fontSize: 11, color: '#334155' }}>
                          <strong style={{ color: '#1D4ED8' }}>What Happens:</strong> {entry.whatHappens}
                        </div>
                        <div style={{ fontSize: 11, color: '#334155' }}>
                          <strong style={{ color: '#1D4ED8' }}>When To Use:</strong> {entry.whenToUse}
                        </div>
                        <div style={{ fontSize: 11, color: '#334155' }}>
                          <strong style={{ color: '#DC2626' }}>Caution:</strong> {entry.caution}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: '#64748B', fontSize: 13 }}>No SQL content available for this flow.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {showSqlConfirmModal && (
        <div
          onClick={() => setShowSqlConfirmModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10020,
            background: 'rgba(15,23,42,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 520,
              maxWidth: '95vw',
              borderRadius: 10,
              border: '1px solid #CBD5E1',
              background: '#FFFFFF',
              padding: 16,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>Confirm SQL Write Execution</div>
            <div style={{ marginTop: 8, fontSize: 12, color: '#475569', lineHeight: 1.5 }}>
              This will run a write statement (<strong>{editorStatementType || 'UNKNOWN'}</strong>).<br />
              Type <strong>{sqlPolicy?.write_execute_confirmation || 'CONFIRM'}</strong> to continue.
            </div>
            <input
              value={sqlConfirmPhrase}
              onChange={(e) => setSqlConfirmPhrase(e.target.value)}
              placeholder={sqlPolicy?.write_execute_confirmation || 'CONFIRM'}
              style={{
                marginTop: 10,
                width: '100%',
                border: '1px solid #CBD5E1',
                borderRadius: 6,
                padding: '8px 10px',
                fontSize: 12,
              }}
            />
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => setShowSqlConfirmModal(false)}
                style={{
                  border: '1px solid #CBD5E1',
                  background: '#FFFFFF',
                  color: '#334155',
                  borderRadius: 6,
                  padding: '6px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const expected = String(sqlPolicy?.write_execute_confirmation || 'CONFIRM').toUpperCase()
                  if (String(sqlConfirmPhrase || '').trim().toUpperCase() !== expected) {
                    setSqlError(`Confirmation phrase must be "${expected}".`)
                    return
                  }
                  setSqlConfirmationText(expected)
                  setShowSqlConfirmModal(false)
                  await runSql(pendingSqlMode || 'execute')
                }}
                style={{
                  border: '1px solid #15803D',
                  background: '#DCFCE7',
                  color: '#166534',
                  borderRadius: 6,
                  padding: '6px 10px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Confirm & Execute
              </button>
            </div>
          </div>
        </div>
      )}
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
