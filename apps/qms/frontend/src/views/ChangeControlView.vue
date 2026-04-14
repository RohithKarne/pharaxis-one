<script setup>
import { ref } from 'vue';
import { apiRequest } from '../services/api';

const message = ref('');
const list = ref([]);

async function createChangeRequest() {
  try {
    const me = await apiRequest('/protected/me');
    await apiRequest('/change-control', {
      method: 'POST',
      body: {
        title: 'Controlled update to document review workflow',
        changeType: 'Standard',
        reason: 'Align workflow timings with current compliance cycle.',
        ownerUserId: me.auth.userId,
        plannedStartDate: new Date().toISOString().slice(0, 10),
        riskLevel: 'Medium'
      }
    });
    message.value = 'Change request created';
    await refresh();
  } catch (error) {
    message.value = error.message;
  }
}

async function refresh() {
  try {
    const data = await apiRequest('/change-control');
    list.value = data.changes || [];
  } catch (error) {
    message.value = error.message;
  }
}
</script>

<template>
  <section class="rounded-2xl border border-indigo-100 bg-white p-4">
    <h2 class="text-lg font-semibold text-indigo-900">Change Control</h2>
    <div class="mt-3">
      <button
        class="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white"
        @click="createChangeRequest"
      >
        Create Change Request
      </button>
      <button
        class="ml-2 rounded-lg border border-indigo-700 px-4 py-2 text-sm font-semibold text-indigo-700"
        @click="refresh"
      >
        Refresh
      </button>
      <p class="mt-2 text-xs text-slate-600">{{ message }}</p>
    </div>
    <ul class="mt-3 space-y-2 text-sm">
      <li
        v-for="change in list.slice(0, 12)"
        :key="change.id"
        class="rounded-lg border border-slate-200 px-3 py-2"
      >
        {{ change.change_code }} - {{ change.title }} ({{ change.status }}) [{{ change.completed_steps }}/{{ change.total_steps }} steps]
      </li>
    </ul>
  </section>
</template>
