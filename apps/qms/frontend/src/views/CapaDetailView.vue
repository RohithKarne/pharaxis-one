<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { apiRequest } from '../services/api'
import RecordHeader from '../components/RecordHeader.vue'
import RelatedRecordsPanel from '../components/RelatedRecordsPanel.vue'

const route = useRoute()
const router = useRouter()

const loading = ref(true)
const error = ref('')
const detail = ref(null)
const allCapas = ref([])
const activeSection = ref('actionItems')
const showActionPanel = ref(false)
const actionLoading = ref(false)
const actionMessage = ref('')
const actionNotes = ref('')

const availableActions = computed(() => {
  const status = capa.value?.status
  const id = route.params.id
  if (!status) return []
  const actions = {
    Draft: [{ label: 'Submit for Review', endpoint: `/capa/${id}/submit`, method: 'POST', bodyFn: () => ({}), requiresNotes: false }],
    Submitted: [{ label: 'Start Investigation (Triage)', endpoint: `/capa/${id}/triage`, method: 'POST', bodyFn: (notes) => ({ triagePriority: 'High', triageSummary: notes || 'Triaged for investigation' }), requiresNotes: true, notesLabel: 'Triage summary' }],
    Investigation: [{ label: 'Approve Action Plan', endpoint: `/capa/${id}/approve`, method: 'POST', bodyFn: (notes) => ({ decision: 'Approve', comments: notes || 'Action plan approved' }), requiresNotes: false }],
    ActionPlanApproval: [{ label: 'Approve Action Plan', endpoint: `/capa/${id}/approve`, method: 'POST', bodyFn: (notes) => ({ decision: 'Approve', comments: notes || 'Action plan approved' }), requiresNotes: false }],
    InExecution: [{ label: 'Submit Effectiveness Check', endpoint: `/capa/${id}/effectiveness`, method: 'POST', bodyFn: (notes) => ({ effectivenessResult: 'Effective', reviewNotes: notes || 'Effectiveness confirmed' }), requiresNotes: false }],
    EffectivenessPending: [{ label: 'Close CAPA', endpoint: `/capa/${id}/close`, method: 'POST', bodyFn: (notes) => ({ closureSummary: notes || 'CAPA closed after effectiveness review' }), requiresNotes: true, notesLabel: 'Closure summary' }],
    Closed: [{ label: 'Reopen CAPA', endpoint: `/capa/${id}/reopen`, method: 'POST', bodyFn: (notes) => ({ reason: notes || 'Reopened for further review' }), requiresNotes: false }]
  }
  return actions[status] || []
})

async function performAction(action) {
  actionLoading.value = true
  actionMessage.value = ''
  try {
    await apiRequest(action.endpoint, { method: action.method, body: action.bodyFn(actionNotes.value) })
    actionMessage.value = `${action.label} — completed successfully.`
    actionNotes.value = ''
    showActionPanel.value = false
    await loadDetail()
  } catch (err) {
    actionMessage.value = `Error: ${err.message}`
  } finally {
    actionLoading.value = false
  }
}

const capa = computed(() => detail.value?.capa || null)
const actionItems = computed(() => detail.value?.actionItems || [])
const fiveWhys = computed(() => detail.value?.fiveWhys || [])
const fishbone = computed(() => detail.value?.fishbone || [])
const effectivenessChecks = computed(() => detail.value?.effectivenessChecks || [])
const approvals = computed(() => detail.value?.approvals || [])
const timeline = computed(() => detail.value?.timeline || [])
const DAY_MS = 24 * 60 * 60 * 1000

const CAPA_LIFECYCLE = [
  { key: 'Draft', label: 'Draft' },
  { key: 'Submitted', label: 'Submitted' },
  { key: 'Investigation', label: 'Investigation' },
  { key: 'ActionPlanApproval', label: 'Action Plan Approval' },
  { key: 'InExecution', label: 'In Execution' },
  { key: 'EffectivenessPending', label: 'Effectiveness Review' },
  { key: 'Closed', label: 'Closed' }
]

function daysUntil(value) {
  if (!value) return null
  const target = new Date(value)
  if (Number.isNaN(target.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - today.getTime()) / DAY_MS)
}

function isOpenStatus(value) {
  return !['Closed', 'Cancelled'].includes(String(value || '').trim())
}

function duePressure(value, status) {
  const days = daysUntil(value)
  if (!isOpenStatus(status)) return { label: 'Closed record', tone: 'border-emerald-200 bg-emerald-50 text-emerald-700' }
  if (days === null) return { label: 'No due date', tone: 'border-slate-200 bg-slate-50 text-slate-700' }
  if (days < 0) return { label: `${Math.abs(days)} days overdue`, tone: 'border-red-200 bg-red-50 text-red-700' }
  if (days <= 14) return { label: `${days} days remaining`, tone: 'border-amber-200 bg-amber-50 text-amber-700' }
  return { label: `${days} days remaining`, tone: 'border-emerald-200 bg-emerald-50 text-emerald-700' }
}

const inspectionCards = computed(() => {
  const pressure = duePressure(capa.value?.due_date, capa.value?.status)
  const rcaCount = fiveWhys.value.length + fishbone.value.length
  return [
    {
      label: 'Lifecycle',
      value: capa.value?.status || 'Draft',
      detail: availableActions.value.length ? `${availableActions.value.length} action available` : 'No immediate action'
    },
    {
      label: 'Due Pressure',
      value: formatDate(capa.value?.due_date),
      detail: pressure.label,
      tone: pressure.tone
    },
    {
      label: 'Risk',
      value: capa.value?.risk_band || 'Unscored',
      detail: capa.value?.risk_score ? `Score ${capa.value.risk_score} (S:${capa.value.severity} O:${capa.value.occurrence} D:${capa.value.detectability})` : 'Risk factors not complete'
    },
    {
      label: 'Evidence',
      value: `${actionItems.value.length + rcaCount + approvals.value.length + effectivenessChecks.value.length}`,
      detail: `${actionItems.value.length} actions, ${rcaCount} RCA entries, ${approvals.value.length} approvals`
    }
  ]
})

const readinessItems = computed(() => [
  {
    label: 'Action plan',
    value: actionItems.value.length ? `${actionItems.value.length} action${actionItems.value.length === 1 ? '' : 's'}` : 'Missing',
    ready: actionItems.value.length > 0 || capa.value?.status === 'Draft'
  },
  {
    label: 'RCA evidence',
    value: fiveWhys.value.length + fishbone.value.length ? `${fiveWhys.value.length + fishbone.value.length} entr${fiveWhys.value.length + fishbone.value.length === 1 ? 'y' : 'ies'}` : 'Not captured',
    ready: fiveWhys.value.length + fishbone.value.length > 0 || ['Draft', 'Submitted'].includes(capa.value?.status)
  },
  {
    label: 'Approvals',
    value: approvals.value.length ? `${approvals.value.length} decision${approvals.value.length === 1 ? '' : 's'}` : 'No decisions',
    ready: approvals.value.length > 0 || ['Draft', 'Submitted', 'Investigation'].includes(capa.value?.status)
  },
  {
    label: 'Timeline',
    value: timeline.value.length ? `${timeline.value.length} event${timeline.value.length === 1 ? '' : 's'}` : 'No events',
    ready: timeline.value.length > 0
  }
])

const sidebarSections = computed(() => [
  {
    title: 'Root Cause Analysis',
    items: [
      { key: 'actionItems', label: 'Action Items', count: actionItems.value.length },
      { key: 'fiveWhys', label: '5-Why Analysis', count: fiveWhys.value.length },
      { key: 'fishbone', label: 'Fishbone Analysis', count: fishbone.value.length }
    ]
  },
  {
    title: 'Verification',
    items: [
      { key: 'effectiveness', label: 'Effectiveness Checks', count: effectivenessChecks.value.length },
      { key: 'approvals', label: 'Approvals', count: approvals.value.length }
    ]
  },
  {
    title: 'Summary & Conclusions',
    items: [
      { key: 'timeline', label: 'Timeline', count: timeline.value.length }
    ]
  },
  {
    title: 'Related Processes',
    items: [
      { key: 'escalations', label: 'Issue Escalations', count: 0 },
      { key: 'extensions', label: 'Extension Requests', count: 0 }
    ]
  }
])

const currentPosition = computed(() => {
  if (!allCapas.value.length) return null
  const idx = allCapas.value.findIndex(c => c.id === route.params.id)
  return idx >= 0 ? idx + 1 : null
})

async function loadDetail() {
  loading.value = true
  error.value = ''
  try {
    const data = await apiRequest(`/capa/${route.params.id}`)
    detail.value = data
  } catch (err) {
    error.value = err.message || 'Failed to load CAPA.'
  } finally {
    loading.value = false
  }
}

async function loadList() {
  try {
    const data = await apiRequest('/capa')
    allCapas.value = data.capas || []
  } catch {
    allCapas.value = []
  }
}

function navigateRecord(delta) {
  const idx = allCapas.value.findIndex(c => c.id === route.params.id)
  const next = allCapas.value[idx + delta]
  if (next) router.push(`/capa/${next.id}`)
}

function scrollToSection(key) {
  activeSection.value = key
  const el = document.getElementById(`section-${key}`)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function formatDate(val) {
  if (!val) return '—'
  return new Date(val).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatDateTime(val) {
  if (!val) return '—'
  return new Date(val).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

watch(() => route.params.id, async (newId) => {
  if (newId) await loadDetail()
})

onMounted(async () => {
  await Promise.all([loadDetail(), loadList()])
})
</script>

<template>
  <div class="space-y-4">

    <div v-if="loading" class="flex items-center justify-center rounded-xl border border-slate-200 bg-white p-10">
      <div class="flex items-center gap-3 text-sm text-slate-500">
        <svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10" stroke-width="2" stroke-opacity="0.25"/>
          <path d="M12 2a10 10 0 0 1 10 10" stroke-width="2" stroke-linecap="round"/>
        </svg>
        Loading CAPA…
      </div>
    </div>

    <div v-else-if="error" class="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
      {{ error }}
      <button class="ml-4 underline hover:no-underline" @click="loadDetail">Retry</button>
    </div>

    <template v-else-if="capa">

      <RecordHeader
        :breadcrumb="`CAPA / ${capa.capa_code}`"
        :doc-number="capa.capa_code"
        :title="capa.title"
        :status="capa.status"
        :position="currentPosition"
        :total="allCapas.length || null"
        :lifecycle-states="CAPA_LIFECYCLE"
        @back="router.push('/capa')"
        @prev="navigateRecord(-1)"
        @next="navigateRecord(1)"
        @edit="() => {}"
        @copy="() => {}"
        @action="showActionPanel = !showActionPanel"
      />

      <section class="grid gap-3 lg:grid-cols-4 sm:grid-cols-2">
        <article
          v-for="card in inspectionCards"
          :key="card.label"
          class="rounded-lg border bg-white p-4 shadow-sm"
          :class="card.tone || 'border-slate-200'"
        >
          <p class="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{{ card.label }}</p>
          <p class="mt-2 text-xl font-extrabold text-slate-900">{{ card.value }}</p>
          <p class="mt-1 text-xs text-slate-500">{{ card.detail }}</p>
        </article>
      </section>

      <section class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="text-base font-semibold text-slate-900">CAPA Review Readiness</h3>
            <p class="text-sm text-slate-500">Fast check of actions, RCA, approvals, and timeline before closure or escalation.</p>
          </div>
          <button
            type="button"
            class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            @click="scrollToSection('timeline')"
          >
            View Timeline
          </button>
        </div>
        <div class="mt-3 grid gap-2 md:grid-cols-4 sm:grid-cols-2">
          <div
            v-for="item in readinessItems"
            :key="item.label"
            class="rounded-lg border px-3 py-2"
            :class="item.ready ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'"
          >
            <p class="text-xs font-semibold uppercase tracking-[0.08em]" :class="item.ready ? 'text-emerald-700' : 'text-amber-700'">{{ item.label }}</p>
            <p class="mt-1 text-sm font-semibold text-slate-800">{{ item.value }}</p>
          </div>
        </div>
      </section>

      <!-- Action Panel -->
      <div v-if="showActionPanel" class="rounded-xl border border-indigo-200 bg-indigo-50 p-4 space-y-3">
        <div class="flex items-center justify-between">
          <p class="text-sm font-semibold text-indigo-800">Lifecycle Actions — Current Status: <span class="font-bold">{{ capa.status }}</span></p>
          <button class="text-xs text-indigo-500 hover:underline" @click="showActionPanel = false">Close</button>
        </div>
        <div v-if="availableActions.length" class="space-y-3">
          <div v-for="action in availableActions" :key="action.label" class="rounded-lg border border-indigo-200 bg-white p-3 space-y-2">
            <p class="text-sm font-semibold text-slate-800">{{ action.label }}</p>
            <textarea v-if="action.requiresNotes" v-model="actionNotes" :placeholder="action.notesLabel || 'Notes'" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none" rows="2" />
            <button class="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50" :disabled="actionLoading || (action.requiresNotes && !actionNotes.trim())" @click="performAction(action)">
              {{ actionLoading ? 'Processing…' : action.label }}
            </button>
          </div>
        </div>
        <p v-else class="text-sm text-indigo-600">No actions available for current status.</p>
        <p v-if="actionMessage" class="rounded-lg border px-3 py-2 text-sm" :class="actionMessage.startsWith('Error') ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'">{{ actionMessage }}</p>
      </div>
      <p v-if="actionMessage && !showActionPanel" class="rounded-lg border px-3 py-2 text-sm" :class="actionMessage.startsWith('Error') ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'">{{ actionMessage }}</p>

      <div class="flex gap-4 items-start">

        <aside class="w-52 shrink-0 sticky top-4">
          <div class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div v-for="section in sidebarSections" :key="section.title" class="border-b border-slate-100 last:border-0">
              <div class="bg-slate-50 px-4 py-2.5">
                <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">{{ section.title }}</p>
              </div>
              <ul class="py-1">
                <li
                  v-for="item in section.items"
                  :key="item.key"
                  class="flex cursor-pointer items-center justify-between border-l-2 px-4 py-1.5 text-sm transition-colors hover:bg-slate-50"
                  :class="activeSection === item.key
                    ? 'border-indigo-500 bg-indigo-50 font-medium text-indigo-700'
                    : 'border-transparent text-slate-600'"
                  @click="scrollToSection(item.key)"
                >
                  <span>{{ item.label }}</span>
                  <span class="ml-2 text-xs text-slate-400">({{ item.count }})</span>
                </li>
              </ul>
            </div>
          </div>
        </aside>

        <div class="flex-1 min-w-0 space-y-3">

          <div class="rounded-xl border border-slate-200 bg-white p-5">
            <dl class="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
              <div>
                <dt class="text-xs font-medium text-slate-400 uppercase tracking-wide">Source Type</dt>
                <dd class="mt-0.5 font-medium text-slate-800">{{ capa.source_type || '—' }}</dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-slate-400 uppercase tracking-wide">Classification</dt>
                <dd class="mt-0.5 font-medium text-slate-800">{{ capa.classification || '—' }}</dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-slate-400 uppercase tracking-wide">Risk Band</dt>
                <dd class="mt-0.5 font-medium text-slate-800">{{ capa.risk_band || '—' }}</dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-slate-400 uppercase tracking-wide">Department</dt>
                <dd class="mt-0.5 font-medium text-slate-800">{{ capa.department || '—' }}</dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-slate-400 uppercase tracking-wide">Product</dt>
                <dd class="mt-0.5 font-medium text-slate-800">{{ capa.product_name || '—' }}</dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-slate-400 uppercase tracking-wide">Due Date</dt>
                <dd class="mt-0.5 font-medium text-slate-800">{{ formatDate(capa.due_date) }}</dd>
              </div>
            </dl>
            <div v-if="capa.risk_score" class="mt-4 flex items-center gap-4 border-t border-slate-100 pt-3 text-sm">
              <span class="text-xs text-slate-400 uppercase tracking-wide">Risk Score</span>
              <span class="font-semibold text-slate-800">{{ capa.risk_score }}</span>
              <span class="text-xs text-slate-400">S:{{ capa.severity }} × O:{{ capa.occurrence }} × D:{{ capa.detectability }}</span>
            </div>
            <div v-if="capa.triage_summary" class="mt-4 border-t border-slate-100 pt-3">
              <dt class="text-xs font-medium uppercase tracking-wide text-slate-400">Triage Summary</dt>
              <dd class="mt-1 text-sm leading-relaxed text-slate-700">{{ capa.triage_summary }}</dd>
            </div>
            <div v-if="capa.root_cause_summary" class="mt-3 border-t border-slate-100 pt-3">
              <dt class="text-xs font-medium uppercase tracking-wide text-slate-400">Root Cause Summary</dt>
              <dd class="mt-1 text-sm leading-relaxed text-slate-700">{{ capa.root_cause_summary }}</dd>
            </div>
            <div v-if="capa.investigation_summary" class="mt-3 border-t border-slate-100 pt-3">
              <dt class="text-xs font-medium uppercase tracking-wide text-slate-400">Investigation Summary</dt>
              <dd class="mt-1 text-sm leading-relaxed text-slate-700">{{ capa.investigation_summary }}</dd>
            </div>
            <div v-if="capa.closure_summary" class="mt-3 border-t border-slate-100 pt-3">
              <dt class="text-xs font-medium uppercase tracking-wide text-slate-400">Closure Summary</dt>
              <dd class="mt-1 text-sm leading-relaxed text-slate-700">{{ capa.closure_summary }}</dd>
            </div>
          </div>

          <div :id="`section-actionItems`">
            <RelatedRecordsPanel
              title="Action Items"
              :items="actionItems"
              :columns="[
                { key: 'action_type', label: 'Type' },
                { key: 'description', label: 'Description' },
                { key: 'status', label: 'Status' },
                { key: 'due_date', label: 'Due Date' }
              ]"
              @create="() => {}"
            >
              <template #cell-due_date="{ value }">{{ formatDate(value) }}</template>
            </RelatedRecordsPanel>
          </div>

          <div :id="`section-fiveWhys`">
            <RelatedRecordsPanel
              title="5-Why Analysis"
              :items="fiveWhys"
              :columns="[
                { key: 'why_level', label: 'Level' },
                { key: 'answer', label: 'Answer' }
              ]"
              @create="() => {}"
            />
          </div>

          <div :id="`section-fishbone`">
            <RelatedRecordsPanel
              title="Fishbone Analysis"
              :items="fishbone"
              :columns="[
                { key: 'category', label: 'Category' },
                { key: 'cause', label: 'Cause' }
              ]"
              @create="() => {}"
            />
          </div>

          <div :id="`section-effectiveness`">
            <RelatedRecordsPanel
              title="Effectiveness Checks"
              :items="effectivenessChecks"
              :columns="[
                { key: 'criteria', label: 'Criteria' },
                { key: 'result', label: 'Result' },
                { key: 'checked_at', label: 'Checked' }
              ]"
              @create="() => {}"
            >
              <template #cell-checked_at="{ value }">{{ formatDate(value) }}</template>
            </RelatedRecordsPanel>
          </div>

          <div :id="`section-approvals`">
            <RelatedRecordsPanel
              title="Approvals"
              :items="approvals"
              :columns="[
                { key: 'stage', label: 'Stage' },
                { key: 'decision', label: 'Decision' },
                { key: 'comments', label: 'Comments' },
                { key: 'decided_at', label: 'Date' }
              ]"
              @create="() => {}"
            >
              <template #cell-decided_at="{ value }">{{ formatDate(value) }}</template>
            </RelatedRecordsPanel>
          </div>

          <div :id="`section-timeline`">
            <RelatedRecordsPanel
              title="Timeline"
              :items="timeline"
              :can-create="false"
              :columns="[
                { key: 'action_key', label: 'Event' },
                { key: 'occurred_at', label: 'Timestamp' }
              ]"
            >
              <template #cell-action_key="{ value }">
                <span class="font-medium text-slate-700">{{ value }}</span>
              </template>
              <template #cell-occurred_at="{ value }">{{ formatDateTime(value) }}</template>
            </RelatedRecordsPanel>
          </div>

          <div :id="`section-escalations`">
            <RelatedRecordsPanel
              title="Issue Escalations"
              :items="[]"
              :columns="[
                { key: 'code', label: 'Code' },
                { key: 'title', label: 'Title' },
                { key: 'status', label: 'Status' }
              ]"
              @create="() => {}"
            />
          </div>

          <div :id="`section-extensions`">
            <RelatedRecordsPanel
              title="Extension Requests"
              :items="[]"
              :columns="[
                { key: 'reason', label: 'Reason' },
                { key: 'requested_date', label: 'Requested' },
                { key: 'status', label: 'Status' }
              ]"
              @create="() => {}"
            />
          </div>

        </div>
      </div>
    </template>

  </div>
</template>
