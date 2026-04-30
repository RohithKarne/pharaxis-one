<script setup>
import { computed, onMounted, ref } from 'vue';
import { apiRequest } from '../services/api';

const loading = ref(false);
const error = ref('');
const summary = ref(null);
const selectedMix = ref('deviations');

async function loadSummary() {
  loading.value = true;
  error.value = '';
  try {
    const payload = await apiRequest('/intelligence/event-hub');
    summary.value = payload.summary || null;
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

function totalFor(moduleRows) {
  return (moduleRows || []).reduce((acc, row) => acc + Number(row.total || 0), 0);
}

const moduleTotals = computed(() => [
  { key: 'deviations', label: 'Deviations', total: totalFor(summary.value?.deviations) },
  { key: 'capas', label: 'CAPAs', total: totalFor(summary.value?.capas) },
  { key: 'complaints', label: 'Complaints', total: totalFor(summary.value?.complaints) },
  { key: 'nonconformances', label: 'Nonconformances', total: totalFor(summary.value?.nonconformances) },
  { key: 'risks', label: 'Risks', total: totalFor(summary.value?.risks) }
]);

const activeMixRows = computed(() => summary.value?.[selectedMix.value] || []);
const activeMixLabel = computed(() => moduleTotals.value.find((item) => item.key === selectedMix.value)?.label || 'Status Mix');
const activeMixTotal = computed(() => totalFor(activeMixRows.value));

function statusPercent(rowTotal) {
  if (!activeMixTotal.value) return 0;
  return Math.round((Number(rowTotal || 0) / activeMixTotal.value) * 100);
}

onMounted(loadSummary);
</script>

<template>
  <section class="space-y-4">
    <header class="rounded-2xl border border-slate-200 bg-white p-5">
      <p class="text-xs uppercase tracking-[0.14em] text-slate-500">Phase 1</p>
      <h2 class="mt-1 text-2xl font-bold text-slate-900">Quality Events Hub</h2>
      <p class="mt-2 text-sm text-slate-600">Unified operational pulse across deviation, CAPA, complaints, nonconformance, changes, audits, and risks.</p>
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <select v-model="selectedMix" class="rounded border border-slate-300 px-2 py-1 text-xs">
          <option v-for="item in moduleTotals" :key="item.key" :value="item.key">{{ item.label }} mix</option>
        </select>
        <button class="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700" @click="loadSummary">Refresh</button>
      </div>
    </header>

    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <p class="text-xs uppercase tracking-[0.08em] text-slate-500">Deviations</p>
        <p class="mt-2 text-3xl font-extrabold text-slate-900">{{ totalFor(summary?.deviations) }}</p>
      </article>
      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <p class="text-xs uppercase tracking-[0.08em] text-slate-500">CAPAs</p>
        <p class="mt-2 text-3xl font-extrabold text-slate-900">{{ totalFor(summary?.capas) }}</p>
      </article>
      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <p class="text-xs uppercase tracking-[0.08em] text-slate-500">Complaints</p>
        <p class="mt-2 text-3xl font-extrabold text-slate-900">{{ totalFor(summary?.complaints) }}</p>
      </article>
      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <p class="text-xs uppercase tracking-[0.08em] text-slate-500">Nonconformances</p>
        <p class="mt-2 text-3xl font-extrabold text-slate-900">{{ totalFor(summary?.nonconformances) }}</p>
      </article>
    </div>

    <section class="grid gap-4 xl:grid-cols-3">
      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">{{ activeMixLabel }} Distribution</h3>
        <ul class="mt-3 space-y-2 text-sm">
          <li
            v-for="row in activeMixRows"
            :key="`active-${row.status}`"
            class="rounded border border-slate-200 px-3 py-2"
          >
            <div class="flex items-center justify-between">
              <span>{{ row.status }}</span>
              <span class="font-semibold">{{ row.total }}</span>
            </div>
            <div class="mt-2 h-2 overflow-hidden rounded bg-slate-100">
              <div class="h-full bg-emerald-600" :style="{ width: `${statusPercent(row.total)}%` }"></div>
            </div>
            <p class="mt-1 text-[11px] text-slate-600">{{ statusPercent(row.total) }}% of {{ activeMixLabel }}</p>
          </li>
        </ul>
      </article>
      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">CAPA Status Mix</h3>
        <ul class="mt-3 space-y-2 text-sm">
          <li v-for="row in summary?.capas || []" :key="`ca-${row.status}`" class="rounded border border-slate-200 px-3 py-2">
            {{ row.status }}: <span class="font-semibold">{{ row.total }}</span>
          </li>
        </ul>
      </article>
      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Risk Status Mix</h3>
        <ul class="mt-3 space-y-2 text-sm">
          <li v-for="row in summary?.risks || []" :key="`rk-${row.status}`" class="rounded border border-slate-200 px-3 py-2">
            {{ row.status }}: <span class="font-semibold">{{ row.total }}</span>
          </li>
        </ul>
      </article>
    </section>

    <div class="flex items-center gap-3">
      <button class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700" @click="loadSummary">Refresh</button>
      <p class="text-sm text-slate-600">Selected mix total: {{ activeMixTotal }}</p>
      <p v-if="loading" class="text-sm text-slate-600">Refreshing event hub...</p>
      <p v-if="error" class="text-sm text-red-700">{{ error }}</p>
    </div>
  </section>
</template>
