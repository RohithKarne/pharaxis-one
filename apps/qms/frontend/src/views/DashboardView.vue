<script setup>
import { computed, onMounted, ref } from 'vue';
import QualityDataGrid from '../components/QualityDataGrid.vue';
import { apiRequest, getStoredAuth } from '../services/api';

const loading = ref(false);
const error = ref('');
const taskFilter = ref('');
const lastLoadedAt = ref('');
const documents = ref([]);
const capas = ref([]);
const deviations = ref([]);
const audits = ref([]);
const systems = ref([]);
const changes = ref([]);

const session = getStoredAuth();

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [docs, capaData, deviationData, auditData, validationData, changeData] = await Promise.all([
      apiRequest('/document-control/documents'),
      apiRequest('/capa'),
      apiRequest('/deviations'),
      apiRequest('/audits'),
      apiRequest('/validation/systems'),
      apiRequest('/change-control')
    ]);
    documents.value = docs.documents || [];
    capas.value = capaData.capas || [];
    deviations.value = deviationData.deviations || [];
    audits.value = auditData.audits || [];
    systems.value = validationData.systems || [];
    changes.value = changeData.changes || [];
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
    lastLoadedAt.value = new Date().toLocaleTimeString();
  }
}

const summaryCards = computed(() => [
  { label: 'Controlled Documents', value: documents.value.length, tone: 'teal' },
  { label: 'Open CAPAs', value: capas.value.filter((item) => item.status !== 'Closed').length, tone: 'cyan' },
  { label: 'Open Deviations', value: deviations.value.filter((item) => item.status !== 'Closed').length, tone: 'amber' },
  { label: 'Active Audits', value: audits.value.filter((item) => item.status !== 'Closed').length, tone: 'blue' },
  { label: 'Validation Systems', value: systems.value.length, tone: 'violet' },
  { label: 'Change Requests', value: changes.value.length, tone: 'indigo' }
]);

const pendingApprovals = computed(() => {
  const docApprovals = documents.value.filter((item) => item.active_status === 'Review').length;
  const changeApprovals = changes.value.filter((item) => item.status === 'PendingApproval').length;
  return docApprovals + changeApprovals;
});

const myTasks = computed(() => {
  const tasks = [];
  for (const capa of capas.value.filter((item) => item.status !== 'Closed').slice(0, 4)) {
    tasks.push({ type: 'CAPA', code: capa.capa_code, title: capa.title, status: capa.status });
  }
  for (const item of changes.value.filter((change) => change.status !== 'Closed').slice(0, 4)) {
    tasks.push({ type: 'Change', code: item.change_code, title: item.title, status: item.status });
  }
  return tasks.slice(0, 8);
});

const filteredTasks = computed(() => {
  const query = taskFilter.value.trim().toLowerCase();
  if (!query) return myTasks.value;
  return myTasks.value.filter(
    (task) =>
      task.type.toLowerCase().includes(query) ||
      task.code.toLowerCase().includes(query) ||
      task.title.toLowerCase().includes(query) ||
      task.status.toLowerCase().includes(query)
  );
});

const taskColumns = [
  { key: 'type', label: 'Type' },
  { key: 'code', label: 'Code' },
  { key: 'title', label: 'Title' },
  { key: 'status', label: 'Status' }
];

const complianceAlerts = computed(() => {
  const alerts = [];
  if (pendingApprovals.value > 0) {
    alerts.push(`${pendingApprovals.value} records require approval action`);
  }
  const overdueCapas = capas.value.filter((item) => item.status !== 'Closed' && item.due_date).length;
  if (overdueCapas > 0) {
    alerts.push(`${overdueCapas} CAPA records carry due-date sensitivity`);
  }
  const openDeviations = deviations.value.filter((item) => item.status !== 'Closed').length;
  if (openDeviations > 0) {
    alerts.push(`${openDeviations} open deviations need investigation visibility`);
  }
  return alerts;
});

onMounted(load);
</script>

<template>
  <section class="space-y-4">
    <header class="rounded-2xl border border-slate-200 bg-white p-5">
      <p class="text-xs uppercase tracking-[0.14em] text-slate-500">Quality Operations Dashboard</p>
      <h2 class="mt-2 text-2xl font-bold text-slate-900">Welcome, {{ session?.user?.fullName || 'QMS User' }}</h2>
      <p class="mt-2 text-sm text-slate-600">
        Real-time view of quality workload, pending approvals, compliance alerts, and active records.
      </p>
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <input
          v-model="taskFilter"
          class="rounded border border-slate-300 px-3 py-1.5 text-xs"
          placeholder="Filter tasks by type, code, title, or status"
        />
        <button class="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700" @click="load">
          Refresh Dashboard
        </button>
        <span class="text-xs text-slate-600">Last sync: {{ lastLoadedAt || 'Not synced yet' }}</span>
      </div>
    </header>

    <section class="grid gap-3 xl:grid-cols-6 md:grid-cols-3 sm:grid-cols-2">
      <article
        v-for="card in summaryCards"
        :key="card.label"
        class="rounded-xl border border-slate-200 bg-white p-4"
      >
        <p class="text-[11px] uppercase tracking-[0.08em] text-slate-500">{{ card.label }}</p>
        <p class="mt-2 text-3xl font-extrabold text-slate-900">{{ card.value }}</p>
      </article>
    </section>

    <section class="grid gap-4 xl:grid-cols-3">
      <article class="rounded-2xl border border-slate-200 bg-white p-4 xl:col-span-2">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold text-slate-900">My Tasks</h3>
          <button class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700" @click="load">
            Refresh
          </button>
        </div>
        <p v-if="loading" class="mt-3 text-sm text-slate-600">Loading latest records...</p>
        <p v-else-if="myTasks.length === 0" class="mt-3 text-sm text-slate-600">No active tasks right now.</p>
        <p v-else-if="filteredTasks.length === 0" class="mt-3 text-sm text-slate-600">No tasks match the current filter.</p>
        <div v-else class="mt-3">
          <QualityDataGrid
            :columns="taskColumns"
            :rows="filteredTasks.map((task) => ({ ...task, rowKey: `${task.type}-${task.code}` }))"
            row-key="rowKey"
            storage-key="qms_dashboard_task_views"
            empty-text="No tasks available."
          >
            <template #cell-status="{ value }">
              <span class="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{{ value }}</span>
            </template>
          </QualityDataGrid>
        </div>
      </article>

      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Compliance Alerts</h3>
        <ul v-if="complianceAlerts.length" class="mt-3 space-y-2 text-sm">
          <li v-for="alert in complianceAlerts" :key="alert" class="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
            {{ alert }}
          </li>
        </ul>
        <p v-else class="mt-3 text-sm text-slate-600">No compliance alerts right now.</p>
      </article>
    </section>

    <section class="grid gap-4 xl:grid-cols-2">
      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Pending Approvals</h3>
        <p class="mt-2 text-3xl font-extrabold text-slate-900">{{ pendingApprovals }}</p>
        <p class="mt-1 text-sm text-slate-600">Document reviews and change requests awaiting approval.</p>
      </article>
      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Recent Activity Snapshot</h3>
        <p class="mt-2 text-sm text-slate-600">
          CAPA: {{ capas.length }} total • Deviations: {{ deviations.length }} total • Audits: {{ audits.length }} total
        </p>
      </article>
    </section>

    <p v-if="error" class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
  </section>
</template>
