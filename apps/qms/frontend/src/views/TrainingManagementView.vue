<script setup>
import { computed, onMounted, ref } from 'vue';
import { apiRequest } from '../services/api';
import { useModuleAccess } from '../composables/useModuleAccess';

const loading = ref(false);
const error = ref('');
const message = ref('');

const trainingCatalog = ref([]);
const assignments = ref([]);
const documents = ref([]);

const catalogForm = ref({
  trainingCode: '',
  title: '',
  description: '',
  linkedDocumentId: ''
});

const assignmentForm = ref({
  trainingId: '',
  assignedRoleKey: 'author',
  dueDate: ''
});

const filterStatus = ref('All');
const { isWriteDisabled, writeDisabledReason, withWriteAccess } = useModuleAccess('trainingManagement');

const visibleAssignments = computed(() => {
  if (filterStatus.value === 'All') return assignments.value;
  return assignments.value.filter((item) => item.status === filterStatus.value);
});

function setMessage(value) {
  message.value = value;
  error.value = '';
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [catalogData, assignmentData, docData] = await Promise.all([
      apiRequest('/platform/training/catalog'),
      apiRequest('/platform/training/assignments'),
      apiRequest('/document-control/documents').catch(() => ({ documents: [] }))
    ]);
    trainingCatalog.value = catalogData.trainingCatalog || [];
    assignments.value = assignmentData.assignments || [];
    documents.value = docData.documents || [];
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

async function createCatalogItem() {
  if (!withWriteAccess(setMessage)) return;
  try {
    const body = {
      trainingCode: catalogForm.value.trainingCode,
      title: catalogForm.value.title,
      description: catalogForm.value.description || null
    };
    if (catalogForm.value.linkedDocumentId) {
      body.sourceModule = 'documentControl';
      body.sourceTable = 'dc_documents';
      body.sourceId = catalogForm.value.linkedDocumentId;
    }
    await apiRequest('/platform/training/catalog', { method: 'POST', body });
    setMessage('Training catalog item created.');
    catalogForm.value.trainingCode = '';
    catalogForm.value.title = '';
    catalogForm.value.description = '';
    catalogForm.value.linkedDocumentId = '';
    await load();
  } catch (err) {
    error.value = err.message;
  }
}

async function assignTraining() {
  if (!withWriteAccess(setMessage)) return;
  try {
    await apiRequest('/platform/training/assignments', { method: 'POST', body: assignmentForm.value });
    setMessage('Training assigned.');
    assignmentForm.value.trainingId = '';
    assignmentForm.value.dueDate = '';
    await load();
  } catch (err) {
    error.value = err.message;
  }
}

async function completeAssignment(assignmentId) {
  if (!withWriteAccess(setMessage)) return;
  try {
    await apiRequest(`/platform/training/assignments/${assignmentId}/complete`, {
      method: 'POST',
      body: { completionNotes: 'Completed from training workspace' }
    });
    setMessage('Assignment marked complete.');
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
      <h2 class="mt-1 text-2xl font-bold text-slate-900">Training Matrix Workspace</h2>
      <p class="mt-2 text-sm text-slate-600">Maintain role-based training catalog and assignment completion visibility.</p>
      <p v-if="isWriteDisabled" class="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        {{ writeDisabledReason }}
      </p>
    </header>

    <section class="grid gap-4 xl:grid-cols-2">
      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Create Training Catalog Item</h3>
        <div class="mt-3 grid gap-2">
          <input v-model="catalogForm.trainingCode" class="rounded-lg border px-3 py-2 text-sm" placeholder="Training code" />
          <input v-model="catalogForm.title" class="rounded-lg border px-3 py-2 text-sm" placeholder="Title" />
          <textarea v-model="catalogForm.description" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Description"></textarea>
          <div>
            <label class="mb-1 block text-xs font-medium text-slate-500">Link to Controlled Document (optional)</label>
            <select v-model="catalogForm.linkedDocumentId" class="w-full rounded-lg border px-3 py-2 text-sm">
              <option value="">— None —</option>
              <option v-for="doc in documents" :key="doc.id" :value="doc.id">{{ doc.document_code }} — {{ doc.title }}</option>
            </select>
          </div>
        </div>
        <button class="mt-3 rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white" :disabled="isWriteDisabled" @click="createCatalogItem">Create Item</button>
      </article>

      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Assign Training</h3>
        <div class="mt-3 grid gap-2">
          <select v-model="assignmentForm.trainingId" class="rounded-lg border px-3 py-2 text-sm">
            <option value="">Select training</option>
            <option v-for="item in trainingCatalog" :key="item.id" :value="item.id">{{ item.training_code }} - {{ item.title }}</option>
          </select>
          <select v-model="assignmentForm.assignedRoleKey" class="rounded-lg border px-3 py-2 text-sm">
            <option>admin</option><option>author</option><option>qa_reviewer</option><option>approver</option><option>viewer</option>
          </select>
          <input v-model="assignmentForm.dueDate" class="rounded-lg border px-3 py-2 text-sm" type="date" />
        </div>
        <button class="mt-3 rounded-lg border border-cyan-400 px-4 py-2 text-sm font-semibold text-cyan-700" :disabled="isWriteDisabled" @click="assignTraining">Assign</button>
      </article>
    </section>

    <section class="rounded-2xl border border-slate-200 bg-white p-4">
      <div class="flex items-center justify-between gap-3">
        <h3 class="text-lg font-semibold text-slate-900">Assignment Tracker</h3>
        <div class="flex items-center gap-2 text-sm">
          <span>Status:</span>
          <select v-model="filterStatus" class="rounded border px-2 py-1">
            <option>All</option><option>Assigned</option><option>InProgress</option><option>Completed</option><option>Overdue</option>
          </select>
        </div>
      </div>
      <p v-if="loading" class="mt-3 text-sm text-slate-600">Loading assignments...</p>
      <ul v-else class="mt-3 space-y-2 text-sm">
        <li v-for="item in visibleAssignments" :key="item.id" class="rounded border border-slate-200 px-3 py-2">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="font-semibold">{{ item.training_code }} - {{ item.training_title }}</p>
            <span class="rounded bg-slate-100 px-2 py-0.5 text-xs">{{ item.status }}</span>
          </div>
          <p class="text-xs text-slate-600">Due: {{ item.due_date || 'n/a' }} • Role: {{ item.assigned_role_key || 'n/a' }}</p>
          <button
            v-if="item.status !== 'Completed'"
            class="mt-2 rounded border border-cyan-300 px-2 py-1 text-xs font-semibold text-cyan-700"
            :disabled="isWriteDisabled"
            @click="completeAssignment(item.id)"
          >
            Mark Completed
          </button>
        </li>
      </ul>
    </section>

    <p v-if="message" class="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ message }}</p>
    <p v-if="error" class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
  </section>
</template>
