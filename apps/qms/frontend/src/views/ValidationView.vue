<script setup>
import { ref } from 'vue';
import { apiRequest } from '../services/api';

const message = ref('');
const systems = ref([]);

async function createSystem() {
  try {
    await apiRequest('/validation/systems', {
      method: 'POST',
      body: {
        systemName: 'LIMS Core Platform',
        vendor: 'Internal',
        version: '1.0.0',
        gampCategory: '5',
        riskLevel: 'High'
      }
    });
    message.value = 'Validation system registered';
    await refresh();
  } catch (e) {
    message.value = e.message;
  }
}

async function refresh() {
  try {
    const data = await apiRequest('/validation/systems');
    systems.value = data.systems || [];
  } catch (e) {
    message.value = e.message;
  }
}
</script>

<template>
  <section class="rounded-2xl border border-violet-100 bg-white p-4">
    <h2 class="text-lg font-semibold text-violet-900">Validation Services (CSV/CSA)</h2>
    <button class="mt-3 rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white" @click="createSystem">Register System</button>
    <button class="mt-3 ml-2 rounded-lg border border-violet-700 px-4 py-2 text-sm font-semibold text-violet-700" @click="refresh">Refresh</button>
    <p class="mt-2 text-xs text-slate-600">{{ message }}</p>
    <ul class="mt-3 space-y-2 text-sm">
      <li v-for="item in systems.slice(0, 12)" :key="item.id" class="rounded-lg border border-slate-200 px-3 py-2">
        {{ item.system_name }} (GAMP {{ item.gamp_category }}) - {{ item.validation_status }}
      </li>
    </ul>
  </section>
</template>

