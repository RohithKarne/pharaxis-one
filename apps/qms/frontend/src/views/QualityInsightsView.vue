<script setup>
import { onMounted, ref } from 'vue';
import { apiRequest } from '../services/api';

const loading = ref(false);
const error = ref('');
const insights = ref(null);
const cached = ref([]);

async function loadInsights() {
  loading.value = true;
  error.value = '';
  try {
    const [insightPayload, cachePayload] = await Promise.all([
      apiRequest('/intelligence/quality-insights'),
      apiRequest('/intelligence/quality-insights/cached')
    ]);
    insights.value = insightPayload.insights || null;
    cached.value = cachePayload.cached || [];
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

onMounted(loadInsights);
</script>

<template>
  <section class="space-y-4">
    <header class="rounded-2xl border border-slate-200 bg-white p-5">
      <p class="text-xs uppercase tracking-[0.14em] text-slate-500">Phase 3</p>
      <h2 class="mt-1 text-2xl font-bold text-slate-900">AI Quality Insights</h2>
      <p class="mt-2 text-sm text-slate-600">Auto-generated quality summary, trend snapshots, and high-risk highlights for proactive decisions.</p>
    </header>

    <section class="grid gap-4 xl:grid-cols-4">
      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <p class="text-xs uppercase tracking-[0.08em] text-slate-500">Overdue SCAR</p>
        <p class="mt-2 text-3xl font-extrabold text-slate-900">{{ insights?.highlights?.overdueScarCount ?? 0 }}</p>
      </article>
      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <p class="text-xs uppercase tracking-[0.08em] text-slate-500">High/Critical Risks</p>
        <p class="mt-2 text-3xl font-extrabold text-slate-900">{{ insights?.highlights?.highRiskCount ?? 0 }}</p>
      </article>
      <article class="rounded-2xl border border-slate-200 bg-white p-4 xl:col-span-2">
        <p class="text-xs uppercase tracking-[0.08em] text-slate-500">Generated At</p>
        <p class="mt-2 text-sm font-semibold text-slate-900">{{ insights?.generatedAt || 'n/a' }}</p>
      </article>
    </section>

    <section class="grid gap-4 xl:grid-cols-2">
      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Narrative Brief</h3>
        <ul class="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">
          <li v-for="line in insights?.narrative || []" :key="line">{{ line }}</li>
        </ul>
      </article>

      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Leading Indicators</h3>
        <p class="mt-2 text-sm font-semibold text-slate-800">Complaint Severity</p>
        <ul class="mt-2 space-y-1 text-sm">
          <li v-for="item in insights?.highlights?.leadingComplaintSeverity || []" :key="item.label">{{ item.label }}: {{ item.total }}</li>
        </ul>
        <p class="mt-4 text-sm font-semibold text-slate-800">Nonconformance Sources</p>
        <ul class="mt-2 space-y-1 text-sm">
          <li v-for="item in insights?.highlights?.leadingNcSources || []" :key="item.label">{{ item.label }}: {{ item.total }}</li>
        </ul>
      </article>
    </section>

    <section class="rounded-2xl border border-slate-200 bg-white p-4">
      <div class="flex items-center justify-between gap-3">
        <h3 class="text-lg font-semibold text-slate-900">Weekly Trends</h3>
        <button class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700" @click="loadInsights">Refresh</button>
      </div>
      <div class="mt-3 grid gap-4 xl:grid-cols-3 text-sm">
        <div>
          <p class="font-semibold text-slate-800">Deviations</p>
          <ul class="mt-2 space-y-1">
            <li v-for="item in insights?.trends?.deviationsByWeek || []" :key="`dv-${item.bucket}`">{{ item.bucket }}: {{ item.total }}</li>
          </ul>
        </div>
        <div>
          <p class="font-semibold text-slate-800">CAPAs</p>
          <ul class="mt-2 space-y-1">
            <li v-for="item in insights?.trends?.capasByWeek || []" :key="`ca-${item.bucket}`">{{ item.bucket }}: {{ item.total }}</li>
          </ul>
        </div>
        <div>
          <p class="font-semibold text-slate-800">Complaints</p>
          <ul class="mt-2 space-y-1">
            <li v-for="item in insights?.trends?.complaintsByWeek || []" :key="`cm-${item.bucket}`">{{ item.bucket }}: {{ item.total }}</li>
          </ul>
        </div>
      </div>
    </section>

    <section class="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 class="text-lg font-semibold text-slate-900">Cache History</h3>
      <ul class="mt-3 space-y-2 text-sm">
        <li v-for="item in cached" :key="item.generated_at" class="rounded border border-slate-200 px-3 py-2">
          {{ item.insight_key }} • {{ item.generated_at }}
        </li>
      </ul>
    </section>

    <p v-if="loading" class="text-sm text-slate-600">Generating insights...</p>
    <p v-if="error" class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
  </section>
</template>
