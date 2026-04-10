<script setup>
import { onMounted, ref } from 'vue';
import { apiRequest } from '../services/api';

const stats = ref({
  documents: 0,
  capas: 0,
  deviations: 0,
  audits: 0,
  systems: 0
});
const error = ref('');

async function load() {
  error.value = '';
  try {
    const [docs, capas, deviations, audits, systems] = await Promise.all([
      apiRequest('/document-control/documents'),
      apiRequest('/capa'),
      apiRequest('/deviations'),
      apiRequest('/audits'),
      apiRequest('/validation/systems')
    ]);
    stats.value = {
      documents: docs.documents?.length || 0,
      capas: capas.capas?.length || 0,
      deviations: deviations.deviations?.length || 0,
      audits: audits.audits?.length || 0,
      systems: systems.systems?.length || 0
    };
  } catch (e) {
    error.value = e.message;
  }
}

onMounted(load);
</script>

<template>
  <section class="grid gap-4 md:grid-cols-5">
    <article class="rounded-2xl border border-teal-100 bg-white p-4">
      <p class="text-xs uppercase text-teal-600">Documents</p>
      <p class="mt-2 text-3xl font-bold">{{ stats.documents }}</p>
    </article>
    <article class="rounded-2xl border border-cyan-100 bg-white p-4">
      <p class="text-xs uppercase text-cyan-700">CAPA</p>
      <p class="mt-2 text-3xl font-bold">{{ stats.capas }}</p>
    </article>
    <article class="rounded-2xl border border-amber-100 bg-white p-4">
      <p class="text-xs uppercase text-amber-700">Deviations</p>
      <p class="mt-2 text-3xl font-bold">{{ stats.deviations }}</p>
    </article>
    <article class="rounded-2xl border border-sky-100 bg-white p-4">
      <p class="text-xs uppercase text-sky-700">Audits</p>
      <p class="mt-2 text-3xl font-bold">{{ stats.audits }}</p>
    </article>
    <article class="rounded-2xl border border-violet-100 bg-white p-4">
      <p class="text-xs uppercase text-violet-700">Validation Systems</p>
      <p class="mt-2 text-3xl font-bold">{{ stats.systems }}</p>
    </article>
  </section>
  <p v-if="error" class="mt-3 text-sm text-red-600">{{ error }}</p>
</template>

