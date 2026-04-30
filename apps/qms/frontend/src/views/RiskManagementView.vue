<script setup>
import { computed, onMounted, ref } from 'vue';
import { apiRequest } from '../services/api';
import { useModuleAccess } from '../composables/useModuleAccess';

const loading = ref(false);
const error = ref('');
const message = ref('');
const risks = ref([]);
const selectedRiskId = ref('');
const selectedRisk = computed(() => risks.value.find((item) => item.id === selectedRiskId.value) || null);
const { isWriteDisabled, writeDisabledReason, withRoles } = useModuleAccess('riskManagement');

const createForm = ref({
  riskTitle: '',
  riskDomain: 'Process',
  severity: 3,
  occurrence: 3,
  detectability: 3,
  mitigationPlan: '',
  reviewDueDate: ''
});

const updateForm = ref({
  status: 'Mitigating',
  severity: 3,
  occurrence: 3,
  detectability: 3,
  mitigationPlan: '',
  reviewDueDate: ''
});

const reviewForm = ref({
  reviewNotes: '',
  residualScore: null
});

function setMessage(value) {
  message.value = value;
  error.value = '';
}

function riskScore(form) {
  return Number(form.severity || 0) * Number(form.occurrence || 0) * Number(form.detectability || 0);
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const payload = await apiRequest('/risk-management');
    risks.value = payload.risks || [];
    if (!selectedRiskId.value && risks.value[0]) {
      selectedRiskId.value = risks.value[0].id;
    }
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

async function createRisk() {
  if (!withRoles(['qa_reviewer', 'admin', 'superadmin'], setMessage)) return;
  try {
    await apiRequest('/risk-management/register', { method: 'POST', body: createForm.value });
    setMessage('Risk registered.');
    createForm.value.riskTitle = '';
    createForm.value.mitigationPlan = '';
    createForm.value.reviewDueDate = '';
    await load();
  } catch (err) {
    error.value = err.message;
  }
}

async function updateRisk() {
  if (!selectedRiskId.value) return;
  if (!withRoles(['qa_reviewer', 'admin', 'superadmin'], setMessage)) return;
  try {
    await apiRequest(`/risk-management/register/${selectedRiskId.value}`, { method: 'PATCH', body: updateForm.value });
    setMessage('Risk updated.');
    await load();
  } catch (err) {
    error.value = err.message;
  }
}

async function addReview() {
  if (!selectedRiskId.value) return;
  if (!withRoles(['qa_reviewer', 'admin', 'superadmin'], setMessage)) return;
  try {
    await apiRequest(`/risk-management/register/${selectedRiskId.value}/review`, {
      method: 'POST',
      body: reviewForm.value
    });
    setMessage('Risk review added.');
    reviewForm.value.reviewNotes = '';
    reviewForm.value.residualScore = null;
  } catch (err) {
    error.value = err.message;
  }
}

onMounted(load);
</script>

<template>
  <section class="space-y-4">
    <header class="rounded-2xl border border-slate-200 bg-white p-5">
      <p class="text-xs uppercase tracking-[0.14em] text-slate-500">Phase 3</p>
      <h2 class="mt-1 text-2xl font-bold text-slate-900">Risk Management Cockpit</h2>
      <p class="mt-2 text-sm text-slate-600">Quantify quality risk with severity/occurrence/detectability scoring and track mitigation progress.</p>
      <p v-if="isWriteDisabled" class="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        {{ writeDisabledReason }}
      </p>
    </header>

    <section class="grid gap-4 xl:grid-cols-3">
      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Register Risk</h3>
        <fieldset :disabled="isWriteDisabled" class="mt-3 grid gap-2">
          <input v-model="createForm.riskTitle" class="rounded-lg border px-3 py-2 text-sm" placeholder="Risk title" />
          <select v-model="createForm.riskDomain" class="rounded-lg border px-3 py-2 text-sm">
            <option>Product</option><option>Process</option><option>Supplier</option><option>Compliance</option><option>Cyber</option><option>Clinical</option>
          </select>
          <input v-model.number="createForm.severity" class="rounded-lg border px-3 py-2 text-sm" type="number" min="1" max="5" placeholder="Severity" />
          <input v-model.number="createForm.occurrence" class="rounded-lg border px-3 py-2 text-sm" type="number" min="1" max="5" placeholder="Occurrence" />
          <input v-model.number="createForm.detectability" class="rounded-lg border px-3 py-2 text-sm" type="number" min="1" max="5" placeholder="Detectability" />
          <input class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" :value="riskScore(createForm)" disabled />
          <textarea v-model="createForm.mitigationPlan" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Mitigation plan"></textarea>
          <input v-model="createForm.reviewDueDate" class="rounded-lg border px-3 py-2 text-sm" type="date" />
        </fieldset>
        <button class="mt-3 rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white" :disabled="isWriteDisabled" @click="createRisk">Register</button>
      </article>

      <article class="rounded-2xl border border-slate-200 bg-white p-4 xl:col-span-2">
        <h3 class="text-lg font-semibold text-slate-900">Risk Register</h3>
        <p v-if="loading" class="mt-3 text-sm text-slate-600">Loading risks...</p>
        <ul v-else class="mt-3 space-y-2">
          <li
            v-for="risk in risks"
            :key="risk.id"
            class="cursor-pointer rounded-lg border px-3 py-2 text-sm"
            :class="selectedRiskId === risk.id ? 'border-violet-400 bg-violet-50' : 'border-slate-200 bg-white'"
            @click="selectedRiskId = risk.id"
          >
            <p class="font-semibold">{{ risk.risk_code }} - {{ risk.risk_title }}</p>
            <p class="text-xs text-slate-600">{{ risk.risk_domain }} • Score {{ risk.risk_score }} • {{ risk.risk_band }} • {{ risk.status }}</p>
          </li>
        </ul>
      </article>
    </section>

    <section v-if="selectedRisk" class="grid gap-4 xl:grid-cols-2">
      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Update Risk</h3>
        <fieldset :disabled="isWriteDisabled" class="mt-3 grid gap-2">
          <select v-model="updateForm.status" class="rounded-lg border px-3 py-2 text-sm"><option>Open</option><option>Mitigating</option><option>Accepted</option><option>Closed</option></select>
          <input v-model.number="updateForm.severity" class="rounded-lg border px-3 py-2 text-sm" type="number" min="1" max="5" placeholder="Severity" />
          <input v-model.number="updateForm.occurrence" class="rounded-lg border px-3 py-2 text-sm" type="number" min="1" max="5" placeholder="Occurrence" />
          <input v-model.number="updateForm.detectability" class="rounded-lg border px-3 py-2 text-sm" type="number" min="1" max="5" placeholder="Detectability" />
          <input class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" :value="riskScore(updateForm)" disabled />
          <textarea v-model="updateForm.mitigationPlan" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Mitigation plan"></textarea>
          <input v-model="updateForm.reviewDueDate" class="rounded-lg border px-3 py-2 text-sm" type="date" />
        </fieldset>
        <button class="mt-3 rounded-lg border border-violet-400 px-4 py-2 text-sm font-semibold text-violet-700" :disabled="isWriteDisabled" @click="updateRisk">Save Update</button>
      </article>

      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Review Log Entry</h3>
        <fieldset :disabled="isWriteDisabled" class="contents">
          <textarea v-model="reviewForm.reviewNotes" class="mt-3 w-full rounded-lg border px-3 py-2 text-sm" rows="3" placeholder="Review notes"></textarea>
          <input v-model.number="reviewForm.residualScore" class="mt-2 w-full rounded-lg border px-3 py-2 text-sm" type="number" min="1" placeholder="Residual score (optional)" />
          <button class="mt-3 rounded-lg border border-violet-400 px-4 py-2 text-sm font-semibold text-violet-700" :disabled="isWriteDisabled" @click="addReview">Add Review</button>
        </fieldset>
      </article>
    </section>

    <p v-if="message" class="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ message }}</p>
    <p v-if="error" class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
  </section>
</template>
