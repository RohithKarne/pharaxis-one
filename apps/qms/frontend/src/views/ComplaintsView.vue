<script setup>
import { computed, onMounted, ref } from 'vue';
import { apiRequest } from '../services/api';
import { useModuleAccess } from '../composables/useModuleAccess';

const loading = ref(false);
const error = ref('');
const message = ref('');
const complaints = ref([]);
const selectedComplaintId = ref('');
const selectedComplaint = computed(() => complaints.value.find((item) => item.id === selectedComplaintId.value) || null);
const selectedCapaId = ref('');
const capas = ref([]);
const { isWriteDisabled, writeDisabledReason, withRoles } = useModuleAccess('complaints');

const createForm = ref({
  sourceChannel: 'Customer',
  summary: '',
  details: '',
  customerName: '',
  productName: '',
  batchLotNo: '',
  severity: 'Medium',
  dueDate: ''
});

const updateForm = ref({
  status: 'Investigation',
  severity: 'Medium',
  dueDate: ''
});

function setMessage(value) {
  message.value = value;
  error.value = '';
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [complaintData, capaData] = await Promise.all([apiRequest('/complaints'), apiRequest('/capa')]);
    complaints.value = complaintData.complaints || [];
    capas.value = capaData.capas || [];
    if (!selectedComplaintId.value && complaints.value[0]) {
      selectedComplaintId.value = complaints.value[0].id;
    }
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

async function createComplaint() {
  if (!withRoles(['author', 'qa_reviewer', 'admin', 'superadmin'], setMessage)) return;
  try {
    await apiRequest('/complaints', { method: 'POST', body: createForm.value });
    setMessage('Complaint created.');
    createForm.value.summary = '';
    createForm.value.details = '';
    createForm.value.customerName = '';
    createForm.value.productName = '';
    createForm.value.batchLotNo = '';
    createForm.value.dueDate = '';
    await load();
  } catch (err) {
    error.value = err.message;
  }
}

async function updateComplaint() {
  if (!selectedComplaintId.value) return;
  if (!withRoles(['qa_reviewer', 'admin', 'superadmin'], setMessage)) return;
  try {
    await apiRequest(`/complaints/${selectedComplaintId.value}`, { method: 'PATCH', body: updateForm.value });
    setMessage('Complaint updated.');
    await load();
  } catch (err) {
    error.value = err.message;
  }
}

async function linkCapa() {
  if (!selectedComplaintId.value || !selectedCapaId.value) return;
  if (!withRoles(['qa_reviewer', 'admin', 'superadmin'], setMessage)) return;
  try {
    await apiRequest(`/complaints/${selectedComplaintId.value}/link-capa`, {
      method: 'POST',
      body: { capaId: selectedCapaId.value }
    });
    setMessage('Complaint linked to CAPA.');
    selectedCapaId.value = '';
    await load();
  } catch (err) {
    error.value = err.message;
  }
}

onMounted(load);
</script>

<template>
  <section class="space-y-4">
    <header class="rounded-2xl border border-slate-200 bg-white p-5">
      <p class="text-xs uppercase tracking-[0.14em] text-slate-500">Phase 2</p>
      <h2 class="mt-1 text-2xl font-bold text-slate-900">Complaints Management</h2>
      <p class="mt-2 text-sm text-slate-600">Capture customer and regulatory complaints, investigate quickly, and link corrective action records.</p>
      <p v-if="isWriteDisabled" class="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        {{ writeDisabledReason }}
      </p>
    </header>

    <section class="grid gap-4 xl:grid-cols-3">
      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Create Complaint</h3>
        <fieldset :disabled="isWriteDisabled" class="mt-3 grid gap-2">
          <select v-model="createForm.sourceChannel" class="rounded-lg border px-3 py-2 text-sm">
            <option>Customer</option><option>Regulatory</option><option>Internal</option><option>Partner</option>
          </select>
          <input v-model="createForm.summary" class="rounded-lg border px-3 py-2 text-sm" placeholder="Complaint summary" />
          <textarea v-model="createForm.details" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Details"></textarea>
          <input v-model="createForm.customerName" class="rounded-lg border px-3 py-2 text-sm" placeholder="Customer name" />
          <input v-model="createForm.productName" class="rounded-lg border px-3 py-2 text-sm" placeholder="Product" />
          <input v-model="createForm.batchLotNo" class="rounded-lg border px-3 py-2 text-sm" placeholder="Batch/Lot" />
          <select v-model="createForm.severity" class="rounded-lg border px-3 py-2 text-sm">
            <option>Low</option><option>Medium</option><option>High</option><option>Critical</option>
          </select>
          <input v-model="createForm.dueDate" class="rounded-lg border px-3 py-2 text-sm" type="date" />
        </fieldset>
        <button class="mt-3 rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white" :disabled="isWriteDisabled" @click="createComplaint">Create Complaint</button>
      </article>

      <article class="rounded-2xl border border-slate-200 bg-white p-4 xl:col-span-2">
        <h3 class="text-lg font-semibold text-slate-900">Complaint Queue</h3>
        <p v-if="loading" class="mt-3 text-sm text-slate-600">Loading complaints...</p>
        <ul v-else class="mt-3 space-y-2">
          <li
            v-for="item in complaints"
            :key="item.id"
            class="cursor-pointer rounded-lg border px-3 py-2 text-sm"
            :class="selectedComplaintId === item.id ? 'border-rose-400 bg-rose-50' : 'border-slate-200 bg-white'"
            @click="selectedComplaintId = item.id"
          >
            <p class="font-semibold">{{ item.complaint_code }} - {{ item.summary }}</p>
            <p class="text-xs text-slate-600">{{ item.source_channel }} • {{ item.severity }} • {{ item.status }}</p>
          </li>
        </ul>
      </article>
    </section>

    <section v-if="selectedComplaint" class="grid gap-4 xl:grid-cols-2">
      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Lifecycle Update</h3>
        <fieldset :disabled="isWriteDisabled" class="mt-3 grid gap-2">
          <select v-model="updateForm.status" class="rounded-lg border px-3 py-2 text-sm">
            <option>Open</option><option>Investigation</option><option>CapaLinked</option><option>Escalated</option><option>Closed</option>
          </select>
          <select v-model="updateForm.severity" class="rounded-lg border px-3 py-2 text-sm">
            <option>Low</option><option>Medium</option><option>High</option><option>Critical</option>
          </select>
          <input v-model="updateForm.dueDate" class="rounded-lg border px-3 py-2 text-sm" type="date" />
        </fieldset>
        <button class="mt-3 rounded-lg border border-rose-400 px-4 py-2 text-sm font-semibold text-rose-700" :disabled="isWriteDisabled" @click="updateComplaint">Save Update</button>
      </article>

      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Link to CAPA</h3>
        <select v-model="selectedCapaId" class="mt-3 w-full rounded-lg border px-3 py-2 text-sm" :disabled="isWriteDisabled">
          <option value="">Select CAPA</option>
          <option v-for="capa in capas" :key="capa.id" :value="capa.id">{{ capa.capa_code }} - {{ capa.title }}</option>
        </select>
        <button class="mt-3 rounded-lg border border-rose-400 px-4 py-2 text-sm font-semibold text-rose-700" :disabled="isWriteDisabled" @click="linkCapa">Link CAPA</button>
      </article>
    </section>

    <p v-if="message" class="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ message }}</p>
    <p v-if="error" class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
  </section>
</template>
