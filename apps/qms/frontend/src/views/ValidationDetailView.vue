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
const allSystems = ref([])
const activeSection = ref('requirements')
const showActionPanel = ref(false)
const actionLoading = ref(false)
const actionMessage = ref('')
const actionNotes = ref('')

const availableActions = computed(() => {
  const status = system.value?.validation_status
  const id = route.params.id
  if (!status) return []
  if (status === 'Planned') {
    return [{
      label: 'Complete Validation',
      endpoint: `/validation/systems/${id}/complete`,
      method: 'POST',
      bodyFn: (notes) => ({ summary: notes || undefined }),
      requiresNotes: true,
      notesLabel: 'Validation completion summary (required)'
    }]
  }
  return []
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

const system = computed(() => detail.value?.system || null)
const requirements = computed(() => detail.value?.requirements || [])
const plans = computed(() => detail.value?.plans || [])
const protocols = computed(() => detail.value?.protocols || [])
const validationDeviations = computed(() => detail.value?.validationDeviations || [])
const traceEntries = computed(() => detail.value?.traceEntries || [])
const timeline = computed(() => detail.value?.timeline || [])

const VALIDATION_LIFECYCLE = [
  { key: 'Planned', label: 'Planned' },
  { key: 'Validated', label: 'Validated' }
]

const sidebarSections = computed(() => [
  {
    title: 'Requirements & Traceability',
    items: [
      { key: 'requirements', label: 'Requirements', count: requirements.value.length },
      { key: 'traceEntries', label: 'Trace Matrix', count: traceEntries.value.length }
    ]
  },
  {
    title: 'Protocols & Testing',
    items: [
      { key: 'plans', label: 'Validation Plans', count: plans.value.length },
      { key: 'protocols', label: 'Protocol Instances', count: protocols.value.length },
      { key: 'deviations', label: 'Validation Deviations', count: validationDeviations.value.length }
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
  if (!allSystems.value.length) return null
  const idx = allSystems.value.findIndex(s => s.id === route.params.id)
  return idx >= 0 ? idx + 1 : null
})

async function loadDetail() {
  loading.value = true
  error.value = ''
  try {
    const data = await apiRequest(`/validation/systems/${route.params.id}`)
    detail.value = data
  } catch (err) {
    error.value = err.message || 'Failed to load validation system.'
  } finally {
    loading.value = false
  }
}

async function loadList() {
  try {
    const data = await apiRequest('/validation/systems')
    allSystems.value = data.systems || []
  } catch {
    allSystems.value = []
  }
}

function navigateRecord(delta) {
  const idx = allSystems.value.findIndex(s => s.id === route.params.id)
  const next = allSystems.value[idx + delta]
  if (next) router.push(`/validation/${next.id}`)
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
        Loading validation system…
      </div>
    </div>

    <div v-else-if="error" class="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
      {{ error }}
      <button class="ml-4 underline hover:no-underline" @click="loadDetail">Retry</button>
    </div>

    <template v-else-if="system">

      <RecordHeader
        :breadcrumb="`Validation / ${system.system_name}`"
        :doc-number="`GAMP ${system.gamp_category}`"
        :title="system.system_name"
        :status="system.validation_status"
        :position="currentPosition"
        :total="allSystems.length || null"
        :lifecycle-states="VALIDATION_LIFECYCLE"
        @back="router.push('/validation')"
        @prev="navigateRecord(-1)"
        @next="navigateRecord(1)"
        @edit="() => {}"
        @copy="() => {}"
        @action="showActionPanel = !showActionPanel"
      />

      <!-- Action Panel -->
      <div v-if="showActionPanel" class="rounded-xl border border-indigo-200 bg-indigo-50 p-4 space-y-3">
        <div class="flex items-center justify-between">
          <p class="text-sm font-semibold text-indigo-800">Lifecycle Actions — Current Status: <span class="font-bold">{{ system.validation_status }}</span></p>
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
        <p v-else class="text-sm text-indigo-600">No further lifecycle transitions available.</p>
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
                <dt class="text-xs font-medium text-slate-400 uppercase tracking-wide">GAMP Category</dt>
                <dd class="mt-0.5 font-medium text-slate-800">GAMP {{ system.gamp_category || '—' }}</dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-slate-400 uppercase tracking-wide">Risk Level</dt>
                <dd class="mt-0.5 font-medium text-slate-800">{{ system.risk_level || '—' }}</dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-slate-400 uppercase tracking-wide">Vendor</dt>
                <dd class="mt-0.5 font-medium text-slate-800">{{ system.vendor || '—' }}</dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-slate-400 uppercase tracking-wide">Version</dt>
                <dd class="mt-0.5 font-medium text-slate-800">{{ system.version || '—' }}</dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-slate-400 uppercase tracking-wide">Next Review Due</dt>
                <dd class="mt-0.5 font-medium text-slate-800">{{ formatDate(system.next_review_due_date) }}</dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-slate-400 uppercase tracking-wide">Validated At</dt>
                <dd class="mt-0.5 font-medium text-slate-800">{{ formatDate(system.validated_at) }}</dd>
              </div>
            </dl>
            <div v-if="system.validation_scope || system.compliance_impact" class="mt-4 border-t border-slate-100 pt-3 space-y-3">
              <div v-if="system.validation_scope">
                <dt class="text-xs font-medium uppercase tracking-wide text-slate-400">Validation Scope</dt>
                <dd class="mt-1 text-sm leading-relaxed text-slate-700">{{ system.validation_scope }}</dd>
              </div>
              <div v-if="system.compliance_impact">
                <dt class="text-xs font-medium uppercase tracking-wide text-slate-400">Compliance Impact</dt>
                <dd class="mt-1 text-sm leading-relaxed text-slate-700">{{ system.compliance_impact }}</dd>
              </div>
            </div>
          </div>

          <div :id="`section-requirements`">
            <RelatedRecordsPanel
              title="Requirements"
              :items="requirements"
              :columns="[
                { key: 'requirement_code', label: 'Code' },
                { key: 'requirement_type', label: 'Type' },
                { key: 'description', label: 'Description' },
                { key: 'risk_level', label: 'Risk' }
              ]"
              @create="() => {}"
            />
          </div>

          <div :id="`section-traceEntries`">
            <RelatedRecordsPanel
              title="Trace Matrix"
              :items="traceEntries"
              :columns="[
                { key: 'requirement_id', label: 'Requirement ID' },
                { key: 'trace_status', label: 'Status' },
                { key: 'notes', label: 'Notes' }
              ]"
              @create="() => {}"
            />
          </div>

          <div :id="`section-plans`">
            <RelatedRecordsPanel
              title="Validation Plans"
              :items="plans"
              :columns="[
                { key: 'scope', label: 'Scope' },
                { key: 'status', label: 'Status' },
                { key: 'created_at', label: 'Created' }
              ]"
              @create="() => {}"
            >
              <template #cell-created_at="{ value }">{{ formatDate(value) }}</template>
            </RelatedRecordsPanel>
          </div>

          <div :id="`section-protocols`">
            <RelatedRecordsPanel
              title="Protocol Instances"
              :items="protocols"
              :columns="[
                { key: 'protocol_name', label: 'Protocol' },
                { key: 'status', label: 'Status' },
                { key: 'created_at', label: 'Created' }
              ]"
              @create="() => {}"
            >
              <template #cell-created_at="{ value }">{{ formatDate(value) }}</template>
            </RelatedRecordsPanel>
          </div>

          <div :id="`section-deviations`">
            <RelatedRecordsPanel
              title="Validation Deviations"
              :items="validationDeviations"
              :columns="[
                { key: 'deviation_text', label: 'Deviation' },
                { key: 'status', label: 'Status' },
                { key: 'created_at', label: 'Captured' }
              ]"
              @create="() => {}"
            >
              <template #cell-created_at="{ value }">{{ formatDate(value) }}</template>
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
