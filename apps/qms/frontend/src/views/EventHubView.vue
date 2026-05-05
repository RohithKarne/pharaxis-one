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
  { key: 'deviations', label: 'Deviations', total: totalFor(summary.value?.deviations), color: 'text-amber-600' },
  { key: 'capas', label: 'CAPAs', total: totalFor(summary.value?.capas), color: 'text-cyan-600' },
  { key: 'complaints', label: 'Complaints', total: totalFor(summary.value?.complaints), color: 'text-rose-600' },
  { key: 'nonconformances', label: 'Nonconformances', total: totalFor(summary.value?.nonconformances), color: 'text-purple-600' },
  { key: 'risks', label: 'Risks', total: totalFor(summary.value?.risks), color: 'text-red-600' }
]);

const activeMixRows = computed(() => summary.value?.[selectedMix.value] || []);
const activeMixLabel = computed(() => moduleTotals.value.find((item) => item.key === selectedMix.value)?.label || 'Status Mix');
const activeMixTotal = computed(() => totalFor(activeMixRows.value));

function statusPercent(rowTotal) {
  if (!activeMixTotal.value) return 0;
  return Math.round((Number(rowTotal || 0) / activeMixTotal.value) * 100);
}

const STATUS_BAR_COLORS = [
  'bg-indigo-500', 'bg-amber-500', 'bg-green-500', 'bg-rose-500', 'bg-cyan-500',
  'bg-purple-500', 'bg-slate-500', 'bg-orange-500'
];

onMounted(loadSummary);
</script>

<template>
  <div class="space-y-4">

    <!-- Header -->
    <div class="flex items-start justify-between rounded-xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
      <div>
        <p class="text-xs font-semibold uppercase tracking-widest text-slate-400">Platform Intelligence</p>
        <h1 class="mt-0.5 text-2xl font-bold text-slate-900">Quality Events Hub</h1>
        <p class="mt-1 text-sm text-slate-500">Unified operational pulse across all QMS modules — deviations, CAPAs, complaints, and more.</p>
      </div>
      <button
        class="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        :disabled="loading"
        @click="loadSummary"
      >
        <svg class="h-4 w-4" :class="loading ? 'animate-spin' : ''" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H3.989a.75.75 0 0 0-.75.75v4.242a.75.75 0 0 0 1.5 0v-2.43l.31.31a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm1.23-3.723a.75.75 0 0 0 .219-.53V2.929a.75.75 0 0 0-1.5 0V5.36l-.31-.31A7 7 0 0 0 3.239 8.188a.75.75 0 1 0 1.448.389A5.5 5.5 0 0 1 13.89 6.11l.311.31h-2.432a.75.75 0 0 0 0 1.5h4.243a.75.75 0 0 0 .53-.219Z" clip-rule="evenodd"/>
        </svg>
        Refresh
      </button>
    </div>

    <!-- Stat tiles -->
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <button
        v-for="mod in moduleTotals"
        :key="mod.key"
        class="rounded-xl border bg-white px-5 py-4 text-left shadow-sm transition-colors hover:bg-slate-50"
        :class="selectedMix === mod.key ? 'border-indigo-400 ring-1 ring-indigo-300' : 'border-slate-200'"
        @click="selectedMix = mod.key"
      >
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">{{ mod.label }}</p>
        <p class="mt-2 text-3xl font-extrabold" :class="mod.color">{{ mod.total }}</p>
        <p class="mt-1 text-xs text-slate-400">total records</p>
      </button>
    </div>

    <!-- Status mix -->
    <div class="grid gap-4 xl:grid-cols-3">
      <div class="xl:col-span-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div class="flex items-center justify-between">
          <h2 class="text-base font-semibold text-slate-800">{{ activeMixLabel }} — Status Distribution</h2>
          <span class="text-sm text-slate-400">Total: {{ activeMixTotal }}</span>
        </div>
        <div v-if="loading" class="mt-6 flex items-center justify-center py-8">
          <svg class="h-5 w-5 animate-spin text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="10" stroke-width="2" stroke-opacity="0.25"/>
            <path d="M12 2a10 10 0 0 1 10 10" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </div>
        <div v-else-if="!activeMixRows.length" class="mt-6 text-center text-sm text-slate-400 py-8">No data available.</div>
        <ul v-else class="mt-4 space-y-3">
          <li v-for="(row, idx) in activeMixRows" :key="`active-${row.status}`">
            <div class="flex items-center justify-between text-sm">
              <span class="font-medium text-slate-700">{{ row.status }}</span>
              <span class="text-slate-500">{{ row.total }} <span class="text-slate-400">({{ statusPercent(row.total) }}%)</span></span>
            </div>
            <div class="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                class="h-full rounded-full transition-all duration-500"
                :class="STATUS_BAR_COLORS[idx % STATUS_BAR_COLORS.length]"
                :style="{ width: `${statusPercent(row.total)}%` }"
              />
            </div>
          </li>
        </ul>
      </div>

      <div class="space-y-4">
        <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 class="text-base font-semibold text-slate-800">CAPA Status Mix</h2>
          <ul class="mt-3 space-y-2 text-sm">
            <li v-for="row in summary?.capas || []" :key="`ca-${row.status}`" class="flex items-center justify-between">
              <span class="text-slate-600">{{ row.status }}</span>
              <span class="font-semibold text-slate-800">{{ row.total }}</span>
            </li>
            <li v-if="!(summary?.capas?.length)" class="text-slate-400">No data.</li>
          </ul>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 class="text-base font-semibold text-slate-800">Risk Status Mix</h2>
          <ul class="mt-3 space-y-2 text-sm">
            <li v-for="row in summary?.risks || []" :key="`rk-${row.status}`" class="flex items-center justify-between">
              <span class="text-slate-600">{{ row.status }}</span>
              <span class="font-semibold text-slate-800">{{ row.total }}</span>
            </li>
            <li v-if="!(summary?.risks?.length)" class="text-slate-400">No data.</li>
          </ul>
        </div>
      </div>
    </div>

    <p v-if="error" class="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{{ error }}</p>
  </div>
</template>
