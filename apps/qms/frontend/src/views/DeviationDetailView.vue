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
const allDeviations = ref([])
const activeSection = ref('containment')
const showActionPanel = ref(false)
const actionLoading = ref(false)
const actionMessage = ref('')
const actionNotes = ref('')

const availableActions = computed(() => {
  const status = deviation.value?.status
  const id = route.params.id
  if (!status) return []
  const actions = {
    Open: [{ label: 'Submit for Triage', endpoint: `/deviations/${id}/triage`, method: 'POST', bodyFn: (notes) => ({ triageSummary: notes || 'Triaged', impactLevel: 'Medium' }), requiresNotes: true, notesLabel: 'Triage summary' }],
    Triage: [{ label: 'Add Containment Action', endpoint: `/deviations/${id}/containment`, method: 'POST', bodyFn: (notes) => ({ actionText: notes || 'Containment applied' }), requiresNotes: true, notesLabel: 'Containment action details' }],
    Containment: [{ label: 'Open Investigation', endpoint: `/deviations/${id}/investigation`, method: 'POST', bodyFn: (notes) => ({ findings: notes || 'Under investigation', rootCause: 'To be determined' }), requiresNotes: false, notesLabel: 'Investigation notes' }],
    Investigation: [{ label: 'Submit for QA Review', endpoint: `/deviations/${id}/qa-review`, method: 'POST', bodyFn: () => ({ decision: 'Approve', reportabilityStatus: 'NotReportable' }), requiresNotes: false }],
    QAReview: [{ label: 'Close Deviation', endpoint: `/deviations/${id}/close`, method: 'POST', bodyFn: (notes) => ({ closureSummary: notes || 'Closed after QA review' }), requiresNotes: true, notesLabel: 'Closure summary' }],
    Closed: [{ label: 'Reopen Deviation', endpoint: `/deviations/${id}/reopen`, method: 'POST', bodyFn: (notes) => ({ reason: notes || 'Reopened for review' }), requiresNotes: false }]
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

// Derived data from API response
const deviation = computed(() => detail.value?.deviation || null)
const containmentActions = computed(() => detail.value?.containmentActions || [])
const investigations = computed(() => detail.value?.investigations || [])
const capaLinks = computed(() => detail.value?.capaLinks || [])
const timeline = computed(() => detail.value?.history || [])

// Deviation lifecycle states (matches DB constraint)
const DEVIATION_LIFECYCLE = [
  { key: 'Open', label: 'Open' },
  { key: 'Triage', label: 'Triage' },
  { key: 'Containment', label: 'Containment' },
  { key: 'Investigation', label: 'Investigation' },
  { key: 'QAReview', label: 'QA Review' },
  { key: 'CapaLinked', label: 'CAPA Linked' },
  { key: 'Closed', label: 'Closed' }
]

// Sidebar section definitions — count badges update reactively
const sidebarSections = computed(() => [
  {
    title: 'Investigations & Root Causes',
    items: [
      { key: 'containment', label: 'Containment Actions', count: containmentActions.value.length },
      { key: 'investigations', label: 'Investigations', count: investigations.value.length },
      { key: 'capa', label: 'CAPA Links', count: capaLinks.value.length }
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

// Position in current list (for "X of N records" counter)
const currentPosition = computed(() => {
  if (!allDeviations.value.length) return null
  const idx = allDeviations.value.findIndex(d => d.id === route.params.id)
  return idx >= 0 ? idx + 1 : null
})

async function loadDetail() {
  loading.value = true
  error.value = ''
  try {
    const data = await apiRequest(`/deviations/${route.params.id}`)
    detail.value = data
  } catch (err) {
    error.value = err.message || 'Failed to load deviation.'
  } finally {
    loading.value = false
  }
}

async function loadList() {
  try {
    const data = await apiRequest('/deviations')
    allDeviations.value = data.deviations || []
  } catch {
    allDeviations.value = []
  }
}

function navigateRecord(delta) {
  const idx = allDeviations.value.findIndex(d => d.id === route.params.id)
  const next = allDeviations.value[idx + delta]
  if (next) router.push(`/deviations/${next.id}`)
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

// Reload when route param changes (prev/next navigation)
watch(() => route.params.id, async (newId) => {
  if (newId) await loadDetail()
})

onMounted(async () => {
  await Promise.all([loadDetail(), loadList()])
})
</script>

<template>
  <div class="space-y-4">

    <!-- Loading state -->
    <div v-if="loading" class="flex items-center justify-center rounded-xl border border-slate-200 bg-white p-10">
      <div class="flex items-center gap-3 text-sm text-slate-500">
        <svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10" stroke-width="2" stroke-opacity="0.25"/>
          <path d="M12 2a10 10 0 0 1 10 10" stroke-width="2" stroke-linecap="round"/>
        </svg>
        Loading deviation…
      </div>
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
      {{ error }}
      <button class="ml-4 underline hover:no-underline" @click="loadDetail">Retry</button>
    </div>

    <!-- Record loaded -->
    <template v-else-if="deviation">

      <!-- Record header with lifecycle stepper -->
      <RecordHeader
        :breadcrumb="`Deviations / ${deviation.deviation_code}`"
        :doc-number="deviation.deviation_code"
        :title="deviation.title"
        :status="deviation.status"
        :position="currentPosition"
        :total="allDeviations.length || null"
        :lifecycle-states="DEVIATION_LIFECYCLE"
        @back="router.push('/deviations')"
        @prev="navigateRecord(-1)"
        @next="navigateRecord(1)"
        @edit="() => {}"
        @copy="() => {}"
        @action="showActionPanel = !showActionPanel"
      />

      <!-- Action Panel -->
      <div v-if="showActionPanel" class="rounded-xl border border-indigo-200 bg-indigo-50 p-4 space-y-3">
        <div class="flex items-center justify-between">
          <p class="text-sm font-semibold text-indigo-800">Lifecycle Actions — Current Status: <span class="font-bold">{{ deviation.status }}</span></p>
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

      <!-- Two-column layout: sidebar + panels -->
      <div class="flex gap-4 items-start">

        <!-- Left sidebar -->
        <aside class="w-52 shrink-0 sticky top-4">
          <div class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div v-for="section in sidebarSections" :key="section.title" class="border-b border-slate-100 last:border-0">
              <!-- Section group header -->
              <div class="bg-slate-50 px-4 py-2.5">
                <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">{{ section.title }}</p>
              </div>
              <!-- Section items -->
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

        <!-- Right: main panels -->
        <div class="flex-1 min-w-0 space-y-3">

          <!-- Deviation metadata card -->
          <div class="rounded-xl border border-slate-200 bg-white p-5">
            <dl class="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
              <div>
                <dt class="text-xs font-medium text-slate-400 uppercase tracking-wide">Type</dt>
                <dd class="mt-0.5 font-medium text-slate-800">{{ deviation.deviation_type || '—' }}</dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-slate-400 uppercase tracking-wide">Classification</dt>
                <dd class="mt-0.5 font-medium text-slate-800">{{ deviation.classification || '—' }}</dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-slate-400 uppercase tracking-wide">Impact Level</dt>
                <dd class="mt-0.5 font-medium text-slate-800">{{ deviation.impact_level || '—' }}</dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-slate-400 uppercase tracking-wide">Department</dt>
                <dd class="mt-0.5 font-medium text-slate-800">{{ deviation.department || '—' }}</dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-slate-400 uppercase tracking-wide">Date of Occurrence</dt>
                <dd class="mt-0.5 font-medium text-slate-800">{{ formatDate(deviation.date_of_occurrence) }}</dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-slate-400 uppercase tracking-wide">Due Date</dt>
                <dd class="mt-0.5 font-medium text-slate-800">{{ formatDate(deviation.due_date) }}</dd>
              </div>
            </dl>
            <div v-if="deviation.description" class="mt-4 border-t border-slate-100 pt-3">
              <dt class="text-xs font-medium uppercase tracking-wide text-slate-400">Description</dt>
              <dd class="mt-1 text-sm leading-relaxed text-slate-700">{{ deviation.description }}</dd>
            </div>
            <div v-if="deviation.triage_summary" class="mt-3 border-t border-slate-100 pt-3">
              <dt class="text-xs font-medium uppercase tracking-wide text-slate-400">Triage Summary</dt>
              <dd class="mt-1 text-sm leading-relaxed text-slate-700">{{ deviation.triage_summary }}</dd>
            </div>
            <div v-if="deviation.closure_summary" class="mt-3 border-t border-slate-100 pt-3">
              <dt class="text-xs font-medium uppercase tracking-wide text-slate-400">Closure Summary</dt>
              <dd class="mt-1 text-sm leading-relaxed text-slate-700">{{ deviation.closure_summary }}</dd>
            </div>
          </div>

          <!-- Containment Actions -->
          <div :id="`section-containment`">
            <RelatedRecordsPanel
              title="Containment Actions"
              :items="containmentActions"
              :columns="[
                { key: 'action_text', label: 'Action' },
                { key: 'created_at', label: 'Date' }
              ]"
              @create="() => {}"
            >
              <template #cell-created_at="{ value }">{{ formatDate(value) }}</template>
            </RelatedRecordsPanel>
          </div>

          <!-- Investigations -->
          <div :id="`section-investigations`">
            <RelatedRecordsPanel
              title="Investigations"
              :items="investigations"
              :columns="[
                { key: 'findings', label: 'Findings' },
                { key: 'root_cause', label: 'Root Cause' },
                { key: 'due_date', label: 'Due Date' }
              ]"
              @create="() => {}"
            >
              <template #cell-due_date="{ value }">{{ formatDate(value) }}</template>
            </RelatedRecordsPanel>
          </div>

          <!-- CAPA Links -->
          <div :id="`section-capa`">
            <RelatedRecordsPanel
              title="CAPA Links"
              :items="capaLinks"
              :columns="[
                { key: 'capa_code', label: 'CAPA' },
                { key: 'capa_title', label: 'Title' },
                { key: 'linked_at', label: 'Linked' }
              ]"
              @create="() => {}"
            >
              <template #cell-linked_at="{ value }">{{ formatDate(value) }}</template>
            </RelatedRecordsPanel>
          </div>

          <!-- Timeline -->
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

          <!-- Issue Escalations (placeholder) -->
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

          <!-- Extension Requests (placeholder) -->
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
