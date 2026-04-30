<script setup>
import { computed, onMounted, ref } from 'vue';
import { apiRequest } from '../services/api';
import { useModuleAccess } from '../composables/useModuleAccess';

const loading = ref(false);
const message = ref('');
const list = ref([]);
const selectedDeviationId = ref('');
const detail = ref(null);
const capas = ref([]);

const createForm = ref({
  title: '',
  description: '',
  deviationType: 'Process',
  classification: 'Major',
  dateOfOccurrence: '',
  department: 'Quality',
  dueDate: ''
});

const triageForm = ref({
  triageSummary: '',
  impactLevel: 'Medium',
  dueDate: ''
});

const containmentForm = ref({ actionText: '' });
const investigationForm = ref({ investigatorUserId: '', findings: '', rootCause: '', dueDate: '' });
const qaReviewForm = ref({ decision: 'Approve', reviewNotes: '', reportabilityStatus: 'Under Review' });
const closeForm = ref({ reportabilityStatus: 'No', reportabilityReason: '', closureSummary: '' });
const reopenForm = ref({ reason: '' });
const linkForm = ref({ capaId: '' });

const deviation = computed(() => detail.value?.deviation || null);
const timeline = computed(() => detail.value?.history || []);
const investigations = computed(() => detail.value?.investigations || []);
const capaLinks = computed(() => detail.value?.capaLinks || []);

const deviationTypes = ['Product', 'Process', 'System', 'Environmental'];
const classifications = ['Critical', 'Major', 'Minor'];
const reportabilityOptions = ['Yes', 'No', 'Under Review'];
const impactLevels = ['Low', 'Medium', 'High', 'Critical'];
const { isWriteDisabled, writeDisabledReason, withWriteAccess } = useModuleAccess('deviations');

function setMessage(text) {
  message.value = text;
}

async function refreshList() {
  loading.value = true;
  try {
    const data = await apiRequest('/deviations');
    list.value = data.deviations || [];

    if (!selectedDeviationId.value && list.value.length > 0) {
      selectedDeviationId.value = list.value[0].id;
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
  if (!selectedDeviationId.value) {
    detail.value = null;
    return;
  }

  try {
    const data = await apiRequest(`/deviations/${selectedDeviationId.value}`);
    detail.value = data;

    const selectedInvestigator = investigations.value[0]?.investigator_user_id || '';
    if (selectedInvestigator && !investigationForm.value.investigatorUserId) {
      investigationForm.value.investigatorUserId = selectedInvestigator;
    }
  } catch (error) {
    setMessage(error.message);
  }
}

async function createDeviation() {
  if (!withWriteAccess(setMessage)) return;
  try {
    await apiRequest('/deviations', {
      method: 'POST',
      body: {
        ...createForm.value,
        dateOfOccurrence: createForm.value.dateOfOccurrence || new Date().toISOString().slice(0, 10),
        dueDate: createForm.value.dueDate || null
      }
    });
    setMessage('Deviation created successfully.');
    createForm.value.title = '';
    createForm.value.description = '';
    createForm.value.dateOfOccurrence = '';
    createForm.value.dueDate = '';
    await refreshList();
  } catch (error) {
    setMessage(error.message);
  }
}

async function runTriage() {
  if (!selectedDeviationId.value) return;
  if (!withWriteAccess(setMessage)) return;
  try {
    await apiRequest(`/deviations/${selectedDeviationId.value}/triage`, {
      method: 'POST',
      body: {
        triageSummary: triageForm.value.triageSummary,
        impactLevel: triageForm.value.impactLevel,
        dueDate: triageForm.value.dueDate || null
      }
    });
    setMessage('Deviation triaged.');
    triageForm.value.triageSummary = '';
    await loadDetail();
    await refreshList();
  } catch (error) {
    setMessage(error.message);
  }
}

async function addContainment() {
  if (!selectedDeviationId.value) return;
  if (!withWriteAccess(setMessage)) return;
  try {
    await apiRequest(`/deviations/${selectedDeviationId.value}/containment`, {
      method: 'POST',
      body: containmentForm.value
    });
    setMessage('Containment action recorded.');
    containmentForm.value.actionText = '';
    await loadDetail();
    await refreshList();
  } catch (error) {
    setMessage(error.message);
  }
}

async function addInvestigation() {
  if (!selectedDeviationId.value) return;
  if (!withWriteAccess(setMessage)) return;
  try {
    const me = await apiRequest('/protected/me');
    await apiRequest(`/deviations/${selectedDeviationId.value}/investigation`, {
      method: 'POST',
      body: {
        investigatorUserId: investigationForm.value.investigatorUserId || me.auth.userId,
        findings: investigationForm.value.findings || null,
        rootCause: investigationForm.value.rootCause || null,
        dueDate: investigationForm.value.dueDate || null
      }
    });
    setMessage('Investigation details saved.');
    investigationForm.value.findings = '';
    investigationForm.value.rootCause = '';
    investigationForm.value.dueDate = '';
    await loadDetail();
    await refreshList();
  } catch (error) {
    setMessage(error.message);
  }
}

async function runQaReview() {
  if (!selectedDeviationId.value) return;
  if (!withWriteAccess(setMessage)) return;
  try {
    await apiRequest(`/deviations/${selectedDeviationId.value}/qa-review`, {
      method: 'POST',
      body: qaReviewForm.value
    });
    setMessage('QA review decision recorded.');
    qaReviewForm.value.reviewNotes = '';
    await loadDetail();
    await refreshList();
  } catch (error) {
    setMessage(error.message);
  }
}

async function linkCapa() {
  if (!selectedDeviationId.value || !linkForm.value.capaId) return;
  if (!withWriteAccess(setMessage)) return;
  try {
    await apiRequest(`/deviations/${selectedDeviationId.value}/link-capa`, {
      method: 'POST',
      body: { capaId: linkForm.value.capaId }
    });
    setMessage('Deviation linked to CAPA.');
    await loadDetail();
    await refreshList();
  } catch (error) {
    setMessage(error.message);
  }
}

async function closeDeviation() {
  if (!selectedDeviationId.value) return;
  if (!withWriteAccess(setMessage)) return;
  try {
    await apiRequest(`/deviations/${selectedDeviationId.value}/close`, {
      method: 'POST',
      body: closeForm.value
    });
    setMessage('Deviation closed successfully.');
    await loadDetail();
    await refreshList();
  } catch (error) {
    setMessage(error.message);
  }
}

async function reopenDeviation() {
  if (!selectedDeviationId.value || !reopenForm.value.reason) return;
  if (!withWriteAccess(setMessage)) return;
  try {
    await apiRequest(`/deviations/${selectedDeviationId.value}/reopen`, {
      method: 'POST',
      body: reopenForm.value
    });
    setMessage('Deviation reopened.');
    reopenForm.value.reason = '';
    await loadDetail();
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
    <header class="rounded-2xl border border-amber-100 bg-white p-4">
      <h2 class="text-xl font-bold text-amber-900">Deviation Management Workspace</h2>
      <p class="mt-1 text-sm text-slate-600">Capture, triage, investigate, link CAPA, QA review, and close enterprise deviations.</p>
      <p v-if="isWriteDisabled" class="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        {{ writeDisabledReason }}
      </p>
      <p v-if="message" class="mt-2 text-sm text-indigo-700">{{ message }}</p>
    </header>

    <section class="grid gap-4 xl:grid-cols-3">
      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Create Deviation</h3>
        <div class="mt-3 grid gap-2">
          <input v-model="createForm.title" class="rounded-lg border px-3 py-2 text-sm" placeholder="Deviation title" />
          <textarea v-model="createForm.description" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Description"></textarea>
          <select v-model="createForm.deviationType" class="rounded-lg border px-3 py-2 text-sm">
            <option v-for="item in deviationTypes" :key="item" :value="item">{{ item }}</option>
          </select>
          <select v-model="createForm.classification" class="rounded-lg border px-3 py-2 text-sm">
            <option v-for="item in classifications" :key="item" :value="item">{{ item }}</option>
          </select>
          <input v-model="createForm.department" class="rounded-lg border px-3 py-2 text-sm" placeholder="Department" />
          <label class="text-xs text-slate-600">Date of Occurrence</label>
          <input v-model="createForm.dateOfOccurrence" class="rounded-lg border px-3 py-2 text-sm" type="date" />
          <label class="text-xs text-slate-600">Due Date</label>
          <input v-model="createForm.dueDate" class="rounded-lg border px-3 py-2 text-sm" type="date" />
        </div>
        <button class="mt-3 rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white" :disabled="isWriteDisabled" @click="createDeviation">Create Deviation</button>
      </article>

      <article class="rounded-2xl border border-slate-200 bg-white p-4 xl:col-span-2">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold text-slate-900">Deviation Records</h3>
          <button class="rounded-lg border border-amber-700 px-4 py-2 text-sm font-semibold text-amber-700" @click="refreshList">Refresh</button>
        </div>
        <p v-if="loading" class="mt-2 text-sm text-slate-600">Loading deviations...</p>
        <ul class="mt-3 max-h-64 space-y-2 overflow-auto text-sm">
          <li
            v-for="item in list"
            :key="item.id"
            class="cursor-pointer rounded-lg border px-3 py-2"
            :class="selectedDeviationId === item.id ? 'border-amber-500 bg-amber-50' : 'border-slate-200'"
            @click="selectedDeviationId = item.id; loadDetail()"
          >
            <p class="font-semibold">{{ item.deviation_code }} - {{ item.title }}</p>
            <p class="text-xs text-slate-600">{{ item.status }} • {{ item.classification }} • Due: {{ item.due_date || 'N/A' }}</p>
          </li>
        </ul>
      </article>
    </section>

    <section v-if="deviation" class="grid gap-4 xl:grid-cols-3">
      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Lifecycle Controls</h3>
        <p class="mt-1 text-xs text-slate-600">Current Status: {{ deviation.status }}</p>

        <div class="mt-3 grid gap-2">
          <textarea v-model="triageForm.triageSummary" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Triage summary"></textarea>
          <select v-model="triageForm.impactLevel" class="rounded-lg border px-3 py-2 text-sm">
            <option v-for="level in impactLevels" :key="level" :value="level">{{ level }}</option>
          </select>
          <input v-model="triageForm.dueDate" class="rounded-lg border px-3 py-2 text-sm" type="date" />
          <button class="rounded border border-amber-500 px-3 py-1 text-xs font-semibold text-amber-700" :disabled="isWriteDisabled" @click="runTriage">Run Triage</button>

          <textarea v-model="containmentForm.actionText" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Containment action"></textarea>
          <button class="rounded border border-amber-500 px-3 py-1 text-xs font-semibold text-amber-700" :disabled="isWriteDisabled" @click="addContainment">Add Containment</button>

          <textarea v-model="reopenForm.reason" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Reopen reason"></textarea>
          <button class="rounded border border-amber-500 px-3 py-1 text-xs font-semibold text-amber-700" :disabled="isWriteDisabled" @click="reopenDeviation">Reopen</button>
        </div>
      </article>

      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Investigation & CAPA</h3>
        <div class="mt-3 grid gap-2">
          <input v-model="investigationForm.investigatorUserId" class="rounded-lg border px-3 py-2 text-sm" placeholder="Investigator user ID" />
          <textarea v-model="investigationForm.findings" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Findings"></textarea>
          <textarea v-model="investigationForm.rootCause" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Root cause"></textarea>
          <input v-model="investigationForm.dueDate" class="rounded-lg border px-3 py-2 text-sm" type="date" />
          <button class="rounded border border-amber-500 px-3 py-1 text-xs font-semibold text-amber-700" :disabled="isWriteDisabled" @click="addInvestigation">Save Investigation</button>

          <select v-model="linkForm.capaId" class="rounded-lg border px-3 py-2 text-sm">
            <option value="">Link CAPA</option>
            <option v-for="capa in capas" :key="capa.id" :value="capa.id">{{ capa.capa_code }} - {{ capa.title }}</option>
          </select>
          <button class="rounded border border-amber-500 px-3 py-1 text-xs font-semibold text-amber-700" :disabled="isWriteDisabled" @click="linkCapa">Link CAPA</button>
        </div>

        <ul class="mt-3 max-h-24 space-y-2 overflow-auto text-xs">
          <li v-for="link in capaLinks" :key="link.id" class="rounded border border-slate-200 px-2 py-1">CAPA Link: {{ link.capa_id }}</li>
        </ul>
      </article>

      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">QA Review & Close</h3>
        <div class="mt-3 grid gap-2">
          <select v-model="qaReviewForm.decision" class="rounded-lg border px-3 py-2 text-sm">
            <option>Approve</option>
            <option>Reject</option>
          </select>
          <select v-model="qaReviewForm.reportabilityStatus" class="rounded-lg border px-3 py-2 text-sm">
            <option v-for="item in reportabilityOptions" :key="item" :value="item">{{ item }}</option>
          </select>
          <textarea v-model="qaReviewForm.reviewNotes" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="QA review notes"></textarea>
          <button class="rounded border border-amber-500 px-3 py-1 text-xs font-semibold text-amber-700" :disabled="isWriteDisabled" @click="runQaReview">Run QA Review</button>

          <select v-model="closeForm.reportabilityStatus" class="rounded-lg border px-3 py-2 text-sm">
            <option v-for="item in reportabilityOptions" :key="`close-${item}`" :value="item">{{ item }}</option>
          </select>
          <input v-model="closeForm.reportabilityReason" class="rounded-lg border px-3 py-2 text-sm" placeholder="Reportability reason" />
          <textarea v-model="closeForm.closureSummary" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Closure summary"></textarea>
          <button class="rounded border border-amber-500 px-3 py-1 text-xs font-semibold text-amber-700" :disabled="isWriteDisabled" @click="closeDeviation">Close Deviation</button>
        </div>
      </article>
    </section>

    <article v-if="deviation" class="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 class="text-lg font-semibold text-slate-900">Deviation Timeline</h3>
      <ul class="mt-3 max-h-72 space-y-2 overflow-auto text-sm">
        <li v-for="item in timeline" :key="item.id" class="rounded border border-slate-200 px-3 py-2">
          <p class="font-semibold">{{ item.action_key }}</p>
          <p class="text-xs text-slate-600">{{ item.occurred_at }}</p>
        </li>
      </ul>
    </article>
  </section>
</template>
