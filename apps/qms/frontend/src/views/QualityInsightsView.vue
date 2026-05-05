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

function formatDateTime(val) {
  if (!val) return '—';
  return new Date(val).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

onMounted(loadInsights);
</script>

<template>
  <div class="space-y-4">

    <!-- Header -->
    <div class="flex items-start justify-between rounded-xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
      <div>
        <p class="text-xs font-semibold uppercase tracking-widest text-slate-400">Platform Intelligence</p>
        <h1 class="mt-0.5 text-2xl font-bold text-slate-900">AI Quality Insights</h1>
        <p class="mt-1 text-sm text-slate-500">Auto-generated quality summaries, trend snapshots, and high-risk highlights for proactive decisions.</p>
      </div>
      <button
        class="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        :disabled="loading"
        @click="loadInsights"
      >
        <svg class="h-4 w-4" :class="loading ? 'animate-spin' : ''" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H3.989a.75.75 0 0 0-.75.75v4.242a.75.75 0 0 0 1.5 0v-2.43l.31.31a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm1.23-3.723a.75.75 0 0 0 .219-.53V2.929a.75.75 0 0 0-1.5 0V5.36l-.31-.31A7 7 0 0 0 3.239 8.188a.75.75 0 1 0 1.448.389A5.5 5.5 0 0 1 13.89 6.11l.311.31h-2.432a.75.75 0 0 0 0 1.5h4.243a.75.75 0 0 0 .53-.219Z" clip-rule="evenodd"/>
        </svg>
        Refresh
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-16 shadow-sm">
      <div class="flex items-center gap-3 text-sm text-slate-500">
        <svg class="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10" stroke-width="2" stroke-opacity="0.25"/>
          <path d="M12 2a10 10 0 0 1 10 10" stroke-width="2" stroke-linecap="round"/>
        </svg>
        Generating insights…
      </div>
    </div>

    <template v-else-if="insights">
      <!-- Highlight tiles -->
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div class="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Overdue SCARs</p>
          <p class="mt-2 text-3xl font-extrabold text-red-600">{{ insights.highlights?.overdueScarCount ?? 0 }}</p>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">High/Critical Risks</p>
          <p class="mt-2 text-3xl font-extrabold text-orange-600">{{ insights.highlights?.highRiskCount ?? 0 }}</p>
        </div>
        <div class="xl:col-span-2 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm flex items-center gap-4">
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Generated</p>
            <p class="mt-1 text-sm font-semibold text-slate-800">{{ formatDateTime(insights.generatedAt) }}</p>
          </div>
        </div>
      </div>

      <!-- Narrative + Leading indicators -->
      <div class="grid gap-4 xl:grid-cols-2">
        <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 class="text-base font-semibold text-slate-800">Narrative Brief</h2>
          <ul v-if="insights.narrative?.length" class="mt-3 space-y-2 text-sm text-slate-700">
            <li v-for="(line, idx) in insights.narrative" :key="idx" class="flex gap-2">
              <span class="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-indigo-400 mt-1.5"></span>
              <span>{{ line }}</span>
            </li>
          </ul>
          <p v-else class="mt-3 text-sm text-slate-400">No narrative available.</p>
        </div>

        <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 class="text-base font-semibold text-slate-800">Leading Indicators</h2>
          <div class="mt-3 space-y-4">
            <div>
              <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Complaint Severity</p>
              <ul class="mt-2 space-y-1 text-sm">
                <li v-for="item in insights.highlights?.leadingComplaintSeverity || []" :key="item.label" class="flex items-center justify-between">
                  <span class="text-slate-600">{{ item.label }}</span>
                  <span class="font-semibold text-slate-800">{{ item.total }}</span>
                </li>
                <li v-if="!(insights.highlights?.leadingComplaintSeverity?.length)" class="text-slate-400">No data.</li>
              </ul>
            </div>
            <div>
              <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Nonconformance Sources</p>
              <ul class="mt-2 space-y-1 text-sm">
                <li v-for="item in insights.highlights?.leadingNcSources || []" :key="item.label" class="flex items-center justify-between">
                  <span class="text-slate-600">{{ item.label }}</span>
                  <span class="font-semibold text-slate-800">{{ item.total }}</span>
                </li>
                <li v-if="!(insights.highlights?.leadingNcSources?.length)" class="text-slate-400">No data.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <!-- Weekly trends -->
      <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 class="text-base font-semibold text-slate-800">Weekly Trends</h2>
        <div class="mt-4 grid gap-6 xl:grid-cols-3 text-sm">
          <div>
            <p class="font-semibold text-slate-700 mb-2">Deviations by Week</p>
            <ul class="space-y-1">
              <li v-for="item in insights.trends?.deviationsByWeek || []" :key="`dv-${item.bucket}`" class="flex items-center justify-between text-slate-600">
                <span>{{ item.bucket }}</span><span class="font-medium text-slate-800">{{ item.total }}</span>
              </li>
              <li v-if="!(insights.trends?.deviationsByWeek?.length)" class="text-slate-400">No data.</li>
            </ul>
          </div>
          <div>
            <p class="font-semibold text-slate-700 mb-2">CAPAs by Week</p>
            <ul class="space-y-1">
              <li v-for="item in insights.trends?.capasByWeek || []" :key="`ca-${item.bucket}`" class="flex items-center justify-between text-slate-600">
                <span>{{ item.bucket }}</span><span class="font-medium text-slate-800">{{ item.total }}</span>
              </li>
              <li v-if="!(insights.trends?.capasByWeek?.length)" class="text-slate-400">No data.</li>
            </ul>
          </div>
          <div>
            <p class="font-semibold text-slate-700 mb-2">Complaints by Week</p>
            <ul class="space-y-1">
              <li v-for="item in insights.trends?.complaintsByWeek || []" :key="`cm-${item.bucket}`" class="flex items-center justify-between text-slate-600">
                <span>{{ item.bucket }}</span><span class="font-medium text-slate-800">{{ item.total }}</span>
              </li>
              <li v-if="!(insights.trends?.complaintsByWeek?.length)" class="text-slate-400">No data.</li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Cache history -->
      <div v-if="cached.length" class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 class="text-base font-semibold text-slate-800">Insight Cache History</h2>
        <table class="mt-3 w-full text-sm">
          <thead>
            <tr class="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              <th class="pb-2 pr-4">Key</th>
              <th class="pb-2">Generated At</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in cached" :key="item.generated_at" class="border-b border-slate-50 last:border-0">
              <td class="py-2 pr-4 font-mono text-xs text-slate-600">{{ item.insight_key }}</td>
              <td class="py-2 text-slate-600">{{ formatDateTime(item.generated_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <div v-else-if="!loading" class="rounded-xl border border-slate-200 bg-white py-16 text-center shadow-sm">
      <p class="text-sm text-slate-400">No insights available. Click <strong>Refresh</strong> to generate.</p>
    </div>

    <p v-if="error" class="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{{ error }}</p>
  </div>
</template>
