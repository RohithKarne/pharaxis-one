<script setup>
import { computed, onMounted, ref } from 'vue';
import { apiRequest } from '../services/api';
import { useModuleAccess } from '../composables/useModuleAccess';

const loading = ref(false);
const error = ref('');
const message = ref('');
const reviews = ref([]);
const actions = ref([]);
const selectedReviewId = ref('');
const selectedReview = computed(() => reviews.value.find((item) => item.id === selectedReviewId.value) || null);
const reviewActions = computed(() => actions.value.filter((item) => item.review_id === selectedReviewId.value));
const { isWriteDisabled, writeDisabledReason, withRoles } = useModuleAccess('managementReview');

const createForm = ref({
  reviewPeriodStart: '',
  reviewPeriodEnd: '',
  chairperson: '',
  summary: '',
  decisions: ''
});

const updateForm = ref({
  status: 'InReview',
  chairperson: '',
  summary: '',
  decisions: ''
});

const actionForm = ref({
  actionTitle: '',
  dueDate: ''
});

function setMessage(value) {
  message.value = value;
  error.value = '';
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const payload = await apiRequest('/management-review');
    reviews.value = payload.reviews || [];
    actions.value = payload.actions || [];
    if (!selectedReviewId.value && reviews.value[0]) {
      selectedReviewId.value = reviews.value[0].id;
    }
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

async function createReview() {
  if (!withRoles(['qa_reviewer', 'admin', 'superadmin'], setMessage)) return;
  try {
    await apiRequest('/management-review', { method: 'POST', body: createForm.value });
    setMessage('Management review created.');
    createForm.value.reviewPeriodStart = '';
    createForm.value.reviewPeriodEnd = '';
    createForm.value.chairperson = '';
    createForm.value.summary = '';
    createForm.value.decisions = '';
    await load();
  } catch (err) {
    error.value = err.message;
  }
}

async function updateReview() {
  if (!selectedReviewId.value) return;
  if (!withRoles(['qa_reviewer', 'admin', 'superadmin'], setMessage)) return;
  try {
    await apiRequest(`/management-review/${selectedReviewId.value}`, { method: 'PATCH', body: updateForm.value });
    setMessage('Management review updated.');
    await load();
  } catch (err) {
    error.value = err.message;
  }
}

async function createAction() {
  if (!selectedReviewId.value) return;
  if (!withRoles(['qa_reviewer', 'admin', 'superadmin'], setMessage)) return;
  try {
    await apiRequest(`/management-review/${selectedReviewId.value}/actions`, { method: 'POST', body: actionForm.value });
    setMessage('Action item created.');
    actionForm.value.actionTitle = '';
    actionForm.value.dueDate = '';
    await load();
  } catch (err) {
    error.value = err.message;
  }
}

async function closeAction(actionId) {
  if (!withRoles(['qa_reviewer', 'admin', 'superadmin'], setMessage)) return;
  try {
    await apiRequest(`/management-review/actions/${actionId}`, {
      method: 'PATCH',
      body: { status: 'Closed', closureNotes: 'Closed from management review workspace' }
    });
    setMessage('Action item closed.');
    await load();
  } catch (err) {
    error.value = err.message;
  }
}

onMounted(load);
</script>

<template>
  <section class="space-y-4">
    <header class="rounded-2xl border border-slate-200 bg-white p-5">
      <p class="text-xs uppercase tracking-[0.14em] text-slate-500">Phase 3</p>
      <h2 class="mt-1 text-2xl font-bold text-slate-900">Management Review Cockpit</h2>
      <p class="mt-2 text-sm text-slate-600">Run periodic quality governance reviews and track follow-up actions to closure.</p>
      <p v-if="isWriteDisabled" class="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        {{ writeDisabledReason }}
      </p>
    </header>

    <section class="grid gap-4 xl:grid-cols-3">
      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Create Review</h3>
        <fieldset :disabled="isWriteDisabled" class="mt-3 grid gap-2">
          <input v-model="createForm.reviewPeriodStart" class="rounded-lg border px-3 py-2 text-sm" type="date" />
          <input v-model="createForm.reviewPeriodEnd" class="rounded-lg border px-3 py-2 text-sm" type="date" />
          <input v-model="createForm.chairperson" class="rounded-lg border px-3 py-2 text-sm" placeholder="Chairperson" />
          <textarea v-model="createForm.summary" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Summary"></textarea>
          <textarea v-model="createForm.decisions" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Decisions"></textarea>
        </fieldset>
        <button class="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white" :disabled="isWriteDisabled" @click="createReview">Create Review</button>
      </article>

      <article class="rounded-2xl border border-slate-200 bg-white p-4 xl:col-span-2">
        <h3 class="text-lg font-semibold text-slate-900">Review Timeline</h3>
        <p v-if="loading" class="mt-3 text-sm text-slate-600">Loading review records...</p>
        <ul v-else class="mt-3 space-y-2 text-sm">
          <li
            v-for="item in reviews"
            :key="item.id"
            class="cursor-pointer rounded border px-3 py-2"
            :class="selectedReviewId === item.id ? 'border-slate-600 bg-slate-50' : 'border-slate-200 bg-white'"
            @click="selectedReviewId = item.id"
          >
            <p class="font-semibold">{{ item.review_code }} • {{ item.status }}</p>
            <p class="text-xs text-slate-600">{{ item.review_period_start }} to {{ item.review_period_end }} • {{ item.chairperson || 'chair TBD' }}</p>
          </li>
        </ul>
      </article>
    </section>

    <section v-if="selectedReview" class="grid gap-4 xl:grid-cols-2">
      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Update Review</h3>
        <fieldset :disabled="isWriteDisabled" class="mt-3 grid gap-2">
          <select v-model="updateForm.status" class="rounded-lg border px-3 py-2 text-sm"><option>Draft</option><option>InReview</option><option>Approved</option><option>Closed</option></select>
          <input v-model="updateForm.chairperson" class="rounded-lg border px-3 py-2 text-sm" placeholder="Chairperson" />
          <textarea v-model="updateForm.summary" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Summary"></textarea>
          <textarea v-model="updateForm.decisions" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Decisions"></textarea>
        </fieldset>
        <button class="mt-3 rounded-lg border border-slate-400 px-4 py-2 text-sm font-semibold text-slate-700" :disabled="isWriteDisabled" @click="updateReview">Save Review</button>
      </article>

      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Action Register</h3>
        <fieldset :disabled="isWriteDisabled" class="mt-3 grid gap-2">
          <input v-model="actionForm.actionTitle" class="rounded-lg border px-3 py-2 text-sm" placeholder="Action title" />
          <input v-model="actionForm.dueDate" class="rounded-lg border px-3 py-2 text-sm" type="date" />
        </fieldset>
        <button class="mt-3 rounded-lg border border-slate-400 px-4 py-2 text-sm font-semibold text-slate-700" :disabled="isWriteDisabled" @click="createAction">Create Action</button>

        <ul class="mt-4 space-y-2 text-sm">
          <li v-for="item in reviewActions" :key="item.id" class="rounded border border-slate-200 px-3 py-2">
            <div class="flex items-center justify-between gap-2">
              <p class="font-semibold">{{ item.action_title }}</p>
              <span class="rounded bg-slate-100 px-2 py-0.5 text-xs">{{ item.status }}</span>
            </div>
            <p class="text-xs text-slate-600">Due: {{ item.due_date || 'n/a' }}</p>
            <button
              v-if="item.status !== 'Closed'"
              class="mt-2 rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700"
              :disabled="isWriteDisabled"
              @click="closeAction(item.id)"
            >
              Mark Closed
            </button>
          </li>
        </ul>
      </article>
    </section>

    <p v-if="message" class="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ message }}</p>
    <p v-if="error" class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
  </section>
</template>
