<script setup>
import { computed, onMounted, ref } from 'vue';
import { apiRequest } from '../services/api';
import { useModuleAccess } from '../composables/useModuleAccess';

const loading = ref(false);
const error = ref('');
const message = ref('');

const adapters = ref([]);
const jobs = ref([]);

const adapterForm = ref({
  adapterKey: 'PLM',
  endpointUrl: '',
  authMode: 'None',
  status: 'Disconnected'
});

const syncForm = ref({
  adapterKey: 'PLM',
  jobType: 'OnDemandSync'
});
const { hasRoles, withRoles } = useModuleAccess('integrations');
const canConfigureAdapter = computed(() => hasRoles(['admin', 'superadmin']));
const canRunSync = computed(() => hasRoles(['qa_reviewer', 'admin', 'superadmin']));

function setMessage(value) {
  message.value = value;
  error.value = '';
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const payload = await apiRequest('/integrations');
    adapters.value = payload.adapters || [];
    jobs.value = payload.jobs || [];
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

async function saveAdapter() {
  if (!withRoles(['admin', 'superadmin'], setMessage)) return;
  try {
    await apiRequest(`/integrations/adapters/${adapterForm.value.adapterKey}`, {
      method: 'PUT',
      body: {
        endpointUrl: adapterForm.value.endpointUrl,
        authMode: adapterForm.value.authMode,
        status: adapterForm.value.status,
        configJson: { updatedFrom: 'integrations-ui' }
      }
    });
    setMessage('Adapter configuration saved.');
    await load();
  } catch (err) {
    error.value = err.message;
  }
}

async function runSync() {
  if (!withRoles(['qa_reviewer', 'admin', 'superadmin'], setMessage)) return;
  try {
    await apiRequest(`/integrations/adapters/${syncForm.value.adapterKey}/sync`, {
      method: 'POST',
      body: { jobType: syncForm.value.jobType, payloadJson: { requestedBy: 'ui' } }
    });
    setMessage('Sync triggered successfully.');
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
      <p class="text-xs uppercase tracking-[0.14em] text-slate-500">Phase 3</p>
      <h2 class="mt-1 text-2xl font-bold text-slate-900">Integrations Control Center</h2>
      <p class="mt-2 text-sm text-slate-600">Manage PLM/ERP/LIMS/DMS adapter status and trigger controlled sync jobs.</p>
      <p v-if="!canConfigureAdapter && !canRunSync" class="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        Integrations actions are read-only for your current role.
      </p>
    </header>

    <section class="grid gap-4 xl:grid-cols-2">
      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Adapter Configuration</h3>
        <fieldset :disabled="!canConfigureAdapter" class="mt-3 grid gap-2">
          <select v-model="adapterForm.adapterKey" class="rounded-lg border px-3 py-2 text-sm"><option>PLM</option><option>ERP</option><option>LIMS</option><option>DMS</option></select>
          <input v-model="adapterForm.endpointUrl" class="rounded-lg border px-3 py-2 text-sm" placeholder="Endpoint URL" />
          <select v-model="adapterForm.authMode" class="rounded-lg border px-3 py-2 text-sm"><option>None</option><option>ApiKey</option><option>Basic</option><option>OAuth2</option></select>
          <select v-model="adapterForm.status" class="rounded-lg border px-3 py-2 text-sm"><option>Disconnected</option><option>Connected</option><option>Error</option></select>
        </fieldset>
        <button class="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white" :disabled="!canConfigureAdapter" @click="saveAdapter">Save Adapter</button>
      </article>

      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Trigger Sync</h3>
        <fieldset :disabled="!canRunSync" class="mt-3 grid gap-2">
          <select v-model="syncForm.adapterKey" class="rounded-lg border px-3 py-2 text-sm"><option>PLM</option><option>ERP</option><option>LIMS</option><option>DMS</option></select>
          <input v-model="syncForm.jobType" class="rounded-lg border px-3 py-2 text-sm" placeholder="Job type" />
        </fieldset>
        <button class="mt-3 rounded-lg border border-slate-400 px-4 py-2 text-sm font-semibold text-slate-700" :disabled="!canRunSync" @click="runSync">Run Sync</button>
      </article>
    </section>

    <section class="grid gap-4 xl:grid-cols-2">
      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Adapters</h3>
        <ul class="mt-3 space-y-2 text-sm">
          <li v-for="item in adapters" :key="item.id" class="rounded border border-slate-200 px-3 py-2">
            <p class="font-semibold">{{ item.adapter_key }} • {{ item.status }}</p>
            <p class="text-xs text-slate-600">{{ item.endpoint_url || 'No endpoint configured' }}</p>
            <p class="text-xs text-slate-500">Last sync: {{ item.last_sync_at || 'n/a' }}</p>
          </li>
        </ul>
      </article>

      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Sync Jobs</h3>
        <ul class="mt-3 space-y-2 text-sm">
          <li v-for="item in jobs" :key="item.id" class="rounded border border-slate-200 px-3 py-2">
            <p class="font-semibold">{{ item.adapter_key }} • {{ item.job_type }} • {{ item.status }}</p>
            <p class="text-xs text-slate-600">{{ item.created_at }} • {{ item.finished_at || 'running' }}</p>
          </li>
        </ul>
      </article>
    </section>

    <p v-if="loading" class="text-sm text-slate-600">Loading integrations...</p>
    <p v-if="message" class="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ message }}</p>
    <p v-if="error" class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
  </section>
</template>
