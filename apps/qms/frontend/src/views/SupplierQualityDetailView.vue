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
const allSuppliers = ref([])
const allAudits = ref([])
const allScars = ref([])
const activeSection = ref('audits')
const showActionPanel = ref(false)
const actionLoading = ref(false)
const actionMessage = ref('')

const availableActions = computed(() => {
  const status = supplier.value?.qualification_status
  const id = route.params.id
  if (!status) return []
  const transitions = { Pending: 'Qualified', Qualified: 'Conditional', Conditional: 'Disqualified' }
  if (transitions[status]) return [{ label: `Mark as ${transitions[status]}`, endpoint: `/supplier-quality/suppliers/${id}`, method: 'PATCH', bodyFn: () => ({ qualificationStatus: transitions[status] }) }]
  return []
})

async function performAction(action) {
  actionLoading.value = true
  actionMessage.value = ''
  try {
    await apiRequest(action.endpoint, { method: action.method, body: action.bodyFn() })
    actionMessage.value = `${action.label} — completed.`
    showActionPanel.value = false
    await loadData()
  } catch (err) {
    actionMessage.value = `Error: ${err.message}`
  } finally {
    actionLoading.value = false
  }
}

const supplier = computed(() =>
  allSuppliers.value.find(s => s.id === route.params.id) || null
)

const supplierAudits = computed(() =>
  allAudits.value.filter(a => a.supplier_id === route.params.id)
)

const supplierScars = computed(() =>
  allScars.value.filter(r => r.supplier_id === route.params.id)
)

const SUPPLIER_LIFECYCLE = [
  { key: 'Pending', label: 'Pending' },
  { key: 'Qualified', label: 'Qualified' },
  { key: 'Conditional', label: 'Conditional' },
  { key: 'Disqualified', label: 'Disqualified' }
]

const sidebarSections = computed(() => [
  {
    title: 'Performance',
    items: [
      { key: 'audits', label: 'Supplier Audits', count: supplierAudits.value.length },
      { key: 'scars', label: 'SCARs', count: supplierScars.value.length }
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
  if (!allSuppliers.value.length) return null
  const idx = allSuppliers.value.findIndex(s => s.id === route.params.id)
  return idx >= 0 ? idx + 1 : null
})

async function loadData() {
  loading.value = true
  error.value = ''
  try {
    const data = await apiRequest('/supplier-quality')
    allSuppliers.value = data.suppliers || []
    allAudits.value = data.supplierAudits || []
    allScars.value = data.scars || []
  } catch (err) {
    error.value = err.message || 'Failed to load supplier data.'
  } finally {
    loading.value = false
  }
}

function navigateRecord(delta) {
  const idx = allSuppliers.value.findIndex(s => s.id === route.params.id)
  const next = allSuppliers.value[idx + delta]
  if (next) router.push(`/supplier-quality/${next.id}`)
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
  if (newId) await loadData()
})

onMounted(async () => {
  await loadData()
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
        Loading supplier record…
      </div>
    </div>

    <div v-else-if="error" class="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
      {{ error }}
      <button class="ml-4 underline hover:no-underline" @click="loadData">Retry</button>
    </div>

    <div v-else-if="!supplier" class="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
      Supplier not found.
      <button class="ml-4 underline" @click="router.push('/supplier-quality')">Back to list</button>
    </div>

    <template v-else>

      <RecordHeader
        :breadcrumb="`Supplier Quality / ${supplier.supplier_code}`"
        :doc-number="supplier.supplier_code"
        :title="supplier.supplier_name"
        :status="supplier.qualification_status"
        :position="currentPosition"
        :total="allSuppliers.length || null"
        :lifecycle-states="SUPPLIER_LIFECYCLE"
        @back="router.push('/supplier-quality')"
        @prev="navigateRecord(-1)"
        @next="navigateRecord(1)"
        @edit="() => {}"
        @copy="() => {}"
        @action="showActionPanel = !showActionPanel"
      />

      <!-- Action Panel -->
      <div v-if="showActionPanel" class="rounded-xl border border-indigo-200 bg-indigo-50 p-4 space-y-3">
        <div class="flex items-center justify-between">
          <p class="text-sm font-semibold text-indigo-800">Qualification Actions — Current Status: <span class="font-bold">{{ supplier.qualification_status }}</span></p>
          <button class="text-xs text-indigo-500 hover:underline" @click="showActionPanel = false">Close</button>
        </div>
        <div v-if="availableActions.length" class="space-y-2">
          <button v-for="action in availableActions" :key="action.label" class="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50" :disabled="actionLoading" @click="performAction(action)">
            {{ actionLoading ? 'Processing…' : action.label }}
          </button>
        </div>
        <p v-else class="text-sm text-indigo-600">No further qualification transitions available.</p>
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
                <dt class="text-xs font-medium text-slate-400 uppercase tracking-wide">Supplier Type</dt>
                <dd class="mt-0.5 font-medium text-slate-800">{{ supplier.supplier_type || '—' }}</dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-slate-400 uppercase tracking-wide">Risk Level</dt>
                <dd class="mt-0.5 font-medium text-slate-800">{{ supplier.risk_level || '—' }}</dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-slate-400 uppercase tracking-wide">Scorecard Rating</dt>
                <dd class="mt-0.5 font-medium text-slate-800">{{ supplier.scorecard_rating ?? '—' }}</dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-slate-400 uppercase tracking-wide">Contact Email</dt>
                <dd class="mt-0.5 font-medium text-slate-800">{{ supplier.contact_email || '—' }}</dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-slate-400 uppercase tracking-wide">Approved At</dt>
                <dd class="mt-0.5 font-medium text-slate-800">{{ formatDate(supplier.approved_at) }}</dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-slate-400 uppercase tracking-wide">Total Audits</dt>
                <dd class="mt-0.5 font-medium text-slate-800">{{ supplierAudits.length }}</dd>
              </div>
            </dl>
          </div>

          <div :id="`section-audits`">
            <RelatedRecordsPanel
              title="Supplier Audits"
              :items="supplierAudits"
              :columns="[
                { key: 'audit_type', label: 'Type' },
                { key: 'outcome', label: 'Outcome' },
                { key: 'planned_date', label: 'Planned' },
                { key: 'findings_count', label: 'Findings' }
              ]"
              @create="() => {}"
            >
              <template #cell-planned_date="{ value }">{{ formatDate(value) }}</template>
            </RelatedRecordsPanel>
          </div>

          <div :id="`section-scars`">
            <RelatedRecordsPanel
              title="SCARs"
              :items="supplierScars"
              :columns="[
                { key: 'scar_code', label: 'SCAR' },
                { key: 'issue_summary', label: 'Issue' },
                { key: 'status', label: 'Status' },
                { key: 'due_date', label: 'Due Date' }
              ]"
              @create="() => {}"
            >
              <template #cell-due_date="{ value }">{{ formatDate(value) }}</template>
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
