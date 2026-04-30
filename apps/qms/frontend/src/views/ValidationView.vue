<script setup>
import { computed, onMounted, ref } from 'vue';
import { apiRequest } from '../services/api';
import { useModuleAccess } from '../composables/useModuleAccess';

const loading = ref(false);
const message = ref('');
const systems = ref([]);
const selectedSystemId = ref('');
const detail = ref(null);

const createForm = ref({
  systemName: '',
  vendor: '',
  version: '',
  gampCategory: '5',
  riskLevel: 'High',
  validationScope: '',
  complianceImpact: ''
});

const requirementForm = ref({
  requirementCode: '',
  requirementType: 'URS',
  description: '',
  riskLevel: 'Medium'
});

const planForm = ref({
  scope: '',
  approach: '',
  responsibilities: ''
});

const protocolForm = ref({
  planId: '',
  protocolName: ''
});

const scriptForm = ref({
  protocolId: '',
  scriptName: '',
  expectedResult: ''
});

const executeForm = ref({
  stepId: '',
  actualResult: '',
  outcome: 'Pass',
  evidenceRef: ''
});

const traceForm = ref({
  requirementId: '',
  stepId: '',
  traceStatus: 'Pending',
  notes: ''
});

const completeForm = ref({ summary: '' });

const system = computed(() => detail.value?.system || null);
const requirements = computed(() => detail.value?.requirements || []);
const plans = computed(() => detail.value?.plans || []);
const protocols = computed(() => detail.value?.protocols || []);
const validationDeviations = computed(() => detail.value?.validationDeviations || []);
const traceEntries = computed(() => detail.value?.traceEntries || []);
const timeline = computed(() => detail.value?.timeline || []);

const riskLevels = ['High', 'Medium', 'Low'];
const gampLevels = ['1', '3', '4', '5'];
const requirementTypes = ['URS', 'FS', 'DS', 'CS'];
const traceStatuses = ['Pending', 'InProgress', 'Pass', 'Fail'];
const outcomes = ['Pass', 'Fail', 'N/A'];
const { isWriteDisabled, writeDisabledReason, withWriteAccess } = useModuleAccess('validation');

function setMessage(text) {
  message.value = text;
}

function hydrateSelectors() {
  planForm.value.scope = planForm.value.scope || '';
  protocolForm.value.planId = plans.value[0]?.id || '';
  scriptForm.value.protocolId = protocols.value[0]?.id || '';
  traceForm.value.requirementId = requirements.value[0]?.id || '';
  traceForm.value.stepId = '';
}

async function refreshSystems() {
  loading.value = true;
  try {
    const data = await apiRequest('/validation/systems');
    systems.value = data.systems || [];

    if (!selectedSystemId.value && systems.value.length > 0) {
      selectedSystemId.value = systems.value[0].id;
      await loadDetail();
    }
  } catch (error) {
    setMessage(error.message);
  } finally {
    loading.value = false;
  }
}

async function loadDetail() {
  if (!selectedSystemId.value) {
    detail.value = null;
    return;
  }
  try {
    const data = await apiRequest(`/validation/systems/${selectedSystemId.value}`);
    detail.value = data;
    hydrateSelectors();
  } catch (error) {
    setMessage(error.message);
  }
}

async function createSystem() {
  if (!withWriteAccess(setMessage)) return;
  try {
    await apiRequest('/validation/systems', {
      method: 'POST',
      body: createForm.value
    });
    setMessage('Validation system registered.');
    createForm.value.systemName = '';
    createForm.value.vendor = '';
    createForm.value.version = '';
    createForm.value.validationScope = '';
    createForm.value.complianceImpact = '';
    await refreshSystems();
  } catch (error) {
    setMessage(error.message);
  }
}

async function addRequirement() {
  if (!selectedSystemId.value) return;
  if (!withWriteAccess(setMessage)) return;
  try {
    await apiRequest(`/validation/systems/${selectedSystemId.value}/requirements`, {
      method: 'POST',
      body: requirementForm.value
    });
    setMessage('Requirement added to traceability scope.');
    requirementForm.value.requirementCode = '';
    requirementForm.value.description = '';
    await loadDetail();
  } catch (error) {
    setMessage(error.message);
  }
}

async function createPlan() {
  if (!selectedSystemId.value) return;
  if (!withWriteAccess(setMessage)) return;
  try {
    await apiRequest(`/validation/systems/${selectedSystemId.value}/plans`, {
      method: 'POST',
      body: {
        scope: planForm.value.scope,
        approach: planForm.value.approach || null,
        responsibilities: planForm.value.responsibilities || null,
        protocolTypes: ['IQ', 'OQ', 'PQ', 'UAT']
      }
    });
    setMessage('Validation plan created.');
    planForm.value.scope = '';
    planForm.value.approach = '';
    planForm.value.responsibilities = '';
    await loadDetail();
  } catch (error) {
    setMessage(error.message);
  }
}

async function addProtocol() {
  if (!protocolForm.value.planId) return;
  if (!withWriteAccess(setMessage)) return;
  try {
    await apiRequest(`/validation/plans/${protocolForm.value.planId}/protocols`, {
      method: 'POST',
      body: {
        protocolName: protocolForm.value.protocolName
      }
    });
    setMessage('Protocol instance created.');
    protocolForm.value.protocolName = '';
    await loadDetail();
  } catch (error) {
    setMessage(error.message);
  }
}

async function addScriptStep() {
  if (!scriptForm.value.protocolId) return;
  if (!withWriteAccess(setMessage)) return;
  try {
    const response = await apiRequest(`/validation/protocols/${scriptForm.value.protocolId}/scripts`, {
      method: 'POST',
      body: {
        scriptName: scriptForm.value.scriptName,
        expectedResult: scriptForm.value.expectedResult
      }
    });
    setMessage('Script and first step created.');
    scriptForm.value.scriptName = '';
    scriptForm.value.expectedResult = '';
    executeForm.value.stepId = response.step?.id || executeForm.value.stepId;
    await loadDetail();
  } catch (error) {
    setMessage(error.message);
  }
}

async function executeStep() {
  if (!executeForm.value.stepId) return;
  if (!withWriteAccess(setMessage)) return;
  try {
    await apiRequest(`/validation/steps/${executeForm.value.stepId}/execute`, {
      method: 'PATCH',
      body: {
        actualResult: executeForm.value.actualResult,
        outcome: executeForm.value.outcome,
        evidenceRef: executeForm.value.evidenceRef || null
      }
    });
    setMessage('Step execution saved.');
    executeForm.value.actualResult = '';
    executeForm.value.evidenceRef = '';
    await loadDetail();
  } catch (error) {
    setMessage(error.message);
  }
}

async function addTraceLink() {
  if (!selectedSystemId.value || !traceForm.value.requirementId) return;
  if (!withWriteAccess(setMessage)) return;
  try {
    await apiRequest(`/validation/systems/${selectedSystemId.value}/traceability`, {
      method: 'POST',
      body: {
        requirementId: traceForm.value.requirementId,
        stepId: traceForm.value.stepId || null,
        traceStatus: traceForm.value.traceStatus,
        notes: traceForm.value.notes || null
      }
    });
    setMessage('Trace matrix entry saved.');
    traceForm.value.notes = '';
    await loadDetail();
  } catch (error) {
    setMessage(error.message);
  }
}

async function completeValidation() {
  if (!selectedSystemId.value) return;
  if (!withWriteAccess(setMessage)) return;
  try {
    await apiRequest(`/validation/systems/${selectedSystemId.value}/complete`, {
      method: 'POST',
      body: completeForm.value
    });
    setMessage('Validation lifecycle marked complete.');
    completeForm.value.summary = '';
    await loadDetail();
    await refreshSystems();
  } catch (error) {
    setMessage(error.message);
  }
}

onMounted(refreshSystems);
</script>

<template>
  <section class="space-y-4">
    <header class="rounded-2xl border border-violet-100 bg-white p-4">
      <h2 class="text-xl font-bold text-violet-900">Validation Services Workspace</h2>
      <p class="mt-1 text-sm text-slate-600">Manage system inventory, requirement traceability, protocol execution, deviation hooks, and final validation sign-off.</p>
      <p v-if="isWriteDisabled" class="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        {{ writeDisabledReason }}
      </p>
      <p v-if="message" class="mt-2 text-sm text-indigo-700">{{ message }}</p>
    </header>

    <section class="grid gap-4 xl:grid-cols-3">
      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Register System</h3>
        <div class="mt-3 grid gap-2">
          <input v-model="createForm.systemName" class="rounded-lg border px-3 py-2 text-sm" placeholder="System name" />
          <input v-model="createForm.vendor" class="rounded-lg border px-3 py-2 text-sm" placeholder="Vendor" />
          <input v-model="createForm.version" class="rounded-lg border px-3 py-2 text-sm" placeholder="Version" />
          <select v-model="createForm.gampCategory" class="rounded-lg border px-3 py-2 text-sm">
            <option v-for="item in gampLevels" :key="item" :value="item">GAMP {{ item }}</option>
          </select>
          <select v-model="createForm.riskLevel" class="rounded-lg border px-3 py-2 text-sm">
            <option v-for="item in riskLevels" :key="item" :value="item">{{ item }}</option>
          </select>
          <textarea v-model="createForm.validationScope" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Validation scope"></textarea>
          <textarea v-model="createForm.complianceImpact" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Compliance impact"></textarea>
        </div>
        <button class="mt-3 rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white" :disabled="isWriteDisabled" @click="createSystem">Register System</button>
      </article>

      <article class="rounded-2xl border border-slate-200 bg-white p-4 xl:col-span-2">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold text-slate-900">Validation Systems</h3>
          <button class="rounded-lg border border-violet-700 px-4 py-2 text-sm font-semibold text-violet-700" @click="refreshSystems">Refresh</button>
        </div>
        <p v-if="loading" class="mt-2 text-sm text-slate-600">Loading systems...</p>
        <ul class="mt-3 max-h-64 space-y-2 overflow-auto text-sm">
          <li
            v-for="item in systems"
            :key="item.id"
            class="cursor-pointer rounded-lg border px-3 py-2"
            :class="selectedSystemId === item.id ? 'border-violet-500 bg-violet-50' : 'border-slate-200'"
            @click="selectedSystemId = item.id; loadDetail()"
          >
            <p class="font-semibold">{{ item.system_name }} (GAMP {{ item.gamp_category }})</p>
            <p class="text-xs text-slate-600">{{ item.validation_status }} • Risk: {{ item.risk_level }} • Next review: {{ item.next_review_due_date || 'N/A' }}</p>
          </li>
        </ul>
      </article>
    </section>

    <section v-if="system" class="grid gap-4 xl:grid-cols-3">
      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Requirements & Trace</h3>
        <div class="mt-3 grid gap-2">
          <input v-model="requirementForm.requirementCode" class="rounded-lg border px-3 py-2 text-sm" placeholder="Requirement code" />
          <select v-model="requirementForm.requirementType" class="rounded-lg border px-3 py-2 text-sm">
            <option v-for="item in requirementTypes" :key="item" :value="item">{{ item }}</option>
          </select>
          <textarea v-model="requirementForm.description" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Requirement description"></textarea>
          <select v-model="requirementForm.riskLevel" class="rounded-lg border px-3 py-2 text-sm">
            <option v-for="item in riskLevels" :key="item" :value="item">{{ item }}</option>
          </select>
          <button class="rounded border border-violet-500 px-3 py-1 text-xs font-semibold text-violet-700" :disabled="isWriteDisabled" @click="addRequirement">Add Requirement</button>

          <select v-model="traceForm.requirementId" class="rounded-lg border px-3 py-2 text-sm">
            <option v-for="item in requirements" :key="item.id" :value="item.id">{{ item.requirement_code }}</option>
          </select>
          <input v-model="traceForm.stepId" class="rounded-lg border px-3 py-2 text-sm" placeholder="Step ID (optional)" />
          <select v-model="traceForm.traceStatus" class="rounded-lg border px-3 py-2 text-sm">
            <option v-for="item in traceStatuses" :key="item" :value="item">{{ item }}</option>
          </select>
          <textarea v-model="traceForm.notes" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Trace notes"></textarea>
          <button class="rounded border border-violet-500 px-3 py-1 text-xs font-semibold text-violet-700" :disabled="isWriteDisabled" @click="addTraceLink">Save Trace Entry</button>
        </div>
      </article>

      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Plans & Protocols</h3>
        <div class="mt-3 grid gap-2">
          <textarea v-model="planForm.scope" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Validation plan scope"></textarea>
          <textarea v-model="planForm.approach" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Approach"></textarea>
          <textarea v-model="planForm.responsibilities" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Responsibilities"></textarea>
          <button class="rounded border border-violet-500 px-3 py-1 text-xs font-semibold text-violet-700" :disabled="isWriteDisabled" @click="createPlan">Create Plan</button>

          <select v-model="protocolForm.planId" class="rounded-lg border px-3 py-2 text-sm">
            <option v-for="item in plans" :key="item.id" :value="item.id">Plan {{ item.id }}</option>
          </select>
          <input v-model="protocolForm.protocolName" class="rounded-lg border px-3 py-2 text-sm" placeholder="Protocol name" />
          <button class="rounded border border-violet-500 px-3 py-1 text-xs font-semibold text-violet-700" :disabled="isWriteDisabled" @click="addProtocol">Add Protocol</button>

          <select v-model="scriptForm.protocolId" class="rounded-lg border px-3 py-2 text-sm">
            <option v-for="item in protocols" :key="item.id" :value="item.id">Protocol {{ item.protocol_name }}</option>
          </select>
          <input v-model="scriptForm.scriptName" class="rounded-lg border px-3 py-2 text-sm" placeholder="Script name" />
          <input v-model="scriptForm.expectedResult" class="rounded-lg border px-3 py-2 text-sm" placeholder="Expected result" />
          <button class="rounded border border-violet-500 px-3 py-1 text-xs font-semibold text-violet-700" :disabled="isWriteDisabled" @click="addScriptStep">Create Script Step</button>
        </div>
      </article>

      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Execution & Completion</h3>
        <div class="mt-3 grid gap-2">
          <input v-model="executeForm.stepId" class="rounded-lg border px-3 py-2 text-sm" placeholder="Step ID" />
          <textarea v-model="executeForm.actualResult" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Actual result"></textarea>
          <select v-model="executeForm.outcome" class="rounded-lg border px-3 py-2 text-sm">
            <option v-for="item in outcomes" :key="item" :value="item">{{ item }}</option>
          </select>
          <input v-model="executeForm.evidenceRef" class="rounded-lg border px-3 py-2 text-sm" placeholder="Evidence reference" />
          <button class="rounded border border-violet-500 px-3 py-1 text-xs font-semibold text-violet-700" :disabled="isWriteDisabled" @click="executeStep">Execute Step</button>

          <textarea v-model="completeForm.summary" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Validation completion summary"></textarea>
          <button class="rounded border border-violet-500 px-3 py-1 text-xs font-semibold text-violet-700" :disabled="isWriteDisabled" @click="completeValidation">Mark System Validated</button>
        </div>
      </article>
    </section>

    <section v-if="system" class="grid gap-4 xl:grid-cols-3">
      <article class="rounded-2xl border border-slate-200 bg-white p-4 xl:col-span-2">
        <h3 class="text-lg font-semibold text-slate-900">Validation Timeline</h3>
        <ul class="mt-3 max-h-60 space-y-2 overflow-auto text-sm">
          <li v-for="item in timeline" :key="item.id" class="rounded border border-slate-200 px-3 py-2">
            <p class="font-semibold">{{ item.action_key }}</p>
            <p class="text-xs text-slate-600">{{ item.occurred_at }}</p>
          </li>
        </ul>
      </article>

      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Validation Deviations</h3>
        <ul class="mt-3 max-h-60 space-y-2 overflow-auto text-xs">
          <li v-for="item in validationDeviations" :key="item.id" class="rounded border border-slate-200 px-2 py-1">
            {{ item.status }} • {{ item.deviation_text }}
          </li>
        </ul>
        <h4 class="mt-4 text-sm font-semibold text-slate-900">Trace Entries</h4>
        <ul class="mt-2 max-h-40 space-y-2 overflow-auto text-xs">
          <li v-for="item in traceEntries" :key="item.id" class="rounded border border-slate-200 px-2 py-1">
            Requirement {{ item.requirement_id }} • {{ item.trace_status }}
          </li>
        </ul>
      </article>
    </section>
  </section>
</template>
