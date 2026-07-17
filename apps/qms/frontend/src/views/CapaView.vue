<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { apiRequest } from '../services/api';
import { useModuleAccess } from '../composables/useModuleAccess';

const router = useRouter();
const loading = ref(false);
const error = ref('');
const message = ref('');
const list = ref([]);
const showCreate = ref(false);
const creating = ref(false);
const searchQuery = ref('');
const statusFilter = ref('All');
const riskFilter = ref('All');
const dueFilter = ref('All');
const sourceFilter = ref('All');

const DAY_MS = 24 * 60 * 60 * 1000;
const STATUS_FILTERS = ['All', 'Draft', 'Submitted', 'Investigation', 'ActionPlanApproval', 'InExecution', 'EffectivenessPending', 'Closed', 'Reopened'];
const RISK_FILTERS = ['All', 'Critical', 'High', 'Medium', 'Low', 'Unscored'];
const DUE_FILTERS = ['All', 'Overdue', 'Due Soon', 'No Due Date'];
const SOURCE_FILTERS = ['All', 'Manual', 'Deviation', 'AuditFinding', 'Complaint', 'ChangeControl', 'DocumentControl', 'Validation'];

const createForm = ref({
  title: '',
  sourceType: 'Manual',
  classification: 'Corrective',
  dueDate: '',
  department: '',
  productName: '',
  severity: 3,
  occurrence: 3,
  detectability: 3
});

const { isWriteDisabled, writeDisabledReason, withWriteAccess } = useModuleAccess('capa');

function formatDate(val) {
  if (!val) return '—';
  return new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function normalizeStatus(value) {
  return String(value || 'Draft').trim();
}

function isOpenStatus(value) {
  return !['Closed', 'Cancelled'].includes(normalizeStatus(value));
}

function daysUntil(value) {
  if (!value) return null;
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / DAY_MS);
}

function matchesDueFilter(capa) {
  const days = daysUntil(capa.due_date);
  if (dueFilter.value === 'Overdue') return isOpenStatus(capa.status) && days !== null && days < 0;
  if (dueFilter.value === 'Due Soon') return isOpenStatus(capa.status) && days !== null && days >= 0 && days <= 14;
  if (dueFilter.value === 'No Due Date') return days === null;
  return true;
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const data = await apiRequest('/capa');
    list.value = data.capas || [];
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

async function createCapa() {
  if (!withWriteAccess((t) => { message.value = t; })) return;
  creating.value = true;
  try {
    await apiRequest('/capa', {
      method: 'POST',
      body: {
        ...createForm.value,
        dueDate: createForm.value.dueDate || null,
        department: createForm.value.department || null,
        productName: createForm.value.productName || null
      }
    });
    message.value = 'CAPA created successfully.';
    createForm.value.title = '';
    createForm.value.department = '';
    createForm.value.productName = '';
    createForm.value.dueDate = '';
    showCreate.value = false;
    await load();
  } catch (err) {
    error.value = err.message;
  } finally {
    creating.value = false;
  }
}

const STATUS_COLORS = {
  Draft: 'bg-slate-50 text-slate-600 border-slate-200',
  Submitted: 'bg-blue-50 text-blue-700 border-blue-200',
  Investigation: 'bg-amber-50 text-amber-700 border-amber-200',
  ActionPlanApproval: 'bg-purple-50 text-purple-700 border-purple-200',
  InExecution: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  EffectivenessPending: 'bg-orange-50 text-orange-700 border-orange-200',
  Closed: 'bg-green-50 text-green-700 border-green-200'
};

const RISK_COLORS = {
  Critical: 'bg-red-100 text-red-800',
  High: 'bg-orange-100 text-orange-800',
  Medium: 'bg-amber-100 text-amber-800',
  Low: 'bg-green-100 text-green-800'
};

const capaKpis = computed(() => {
  const openCapas = list.value.filter((capa) => isOpenStatus(capa.status));
  const highRisk = openCapas.filter((capa) => ['High', 'Critical'].includes(capa.risk_band));
  const overdue = openCapas.filter((capa) => {
    const days = daysUntil(capa.due_date);
    return days !== null && days < 0;
  });
  const dueSoon = openCapas.filter((capa) => {
    const days = daysUntil(capa.due_date);
    return days !== null && days >= 0 && days <= 14;
  });
  const effectivenessPending = list.value.filter((capa) => normalizeStatus(capa.status) === 'EffectivenessPending');

  return [
    { label: 'Total CAPAs', value: list.value.length, detail: 'All corrective/preventive records' },
    { label: 'Open CAPAs', value: openCapas.length, detail: 'Still moving through lifecycle' },
    { label: 'High/Critical Risk', value: highRisk.length, detail: 'Needs QA leadership attention' },
    { label: 'Overdue', value: overdue.length, detail: 'Past due date and not closed' },
    { label: 'Due Soon', value: dueSoon.length, detail: 'Due in the next 14 days' },
    { label: 'Effectiveness Review', value: effectivenessPending.length, detail: 'Awaiting verification before closure' }
  ];
});

const filteredCapas = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  return list.value.filter((capa) => {
    const status = normalizeStatus(capa.status);
    const searchable = [
      capa.capa_code,
      capa.title,
      capa.source_type,
      capa.classification,
      capa.risk_band,
      capa.department,
      capa.product_name,
      status
    ].join(' ').toLowerCase();

    const matchesSearch = !query || searchable.includes(query);
    const matchesStatus = statusFilter.value === 'All' || status === statusFilter.value;
    const matchesRisk =
      riskFilter.value === 'All' ||
      (riskFilter.value === 'Unscored' ? !capa.risk_band : capa.risk_band === riskFilter.value);
    const matchesSource = sourceFilter.value === 'All' || capa.source_type === sourceFilter.value;

    return matchesSearch && matchesStatus && matchesRisk && matchesSource && matchesDueFilter(capa);
  });
});

onMounted(load);
</script>

<template>
  <div class="flex h-full flex-col">

    <div class="flex items-start justify-between rounded-xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
      <div>
        <p class="text-xs font-semibold uppercase tracking-widest text-slate-400">Quality Management</p>
        <h1 class="mt-0.5 text-2xl font-bold text-slate-900">CAPA</h1>
        <p class="mt-1 text-sm text-slate-500">Corrective and Preventive Actions — investigate root causes and drive closure.</p>
      </div>
      <button
        class="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
        :disabled="isWriteDisabled"
        @click="showCreate = true"
      >
        <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z"/></svg>
        New CAPA
      </button>
    </div>

    <p v-if="isWriteDisabled" class="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">{{ writeDisabledReason }}</p>

    <section class="mt-3 grid gap-3 xl:grid-cols-6 md:grid-cols-3 sm:grid-cols-2">
      <article
        v-for="kpi in capaKpis"
        :key="kpi.label"
        class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      >
        <p class="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{{ kpi.label }}</p>
        <p class="mt-2 text-2xl font-extrabold text-slate-900">{{ kpi.value }}</p>
        <p class="mt-1 text-xs text-slate-500">{{ kpi.detail }}</p>
      </article>
    </section>

    <div class="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div class="border-b border-slate-100 bg-slate-50 px-4 py-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-slate-700">
              {{ loading ? 'Loading…' : `${filteredCapas.length} of ${list.length} record${list.length !== 1 ? 's' : ''}` }}
            </p>
            <p class="text-xs text-slate-500">Filter by status, risk, source, and due-date pressure.</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <input
              v-model="searchQuery"
              class="h-8 w-60 rounded border border-slate-300 px-3 text-xs"
              type="search"
              placeholder="Search code, title, department, product"
            />
            <select v-model="statusFilter" class="h-8 rounded border border-slate-300 px-2 text-xs">
              <option v-for="status in STATUS_FILTERS" :key="status" :value="status">{{ status }} status</option>
            </select>
            <select v-model="riskFilter" class="h-8 rounded border border-slate-300 px-2 text-xs">
              <option v-for="risk in RISK_FILTERS" :key="risk" :value="risk">{{ risk }} risk</option>
            </select>
            <select v-model="sourceFilter" class="h-8 rounded border border-slate-300 px-2 text-xs">
              <option v-for="source in SOURCE_FILTERS" :key="source" :value="source">{{ source }} source</option>
            </select>
            <select v-model="dueFilter" class="h-8 rounded border border-slate-300 px-2 text-xs">
              <option v-for="due in DUE_FILTERS" :key="due" :value="due">{{ due }} due</option>
            </select>
          </div>
        </div>
      </div>

      <div v-if="loading" class="flex items-center justify-center py-16">
        <svg class="h-5 w-5 animate-spin text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10" stroke-width="2" stroke-opacity="0.25"/>
          <path d="M12 2a10 10 0 0 1 10 10" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </div>

      <div v-else-if="!list.length" class="py-16 text-center text-sm text-slate-400">
        No CAPA records found. Click <strong>New CAPA</strong> to get started.
      </div>

      <div v-else-if="!filteredCapas.length" class="py-16 text-center text-sm text-slate-400">
        No CAPA records match the current filters.
      </div>

      <table v-else class="w-full text-sm">
        <thead>
          <tr class="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
            <th class="px-4 py-3">Code</th>
            <th class="px-4 py-3">Title</th>
            <th class="px-4 py-3">Source</th>
            <th class="px-4 py-3">Classification</th>
            <th class="px-4 py-3">Risk Band</th>
            <th class="px-4 py-3">Department</th>
            <th class="px-4 py-3">Due Date</th>
            <th class="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="capa in filteredCapas"
            :key="capa.id"
            class="cursor-pointer border-b border-slate-50 transition-colors last:border-0 hover:bg-slate-50"
            @click="router.push('/capa/' + capa.id)"
          >
            <td class="px-4 py-3 font-mono text-xs font-semibold text-indigo-600">{{ capa.capa_code }}</td>
            <td class="max-w-xs px-4 py-3 font-medium text-slate-800"><span class="line-clamp-1">{{ capa.title }}</span></td>
            <td class="px-4 py-3 text-slate-600">{{ capa.source_type }}</td>
            <td class="px-4 py-3 text-slate-600">{{ capa.classification }}</td>
            <td class="px-4 py-3">
              <span v-if="capa.risk_band" class="rounded-full px-2 py-0.5 text-xs font-medium" :class="RISK_COLORS[capa.risk_band] || 'bg-slate-100 text-slate-600'">{{ capa.risk_band }}</span>
              <span v-else class="text-slate-400">—</span>
            </td>
            <td class="px-4 py-3 text-slate-600">{{ capa.department || '—' }}</td>
            <td class="px-4 py-3 text-slate-600">{{ formatDate(capa.due_date) }}</td>
            <td class="px-4 py-3">
              <span class="rounded-full border px-2 py-0.5 text-xs font-medium" :class="STATUS_COLORS[capa.status] || 'bg-slate-50 text-slate-600 border-slate-200'">{{ capa.status }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-if="message" class="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{{ message }}</p>
    <p v-if="error" class="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{{ error }}</p>

    <Transition enter-active-class="transition-opacity duration-200" enter-from-class="opacity-0" leave-active-class="transition-opacity duration-200" leave-to-class="opacity-0">
      <div v-if="showCreate" class="fixed inset-0 z-40 bg-black/30" @click="showCreate = false" />
    </Transition>

    <Transition enter-active-class="transition-transform duration-300" enter-from-class="translate-x-full" leave-active-class="transition-transform duration-300" leave-to-class="translate-x-full">
      <div v-if="showCreate" class="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <div class="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 class="text-lg font-semibold text-slate-900">New CAPA</h2>
          <button class="rounded-lg p-2 text-slate-400 hover:bg-slate-100" @click="showCreate = false">
            <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"/></svg>
          </button>
        </div>
        <div class="flex-1 overflow-y-auto px-6 py-5">
          <fieldset :disabled="isWriteDisabled" class="grid gap-3">
            <div>
              <label class="text-xs font-semibold text-slate-500">Title <span class="text-red-500">*</span></label>
              <input v-model="createForm.title" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none" placeholder="CAPA title" />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-xs font-semibold text-slate-500">Source Type</label>
                <select v-model="createForm.sourceType" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none">
                  <option>Manual</option><option>Deviation</option><option>AuditFinding</option><option>Complaint</option><option>ChangeControl</option><option>DocumentControl</option><option>Validation</option>
                </select>
              </div>
              <div>
                <label class="text-xs font-semibold text-slate-500">Classification</label>
                <select v-model="createForm.classification" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none">
                  <option>Corrective</option><option>Preventive</option><option>Both</option>
                </select>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-xs font-semibold text-slate-500">Department</label>
                <input v-model="createForm.department" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none" placeholder="Department" />
              </div>
              <div>
                <label class="text-xs font-semibold text-slate-500">Product</label>
                <input v-model="createForm.productName" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none" placeholder="Product" />
              </div>
            </div>
            <div>
              <label class="text-xs font-semibold text-slate-500">Due Date</label>
              <input v-model="createForm.dueDate" type="date" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none" />
            </div>
            <div>
              <label class="text-xs font-semibold text-slate-500">Risk Scores (1–5)</label>
              <div class="mt-1 grid grid-cols-3 gap-2">
                <div>
                  <label class="text-xs text-slate-400">Severity</label>
                  <input v-model.number="createForm.severity" type="number" min="1" max="5" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none" />
                </div>
                <div>
                  <label class="text-xs text-slate-400">Occurrence</label>
                  <input v-model.number="createForm.occurrence" type="number" min="1" max="5" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none" />
                </div>
                <div>
                  <label class="text-xs text-slate-400">Detectability</label>
                  <input v-model.number="createForm.detectability" type="number" min="1" max="5" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none" />
                </div>
              </div>
            </div>
          </fieldset>
        </div>
        <div class="border-t border-slate-200 px-6 py-4 flex gap-3">
          <button
            class="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            :disabled="!createForm.title || creating || isWriteDisabled"
            @click="createCapa"
          >
            {{ creating ? 'Creating…' : 'Create CAPA' }}
          </button>
          <button class="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50" @click="showCreate = false">Cancel</button>
        </div>
      </div>
    </Transition>
  </div>
</template>
