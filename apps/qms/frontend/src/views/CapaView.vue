<script setup>
import { computed, onMounted, ref } from 'vue';
import { apiRequest } from '../services/api';

const loading = ref(false);
const message = ref('');
const list = ref([]);
const selectedCapaId = ref('');
const detail = ref(null);

const createForm = ref({
  title: '',
  sourceType: 'Manual',
  classification: 'Corrective',
  dueDate: '',
  department: '',
  productName: '',
  batchLotNo: '',
  severity: 3,
  occurrence: 3,
  detectability: 3
});

const fiveWhyForm = ref({ whyLevel: 1, answer: '' });
const fishboneForm = ref({ category: 'Method', cause: '' });
const actionForm = ref({ description: '', actionType: 'Corrective', dueDate: '' });
const effectivenessForm = ref({ criteria: '', result: 'Pass', evidenceRef: '' });
const triageForm = ref({ triageSummary: '' });
const reopenForm = ref({ reason: '' });

const selectedCapa = computed(() => detail.value?.capa || null);
const sourceTypes = ['Manual', 'Deviation', 'AuditFinding', 'Complaint', 'ChangeControl', 'DocumentControl', 'Validation'];
const classifications = ['Corrective', 'Preventive', 'Both'];

async function refreshList() {
  loading.value = true;
  try {
    const data = await apiRequest('/capa');
    list.value = data.capas || [];
    if (!selectedCapaId.value && list.value.length > 0) {
      selectedCapaId.value = list.value[0].id;
      await loadDetail();
    }
  } catch (error) {
    message.value = error.message;
  } finally {
    loading.value = false;
  }
}

async function loadDetail() {
  if (!selectedCapaId.value) {
    detail.value = null;
    return;
  }
  try {
    const data = await apiRequest(`/capa/${selectedCapaId.value}`);
    detail.value = data;
  } catch (error) {
    message.value = error.message;
  }
}

async function createCapa() {
  try {
    await apiRequest('/capa', {
      method: 'POST',
      body: {
        ...createForm.value,
        dueDate: createForm.value.dueDate || null,
        department: createForm.value.department || null,
        productName: createForm.value.productName || null,
        batchLotNo: createForm.value.batchLotNo || null
      }
    });
    message.value = 'CAPA created successfully.';
    createForm.value.title = '';
    createForm.value.department = '';
    createForm.value.productName = '';
    createForm.value.batchLotNo = '';
    createForm.value.dueDate = '';
    await refreshList();
  } catch (error) {
    message.value = error.message;
  }
}

async function submitCapa() {
  if (!selectedCapaId.value) return;
  try {
    await apiRequest(`/capa/${selectedCapaId.value}/submit`, { method: 'POST' });
    message.value = 'CAPA submitted.';
    await loadDetail();
    await refreshList();
  } catch (error) {
    message.value = error.message;
  }
}

async function triageCapa() {
  if (!selectedCapaId.value) return;
  try {
    await apiRequest(`/capa/${selectedCapaId.value}/triage`, {
      method: 'POST',
      body: triageForm.value
    });
    message.value = 'CAPA triaged and moved to Investigation.';
    triageForm.value.triageSummary = '';
    await loadDetail();
    await refreshList();
  } catch (error) {
    message.value = error.message;
  }
}

async function addFiveWhy() {
  if (!selectedCapaId.value) return;
  try {
    await apiRequest(`/capa/${selectedCapaId.value}/rca/5why`, {
      method: 'POST',
      body: fiveWhyForm.value
    });
    message.value = '5-Why entry saved.';
    fiveWhyForm.value.answer = '';
    await loadDetail();
  } catch (error) {
    message.value = error.message;
  }
}

async function addFishbone() {
  if (!selectedCapaId.value) return;
  try {
    await apiRequest(`/capa/${selectedCapaId.value}/rca/fishbone`, {
      method: 'POST',
      body: fishboneForm.value
    });
    message.value = 'Fishbone cause saved.';
    fishboneForm.value.cause = '';
    await loadDetail();
  } catch (error) {
    message.value = error.message;
  }
}

async function addAction() {
  if (!selectedCapaId.value) return;
  try {
    await apiRequest(`/capa/${selectedCapaId.value}/actions`, {
      method: 'POST',
      body: actionForm.value
    });
    message.value = 'Action item created.';
    actionForm.value.description = '';
    actionForm.value.dueDate = '';
    await loadDetail();
    await refreshList();
  } catch (error) {
    message.value = error.message;
  }
}

async function markActionComplete(actionId) {
  if (!selectedCapaId.value) return;
  try {
    await apiRequest(`/capa/${selectedCapaId.value}/actions/${actionId}`, {
      method: 'PATCH',
      body: { status: 'Complete' }
    });
    message.value = 'Action marked complete.';
    await loadDetail();
  } catch (error) {
    message.value = error.message;
  }
}

async function approveActionPlan() {
  if (!selectedCapaId.value) return;
  try {
    await apiRequest(`/capa/${selectedCapaId.value}/approve`, {
      method: 'POST',
      body: {
        stage: 'ActionPlan',
        decision: 'Approve',
        comments: 'Action plan approved from CAPA workspace'
      }
    });
    message.value = 'Action plan approved.';
    await loadDetail();
    await refreshList();
  } catch (error) {
    message.value = error.message;
  }
}

async function recordEffectiveness() {
  if (!selectedCapaId.value) return;
  try {
    await apiRequest(`/capa/${selectedCapaId.value}/effectiveness`, {
      method: 'POST',
      body: effectivenessForm.value
    });
    message.value = 'Effectiveness recorded.';
    await loadDetail();
    await refreshList();
  } catch (error) {
    message.value = error.message;
  }
}

async function approveClosure() {
  if (!selectedCapaId.value) return;
  try {
    await apiRequest(`/capa/${selectedCapaId.value}/approve`, {
      method: 'POST',
      body: {
        stage: 'Closure',
        decision: 'Approve',
        comments: 'Closure approved from CAPA workspace'
      }
    });
    message.value = 'CAPA closure approved.';
    await loadDetail();
    await refreshList();
  } catch (error) {
    message.value = error.message;
  }
}

async function reopenCapa() {
  if (!selectedCapaId.value) return;
  if (!reopenForm.value.reason) {
    message.value = 'Reopen reason is required.';
    return;
  }
  try {
    await apiRequest(`/capa/${selectedCapaId.value}/reopen`, {
      method: 'POST',
      body: reopenForm.value
    });
    message.value = 'CAPA reopened successfully.';
    reopenForm.value.reason = '';
    await loadDetail();
    await refreshList();
  } catch (error) {
    message.value = error.message;
  }
}

onMounted(refreshList);
</script>

<template>
  <section class="space-y-4">
    <header class="rounded-2xl border border-cyan-100 bg-white p-4">
      <h2 class="text-xl font-bold text-cyan-900">CAPA Management Workspace</h2>
      <p class="mt-1 text-sm text-slate-600">Create, triage, investigate, approve, verify effectiveness, and close CAPA records.</p>
      <p v-if="message" class="mt-2 text-sm text-indigo-700">{{ message }}</p>
    </header>

    <section class="grid gap-4 xl:grid-cols-3">
      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Create CAPA</h3>
        <div class="mt-3 grid gap-2">
          <input v-model="createForm.title" class="rounded-lg border px-3 py-2 text-sm" placeholder="CAPA title" />
          <select v-model="createForm.sourceType" class="rounded-lg border px-3 py-2 text-sm">
            <option v-for="type in sourceTypes" :key="type" :value="type">{{ type }}</option>
          </select>
          <select v-model="createForm.classification" class="rounded-lg border px-3 py-2 text-sm">
            <option v-for="classification in classifications" :key="classification" :value="classification">{{ classification }}</option>
          </select>
          <input v-model="createForm.department" class="rounded-lg border px-3 py-2 text-sm" placeholder="Department" />
          <input v-model="createForm.productName" class="rounded-lg border px-3 py-2 text-sm" placeholder="Product" />
          <input v-model="createForm.batchLotNo" class="rounded-lg border px-3 py-2 text-sm" placeholder="Batch/Lot" />
          <label class="text-xs font-semibold text-slate-500">Due Date</label>
          <input v-model="createForm.dueDate" class="rounded-lg border px-3 py-2 text-sm" type="date" />
        </div>
        <div class="mt-3 grid grid-cols-3 gap-2 text-xs">
          <label class="font-semibold text-slate-600">Severity
            <input v-model.number="createForm.severity" class="mt-1 w-full rounded border px-2 py-1 text-sm" type="number" min="1" max="5" />
          </label>
          <label class="font-semibold text-slate-600">Occurrence
            <input v-model.number="createForm.occurrence" class="mt-1 w-full rounded border px-2 py-1 text-sm" type="number" min="1" max="5" />
          </label>
          <label class="font-semibold text-slate-600">Detectability
            <input v-model.number="createForm.detectability" class="mt-1 w-full rounded border px-2 py-1 text-sm" type="number" min="1" max="5" />
          </label>
        </div>
        <button class="mt-3 rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white" @click="createCapa">Create CAPA</button>
      </article>

      <article class="rounded-2xl border border-slate-200 bg-white p-4 xl:col-span-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-lg font-semibold text-slate-900">CAPA Records</h3>
          <button class="rounded-lg border border-cyan-700 px-4 py-2 text-sm font-semibold text-cyan-700" @click="refreshList">Refresh</button>
        </div>
        <p v-if="loading" class="mt-2 text-sm text-slate-600">Loading CAPA records...</p>
        <ul class="mt-3 max-h-72 space-y-2 overflow-auto text-sm">
          <li
            v-for="capa in list"
            :key="capa.id"
            class="cursor-pointer rounded-lg border px-3 py-2"
            :class="selectedCapaId === capa.id ? 'border-cyan-500 bg-cyan-50' : 'border-slate-200'"
            @click="selectedCapaId = capa.id; loadDetail()"
          >
            <p class="font-semibold text-slate-900">{{ capa.capa_code }} - {{ capa.title }}</p>
            <p class="text-xs text-slate-600">Status: {{ capa.status }} • Risk: {{ capa.risk_band || 'N/A' }} • Due: {{ capa.due_date || 'N/A' }}</p>
          </li>
        </ul>
      </article>
    </section>

    <section v-if="selectedCapa" class="grid gap-4 xl:grid-cols-3">
      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Lifecycle Controls</h3>
        <p class="mt-1 text-xs text-slate-500">Current status: {{ selectedCapa.status }}</p>
        <div class="mt-3 flex flex-wrap gap-2">
          <button class="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700" @click="submitCapa">Submit</button>
          <button class="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700" @click="triageCapa">Triage</button>
          <button class="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700" @click="approveActionPlan">Approve Action Plan</button>
          <button class="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700" @click="approveClosure">Approve Closure</button>
        </div>
        <input v-model="triageForm.triageSummary" class="mt-3 w-full rounded-lg border px-3 py-2 text-sm" placeholder="Triage summary" />
        <input v-model="reopenForm.reason" class="mt-2 w-full rounded-lg border px-3 py-2 text-sm" placeholder="Reopen reason" />
        <button class="mt-2 rounded border border-amber-400 px-3 py-1 text-xs font-semibold text-amber-700" @click="reopenCapa">Reopen CAPA</button>
      </article>

      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">RCA (5-Why + Fishbone)</h3>
        <div class="mt-3 grid gap-2">
          <label class="text-xs font-semibold text-slate-500">5-Why</label>
          <input v-model.number="fiveWhyForm.whyLevel" class="rounded-lg border px-3 py-2 text-sm" type="number" min="1" max="5" placeholder="Why level" />
          <textarea v-model="fiveWhyForm.answer" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Why answer"></textarea>
          <button class="rounded border border-cyan-400 px-3 py-1 text-xs font-semibold text-cyan-700" @click="addFiveWhy">Save 5-Why</button>

          <label class="mt-2 text-xs font-semibold text-slate-500">Fishbone</label>
          <input v-model="fishboneForm.category" class="rounded-lg border px-3 py-2 text-sm" placeholder="Category" />
          <textarea v-model="fishboneForm.cause" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Cause"></textarea>
          <button class="rounded border border-cyan-400 px-3 py-1 text-xs font-semibold text-cyan-700" @click="addFishbone">Save Fishbone</button>
        </div>
      </article>

      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Actions + Effectiveness</h3>
        <div class="mt-3 grid gap-2">
          <input v-model="actionForm.description" class="rounded-lg border px-3 py-2 text-sm" placeholder="Action description" />
          <select v-model="actionForm.actionType" class="rounded-lg border px-3 py-2 text-sm">
            <option>Corrective</option>
            <option>Preventive</option>
          </select>
          <input v-model="actionForm.dueDate" class="rounded-lg border px-3 py-2 text-sm" type="date" />
          <button class="rounded border border-cyan-400 px-3 py-1 text-xs font-semibold text-cyan-700" @click="addAction">Add Action</button>

          <textarea v-model="effectivenessForm.criteria" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Effectiveness criteria"></textarea>
          <select v-model="effectivenessForm.result" class="rounded-lg border px-3 py-2 text-sm">
            <option>Pass</option>
            <option>Fail</option>
          </select>
          <input v-model="effectivenessForm.evidenceRef" class="rounded-lg border px-3 py-2 text-sm" placeholder="Evidence ref" />
          <button class="rounded border border-cyan-400 px-3 py-1 text-xs font-semibold text-cyan-700" @click="recordEffectiveness">Record Effectiveness</button>
        </div>
      </article>
    </section>

    <section v-if="detail" class="grid gap-4 xl:grid-cols-2">
      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Action Items</h3>
        <ul class="mt-3 space-y-2 text-sm">
          <li v-for="action in detail.actionItems || []" :key="action.id" class="rounded-lg border border-slate-200 px-3 py-2">
            <div class="flex items-center justify-between gap-2">
              <p class="font-semibold text-slate-900">{{ action.action_type }} - {{ action.description }}</p>
              <button
                v-if="action.status !== 'Complete'"
                class="rounded border border-emerald-400 px-2 py-1 text-xs font-semibold text-emerald-700"
                @click="markActionComplete(action.id)"
              >
                Mark Complete
              </button>
            </div>
            <p class="text-xs text-slate-500">{{ action.status }} • Due: {{ action.due_date }}</p>
          </li>
        </ul>
      </article>

      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Timeline</h3>
        <ul class="mt-3 max-h-64 space-y-2 overflow-auto text-sm">
          <li v-for="item in detail.timeline || []" :key="item.id" class="rounded-lg border border-slate-200 px-3 py-2">
            <p class="font-semibold text-slate-900">{{ item.action_key }}</p>
            <p class="text-xs text-slate-500">{{ item.actor_name || item.actor_email || 'system' }} • {{ new Date(item.occurred_at).toLocaleString() }}</p>
          </li>
        </ul>
      </article>
    </section>
  </section>
</template>
