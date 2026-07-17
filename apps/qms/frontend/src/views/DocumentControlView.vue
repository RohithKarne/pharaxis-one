<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { apiRequest } from '../services/api';
import { useModuleAccess } from '../composables/useModuleAccess';

const router = useRouter();
const loading = ref(false);
const error = ref('');
const message = ref('');
const list = ref([]);
const showCreate = ref(false);
const creating = ref(false);
const searchQuery = ref('');
const statusFilter = ref('All');
const criticalityFilter = ref('All');
const reviewFilter = ref('All');

const DAY_MS = 24 * 60 * 60 * 1000;
const STATUS_FILTERS = ['All', 'Draft', 'Review', 'Approved', 'Effective', 'Retired'];
const CRITICALITY_FILTERS = ['All', 'Critical', 'High', 'Medium', 'Low'];
const REVIEW_FILTERS = ['All', 'Overdue', 'Due Soon', 'No Review Date'];

const createForm = ref({
  title: '',
  documentType: 'SOP',
  documentSubtype: '',
  department: 'Quality',
  siteCode: '',
  reviewIntervalDays: 365,
  criticality: 'Medium',
  trainingRequired: false,
  controlledCopyRequired: true,
  contentSummary: '',
  reasonForChange: ''
});

const { isWriteDisabled, writeDisabledReason, withWriteAccess } = useModuleAccess('documentControl');

function formatDate(val) {
  if (!val) return '—';
  return new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function normalizeStatus(value) {
  return String(value || 'Draft').trim();
}

function daysUntil(value) {
  if (!value) return null;
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / DAY_MS);
}

function matchesReviewFilter(doc) {
  const days = daysUntil(doc.next_review_due_date);
  if (reviewFilter.value === 'Overdue') return days !== null && days < 0;
  if (reviewFilter.value === 'Due Soon') return days !== null && days >= 0 && days <= 30;
  if (reviewFilter.value === 'No Review Date') return days === null;
  return true;
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const data = await apiRequest('/document-control/documents');
    list.value = data.documents || [];
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

async function createDocument() {
  if (!withWriteAccess((t) => { message.value = t; })) return;
  creating.value = true;
  try {
    const me = await apiRequest('/protected/me');
    await apiRequest('/document-control/documents', {
      method: 'POST',
      body: {
        title: createForm.value.title,
        documentType: createForm.value.documentType,
        documentSubtype: createForm.value.documentSubtype || null,
        department: createForm.value.department,
        siteCode: createForm.value.siteCode || null,
        ownerUserId: me.auth.userId,
        reviewIntervalDays: Number(createForm.value.reviewIntervalDays || 365),
        contentSummary: createForm.value.contentSummary || null,
        reasonForChange: createForm.value.reasonForChange || null,
        criticality: createForm.value.criticality,
        trainingRequired: Boolean(createForm.value.trainingRequired),
        controlledCopyRequired: Boolean(createForm.value.controlledCopyRequired)
      }
    });
    message.value = 'Document created successfully.';
    createForm.value.title = '';
    createForm.value.documentSubtype = '';
    createForm.value.siteCode = '';
    createForm.value.contentSummary = '';
    createForm.value.reasonForChange = '';
    showCreate.value = false;
    await load();
  } catch (err) {
    error.value = err.message;
  } finally {
    creating.value = false;
  }
}

const STATUS_COLORS = {
  Draft: 'bg-slate-50 text-slate-600 border-slate-200',
  Review: 'bg-blue-50 text-blue-700 border-blue-200',
  Approved: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  Effective: 'bg-green-50 text-green-700 border-green-200',
  Retired: 'bg-slate-100 text-slate-500 border-slate-300'
};

const CRIT_COLORS = {
  Critical: 'bg-red-100 text-red-800',
  High: 'bg-orange-100 text-orange-800',
  Medium: 'bg-amber-100 text-amber-800',
  Low: 'bg-green-100 text-green-800'
};

const documentKpis = computed(() => {
  const reviewDocs = list.value.filter((doc) => normalizeStatus(doc.status) === 'Review');
  const effectiveDocs = list.value.filter((doc) => normalizeStatus(doc.status) === 'Effective');
  const highCriticalDocs = list.value.filter((doc) => ['High', 'Critical'].includes(doc.criticality));
  const reviewDueSoon = list.value.filter((doc) => {
    const days = daysUntil(doc.next_review_due_date);
    return days !== null && days >= 0 && days <= 30;
  });
  const overdueReviews = list.value.filter((doc) => {
    const days = daysUntil(doc.next_review_due_date);
    return days !== null && days < 0;
  });

  return [
    { label: 'Total Documents', value: list.value.length, detail: 'Controlled records in scope' },
    { label: 'In Review', value: reviewDocs.length, detail: 'Needs reviewer action' },
    { label: 'Effective', value: effectiveDocs.length, detail: 'Released for use' },
    { label: 'High/Critical', value: highCriticalDocs.length, detail: 'Higher compliance sensitivity' },
    { label: 'Due Soon', value: reviewDueSoon.length, detail: 'Periodic review in 30 days' },
    { label: 'Overdue Review', value: overdueReviews.length, detail: 'Needs immediate follow-up' }
  ];
});

const filteredDocuments = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  return list.value.filter((doc) => {
    const status = normalizeStatus(doc.status);
    const searchable = [
      doc.document_code,
      doc.title,
      doc.document_type,
      doc.department,
      doc.criticality,
      status
    ].join(' ').toLowerCase();

    const matchesSearch = !query || searchable.includes(query);
    const matchesStatus = statusFilter.value === 'All' || status === statusFilter.value;
    const matchesCriticality = criticalityFilter.value === 'All' || doc.criticality === criticalityFilter.value;

    return matchesSearch && matchesStatus && matchesCriticality && matchesReviewFilter(doc);
  });
});

onMounted(load);
</script>

<template>
  <div class="flex h-full flex-col">

    <div class="flex items-start justify-between rounded-xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
      <div>
        <p class="text-xs font-semibold uppercase tracking-widest text-slate-400">Quality Management</p>
        <h1 class="mt-0.5 text-2xl font-bold text-slate-900">Document Control</h1>
        <p class="mt-1 text-sm text-slate-500">Manage controlled documents through version control, review, approval, and distribution.</p>
      </div>
      <button
        class="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
        :disabled="isWriteDisabled"
        @click="showCreate = true"
      >
        <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z"/></svg>
        New Document
      </button>
    </div>

    <p v-if="isWriteDisabled" class="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">{{ writeDisabledReason }}</p>

    <section class="mt-3 grid gap-3 xl:grid-cols-6 md:grid-cols-3 sm:grid-cols-2">
      <article
        v-for="kpi in documentKpis"
        :key="kpi.label"
        class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      >
        <p class="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{{ kpi.label }}</p>
        <p class="mt-2 text-2xl font-extrabold text-slate-900">{{ kpi.value }}</p>
        <p class="mt-1 text-xs text-slate-500">{{ kpi.detail }}</p>
      </article>
    </section>

    <div class="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div class="border-b border-slate-100 bg-slate-50 px-4 py-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-slate-700">
              {{ loading ? 'Loading…' : `${filteredDocuments.length} of ${list.length} document${list.length !== 1 ? 's' : ''}` }}
            </p>
            <p class="text-xs text-slate-500">Filter by status, criticality, and periodic review pressure.</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <input
              v-model="searchQuery"
              class="h-8 w-60 rounded border border-slate-300 px-3 text-xs"
              type="search"
              placeholder="Search code, title, type, department"
            />
            <select v-model="statusFilter" class="h-8 rounded border border-slate-300 px-2 text-xs">
              <option v-for="status in STATUS_FILTERS" :key="status" :value="status">{{ status }} status</option>
            </select>
            <select v-model="criticalityFilter" class="h-8 rounded border border-slate-300 px-2 text-xs">
              <option v-for="level in CRITICALITY_FILTERS" :key="level" :value="level">{{ level }} criticality</option>
            </select>
            <select v-model="reviewFilter" class="h-8 rounded border border-slate-300 px-2 text-xs">
              <option v-for="review in REVIEW_FILTERS" :key="review" :value="review">{{ review }} review</option>
            </select>
          </div>
        </div>
      </div>

      <div v-if="loading" class="flex items-center justify-center py-16">
        <svg class="h-5 w-5 animate-spin text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10" stroke-width="2" stroke-opacity="0.25"/>
          <path d="M12 2a10 10 0 0 1 10 10" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </div>

      <div v-else-if="!list.length" class="py-16 text-center text-sm text-slate-400">
        No documents found. Click <strong>New Document</strong> to get started.
      </div>

      <div v-else-if="!filteredDocuments.length" class="py-16 text-center text-sm text-slate-400">
        No documents match the current filters.
      </div>

      <table v-else class="w-full text-sm">
        <thead>
          <tr class="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
            <th class="px-4 py-3">Code</th>
            <th class="px-4 py-3">Title</th>
            <th class="px-4 py-3">Type</th>
            <th class="px-4 py-3">Department</th>
            <th class="px-4 py-3">Criticality</th>
            <th class="px-4 py-3">Version</th>
            <th class="px-4 py-3">Next Review</th>
            <th class="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="doc in filteredDocuments"
            :key="doc.id"
            class="cursor-pointer border-b border-slate-50 transition-colors last:border-0 hover:bg-slate-50"
            @click="router.push('/document-control/' + doc.id)"
          >
            <td class="px-4 py-3 font-mono text-xs font-semibold text-indigo-600">{{ doc.document_code }}</td>
            <td class="max-w-xs px-4 py-3 font-medium text-slate-800"><span class="line-clamp-1">{{ doc.title }}</span></td>
            <td class="px-4 py-3 text-slate-600">{{ doc.document_type }}</td>
            <td class="px-4 py-3 text-slate-600">{{ doc.department }}</td>
            <td class="px-4 py-3">
              <span v-if="doc.criticality" class="rounded-full px-2 py-0.5 text-xs font-medium" :class="CRIT_COLORS[doc.criticality] || 'bg-slate-100 text-slate-600'">{{ doc.criticality }}</span>
              <span v-else class="text-slate-400">—</span>
            </td>
            <td class="px-4 py-3 text-slate-600">{{ doc.version_no ? `v${doc.version_no}` : '—' }}</td>
            <td class="px-4 py-3 text-slate-600">{{ formatDate(doc.next_review_due_date) }}</td>
            <td class="px-4 py-3">
              <span class="rounded-full border px-2 py-0.5 text-xs font-medium" :class="STATUS_COLORS[doc.status] || 'bg-slate-50 text-slate-600 border-slate-200'">{{ doc.status || 'Draft' }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-if="message" class="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{{ message }}</p>
    <p v-if="error" class="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{{ error }}</p>

    <Transition enter-active-class="transition-opacity duration-200" enter-from-class="opacity-0" leave-active-class="transition-opacity duration-200" leave-to-class="opacity-0">
      <div v-if="showCreate" class="fixed inset-0 z-40 bg-black/30" @click="showCreate = false" />
    </Transition>

    <Transition enter-active-class="transition-transform duration-300" enter-from-class="translate-x-full" leave-active-class="transition-transform duration-300" leave-to-class="translate-x-full">
      <div v-if="showCreate" class="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <div class="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 class="text-lg font-semibold text-slate-900">New Document</h2>
          <button class="rounded-lg p-2 text-slate-400 hover:bg-slate-100" @click="showCreate = false">
            <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"/></svg>
          </button>
        </div>
        <div class="flex-1 overflow-y-auto px-6 py-5">
          <fieldset :disabled="isWriteDisabled" class="grid gap-3">
            <div>
              <label class="text-xs font-semibold text-slate-500">Title <span class="text-red-500">*</span></label>
              <input v-model="createForm.title" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none" placeholder="Document title" />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-xs font-semibold text-slate-500">Document Type</label>
                <select v-model="createForm.documentType" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none">
                  <option>SOP</option><option>Work Instruction</option><option>Policy</option><option>Form</option><option>Protocol</option>
                </select>
              </div>
              <div>
                <label class="text-xs font-semibold text-slate-500">Subtype</label>
                <input v-model="createForm.documentSubtype" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none" placeholder="Optional" />
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-xs font-semibold text-slate-500">Department</label>
                <input v-model="createForm.department" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none" placeholder="Department" />
              </div>
              <div>
                <label class="text-xs font-semibold text-slate-500">Criticality</label>
                <select v-model="createForm.criticality" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none">
                  <option>Low</option><option>Medium</option><option>High</option><option>Critical</option>
                </select>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-xs font-semibold text-slate-500">Review Interval (days)</label>
                <input v-model.number="createForm.reviewIntervalDays" type="number" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none" />
              </div>
              <div>
                <label class="text-xs font-semibold text-slate-500">Site Code</label>
                <input v-model="createForm.siteCode" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none" placeholder="Optional" />
              </div>
            </div>
            <div>
              <label class="text-xs font-semibold text-slate-500">Content Summary</label>
              <textarea v-model="createForm.contentSummary" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none" rows="2" placeholder="Brief summary" />
            </div>
            <div>
              <label class="text-xs font-semibold text-slate-500">Reason for Change</label>
              <input v-model="createForm.reasonForChange" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none" placeholder="Initial creation" />
            </div>
            <div class="flex flex-col gap-2">
              <label class="flex items-center gap-2 text-sm text-slate-600">
                <input v-model="createForm.trainingRequired" type="checkbox" class="h-4 w-4 rounded border-slate-300" />
                Training required
              </label>
              <label class="flex items-center gap-2 text-sm text-slate-600">
                <input v-model="createForm.controlledCopyRequired" type="checkbox" class="h-4 w-4 rounded border-slate-300" />
                Controlled copy required
              </label>
            </div>
          </fieldset>
        </div>
        <div class="border-t border-slate-200 px-6 py-4 flex gap-3">
          <button
            class="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            :disabled="!createForm.title || creating || isWriteDisabled"
            @click="createDocument"
          >
            {{ creating ? 'Creating…' : 'Create Document' }}
          </button>
          <button class="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50" @click="showCreate = false">Cancel</button>
        </div>
      </div>
    </Transition>
  </div>
</template>
