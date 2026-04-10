<script setup>
import { ref } from 'vue';
import { apiRequest } from '../services/api';

const message = ref('');
const list = ref([]);

async function createCapa() {
  try {
    const me = await apiRequest('/protected/me');
    await apiRequest('/capa', {
      method: 'POST',
      body: {
        title: 'CAPA for recurring documentation delay',
        sourceType: 'Manual',
        classification: 'Corrective',
        ownerUserId: me.auth.userId
      }
    });
    message.value = 'CAPA created';
    await refresh();
  } catch (e) {
    message.value = e.message;
  }
}

async function refresh() {
  try {
    const data = await apiRequest('/capa');
    list.value = data.capas || [];
  } catch (e) {
    message.value = e.message;
  }
}
</script>

<template>
  <section class="rounded-2xl border border-cyan-100 bg-white p-4">
    <h2 class="text-lg font-semibold text-cyan-900">CAPA Management</h2>
    <div class="mt-3">
      <button class="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white" @click="createCapa">Create CAPA</button>
      <button class="ml-2 rounded-lg border border-cyan-700 px-4 py-2 text-sm font-semibold text-cyan-700" @click="refresh">Refresh</button>
      <p class="mt-2 text-xs text-slate-600">{{ message }}</p>
    </div>
    <ul class="mt-3 space-y-2 text-sm">
      <li v-for="capa in list.slice(0, 12)" :key="capa.id" class="rounded-lg border border-slate-200 px-3 py-2">
        {{ capa.capa_code }} - {{ capa.title }} ({{ capa.status }})
      </li>
    </ul>
  </section>
</template>

