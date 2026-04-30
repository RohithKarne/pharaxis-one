<script setup>
import { computed, onMounted, ref } from 'vue';
import { apiRequest } from '../services/api';
import { useModuleAccess } from '../composables/useModuleAccess';

const loading = ref(false);
const error = ref('');
const message = ref('');
const nonconformances = ref([]);
const capas = ref([]);
const selectedRecordId = ref('');
const selectedRecord = computed(() => nonconformances.value.find((item) => item.id === selectedRecordId.value) || null);
const selectedCapaId = ref('');
const { isWriteDisabled, writeDisabledReason, withRoles } = useModuleAccess('nonconformance');

const createForm = ref({
  sourceType: 'Manufacturing',
  summary: '',
  details: '',
  itemReference: '',
  severity: 'Medium',
  dueDate: ''
});

const updateForm = ref({
  status: 'Containment',
  severity: 'Medium',
  disposition: 'Rework',
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
    const [ncData, capaData] = await Promise.all([apiRequest('/nonconformance'), apiRequest('/capa')]);
    nonconformances.value = ncData.nonconformances || [];
    capas.value = capaData.capas || [];
    if (!selectedRecordId.value && nonconformances.value[0]) {
      selectedRecordId.value = nonconformances.value[0].id;
    }
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

async function createRecord() {
  if (!withRoles(['author', 'qa_reviewer', 'admin', 'superadmin'], setMessage)) return;
  try {
    await apiRequest('/nonconformance', { method: 'POST', body: createForm.value });
    setMessage('Nonconformance record created.');
    createForm.value.summary = '';
    createForm.value.details = '';
    createForm.value.itemReference = '';
    createForm.value.dueDate = '';
    await load();
  } catch (err) {
    error.value = err.message;
  }
}

async function updateRecord() {
  if (!selectedRecordId.value) return;
  if (!withRoles(['qa_reviewer', 'admin', 'superadmin'], setMessage)) return;
  try {
    await apiRequest(`/nonconformance/${selectedRecordId.value}`, { method: 'PATCH', body: updateForm.value });
    setMessage('Nonconformance record updated.');
    await load();
  } catch (err) {
    error.value = err.message;
  }
}

async function linkCapa() {
  if (!selectedRecordId.value || !selectedCapaId.value) return;
  if (!withRoles(['qa_reviewer', 'admin', 'superadmin'], setMessage)) return;
  try {
    await apiRequest(`/nonconformance/${selectedRecordId.value}/link-capa`, {
      method: 'POST',
      body: { capaId: selectedCapaId.value }
    });
    setMessage('Nonconformance linked to CAPA.');
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
      <h2 class="mt-1 text-2xl font-bold text-slate-900">Nonconformance Management</h2>
      <p class="mt-2 text-sm text-slate-600">Capture material and process nonconformances, drive containment and disposition, and route corrective action.</p>
      <p v-if="isWriteDisabled" class="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        {{ writeDisabledReason }}
      </p>
    </header>

    <section class="grid gap-4 xl:grid-cols-3">
      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Create Nonconformance</h3>
        <fieldset :disabled="isWriteDisabled" class="mt-3 grid gap-2">
          <select v-model="createForm.sourceType" class="rounded-lg border px-3 py-2 text-sm">
            <option>Manufacturing</option><option>Supplier</option><option>Audit</option><option>IncomingInspection</option><option>Warehouse</option><option>Laboratory</option>
          </select>
          <input v-model="createForm.summary" class="rounded-lg border px-3 py-2 text-sm" placeholder="Issue summary" />
          <textarea v-model="createForm.details" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Details"></textarea>
          <input v-model="createForm.itemReference" class="rounded-lg border px-3 py-2 text-sm" placeholder="Item reference" />
          <select v-model="createForm.severity" class="rounded-lg border px-3 py-2 text-sm">
            <option>Low</option><option>Medium</option><option>High</option><option>Critical</option>
          </select>
          <input v-model="createForm.dueDate" class="rounded-lg border px-3 py-2 text-sm" type="date" />
        </fieldset>
        <button class="mt-3 rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white" :disabled="isWriteDisabled" @click="createRecord">Create Record</button>
      </article>

      <article class="rounded-2xl border border-slate-200 bg-white p-4 xl:col-span-2">
        <h3 class="text-lg font-semibold text-slate-900">Record Queue</h3>
        <p v-if="loading" class="mt-3 text-sm text-slate-600">Loading records...</p>
        <ul v-else class="mt-3 space-y-2">
          <li
            v-for="item in nonconformances"
            :key="item.id"
            class="cursor-pointer rounded-lg border px-3 py-2 text-sm"
            :class="selectedRecordId === item.id ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-white'"
            @click="selectedRecordId = item.id"
          >
            <p class="font-semibold">{{ item.nc_code }} - {{ item.summary }}</p>
            <p class="text-xs text-slate-600">{{ item.source_type }} • {{ item.severity }} • {{ item.status }}</p>
          </li>
        </ul>
      </article>
    </section>

    <section v-if="selectedRecord" class="grid gap-4 xl:grid-cols-2">
      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Disposition Update</h3>
        <fieldset :disabled="isWriteDisabled" class="mt-3 grid gap-2">
          <select v-model="updateForm.status" class="rounded-lg border px-3 py-2 text-sm">
            <option>Open</option><option>Containment</option><option>Dispositioned</option><option>CapaLinked</option><option>Closed</option>
          </select>
          <select v-model="updateForm.severity" class="rounded-lg border px-3 py-2 text-sm">
            <option>Low</option><option>Medium</option><option>High</option><option>Critical</option>
          </select>
          <select v-model="updateForm.disposition" class="rounded-lg border px-3 py-2 text-sm">
            <option>UseAsIs</option><option>Rework</option><option>Reject</option><option>ReturnToSupplier</option><option>Scrap</option>
          </select>
          <input v-model="updateForm.dueDate" class="rounded-lg border px-3 py-2 text-sm" type="date" />
        </fieldset>
        <button class="mt-3 rounded-lg border border-amber-400 px-4 py-2 text-sm font-semibold text-amber-700" :disabled="isWriteDisabled" @click="updateRecord">Save Update</button>
      </article>

      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Link to CAPA</h3>
        <select v-model="selectedCapaId" class="mt-3 w-full rounded-lg border px-3 py-2 text-sm" :disabled="isWriteDisabled">
          <option value="">Select CAPA</option>
          <option v-for="capa in capas" :key="capa.id" :value="capa.id">{{ capa.capa_code }} - {{ capa.title }}</option>
        </select>
        <button class="mt-3 rounded-lg border border-amber-400 px-4 py-2 text-sm font-semibold text-amber-700" :disabled="isWriteDisabled" @click="linkCapa">Link CAPA</button>
      </article>
    </section>

    <p v-if="message" class="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ message }}</p>
    <p v-if="error" class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
  </section>
</template>
