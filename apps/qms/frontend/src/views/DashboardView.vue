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
const DAY_MS = 24 * 60 * 60 * 1000;

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

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeStatus(value) {
  return String(value || '').trim();
}

function isOpenStatus(value) {
  return !['Closed', 'Retired', 'Complete', 'Completed', 'Cancelled'].includes(normalizeStatus(value));
}

function daysUntil(value) {
  if (!value) return null;
  const dueDate = new Date(value);
  if (Number.isNaN(dueDate.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dueDate.setHours(0, 0, 0, 0);
  return Math.ceil((dueDate.getTime() - today.getTime()) / DAY_MS);
}

function isOverdue(value) {
  const diff = daysUntil(value);
  return diff !== null && diff < 0;
}

function isDueSoon(value, windowDays = 14) {
  const diff = daysUntil(value);
  return diff !== null && diff >= 0 && diff <= windowDays;
}

function formatDueDate(value) {
  if (!value) return 'No due date';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const summaryCards = computed(() => [
  {
    label: 'Controlled Documents',
    value: documents.value.length,
    detail: `${documents.value.filter((item) => normalizeStatus(item.status) === 'Review').length} in review`,
    accent: 'border-l-emerald-500'
  },
  {
    label: 'Open CAPAs',
    value: capas.value.filter((item) => isOpenStatus(item.status)).length,
    detail: `${capas.value.filter((item) => item.risk_band === 'High' || item.risk_band === 'Critical').length} high risk`,
    accent: 'border-l-cyan-500'
  },
  {
    label: 'Open Deviations',
    value: deviations.value.filter((item) => isOpenStatus(item.status)).length,
    detail: `${deviations.value.filter((item) => item.capa_id || item.linked_capa_id).length} linked to CAPA`,
    accent: 'border-l-amber-500'
  },
  {
    label: 'Active Audits',
    value: audits.value.filter((item) => isOpenStatus(item.status)).length,
    detail: `${audits.value.filter((item) => isOpenStatus(item.status)).length} require evidence`,
    accent: 'border-l-blue-500'
  },
  {
    label: 'Validation Systems',
    value: systems.value.length,
    detail: `${systems.value.filter((item) => isOpenStatus(item.status)).length} active records`,
    accent: 'border-l-violet-500'
  },
  {
    label: 'Change Requests',
    value: changes.value.length,
    detail: `${changes.value.filter((item) => isOpenStatus(item.status)).length} open changes`,
    accent: 'border-l-slate-500'
  }
]);

const pendingApprovals = computed(() => {
  const docApprovals = documents.value.filter((item) => normalizeStatus(item.active_status || item.status) === 'Review').length;
  const changeApprovals = changes.value.filter((item) => item.status === 'PendingApproval').length;
  return docApprovals + changeApprovals;
});

const qualityRiskSummary = computed(() => {
  const overdueCapas = capas.value.filter((item) => isOpenStatus(item.status) && isOverdue(item.due_date));
  const dueSoonCapas = capas.value.filter((item) => isOpenStatus(item.status) && isDueSoon(item.due_date));
  const overdueReviews = documents.value.filter((item) => isOpenStatus(item.status) && isOverdue(item.next_review_due_date));
  const highRiskCapas = capas.value.filter(
    (item) => isOpenStatus(item.status) && ['High', 'Critical'].includes(item.risk_band)
  );

  return [
    {
      label: 'Overdue CAPAs',
      value: overdueCapas.length,
      description: overdueCapas.length ? 'Needs owner follow-up' : 'No overdue CAPA due dates',
      tone: overdueCapas.length ? 'text-red-700 bg-red-50 border-red-200' : 'text-emerald-700 bg-emerald-50 border-emerald-200'
    },
    {
      label: 'Due Soon',
      value: dueSoonCapas.length,
      description: 'CAPAs due in the next 14 days',
      tone: dueSoonCapas.length ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-slate-700 bg-slate-50 border-slate-200'
    },
    {
      label: 'Review Risk',
      value: overdueReviews.length,
      description: 'Documents past next review date',
      tone: overdueReviews.length ? 'text-red-700 bg-red-50 border-red-200' : 'text-emerald-700 bg-emerald-50 border-emerald-200'
    },
    {
      label: 'High Risk CAPAs',
      value: highRiskCapas.length,
      description: 'High or critical risk band',
      tone: highRiskCapas.length ? 'text-orange-700 bg-orange-50 border-orange-200' : 'text-slate-700 bg-slate-50 border-slate-200'
    }
  ];
});

const myTasks = computed(() => {
  const tasks = [];
  for (const doc of documents.value.filter((item) => normalizeStatus(item.active_status || item.status) === 'Review').slice(0, 4)) {
    tasks.push({
      type: 'Document',
      code: doc.document_code || doc.code || 'DOC',
      title: doc.title || 'Untitled document',
      status: doc.status || doc.active_status || 'Review',
      due: formatDueDate(doc.next_review_due_date)
    });
  }
  for (const capa of capas.value.filter((item) => isOpenStatus(item.status)).slice(0, 4)) {
    tasks.push({
      type: 'CAPA',
      code: capa.capa_code || 'CAPA',
      title: capa.title || 'Untitled CAPA',
      status: capa.status || 'Open',
      due: formatDueDate(capa.due_date)
    });
  }
  for (const item of changes.value.filter((change) => isOpenStatus(change.status)).slice(0, 4)) {
    tasks.push({
      type: 'Change',
      code: item.change_code || 'CHG',
      title: item.title || 'Untitled change',
      status: item.status || 'Open',
      due: formatDueDate(item.due_date || item.target_date)
    });
  }
  return tasks.slice(0, 10);
});

const filteredTasks = computed(() => {
  const query = taskFilter.value.trim().toLowerCase();
  if (!query) return myTasks.value;
  return myTasks.value.filter(
    (task) =>
      task.type.toLowerCase().includes(query) ||
      String(task.code || '').toLowerCase().includes(query) ||
      String(task.title || '').toLowerCase().includes(query) ||
      String(task.status || '').toLowerCase().includes(query) ||
      String(task.due || '').toLowerCase().includes(query)
  );
});

const taskColumns = [
  { key: 'type', label: 'Type' },
  { key: 'code', label: 'Code' },
  { key: 'title', label: 'Title' },
  { key: 'status', label: 'Status' },
  { key: 'due', label: 'Due / Review' }
];

const complianceAlerts = computed(() => {
  const alerts = [];
  if (pendingApprovals.value > 0) {
    alerts.push({
      title: `${pendingApprovals.value} records require approval action`,
      detail: 'Document reviews and change requests should be cleared before product review.'
    });
  }
  const overdueCapas = capas.value.filter((item) => isOpenStatus(item.status) && isOverdue(item.due_date)).length;
  if (overdueCapas > 0) {
    alerts.push({
      title: `${overdueCapas} CAPA records are overdue`,
      detail: 'Overdue CAPA work is a compliance and delivery risk.'
    });
  }
  const openDeviations = deviations.value.filter((item) => isOpenStatus(item.status)).length;
  if (openDeviations > 0) {
    alerts.push({
      title: `${openDeviations} open deviations need investigation visibility`,
      detail: 'Deviation-to-CAPA linkage should stay visible for inspection readiness.'
    });
  }
  return alerts;
});

const moduleReadiness = computed(() => [
  {
    module: 'Document Control',
    stage: documents.value.length ? 'Operational' : 'Ready for first records',
    focus: 'Lifecycle, versioning, periodic review, training linkage',
    count: documents.value.length
  },
  {
    module: 'CAPA',
    stage: capas.value.length ? 'Operational' : 'Ready for first records',
    focus: 'RCA, action plans, approvals, effectiveness, reopen controls',
    count: capas.value.length
  },
  {
    module: 'Deviation',
    stage: deviations.value.length ? 'Operational' : 'Needs workflow proving',
    focus: 'Containment, investigation, reportability, CAPA linkage',
    count: deviations.value.length
  },
  {
    module: 'Audit',
    stage: audits.value.length ? 'Operational' : 'Needs evidence scenarios',
    focus: 'Planning, findings, responses, CAPA linkage, binder export',
    count: audits.value.length
  },
  {
    module: 'Validation',
    stage: systems.value.length ? 'Operational' : 'Needs traceability scenarios',
    focus: 'URS, plans, protocols, execution, VSR generation',
    count: systems.value.length
  },
  {
    module: 'Change Control',
    stage: changes.value.length ? 'Operational' : 'Needs impact scenarios',
    focus: 'Impact assessment, CAB review, implementation, closure',
    count: changes.value.length
  }
]);

const buildPriorities = [
  {
    phase: 'Now',
    title: 'Command center and core workflow visibility',
    outcome: 'Leadership can see workload, risks, approvals, and module readiness before daily build decisions.'
  },
  {
    phase: 'Next',
    title: 'Document Control plus CAPA polish',
    outcome: 'Make the two landing modules demo-ready with stronger forms, filters, lifecycle actions, and evidence views.'
  },
  {
    phase: 'Then',
    title: 'Deviation, Change, Audit, and Validation traceability',
    outcome: 'Connect quality records across modules so inspections can follow cause, action, evidence, and closure.'
  }
];

const loadedRecordCount = computed(
  () =>
    asArray(documents.value).length +
    asArray(capas.value).length +
    asArray(deviations.value).length +
    asArray(audits.value).length +
    asArray(systems.value).length +
    asArray(changes.value).length
);

onMounted(load);
</script>

<template>
  <section class="space-y-4">
    <header class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Quality Operations Dashboard</p>
          <h2 class="mt-2 text-2xl font-bold text-slate-900">Welcome, {{ session?.user?.fullName || 'QMS User' }}</h2>
          <p class="mt-2 max-w-3xl text-sm text-slate-600">
            Command-center view for QMS workload, compliance risk, approvals, and module readiness.
          </p>
        </div>
        <div class="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-right">
          <p class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Records Loaded</p>
          <p class="mt-1 text-2xl font-extrabold text-slate-900">{{ loadedRecordCount }}</p>
        </div>
      </div>
      <div class="mt-4 flex flex-wrap items-center gap-2">
        <input
          v-model="taskFilter"
          class="h-9 min-w-64 rounded border border-slate-300 px-3 text-sm"
          placeholder="Filter tasks by type, code, title, status, or due date"
        />
        <button class="h-9 rounded border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50" @click="load">
          Refresh Dashboard
        </button>
        <span class="text-xs text-slate-600">Last sync: {{ lastLoadedAt || 'Not synced yet' }}</span>
      </div>
    </header>

    <section class="grid gap-3 xl:grid-cols-6 md:grid-cols-3 sm:grid-cols-2">
      <article
        v-for="card in summaryCards"
        :key="card.label"
        class="rounded-lg border border-l-4 border-slate-200 bg-white p-4 shadow-sm"
        :class="card.accent"
      >
        <p class="text-[11px] uppercase tracking-[0.08em] text-slate-500">{{ card.label }}</p>
        <p class="mt-2 text-3xl font-extrabold text-slate-900">{{ card.value }}</p>
        <p class="mt-1 text-xs text-slate-500">{{ card.detail }}</p>
      </article>
    </section>

    <section class="grid gap-3 md:grid-cols-4">
      <article
        v-for="item in qualityRiskSummary"
        :key="item.label"
        class="rounded-lg border p-4"
        :class="item.tone"
      >
        <p class="text-xs font-semibold uppercase tracking-[0.08em]">{{ item.label }}</p>
        <p class="mt-2 text-3xl font-extrabold">{{ item.value }}</p>
        <p class="mt-1 text-xs">{{ item.description }}</p>
      </article>
    </section>

    <section class="grid gap-4 xl:grid-cols-3">
      <article class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-2">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-lg font-semibold text-slate-900">Attention Queue</h3>
            <p class="text-sm text-slate-500">Records that should be reviewed first during daily QMS execution.</p>
          </div>
          <button class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50" @click="load">
            Refresh
          </button>
        </div>
        <p v-if="loading" class="mt-3 text-sm text-slate-600">Loading latest records...</p>
        <p v-else-if="myTasks.length === 0" class="mt-3 text-sm text-slate-600">No active attention items right now.</p>
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

      <article class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 class="text-lg font-semibold text-slate-900">Compliance Alerts</h3>
        <ul v-if="complianceAlerts.length" class="mt-3 space-y-2">
          <li v-for="alert in complianceAlerts" :key="alert.title" class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <p class="text-sm font-semibold text-amber-900">{{ alert.title }}</p>
            <p class="mt-1 text-xs text-amber-800">{{ alert.detail }}</p>
          </li>
        </ul>
        <p v-else class="mt-3 text-sm text-slate-600">No compliance alerts right now.</p>
      </article>
    </section>

    <section class="grid gap-4 xl:grid-cols-3">
      <article class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 class="text-lg font-semibold text-slate-900">Pending Approvals</h3>
        <p class="mt-2 text-3xl font-extrabold text-slate-900">{{ pendingApprovals }}</p>
        <p class="mt-1 text-sm text-slate-600">Document reviews and change requests awaiting approval.</p>
      </article>
      <article class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-2">
        <h3 class="text-lg font-semibold text-slate-900">QMS Build Priorities</h3>
        <div class="mt-3 grid gap-3 md:grid-cols-3">
          <div v-for="item in buildPriorities" :key="item.phase" class="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p class="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">{{ item.phase }}</p>
            <p class="mt-1 text-sm font-semibold text-slate-900">{{ item.title }}</p>
            <p class="mt-1 text-xs text-slate-600">{{ item.outcome }}</p>
          </div>
        </div>
      </article>
    </section>

    <section class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 class="text-lg font-semibold text-slate-900">Module Readiness</h3>
          <p class="text-sm text-slate-500">Product and delivery view of what each QMS area needs next.</p>
        </div>
        <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Phase 1 command view</span>
      </div>
      <div class="mt-3 grid gap-3 lg:grid-cols-3 md:grid-cols-2">
        <article v-for="item in moduleReadiness" :key="item.module" class="rounded-lg border border-slate-200 p-3">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-sm font-semibold text-slate-900">{{ item.module }}</p>
              <p class="mt-1 text-xs text-slate-500">{{ item.focus }}</p>
            </div>
            <span class="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{{ item.count }}</span>
          </div>
          <p class="mt-3 rounded bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">{{ item.stage }}</p>
        </article>
      </div>
    </section>

    <p v-if="error" class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
  </section>
</template>
