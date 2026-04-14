<script setup>
import { computed, onMounted, ref } from 'vue';
import { apiRequest } from '../services/api';

const loading = ref(false);
const message = ref('');
const list = ref([]);
const selectedChangeId = ref('');
const detail = ref(null);

const createForm = ref({
  title: '',
  changeType: 'Standard',
  reason: '',
  plannedStartDate: '',
  plannedEndDate: '',
  riskLevel: 'Medium',
  cabRequired: true
});

const impactForm = ref({
  assessmentSummary: '',
  impactedModulesCsv: 'DocumentControl,CAPA',
  riskLevel: 'Medium'
});

const cabForm = ref({ decision: 'Approve', comments: '' });
const approvalForm = ref({ decision: 'Approve', comments: '' });
const implementationForm = ref({ stepTitle: '', stepStatus: 'InProgress', dueDate: '', evidenceRef: '' });
const closeForm = ref({ closureSummary: '', effectivenessResult: 'Effective' });
const reopenForm = ref({ reason: '' });

const change = computed(() => detail.value?.change || null);
const approvals = computed(() => detail.value?.approvals || []);
const implementationSteps = computed(() => detail.value?.implementationSteps || []);
const timeline = computed(() => detail.value?.timeline || []);

const changeTypes = ['Standard', 'Major', 'Emergency'];
const riskLevels = ['High', 'Medium', 'Low'];
const decisions = ['Approve', 'Reject'];
const cabDecisions = ['Approve', 'ConditionalApprove', 'Reject'];
const stepStatuses = ['Planned', 'InProgress', 'Completed', 'Blocked'];
const effectivenessResults = ['Effective', 'PartiallyEffective', 'NotEffective'];

function setMessage(text) {
  message.value = text;
}

async function refreshList() {
  loading.value = true;
  try {
    const data = await apiRequest('/change-control');
    list.value = data.changes || [];

    if (!selectedChangeId.value && list.value.length > 0) {
      selectedChangeId.value = list.value[0].id;
      await loadDetail();
    }
  } catch (error) {
    setMessage(error.message);
  } finally {
    loading.value = false;
  }
}

async function loadDetail() {
  if (!selectedChangeId.value) {
    detail.value = null;
    return;
  }
  try {
    const data = await apiRequest(`/change-control/${selectedChangeId.value}`);
    detail.value = data;
  } catch (error) {
    setMessage(error.message);
  }
}

async function createChangeRequest() {
  try {
    const me = await apiRequest('/protected/me');
    await apiRequest('/change-control', {
      method: 'POST',
      body: {
        title: createForm.value.title,
        changeType: createForm.value.changeType,
        reason: createForm.value.reason,
        ownerUserId: me.auth.userId,
        plannedStartDate: createForm.value.plannedStartDate || null,
        plannedEndDate: createForm.value.plannedEndDate || null,
        riskLevel: createForm.value.riskLevel,
        cabRequired: Boolean(createForm.value.cabRequired)
      }
    });
    setMessage('Change request created.');
    createForm.value.title = '';
    createForm.value.reason = '';
    createForm.value.plannedStartDate = '';
    createForm.value.plannedEndDate = '';
    await refreshList();
  } catch (error) {
    setMessage(error.message);
  }
}

async function submitImpact() {
  if (!selectedChangeId.value) return;
  try {
    const impactedModules = impactForm.value.impactedModulesCsv
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    await apiRequest(`/change-control/${selectedChangeId.value}/impact-assessment`, {
      method: 'POST',
      body: {
        assessmentSummary: impactForm.value.assessmentSummary,
        impactedModules,
        riskLevel: impactForm.value.riskLevel
      }
    });

    setMessage('Impact assessment submitted.');
    impactForm.value.assessmentSummary = '';
    await loadDetail();
    await refreshList();
  } catch (error) {
    setMessage(error.message);
  }
}

async function submitCabReview() {
  if (!selectedChangeId.value) return;
  try {
    await apiRequest(`/change-control/${selectedChangeId.value}/cab-review`, {
      method: 'POST',
      body: cabForm.value
    });
    setMessage('CAB review decision saved.');
    cabForm.value.comments = '';
    await loadDetail();
    await refreshList();
  } catch (error) {
    setMessage(error.message);
  }
}

async function submitApproval() {
  if (!selectedChangeId.value) return;
  try {
    await apiRequest(`/change-control/${selectedChangeId.value}/approvals`, {
      method: 'POST',
      body: approvalForm.value
    });
    setMessage('Approval decision recorded.');
    approvalForm.value.comments = '';
    await loadDetail();
    await refreshList();
  } catch (error) {
    setMessage(error.message);
  }
}

async function addImplementationStep() {
  if (!selectedChangeId.value) return;
  try {
    await apiRequest(`/change-control/${selectedChangeId.value}/implementation`, {
      method: 'POST',
      body: {
        stepTitle: implementationForm.value.stepTitle,
        stepStatus: implementationForm.value.stepStatus,
        dueDate: implementationForm.value.dueDate || null,
        evidenceRef: implementationForm.value.evidenceRef || null
      }
    });
    setMessage('Implementation step added.');
    implementationForm.value.stepTitle = '';
    implementationForm.value.dueDate = '';
    implementationForm.value.evidenceRef = '';
    await loadDetail();
    await refreshList();
  } catch (error) {
    setMessage(error.message);
  }
}

async function closeChange() {
  if (!selectedChangeId.value) return;
  try {
    await apiRequest(`/change-control/${selectedChangeId.value}/close`, {
      method: 'POST',
      body: closeForm.value
    });
    setMessage('Change request closed.');
    closeForm.value.closureSummary = '';
    await loadDetail();
    await refreshList();
  } catch (error) {
    setMessage(error.message);
  }
}

async function reopenChange() {
  if (!selectedChangeId.value || !reopenForm.value.reason) return;
  try {
    await apiRequest(`/change-control/${selectedChangeId.value}/reopen`, {
      method: 'POST',
      body: reopenForm.value
    });
    setMessage('Change request reopened.');
    reopenForm.value.reason = '';
    await loadDetail();
    await refreshList();
  } catch (error) {
    setMessage(error.message);
  }
}

onMounted(refreshList);
</script>

<template>
  <section class="space-y-4">
    <header class="rounded-2xl border border-indigo-100 bg-white p-4">
      <h2 class="text-xl font-bold text-indigo-900">Change Control Workspace</h2>
      <p class="mt-1 text-sm text-slate-600">Run impact, CAB, approval, implementation, effectiveness closure, and controlled reopen for enterprise changes.</p>
      <p v-if="message" class="mt-2 text-sm text-indigo-700">{{ message }}</p>
    </header>

    <section class="grid gap-4 xl:grid-cols-3">
      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Create Change</h3>
        <div class="mt-3 grid gap-2">
          <input v-model="createForm.title" class="rounded-lg border px-3 py-2 text-sm" placeholder="Change title" />
          <select v-model="createForm.changeType" class="rounded-lg border px-3 py-2 text-sm">
            <option v-for="item in changeTypes" :key="item" :value="item">{{ item }}</option>
          </select>
          <textarea v-model="createForm.reason" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Reason"></textarea>
          <select v-model="createForm.riskLevel" class="rounded-lg border px-3 py-2 text-sm">
            <option v-for="item in riskLevels" :key="item" :value="item">{{ item }}</option>
          </select>
          <label class="text-xs text-slate-600">Planned Start</label>
          <input v-model="createForm.plannedStartDate" class="rounded-lg border px-3 py-2 text-sm" type="date" />
          <label class="text-xs text-slate-600">Planned End</label>
          <input v-model="createForm.plannedEndDate" class="rounded-lg border px-3 py-2 text-sm" type="date" />
          <label class="text-xs text-slate-600"><input v-model="createForm.cabRequired" class="mr-1" type="checkbox" />CAB required</label>
        </div>
        <button class="mt-3 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white" @click="createChangeRequest">Create Request</button>
      </article>

      <article class="rounded-2xl border border-slate-200 bg-white p-4 xl:col-span-2">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold text-slate-900">Change Requests</h3>
          <button class="rounded-lg border border-indigo-700 px-4 py-2 text-sm font-semibold text-indigo-700" @click="refreshList">Refresh</button>
        </div>
        <p v-if="loading" class="mt-2 text-sm text-slate-600">Loading changes...</p>
        <ul class="mt-3 max-h-64 space-y-2 overflow-auto text-sm">
          <li
            v-for="item in list"
            :key="item.id"
            class="cursor-pointer rounded-lg border px-3 py-2"
            :class="selectedChangeId === item.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200'"
            @click="selectedChangeId = item.id; loadDetail()"
          >
            <p class="font-semibold">{{ item.change_code }} - {{ item.title }}</p>
            <p class="text-xs text-slate-600">{{ item.status }} • Risk: {{ item.risk_level }} • Steps: {{ item.completed_steps }}/{{ item.total_steps }}</p>
          </li>
        </ul>
      </article>
    </section>

    <section v-if="change" class="grid gap-4 xl:grid-cols-3">
      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Assessment & CAB</h3>
        <p class="mt-1 text-xs text-slate-600">Current Status: {{ change.status }}</p>
        <div class="mt-3 grid gap-2">
          <textarea v-model="impactForm.assessmentSummary" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Impact summary"></textarea>
          <input v-model="impactForm.impactedModulesCsv" class="rounded-lg border px-3 py-2 text-sm" placeholder="Impacted modules (csv)" />
          <select v-model="impactForm.riskLevel" class="rounded-lg border px-3 py-2 text-sm">
            <option v-for="item in riskLevels" :key="`impact-${item}`" :value="item">{{ item }}</option>
          </select>
          <button class="rounded border border-indigo-500 px-3 py-1 text-xs font-semibold text-indigo-700" @click="submitImpact">Submit Impact</button>

          <select v-model="cabForm.decision" class="rounded-lg border px-3 py-2 text-sm">
            <option v-for="item in cabDecisions" :key="item" :value="item">{{ item }}</option>
          </select>
          <textarea v-model="cabForm.comments" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="CAB comments"></textarea>
          <button class="rounded border border-indigo-500 px-3 py-1 text-xs font-semibold text-indigo-700" @click="submitCabReview">Submit CAB Review</button>
        </div>
      </article>

      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Approval & Implementation</h3>
        <div class="mt-3 grid gap-2">
          <select v-model="approvalForm.decision" class="rounded-lg border px-3 py-2 text-sm">
            <option v-for="item in decisions" :key="item" :value="item">{{ item }}</option>
          </select>
          <textarea v-model="approvalForm.comments" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Approval comments"></textarea>
          <button class="rounded border border-indigo-500 px-3 py-1 text-xs font-semibold text-indigo-700" @click="submitApproval">Submit Approval</button>

          <input v-model="implementationForm.stepTitle" class="rounded-lg border px-3 py-2 text-sm" placeholder="Step title" />
          <select v-model="implementationForm.stepStatus" class="rounded-lg border px-3 py-2 text-sm">
            <option v-for="item in stepStatuses" :key="item" :value="item">{{ item }}</option>
          </select>
          <input v-model="implementationForm.dueDate" class="rounded-lg border px-3 py-2 text-sm" type="date" />
          <input v-model="implementationForm.evidenceRef" class="rounded-lg border px-3 py-2 text-sm" placeholder="Evidence reference" />
          <button class="rounded border border-indigo-500 px-3 py-1 text-xs font-semibold text-indigo-700" @click="addImplementationStep">Add Step</button>
        </div>
      </article>

      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Closure & Reopen</h3>
        <div class="mt-3 grid gap-2">
          <textarea v-model="closeForm.closureSummary" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Closure summary"></textarea>
          <select v-model="closeForm.effectivenessResult" class="rounded-lg border px-3 py-2 text-sm">
            <option v-for="item in effectivenessResults" :key="item" :value="item">{{ item }}</option>
          </select>
          <button class="rounded border border-indigo-500 px-3 py-1 text-xs font-semibold text-indigo-700" @click="closeChange">Close Change</button>

          <textarea v-model="reopenForm.reason" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Reopen reason"></textarea>
          <button class="rounded border border-indigo-500 px-3 py-1 text-xs font-semibold text-indigo-700" @click="reopenChange">Reopen Change</button>
        </div>
      </article>
    </section>

    <section v-if="change" class="grid gap-4 xl:grid-cols-3">
      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Approvals</h3>
        <ul class="mt-3 max-h-48 space-y-2 overflow-auto text-xs">
          <li v-for="item in approvals" :key="item.id" class="rounded border border-slate-200 px-2 py-1">
            {{ item.decision }} • {{ item.decided_at }}
          </li>
        </ul>
      </article>

      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Implementation Steps</h3>
        <ul class="mt-3 max-h-48 space-y-2 overflow-auto text-xs">
          <li v-for="item in implementationSteps" :key="item.id" class="rounded border border-slate-200 px-2 py-1">
            #{{ item.step_no }} {{ item.step_title }} • {{ item.step_status }}
          </li>
        </ul>
      </article>

      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Timeline</h3>
        <ul class="mt-3 max-h-48 space-y-2 overflow-auto text-xs">
          <li v-for="item in timeline" :key="item.id" class="rounded border border-slate-200 px-2 py-1">
            {{ item.action_key }} • {{ item.occurred_at }}
          </li>
        </ul>
      </article>
    </section>
  </section>
</template>
