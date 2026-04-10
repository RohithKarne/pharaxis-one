<script setup>
import { ref } from 'vue';
import { apiRequest } from '../services/api';

const message = ref('');
const audits = ref([]);
const binderJobs = ref([]);

async function createAudit() {
  try {
    await apiRequest('/audits', {
      method: 'POST',
      body: {
        auditTitle: 'Internal GMP readiness audit',
        auditType: 'Internal',
        scope: 'Document control and CAPA traceability',
        plannedDate: new Date().toISOString().slice(0, 10)
      }
    });
    message.value = 'Audit created';
    await refresh();
  } catch (e) {
    message.value = e.message;
  }
}

async function generateBinder() {
  try {
    await apiRequest('/audits/binder/generate', { method: 'POST', body: {} });
    message.value = 'Inspection binder generated';
    await refresh();
  } catch (e) {
    message.value = e.message;
  }
}

async function refresh() {
  try {
    const [a, b] = await Promise.all([apiRequest('/audits'), apiRequest('/audits/binder/jobs')]);
    audits.value = a.audits || [];
    binderJobs.value = b.jobs || [];
  } catch (e) {
    message.value = e.message;
  }
}
</script>

<template>
  <section class="grid gap-4 lg:grid-cols-2">
    <article class="rounded-2xl border border-sky-100 bg-white p-4">
      <h2 class="text-lg font-semibold text-sky-900">Audit Management</h2>
      <button class="mt-3 rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white" @click="createAudit">Create Audit</button>
      <button class="mt-3 ml-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white" @click="generateBinder">Generate Binder</button>
      <button class="mt-3 ml-2 rounded-lg border border-sky-700 px-4 py-2 text-sm font-semibold text-sky-700" @click="refresh">Refresh</button>
      <p class="mt-2 text-xs text-slate-600">{{ message }}</p>
      <ul class="mt-3 space-y-2 text-sm">
        <li v-for="item in audits.slice(0, 8)" :key="item.id" class="rounded-lg border border-slate-200 px-3 py-2">
          {{ item.audit_code }} - {{ item.audit_title }} ({{ item.status }})
        </li>
      </ul>
    </article>
    <article class="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 class="text-base font-semibold text-slate-900">Binder Jobs</h3>
      <ul class="mt-3 space-y-2 text-sm">
        <li v-for="job in binderJobs.slice(0, 8)" :key="job.id" class="rounded-lg border border-slate-200 px-3 py-2">
          {{ job.job_status }} | records: {{ job.total_records }} | duration: {{ job.duration_ms || 0 }}ms
        </li>
      </ul>
    </article>
  </section>
</template>

