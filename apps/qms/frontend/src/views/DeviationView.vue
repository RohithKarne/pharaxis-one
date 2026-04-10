<script setup>
import { ref } from 'vue';
import { apiRequest } from '../services/api';

const message = ref('');
const list = ref([]);

async function createDeviation() {
  try {
    await apiRequest('/deviations', {
      method: 'POST',
      body: {
        title: 'Temperature excursion in storage area',
        description: 'Storage room temperature exceeded validated range for 2 hours.',
        deviationType: 'Environmental',
        classification: 'Major',
        dateOfOccurrence: new Date().toISOString().slice(0, 10),
        department: 'Manufacturing'
      }
    });
    message.value = 'Deviation created';
    await refresh();
  } catch (e) {
    message.value = e.message;
  }
}

async function refresh() {
  try {
    const data = await apiRequest('/deviations');
    list.value = data.deviations || [];
  } catch (e) {
    message.value = e.message;
  }
}
</script>

<template>
  <section class="rounded-2xl border border-amber-100 bg-white p-4">
    <h2 class="text-lg font-semibold text-amber-900">Deviation Management</h2>
    <div class="mt-3">
      <button class="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white" @click="createDeviation">Create Deviation</button>
      <button class="ml-2 rounded-lg border border-amber-700 px-4 py-2 text-sm font-semibold text-amber-700" @click="refresh">Refresh</button>
      <p class="mt-2 text-xs text-slate-600">{{ message }}</p>
    </div>
    <ul class="mt-3 space-y-2 text-sm">
      <li v-for="item in list.slice(0, 12)" :key="item.id" class="rounded-lg border border-slate-200 px-3 py-2">
        {{ item.deviation_code }} - {{ item.title }} ({{ item.status }})
      </li>
    </ul>
  </section>
</template>

