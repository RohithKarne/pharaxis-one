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
const allComplaints = ref([])
const activeSection = ref('capaLinks')
const showActionPanel = ref(false)
const actionLoading = ref(false)
const actionMessage = ref('')
const actionNotes = ref('')

const availableActions = computed(() => {
  const status = complaint.value?.status
  const id = route.params.id
  if (!status) return []
  const next = { Open: 'Investigation', Investigation: 'CapaLinked', CapaLinked: 'Closed' }
  if (next[status]) return [{ label: `Advance to ${next[status].replace(/([A-Z])/g, ' $1').trim()}`, endpoint: `/complaints/${id}`, method: 'PATCH', bodyFn: () => ({ status: next[status] }), requiresNotes: false }]
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

const complaint = computed(() => detail.value?.complaint || null)
const capaLinks = computed(() => detail.value?.capaLinks || [])

const COMPLAINTS_LIFECYCLE = [
  { key: 'Open', label: 'Open' },
  { key: 'Investigation', label: 'Investigation' },
  { key: 'CapaLinked', label: 'CAPA Linked' },
  { key: 'Escalated', label: 'Escalated' },
  { key: 'Closed', label: 'Closed' }
]

const sidebarSections = computed(() => [
  {
    title: 'Investigation & Actions',
    items: [
      { key: 'capaLinks', label: 'CAPA Links', count: capaLinks.value.length }
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
  if (!allComplaints.value.length) return null
  const idx = allComplaints.value.findIndex(c => c.id === route.params.id)
  return idx >= 0 ? idx + 1 : null
})

async function loadDetail() {
  loading.value = true
  error.value = ''
  try {
    const data = await apiRequest(`/complaints/${route.params.id}`)
    detail.value = data
  } catch (err) {
    error.value = err.message || 'Failed to load complaint.'
  } finally {
    loading.value = false
  }
}

async function loadList() {
  try {
    const data = await apiRequest('/complaints')
    allComplaints.value = data.complaints || []
  } catch {
    allComplaints.value = []
  }
}

function navigateRecord(delta) {
  const idx = allComplaints.value.findIndex(c => c.id === route.params.id)
  const next = allComplaints.value[idx + delta]
  if (next) router.push(`/complaints/${next.id}`)
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
        Loading complaint…
      </div>
    </div>

    <div v-else-if="error" class="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
      {{ error }}
      <button class="ml-4 underline hover:no-underline" @click="loadDetail">Retry</button>
    </div>

    <template v-else-if="complaint">

      <RecordHeader
        :breadcrumb="`Complaints / ${complaint.complaint_code}`"
        :doc-number="complaint.complaint_code"
        :title="complaint.summary"
        :status="complaint.status"
        :position="currentPosition"
        :total="allComplaints.length || null"
        :lifecycle-states="COMPLAINTS_LIFECYCLE"
        @back="router.push('/complaints')"
        @prev="navigateRecord(-1)"
        @next="navigateRecord(1)"
        @edit="() => {}"
        @copy="() => {}"
        @action="showActionPanel = !showActionPanel"
      />

      <!-- Action Panel -->
      <div v-if="showActionPanel" class="rounded-xl border border-indigo-200 bg-indigo-50 p-4 space-y-3">
        <div class="flex items-center justify-between">
          <p class="text-sm font-semibold text-indigo-800">Lifecycle Actions — Current Status: <span class="font-bold">{{ complaint.status }}</span></p>
          <button class="text-xs text-indigo-500 hover:underline" @click="showActionPanel = false">Close</button>
        </div>
        <div v-if="availableActions.length" class="space-y-2">
          <div v-for="action in availableActions" :key="action.label" class="rounded-lg border border-indigo-200 bg-white p-3">
            <button class="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50" :disabled="actionLoading" @click="performAction(action)">
              {{ actionLoading ? 'Processing…' : action.label }}
            </button>
          </div>
        </div>
        <p v-else class="text-sm text-indigo-600">No further actions available.</p>
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
                <dt class="text-xs font-medium text-slate-400 uppercase tracking-wide">Source Channel</dt>
                <dd class="mt-0.5 font-medium text-slate-800">{{ complaint.source_channel || '—' }}</dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-slate-400 uppercase tracking-wide">Severity</dt>
                <dd class="mt-0.5 font-medium text-slate-800">{{ complaint.severity || '—' }}</dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-slate-400 uppercase tracking-wide">Customer</dt>
                <dd class="mt-0.5 font-medium text-slate-800">{{ complaint.customer_name || '—' }}</dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-slate-400 uppercase tracking-wide">Product</dt>
                <dd class="mt-0.5 font-medium text-slate-800">{{ complaint.product_name || '—' }}</dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-slate-400 uppercase tracking-wide">Batch / Lot</dt>
                <dd class="mt-0.5 font-medium text-slate-800">{{ complaint.batch_lot_no || '—' }}</dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-slate-400 uppercase tracking-wide">Due Date</dt>
                <dd class="mt-0.5 font-medium text-slate-800">{{ formatDate(complaint.due_date) }}</dd>
              </div>
            </dl>
            <div v-if="complaint.details" class="mt-4 border-t border-slate-100 pt-3">
              <dt class="text-xs font-medium uppercase tracking-wide text-slate-400">Details</dt>
              <dd class="mt-1 text-sm leading-relaxed text-slate-700">{{ complaint.details }}</dd>
            </div>
          </div>

          <div :id="`section-capaLinks`">
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
