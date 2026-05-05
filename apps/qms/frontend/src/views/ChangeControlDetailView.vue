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
const allChanges = ref([])
const activeSection = ref('impactAssessment')
const showActionPanel = ref(false)
const actionLoading = ref(false)
const actionMessage = ref('')
const actionNotes = ref('')

const availableActions = computed(() => {
  const status = change.value?.status
  const id = route.params.id
  if (!status) return []
  const actions = {
    Draft: [{ label: 'Submit Impact Assessment', endpoint: `/change-control/${id}/impact-assessment`, method: 'POST', bodyFn: (notes) => ({ assessmentSummary: notes || 'Impact assessed', riskLevel: change.value?.risk_level || 'Medium', requiresCabReview: Boolean(change.value?.cab_required) }), requiresNotes: true, notesLabel: 'Assessment summary' }],
    ImpactAssessment: [{ label: 'Submit for CAB Review', endpoint: `/change-control/${id}/cab-review`, method: 'POST', bodyFn: (notes) => ({ cabDecision: 'Approved', cabNotes: notes || 'CAB review completed' }), requiresNotes: false }],
    CABReview: [{ label: 'Approve Change', endpoint: `/change-control/${id}/approvals`, method: 'POST', bodyFn: (notes) => ({ decision: 'Approve', comments: notes || 'Approved' }), requiresNotes: false }],
    PendingApproval: [{ label: 'Approve Change', endpoint: `/change-control/${id}/approvals`, method: 'POST', bodyFn: (notes) => ({ decision: 'Approve', comments: notes || 'Approved' }), requiresNotes: false }],
    Approved: [{ label: 'Start Implementation', endpoint: `/change-control/${id}/implementation`, method: 'POST', bodyFn: (notes) => ({ implementationNotes: notes || 'Implementation started' }), requiresNotes: false }],
    Implementation: [{ label: 'Close Change Request', endpoint: `/change-control/${id}/close`, method: 'POST', bodyFn: (notes) => ({ closureSummary: notes || 'Change implemented and closed' }), requiresNotes: true, notesLabel: 'Closure summary' }],
    Closed: [{ label: 'Reopen Change Request', endpoint: `/change-control/${id}/reopen`, method: 'POST', bodyFn: (notes) => ({ reason: notes || 'Reopened' }), requiresNotes: false }]
  }
  return actions[status] || []
})

async function performAction(action) {
  actionLoading.value = true
  actionMessage.value = ''
  try {
    await apiRequest(action.endpoint, { method: action.method, body: action.bodyFn(actionNotes.value) })
    actionMessage.value = `${action.label} — completed.`
    actionNotes.value = ''
    showActionPanel.value = false
    await loadDetail()
  } catch (err) {
    actionMessage.value = `Error: ${err.message}`
  } finally {
    actionLoading.value = false
  }
}

const change = computed(() => detail.value?.change || null)
const impactAssessment = computed(() => {
  const ia = detail.value?.impactAssessment
  return ia ? [ia] : []
})
const approvals = computed(() => detail.value?.approvals || [])
const implementationSteps = computed(() => detail.value?.implementationSteps || [])
const timeline = computed(() => detail.value?.timeline || [])

const CHANGE_CONTROL_LIFECYCLE = [
  { key: 'Draft', label: 'Draft' },
  { key: 'PendingApproval', label: 'Pending Approval' },
  { key: 'CabReview', label: 'CAB Review' },
  { key: 'Approved', label: 'Approved' },
  { key: 'Implementation', label: 'Implementation' },
  { key: 'Closed', label: 'Closed' }
]

const sidebarSections = computed(() => [
  {
    title: 'Assessment & Planning',
    items: [
      { key: 'impactAssessment', label: 'Impact Assessment', count: impactAssessment.value.length },
      { key: 'implementationSteps', label: 'Implementation Steps', count: implementationSteps.value.length }
    ]
  },
  {
    title: 'Approvals',
    items: [
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
  if (!allChanges.value.length) return null
  const idx = allChanges.value.findIndex(c => c.id === route.params.id)
  return idx >= 0 ? idx + 1 : null
})

async function loadDetail() {
  loading.value = true
  error.value = ''
  try {
    const data = await apiRequest(`/change-control/${route.params.id}`)
    detail.value = data
  } catch (err) {
    error.value = err.message || 'Failed to load change request.'
  } finally {
    loading.value = false
  }
}

async function loadList() {
  try {
    const data = await apiRequest('/change-control')
    allChanges.value = data.changes || []
  } catch {
    allChanges.value = []
  }
}

function navigateRecord(delta) {
  const idx = allChanges.value.findIndex(c => c.id === route.params.id)
  const next = allChanges.value[idx + delta]
  if (next) router.push(`/change-control/${next.id}`)
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
        Loading change request…
      </div>
    </div>

    <div v-else-if="error" class="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
      {{ error }}
      <button class="ml-4 underline hover:no-underline" @click="loadDetail">Retry</button>
    </div>

    <template v-else-if="change">

      <RecordHeader
        :breadcrumb="`Change Control / ${change.change_code}`"
        :doc-number="change.change_code"
        :title="change.title"
        :status="change.status"
        :position="currentPosition"
        :total="allChanges.length || null"
        :lifecycle-states="CHANGE_CONTROL_LIFECYCLE"
        @back="router.push('/change-control')"
        @prev="navigateRecord(-1)"
        @next="navigateRecord(1)"
        @edit="() => {}"
        @copy="() => {}"
        @action="showActionPanel = !showActionPanel"
      />

      <!-- Action Panel -->
      <div v-if="showActionPanel" class="rounded-xl border border-indigo-200 bg-indigo-50 p-4 space-y-3">
        <div class="flex items-center justify-between">
          <p class="text-sm font-semibold text-indigo-800">Lifecycle Actions — Current Status: <span class="font-bold">{{ change.status }}</span></p>
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
                <dt class="text-xs font-medium text-slate-400 uppercase tracking-wide">Change Type</dt>
                <dd class="mt-0.5 font-medium text-slate-800">{{ change.change_type || '—' }}</dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-slate-400 uppercase tracking-wide">Risk Level</dt>
                <dd class="mt-0.5 font-medium text-slate-800">{{ change.risk_level || '—' }}</dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-slate-400 uppercase tracking-wide">CAB Required</dt>
                <dd class="mt-0.5 font-medium text-slate-800">{{ change.cab_required ? 'Yes' : 'No' }}</dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-slate-400 uppercase tracking-wide">Planned Start</dt>
                <dd class="mt-0.5 font-medium text-slate-800">{{ formatDate(change.planned_start_date) }}</dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-slate-400 uppercase tracking-wide">Planned End</dt>
                <dd class="mt-0.5 font-medium text-slate-800">{{ formatDate(change.planned_end_date) }}</dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-slate-400 uppercase tracking-wide">Approved At</dt>
                <dd class="mt-0.5 font-medium text-slate-800">{{ formatDate(change.approved_at) }}</dd>
              </div>
            </dl>
            <div v-if="change.reason" class="mt-4 border-t border-slate-100 pt-3">
              <dt class="text-xs font-medium uppercase tracking-wide text-slate-400">Reason for Change</dt>
              <dd class="mt-1 text-sm leading-relaxed text-slate-700">{{ change.reason }}</dd>
            </div>
            <div v-if="change.closure_summary" class="mt-3 border-t border-slate-100 pt-3">
              <dt class="text-xs font-medium uppercase tracking-wide text-slate-400">Closure Summary</dt>
              <dd class="mt-1 text-sm leading-relaxed text-slate-700">{{ change.closure_summary }}</dd>
            </div>
            <div v-if="change.effectiveness_result" class="mt-3 border-t border-slate-100 pt-3">
              <dt class="text-xs font-medium uppercase tracking-wide text-slate-400">Effectiveness Result</dt>
              <dd class="mt-1 text-sm font-medium text-slate-800">{{ change.effectiveness_result }}</dd>
            </div>
          </div>

          <div :id="`section-impactAssessment`">
            <RelatedRecordsPanel
              title="Impact Assessment"
              :items="impactAssessment"
              :columns="[
                { key: 'assessment_summary', label: 'Summary' },
                { key: 'risk_level', label: 'Risk Level' },
                { key: 'impacted_modules', label: 'Impacted Modules' }
              ]"
              @create="() => {}"
            >
              <template #cell-impacted_modules="{ value }">
                {{ Array.isArray(value) ? value.join(', ') : (value || '—') }}
              </template>
            </RelatedRecordsPanel>
          </div>

          <div :id="`section-implementationSteps`">
            <RelatedRecordsPanel
              title="Implementation Steps"
              :items="implementationSteps"
              :columns="[
                { key: 'step_no', label: '#' },
                { key: 'step_title', label: 'Step' },
                { key: 'step_status', label: 'Status' },
                { key: 'due_date', label: 'Due Date' }
              ]"
              @create="() => {}"
            >
              <template #cell-due_date="{ value }">{{ formatDate(value) }}</template>
            </RelatedRecordsPanel>
          </div>

          <div :id="`section-approvals`">
            <RelatedRecordsPanel
              title="Approvals"
              :items="approvals"
              :columns="[
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
