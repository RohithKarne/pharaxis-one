<script setup>
import { computed, onMounted, ref } from 'vue';
import { apiRequest } from '../services/api';

const loading = ref(false);
const message = ref('');
const audits = ref([]);
const binderJobs = ref([]);
const selectedAuditId = ref('');
const detail = ref(null);
const capas = ref([]);

const createForm = ref({
  auditTitle: '',
  auditType: 'Internal',
  scope: '',
  plannedDate: ''
});

const findingForm = ref({
  description: '',
  findingType: 'Major',
  department: 'Quality',
  processArea: '',
  dueDate: '',
  responseDueDate: ''
});

const responseForm = ref({ findingId: '', responseText: '', proposedAction: '' });
const closeFindingForm = ref({ findingId: '', closureSummary: '', effectivenessResult: 'Effective' });
const closeAuditForm = ref({ closureSummary: '' });
const linkForm = ref({ findingId: '', capaId: '' });

const audit = computed(() => detail.value?.audit || null);
const findings = computed(() => detail.value?.findings || []);
const timeline = computed(() => detail.value?.timeline || []);

const auditTypes = ['Internal', 'External', 'RegulatoryInspection'];
const findingTypes = ['Observation', 'Minor', 'Major', 'Critical'];
const effectivenessOptions = ['Effective', 'PartiallyEffective', 'NotEffective'];

function setMessage(text) {
  message.value = text;
}

function hydrateFindingSelectors() {
  const firstFindingId = findings.value[0]?.id || '';
  responseForm.value.findingId = firstFindingId;
  closeFindingForm.value.findingId = firstFindingId;
  linkForm.value.findingId = firstFindingId;
}

async function refreshList() {
  loading.value = true;
  try {
    const [auditData, jobData] = await Promise.all([apiRequest('/audits'), apiRequest('/audits/binder/jobs')]);
    audits.value = auditData.audits || [];
    binderJobs.value = jobData.jobs || [];

    if (!selectedAuditId.value && audits.value.length > 0) {
      selectedAuditId.value = audits.value[0].id;
      await loadDetail();
    }
  } catch (error) {
    setMessage(error.message);
  } finally {
    loading.value = false;
  }
}

async function loadCapas() {
  try {
    const data = await apiRequest('/capa');
    capas.value = data.capas || [];
  } catch {
    capas.value = [];
  }
}

async function loadDetail() {
  if (!selectedAuditId.value) {
    detail.value = null;
    return;
  }

  try {
    const data = await apiRequest(`/audits/${selectedAuditId.value}`);
    detail.value = data;
    hydrateFindingSelectors();
  } catch (error) {
    setMessage(error.message);
  }
}

async function createAudit() {
  try {
    await apiRequest('/audits', {
      method: 'POST',
      body: {
        ...createForm.value,
        plannedDate: createForm.value.plannedDate || new Date().toISOString().slice(0, 10)
      }
    });
    setMessage('Audit created successfully.');
    createForm.value.auditTitle = '';
    createForm.value.scope = '';
    createForm.value.plannedDate = '';
    await refreshList();
  } catch (error) {
    setMessage(error.message);
  }
}

async function startAudit() {
  if (!selectedAuditId.value) return;
  try {
    await apiRequest(`/audits/${selectedAuditId.value}/start`, { method: 'POST' });
    setMessage('Audit moved to InProgress.');
    await loadDetail();
    await refreshList();
  } catch (error) {
    setMessage(error.message);
  }
}

async function addFinding() {
  if (!selectedAuditId.value) return;
  try {
    await apiRequest(`/audits/${selectedAuditId.value}/findings`, {
      method: 'POST',
      body: {
        ...findingForm.value,
        dueDate: findingForm.value.dueDate || null,
        responseDueDate: findingForm.value.responseDueDate || null
      }
    });
    setMessage('Finding created.');
    findingForm.value.description = '';
    findingForm.value.processArea = '';
    findingForm.value.dueDate = '';
    findingForm.value.responseDueDate = '';
    await loadDetail();
    await refreshList();
  } catch (error) {
    setMessage(error.message);
  }
}

async function respondFinding() {
  if (!selectedAuditId.value || !responseForm.value.findingId) return;
  try {
    await apiRequest(`/audits/${selectedAuditId.value}/findings/${responseForm.value.findingId}/respond`, {
      method: 'POST',
      body: {
        responseText: responseForm.value.responseText,
        proposedAction: responseForm.value.proposedAction || null
      }
    });
    setMessage('Finding response recorded.');
    responseForm.value.responseText = '';
    responseForm.value.proposedAction = '';
    await loadDetail();
    await refreshList();
  } catch (error) {
    setMessage(error.message);
  }
}

async function linkFindingToCapa() {
  if (!selectedAuditId.value || !linkForm.value.findingId || !linkForm.value.capaId) return;
  try {
    await apiRequest(`/audits/${selectedAuditId.value}/findings/${linkForm.value.findingId}/link-capa`, {
      method: 'POST',
      body: { capaId: linkForm.value.capaId }
    });
    setMessage('Finding linked to CAPA.');
    await loadDetail();
  } catch (error) {
    setMessage(error.message);
  }
}

async function closeFinding() {
  if (!selectedAuditId.value || !closeFindingForm.value.findingId) return;
  try {
    await apiRequest(`/audits/${selectedAuditId.value}/findings/${closeFindingForm.value.findingId}/close`, {
      method: 'POST',
      body: {
        closureSummary: closeFindingForm.value.closureSummary,
        effectivenessResult: closeFindingForm.value.effectivenessResult
      }
    });
    setMessage('Finding closed.');
    closeFindingForm.value.closureSummary = '';
    await loadDetail();
    await refreshList();
  } catch (error) {
    setMessage(error.message);
  }
}

async function closeAudit() {
  if (!selectedAuditId.value) return;
  try {
    await apiRequest(`/audits/${selectedAuditId.value}/close`, {
      method: 'POST',
      body: closeAuditForm.value
    });
    setMessage('Audit closed successfully.');
    closeAuditForm.value.closureSummary = '';
    await loadDetail();
    await refreshList();
  } catch (error) {
    setMessage(error.message);
  }
}

async function generateBinder() {
  try {
    await apiRequest('/audits/binder/generate', { method: 'POST', body: {} });
    setMessage('Inspection binder generated.');
    await refreshList();
  } catch (error) {
    setMessage(error.message);
  }
}

onMounted(async () => {
  await Promise.all([refreshList(), loadCapas()]);
});
</script>

<template>
  <section class="space-y-4">
    <header class="rounded-2xl border border-sky-100 bg-white p-4">
      <h2 class="text-xl font-bold text-sky-900">Audit Management Workspace</h2>
      <p class="mt-1 text-sm text-slate-600">Run enterprise audits with findings, responses, CAPA linkage, closure evidence, and binder output.</p>
      <p v-if="message" class="mt-2 text-sm text-indigo-700">{{ message }}</p>
    </header>

    <section class="grid gap-4 xl:grid-cols-3">
      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Create Audit</h3>
        <div class="mt-3 grid gap-2">
          <input v-model="createForm.auditTitle" class="rounded-lg border px-3 py-2 text-sm" placeholder="Audit title" />
          <select v-model="createForm.auditType" class="rounded-lg border px-3 py-2 text-sm">
            <option v-for="item in auditTypes" :key="item" :value="item">{{ item }}</option>
          </select>
          <textarea v-model="createForm.scope" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Scope"></textarea>
          <label class="text-xs text-slate-600">Planned Date</label>
          <input v-model="createForm.plannedDate" class="rounded-lg border px-3 py-2 text-sm" type="date" />
        </div>
        <button class="mt-3 rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white" @click="createAudit">Create Audit</button>
      </article>

      <article class="rounded-2xl border border-slate-200 bg-white p-4 xl:col-span-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-lg font-semibold text-slate-900">Audits</h3>
          <div class="flex gap-2">
            <button class="rounded-lg border border-sky-700 px-4 py-2 text-sm font-semibold text-sky-700" @click="refreshList">Refresh</button>
            <button class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white" @click="generateBinder">Generate Binder</button>
          </div>
        </div>
        <p v-if="loading" class="mt-2 text-sm text-slate-600">Loading audits...</p>
        <ul class="mt-3 max-h-64 space-y-2 overflow-auto text-sm">
          <li
            v-for="item in audits"
            :key="item.id"
            class="cursor-pointer rounded-lg border px-3 py-2"
            :class="selectedAuditId === item.id ? 'border-sky-500 bg-sky-50' : 'border-slate-200'"
            @click="selectedAuditId = item.id; loadDetail()"
          >
            <p class="font-semibold">{{ item.audit_code }} - {{ item.audit_title }}</p>
            <p class="text-xs text-slate-600">{{ item.status }} • Findings: {{ item.closed_findings || 0 }}/{{ item.total_findings || 0 }}</p>
          </li>
        </ul>
      </article>
    </section>

    <section v-if="audit" class="grid gap-4 xl:grid-cols-3">
      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Audit Actions</h3>
        <p class="mt-1 text-xs text-slate-600">Current Status: {{ audit.status }}</p>
        <button class="mt-3 rounded border border-sky-500 px-3 py-1 text-xs font-semibold text-sky-700" @click="startAudit">Start Audit</button>

        <h4 class="mt-4 text-sm font-semibold text-slate-900">Close Audit</h4>
        <textarea v-model="closeAuditForm.closureSummary" class="mt-2 w-full rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Closure summary"></textarea>
        <button class="mt-2 rounded border border-sky-500 px-3 py-1 text-xs font-semibold text-sky-700" @click="closeAudit">Close Audit</button>
      </article>

      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Findings</h3>
        <div class="mt-3 grid gap-2">
          <textarea v-model="findingForm.description" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Finding description"></textarea>
          <select v-model="findingForm.findingType" class="rounded-lg border px-3 py-2 text-sm">
            <option v-for="item in findingTypes" :key="item" :value="item">{{ item }}</option>
          </select>
          <input v-model="findingForm.department" class="rounded-lg border px-3 py-2 text-sm" placeholder="Department" />
          <input v-model="findingForm.processArea" class="rounded-lg border px-3 py-2 text-sm" placeholder="Process area" />
          <input v-model="findingForm.dueDate" class="rounded-lg border px-3 py-2 text-sm" type="date" />
          <input v-model="findingForm.responseDueDate" class="rounded-lg border px-3 py-2 text-sm" type="date" />
          <button class="rounded border border-sky-500 px-3 py-1 text-xs font-semibold text-sky-700" @click="addFinding">Add Finding</button>
        </div>

        <ul class="mt-3 max-h-36 space-y-2 overflow-auto text-xs">
          <li v-for="finding in findings" :key="finding.id" class="rounded border border-slate-200 px-2 py-1">
            {{ finding.finding_code || finding.id }} • {{ finding.finding_type }} • {{ finding.status }}
          </li>
        </ul>
      </article>

      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Responses & Closure</h3>
        <div class="mt-3 grid gap-2">
          <select v-model="responseForm.findingId" class="rounded-lg border px-3 py-2 text-sm">
            <option v-for="finding in findings" :key="`resp-${finding.id}`" :value="finding.id">{{ finding.finding_code || finding.id }}</option>
          </select>
          <textarea v-model="responseForm.responseText" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Response"></textarea>
          <textarea v-model="responseForm.proposedAction" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Proposed action"></textarea>
          <button class="rounded border border-sky-500 px-3 py-1 text-xs font-semibold text-sky-700" @click="respondFinding">Submit Response</button>

          <select v-model="linkForm.findingId" class="rounded-lg border px-3 py-2 text-sm">
            <option v-for="finding in findings" :key="`link-${finding.id}`" :value="finding.id">{{ finding.finding_code || finding.id }}</option>
          </select>
          <select v-model="linkForm.capaId" class="rounded-lg border px-3 py-2 text-sm">
            <option value="">Select CAPA</option>
            <option v-for="capa in capas" :key="capa.id" :value="capa.id">{{ capa.capa_code }} - {{ capa.title }}</option>
          </select>
          <button class="rounded border border-sky-500 px-3 py-1 text-xs font-semibold text-sky-700" @click="linkFindingToCapa">Link CAPA</button>

          <select v-model="closeFindingForm.findingId" class="rounded-lg border px-3 py-2 text-sm">
            <option v-for="finding in findings" :key="`close-${finding.id}`" :value="finding.id">{{ finding.finding_code || finding.id }}</option>
          </select>
          <textarea v-model="closeFindingForm.closureSummary" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Closure summary"></textarea>
          <select v-model="closeFindingForm.effectivenessResult" class="rounded-lg border px-3 py-2 text-sm">
            <option v-for="item in effectivenessOptions" :key="item" :value="item">{{ item }}</option>
          </select>
          <button class="rounded border border-sky-500 px-3 py-1 text-xs font-semibold text-sky-700" @click="closeFinding">Close Finding</button>
        </div>
      </article>
    </section>

    <section class="grid gap-4 xl:grid-cols-2">
      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Audit Timeline</h3>
        <ul class="mt-3 max-h-60 space-y-2 overflow-auto text-sm">
          <li v-for="item in timeline" :key="item.id" class="rounded border border-slate-200 px-3 py-2">
            <p class="font-semibold">{{ item.action_key }}</p>
            <p class="text-xs text-slate-600">{{ item.occurred_at }}</p>
          </li>
        </ul>
      </article>

      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Binder Jobs</h3>
        <ul class="mt-3 max-h-60 space-y-2 overflow-auto text-sm">
          <li v-for="job in binderJobs" :key="job.id" class="rounded border border-slate-200 px-3 py-2">
            {{ job.job_status }} • records {{ job.total_records }} • duration {{ job.duration_ms || 0 }}ms
          </li>
        </ul>
      </article>
    </section>
  </section>
</template>
