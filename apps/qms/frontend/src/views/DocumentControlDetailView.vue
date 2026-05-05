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
const timeline = ref([])
const allDocuments = ref([])
const activeSection = ref('versions')
const showActionPanel = ref(false)
const actionLoading = ref(false)
const actionMessage = ref('')
const actionNotes = ref('')

const doc = computed(() => detail.value?.document || null)
const versions = computed(() => detail.value?.versions || [])
const reviews = computed(() => detail.value?.reviews || [])
const policies = computed(() => detail.value?.policies || [])
const distributionTargets = computed(() => detail.value?.distributionTargets || [])

const activeVersion = computed(() => {
  if (!versions.value.length) return null
  return versions.value.find(v => v.status === doc.value?.active_status) || versions.value[0]
})

const availableActions = computed(() => {
  const status = doc.value?.active_status
  const docId = route.params.id
  const vId = activeVersion.value?.id
  if (!status || !vId) return []
  const next = { Draft: 'Review', Review: 'Approved', Approved: 'Effective', Effective: 'Retired' }
  const labels = { Review: 'Submit for Review', Approved: 'Approve Document', Effective: 'Make Effective', Retired: 'Retire Document' }
  if (next[status]) {
    const toStatus = next[status]
    return [{
      label: labels[toStatus] || `Advance to ${toStatus}`,
      endpoint: `/document-control/documents/${docId}/versions/${vId}/transition`,
      method: 'POST',
      bodyFn: (notes) => ({ toStatus, ...(notes ? { notes } : {}) }),
      requiresNotes: toStatus === 'Retired',
      notesLabel: 'Reason for retirement'
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

const DOC_LIFECYCLE = [
  { key: 'Draft', label: 'Draft' },
  { key: 'Review', label: 'Review' },
  { key: 'Approved', label: 'Approved' },
  { key: 'Effective', label: 'Effective' },
  { key: 'Retired', label: 'Retired' }
]

const sidebarSections = computed(() => [
  {
    title: 'Document Content',
    items: [
      { key: 'versions', label: 'Versions', count: versions.value.length },
      { key: 'reviews', label: 'Periodic Reviews', count: reviews.value.length }
    ]
  },
  {
    title: 'Distribution & Access',
    items: [
      { key: 'distribution', label: 'Distribution Targets', count: distributionTargets.value.length },
      { key: 'policies', label: 'Access Policies', count: policies.value.length }
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
  if (!allDocuments.value.length) return null
  const idx = allDocuments.value.findIndex(d => d.id === route.params.id)
  return idx >= 0 ? idx + 1 : null
})

async function loadDetail() {
  loading.value = true
  error.value = ''
  try {
    const [detailData, timelineData] = await Promise.all([
      apiRequest(`/document-control/documents/${route.params.id}`),
      apiRequest(`/document-control/documents/${route.params.id}/timeline`)
    ])
    detail.value = detailData
    timeline.value = timelineData.timeline || []
  } catch (err) {
    error.value = err.message || 'Failed to load document.'
  } finally {
    loading.value = false
  }
}

async function loadList() {
  try {
    const data = await apiRequest('/document-control/documents')
    allDocuments.value = data.documents || []
  } catch {
    allDocuments.value = []
  }
}

function navigateRecord(delta) {
  const idx = allDocuments.value.findIndex(d => d.id === route.params.id)
  const next = allDocuments.value[idx + delta]
  if (next) router.push(`/document-control/${next.id}`)
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
        Loading document…
      </div>
    </div>

    <div v-else-if="error" class="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
      {{ error }}
      <button class="ml-4 underline hover:no-underline" @click="loadDetail">Retry</button>
    </div>

    <template v-else-if="doc">

      <RecordHeader
        :breadcrumb="`Document Control / ${doc.document_code}`"
        :doc-number="doc.document_code"
        :title="doc.title"
        :status="doc.active_status"
        :position="currentPosition"
        :total="allDocuments.length || null"
        :lifecycle-states="DOC_LIFECYCLE"
        @back="router.push('/document-control')"
        @prev="navigateRecord(-1)"
        @next="navigateRecord(1)"
        @edit="() => {}"
        @copy="() => {}"
        @action="showActionPanel = !showActionPanel"
      />

      <!-- Action Panel -->
      <div v-if="showActionPanel" class="rounded-xl border border-indigo-200 bg-indigo-50 p-4 space-y-3">
        <div class="flex items-center justify-between">
          <p class="text-sm font-semibold text-indigo-800">Lifecycle Actions — Current Status: <span class="font-bold">{{ doc.active_status }}</span></p>
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
        <p v-else class="text-sm text-indigo-600">No further lifecycle transitions available for this document.</p>
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
                <dt class="text-xs font-medium text-slate-400 uppercase tracking-wide">Document Type</dt>
                <dd class="mt-0.5 font-medium text-slate-800">{{ doc.document_type || '—' }}</dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-slate-400 uppercase tracking-wide">Subtype</dt>
                <dd class="mt-0.5 font-medium text-slate-800">{{ doc.document_subtype || '—' }}</dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-slate-400 uppercase tracking-wide">Department</dt>
                <dd class="mt-0.5 font-medium text-slate-800">{{ doc.department || '—' }}</dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-slate-400 uppercase tracking-wide">Criticality</dt>
                <dd class="mt-0.5 font-medium text-slate-800">{{ doc.criticality || '—' }}</dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-slate-400 uppercase tracking-wide">Active Version</dt>
                <dd class="mt-0.5 font-medium text-slate-800">{{ doc.active_version_no ?? '—' }}</dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-slate-400 uppercase tracking-wide">Next Review Due</dt>
                <dd class="mt-0.5 font-medium text-slate-800">{{ formatDate(doc.next_review_due_date) }}</dd>
              </div>
            </dl>
            <div v-if="doc.training_required" class="mt-4 border-t border-slate-100 pt-3 flex items-center gap-2">
              <span class="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                Training Required
              </span>
            </div>
          </div>

          <div :id="`section-versions`">
            <RelatedRecordsPanel
              title="Versions"
              :items="versions"
              :columns="[
                { key: 'version_no', label: 'Version' },
                { key: 'status', label: 'Status' },
                { key: 'effective_date', label: 'Effective' },
                { key: 'created_at', label: 'Created' }
              ]"
              @create="() => {}"
            >
              <template #cell-effective_date="{ value }">{{ formatDate(value) }}</template>
              <template #cell-created_at="{ value }">{{ formatDate(value) }}</template>
            </RelatedRecordsPanel>
          </div>

          <div :id="`section-reviews`">
            <RelatedRecordsPanel
              title="Periodic Reviews"
              :items="reviews"
              :columns="[
                { key: 'due_date', label: 'Due Date' },
                { key: 'status', label: 'Status' },
                { key: 'result', label: 'Result' }
              ]"
              @create="() => {}"
            >
              <template #cell-due_date="{ value }">{{ formatDate(value) }}</template>
            </RelatedRecordsPanel>
          </div>

          <div :id="`section-distribution`">
            <RelatedRecordsPanel
              title="Distribution Targets"
              :items="distributionTargets"
              :columns="[
                { key: 'target_type', label: 'Type' },
                { key: 'target_value', label: 'Target' },
                { key: 'acknowledgement_required', label: 'Ack Required' }
              ]"
              @create="() => {}"
            >
              <template #cell-acknowledgement_required="{ value }">
                {{ value ? 'Yes' : 'No' }}
              </template>
            </RelatedRecordsPanel>
          </div>

          <div :id="`section-policies`">
            <RelatedRecordsPanel
              title="Access Policies"
              :items="policies"
              :can-create="false"
              :columns="[
                { key: 'role_key', label: 'Role' },
                { key: 'can_view', label: 'View' },
                { key: 'can_download', label: 'Download' },
                { key: 'can_print', label: 'Print' }
              ]"
            >
              <template #cell-can_view="{ value }">{{ value ? '✓' : '—' }}</template>
              <template #cell-can_download="{ value }">{{ value ? '✓' : '—' }}</template>
              <template #cell-can_print="{ value }">{{ value ? '✓' : '—' }}</template>
            </RelatedRecordsPanel>
          </div>

          <div :id="`section-timeline`">
            <RelatedRecordsPanel
              title="Timeline"
              :items="timeline"
              :can-create="false"
              :columns="[
                { key: 'event_type', label: 'Event' },
                { key: 'to_status', label: 'Status' },
                { key: 'actor_name', label: 'Actor' },
                { key: 'event_at', label: 'Timestamp' }
              ]"
            >
              <template #cell-event_type="{ value }">
                <span class="font-medium text-slate-700 capitalize">{{ value }}</span>
              </template>
              <template #cell-event_at="{ value }">{{ formatDateTime(value) }}</template>
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
