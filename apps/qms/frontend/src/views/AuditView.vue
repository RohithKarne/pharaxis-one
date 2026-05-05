<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { apiRequest } from '../services/api';
import { useModuleAccess } from '../composables/useModuleAccess';

const router = useRouter();
const loading = ref(false);
const error = ref('');
const message = ref('');
const audits = ref([]);
const showCreate = ref(false);
const creating = ref(false);

const createForm = ref({
  auditTitle: '',
  auditType: 'Internal',
  scope: '',
  plannedDate: ''
});

const { isWriteDisabled, writeDisabledReason, withWriteAccess } = useModuleAccess('audits');

function formatDate(val) {
  if (!val) return '—';
  return new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const data = await apiRequest('/audits');
    audits.value = data.audits || [];
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

async function createAudit() {
  if (!withWriteAccess((t) => { message.value = t; })) return;
  creating.value = true;
  try {
    await apiRequest('/audits', {
      method: 'POST',
      body: {
        ...createForm.value,
        plannedDate: createForm.value.plannedDate || new Date().toISOString().slice(0, 10)
      }
    });
    message.value = 'Audit created successfully.';
    createForm.value.auditTitle = '';
    createForm.value.scope = '';
    createForm.value.plannedDate = '';
    showCreate.value = false;
    await load();
  } catch (err) {
    error.value = err.message;
  } finally {
    creating.value = false;
  }
}

const STATUS_COLORS = {
  Planned: 'bg-slate-50 text-slate-600 border-slate-200',
  InProgress: 'bg-blue-50 text-blue-700 border-blue-200',
  FindingsCaptured: 'bg-amber-50 text-amber-700 border-amber-200',
  ResponseInProgress: 'bg-purple-50 text-purple-700 border-purple-200',
  Closed: 'bg-green-50 text-green-700 border-green-200'
};

onMounted(load);
</script>

<template>
  <div class="flex h-full flex-col">

    <div class="flex items-start justify-between rounded-xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
      <div>
        <p class="text-xs font-semibold uppercase tracking-widest text-slate-400">Quality Management</p>
        <h1 class="mt-0.5 text-2xl font-bold text-slate-900">Audits</h1>
        <p class="mt-1 text-sm text-slate-500">Plan and run internal, external, and regulatory audits with findings and closure evidence.</p>
      </div>
      <button
        class="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
        :disabled="isWriteDisabled"
        @click="showCreate = true"
      >
        <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z"/></svg>
        New Audit
      </button>
    </div>

    <p v-if="isWriteDisabled" class="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">{{ writeDisabledReason }}</p>

    <div class="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div class="border-b border-slate-100 bg-slate-50 px-4 py-3">
        <p class="text-sm font-semibold text-slate-700">
          {{ loading ? 'Loading…' : `${audits.length} record${audits.length !== 1 ? 's' : ''}` }}
        </p>
      </div>

      <div v-if="loading" class="flex items-center justify-center py-16">
        <svg class="h-5 w-5 animate-spin text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10" stroke-width="2" stroke-opacity="0.25"/>
          <path d="M12 2a10 10 0 0 1 10 10" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </div>

      <div v-else-if="!audits.length" class="py-16 text-center text-sm text-slate-400">
        No audits found. Click <strong>New Audit</strong> to get started.
      </div>

      <table v-else class="w-full text-sm">
        <thead>
          <tr class="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
            <th class="px-4 py-3">Code</th>
            <th class="px-4 py-3">Title</th>
            <th class="px-4 py-3">Type</th>
            <th class="px-4 py-3">Planned Date</th>
            <th class="px-4 py-3">Findings</th>
            <th class="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in audits"
            :key="item.id"
            class="cursor-pointer border-b border-slate-50 transition-colors last:border-0 hover:bg-slate-50"
            @click="router.push('/audits/' + item.id)"
          >
            <td class="px-4 py-3 font-mono text-xs font-semibold text-indigo-600">{{ item.audit_code }}</td>
            <td class="max-w-xs px-4 py-3 font-medium text-slate-800"><span class="line-clamp-1">{{ item.audit_title }}</span></td>
            <td class="px-4 py-3 text-slate-600">{{ item.audit_type }}</td>
            <td class="px-4 py-3 text-slate-600">{{ formatDate(item.planned_date) }}</td>
            <td class="px-4 py-3 text-slate-600">{{ item.closed_findings || 0 }} / {{ item.total_findings || 0 }}</td>
            <td class="px-4 py-3">
              <span class="rounded-full border px-2 py-0.5 text-xs font-medium" :class="STATUS_COLORS[item.status] || 'bg-slate-50 text-slate-600 border-slate-200'">{{ item.status }}</span>
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
          <h2 class="text-lg font-semibold text-slate-900">New Audit</h2>
          <button class="rounded-lg p-2 text-slate-400 hover:bg-slate-100" @click="showCreate = false">
            <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"/></svg>
          </button>
        </div>
        <div class="flex-1 overflow-y-auto px-6 py-5">
          <fieldset :disabled="isWriteDisabled" class="grid gap-3">
            <div>
              <label class="text-xs font-semibold text-slate-500">Audit Title <span class="text-red-500">*</span></label>
              <input v-model="createForm.auditTitle" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none" placeholder="Audit title" />
            </div>
            <div>
              <label class="text-xs font-semibold text-slate-500">Audit Type</label>
              <select v-model="createForm.auditType" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none">
                <option>Internal</option><option>External</option><option>RegulatoryInspection</option>
              </select>
            </div>
            <div>
              <label class="text-xs font-semibold text-slate-500">Scope</label>
              <textarea v-model="createForm.scope" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none" rows="3" placeholder="Audit scope" />
            </div>
            <div>
              <label class="text-xs font-semibold text-slate-500">Planned Date</label>
              <input v-model="createForm.plannedDate" type="date" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none" />
            </div>
          </fieldset>
        </div>
        <div class="border-t border-slate-200 px-6 py-4 flex gap-3">
          <button
            class="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            :disabled="!createForm.auditTitle || creating || isWriteDisabled"
            @click="createAudit"
          >
            {{ creating ? 'Creating…' : 'Create Audit' }}
          </button>
          <button class="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50" @click="showCreate = false">Cancel</button>
        </div>
      </div>
    </Transition>
  </div>
</template>
