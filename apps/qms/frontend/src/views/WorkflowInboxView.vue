<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import QualityDataGrid from '../components/QualityDataGrid.vue';
import RecordCollaborationPanel from '../components/RecordCollaborationPanel.vue';
import { apiRequest, getStoredAuth } from '../services/api';
import { resolveWorkflowActions } from '../config/workflowActionMatrix';
import { normalizeTimelineRows } from '../utils/timeline';
import { FEATURE_FLAGS } from '../config/featureFlags';

const loading = ref(false);
const detailLoading = ref(false);
const error = ref('');
const message = ref('');
const items = ref([]);
const selectedItemKey = ref('');
const detail = ref(null);
const approvalDecision = ref('Approve');
const approvalComments = ref('');
const capaStage = ref('ActionPlan');
const commentsByRecord = ref({});
const attachmentsByRecord = ref({});

const auth = getStoredAuth();
const normalizedRoles = Array.isArray(auth?.roles)
  ? auth.roles.map((role) => String(role || '').toLowerCase())
  : [];
const canApprove = computed(() =>
  ['approver', 'qa_reviewer', 'admin', 'superadmin'].some((role) => normalizedRoles.includes(role))
);

const columns = [
  { key: 'module', label: 'Module' },
  { key: 'recordCode', label: 'Record' },
  { key: 'title', label: 'Title' },
  { key: 'status', label: 'Status' },
  { key: 'actionRequired', label: 'Action Required' },
  { key: 'dueDate', label: 'Due Date' }
];

const selectedItem = computed(() => items.value.find((item) => item.taskKey === selectedItemKey.value) || null);
const detailTimeline = computed(() => normalizeTimelineRows(detail.value?.timeline || []));
const detailSummary = computed(() => detail.value?.summary || null);
const allowedActions = computed(() =>
  selectedItem.value
    ? resolveWorkflowActions({
        moduleName: selectedItem.value.module,
        status: selectedItem.value.status,
        userRoles: normalizedRoles
      })
    : []
);
const canSubmitApproval = computed(
  () =>
    canApprove.value
    && selectedItem.value
    && ['approveActionPlan', 'rejectActionPlan', 'approveClosure', 'rejectClosure', 'approveChange', 'rejectChange']
      .some((action) => allowedActions.value.includes(action))
);
const showCollaboration = computed(() => FEATURE_FLAGS.collaborationPanel && Boolean(selectedItem.value));
const activeComments = computed(() => commentsByRecord.value[selectedItemKey.value] || []);
const activeAttachments = computed(() => attachmentsByRecord.value[selectedItemKey.value] || []);

function toDate(value) {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().slice(0, 10);
}

function deriveCapaAction(status) {
  const state = String(status || '');
  if (/approval|investigation/i.test(state)) return 'Action Plan Approval';
  if (/effectiveness|execution|closure/i.test(state)) return 'Closure Approval';
  return 'Review';
}

function deriveChangeAction(status) {
  const state = String(status || '');
  if (/pending|review|cab|approved/i.test(state)) return 'Final Approval';
  return 'Review';
}

function buildInboxRows(payload) {
  const rows = [];

  for (const capa of payload.capas || []) {
    if (String(capa.status || '').toLowerCase() === 'closed') continue;
    rows.push({
      taskKey: `capa:${capa.id}`,
      module: 'CAPA',
      sourceId: capa.id,
      recordCode: capa.capa_code || 'CAPA',
      title: capa.title || 'Untitled CAPA',
      status: capa.status || 'Open',
      dueDate: toDate(capa.due_date),
      actionRequired: deriveCapaAction(capa.status)
    });
  }

  for (const change of payload.changes || []) {
    const state = String(change.status || '').toLowerCase();
    if (state === 'closed' || state === 'rejected') continue;
    rows.push({
      taskKey: `change:${change.id}`,
      module: 'Change Control',
      sourceId: change.id,
      recordCode: change.change_code || 'CHANGE',
      title: change.title || 'Untitled Change',
      status: change.status || 'Open',
      dueDate: toDate(change.planned_end_date || change.updated_at),
      actionRequired: deriveChangeAction(change.status)
    });
  }

  for (const deviation of payload.deviations || []) {
    if (String(deviation.status || '').toLowerCase() === 'closed') continue;
    rows.push({
      taskKey: `deviation:${deviation.id}`,
      module: 'Deviation',
      sourceId: deviation.id,
      recordCode: deviation.deviation_code || 'DEVIATION',
      title: deviation.title || 'Untitled Deviation',
      status: deviation.status || 'Open',
      dueDate: toDate(deviation.due_date),
      actionRequired: 'Review'
    });
  }

  for (const audit of payload.audits || []) {
    if (String(audit.status || '').toLowerCase() === 'closed') continue;
    rows.push({
      taskKey: `audit:${audit.id}`,
      module: 'Audit',
      sourceId: audit.id,
      recordCode: audit.audit_code || 'AUDIT',
      title: audit.title || audit.scope_summary || 'Untitled Audit',
      status: audit.status || 'Open',
      dueDate: toDate(audit.end_date || audit.updated_at),
      actionRequired: 'Review'
    });
  }

  return rows.sort((left, right) => String(left.dueDate).localeCompare(String(right.dueDate)));
}

async function loadInbox() {
  loading.value = true;
  error.value = '';
  try {
    const [capaData, changeData, deviationData, auditData] = await Promise.all([
      apiRequest('/capa'),
      apiRequest('/change-control'),
      apiRequest('/deviations'),
      apiRequest('/audits')
    ]);

    items.value = buildInboxRows({
      capas: capaData.capas || [],
      changes: changeData.changes || [],
      deviations: deviationData.deviations || [],
      audits: auditData.audits || []
    });

    if (!selectedItemKey.value && items.value.length > 0) {
      selectedItemKey.value = items.value[0].taskKey;
    }
  } catch (requestError) {
    error.value = requestError.message;
  } finally {
    loading.value = false;
  }
}

async function loadDetail() {
  if (!selectedItem.value) {
    detail.value = null;
    return;
  }

  detailLoading.value = true;
  error.value = '';
  try {
    if (selectedItem.value.module === 'CAPA') {
      const payload = await apiRequest(`/capa/${selectedItem.value.sourceId}`);
      detail.value = {
        summary: payload.capa || null,
        timeline: payload.timeline || []
      };
      capaStage.value = selectedItem.value.actionRequired === 'Closure Approval' ? 'Closure' : 'ActionPlan';
      return;
    }

    if (selectedItem.value.module === 'Change Control') {
      const payload = await apiRequest(`/change-control/${selectedItem.value.sourceId}`);
      detail.value = {
        summary: payload.change || null,
        timeline: payload.timeline || []
      };
      return;
    }

    if (selectedItem.value.module === 'Deviation') {
      const payload = await apiRequest(`/deviations/${selectedItem.value.sourceId}`);
      detail.value = {
        summary: payload.deviation || null,
        timeline: payload.history || []
      };
      return;
    }

    if (selectedItem.value.module === 'Audit') {
      const payload = await apiRequest(`/audits/${selectedItem.value.sourceId}`);
      detail.value = {
        summary: payload.audit || null,
        timeline: payload.timeline || []
      };
      return;
    }
  } catch (requestError) {
    error.value = requestError.message;
  } finally {
    detailLoading.value = false;
  }
}

async function submitApproval() {
  if (!selectedItem.value || !canSubmitApproval.value) return;
  message.value = '';
  error.value = '';

  try {
    if (selectedItem.value.module === 'CAPA') {
      await apiRequest(`/capa/${selectedItem.value.sourceId}/approve`, {
        method: 'POST',
        body: {
          stage: capaStage.value,
          decision: approvalDecision.value,
          comments: approvalComments.value || null
        }
      });
    } else if (selectedItem.value.module === 'Change Control') {
      await apiRequest(`/change-control/${selectedItem.value.sourceId}/approvals`, {
        method: 'POST',
        body: {
          decision: approvalDecision.value,
          comments: approvalComments.value || null
        }
      });
    } else {
      message.value = 'Approval action is available for CAPA and Change Control tasks.';
      return;
    }

    message.value = 'Workflow decision submitted successfully.';
    approvalComments.value = '';
    await loadInbox();
    await loadDetail();
  } catch (requestError) {
    error.value = requestError.message;
  }
}

function addComment(text) {
  if (!selectedItemKey.value) return;
  const current = commentsByRecord.value[selectedItemKey.value] || [];
  commentsByRecord.value[selectedItemKey.value] = [
    {
      id: `${Date.now()}-${Math.random()}`,
      author: auth?.user?.fullName || auth?.user?.email || 'QMS User',
      text,
      createdAt: new Date().toISOString().slice(0, 19).replace('T', ' ')
    },
    ...current
  ].slice(0, 50);
}

function addAttachment(item) {
  if (!selectedItemKey.value) return;
  const current = attachmentsByRecord.value[selectedItemKey.value] || [];
  attachmentsByRecord.value[selectedItemKey.value] = [
    {
      id: `${Date.now()}-${Math.random()}`,
      name: item.name,
      ref: item.ref,
      createdAt: new Date().toISOString().slice(0, 19).replace('T', ' ')
    },
    ...current
  ].slice(0, 50);
}

watch(selectedItemKey, async () => {
  await loadDetail();
});

onMounted(async () => {
  await loadInbox();
  await loadDetail();
});
</script>

<template>
  <section class="space-y-4">
    <header class="rounded-2xl border border-slate-200 bg-white p-5">
      <p class="text-xs uppercase tracking-[0.14em] text-slate-500">Workflow Execution</p>
      <h2 class="mt-1 text-2xl font-bold text-slate-900">Workflow Inbox</h2>
      <p class="mt-2 text-sm text-slate-600">
        Single queue for CAPA, Change Control, Deviation, and Audit workflows with approval actions and timeline context.
      </p>
    </header>

    <section class="grid gap-4 xl:grid-cols-[1.2fr_minmax(0,1fr)]">
      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-slate-900">Pending Workflow Records</h3>
          <button class="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700" @click="loadInbox">
            Refresh Inbox
          </button>
        </div>

        <div v-if="loading" class="mb-3 space-y-2">
          <div class="qms-skeleton h-6 rounded"></div>
          <div class="qms-skeleton h-6 rounded"></div>
          <div class="qms-skeleton h-6 rounded"></div>
        </div>

        <QualityDataGrid
          :columns="columns"
          :rows="items"
          row-key="taskKey"
          storage-key="qms_workflow_inbox_views"
          empty-text="No workflow items."
          @row-click="selectedItemKey = $event.taskKey"
        >
          <template #cell-recordCode="{ row }">
            <div class="flex flex-col">
              <span class="font-semibold">{{ row.recordCode }}</span>
              <span class="text-xs text-slate-500">{{ row.module }}</span>
            </div>
          </template>
          <template #cell-status="{ row }">
            <span class="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{{ row.status }}</span>
          </template>
          <template #cell-actionRequired="{ value }">
            <span class="text-xs font-semibold text-emerald-700">{{ value }}</span>
          </template>
        </QualityDataGrid>
      </article>

      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Record Detail Panel</h3>

        <p v-if="!selectedItem" class="mt-3 text-sm text-slate-600">Select a workflow item to inspect details.</p>
        <div v-else-if="detailLoading" class="mt-3 space-y-2">
          <div class="qms-skeleton h-5 rounded"></div>
          <div class="qms-skeleton h-16 rounded"></div>
          <div class="qms-skeleton h-20 rounded"></div>
        </div>
        <template v-else>
          <div class="mt-3 rounded border border-slate-200 px-3 py-2 text-sm">
            <p><span class="font-semibold">Record:</span> {{ selectedItem.recordCode }}</p>
            <p><span class="font-semibold">Title:</span> {{ selectedItem.title }}</p>
            <p><span class="font-semibold">Module:</span> {{ selectedItem.module }}</p>
            <p><span class="font-semibold">Status:</span> {{ selectedItem.status }}</p>
          </div>

          <div v-if="detailSummary" class="mt-3 rounded border border-slate-200 px-3 py-2 text-xs text-slate-700">
            <p class="font-semibold text-slate-900">Summary Snapshot</p>
            <p class="mt-1">Owner: {{ detailSummary.owner_user_id || detailSummary.created_by || 'N/A' }}</p>
            <p>Updated: {{ detailSummary.updated_at ? detailSummary.updated_at.slice(0, 19) : 'N/A' }}</p>
          </div>

          <div
            v-if="canSubmitApproval && (selectedItem.module === 'CAPA' || selectedItem.module === 'Change Control')"
            class="mt-3 rounded border border-slate-200 px-3 py-2"
          >
            <p class="text-sm font-semibold text-slate-900">Approval Action</p>
            <div class="mt-2 grid gap-2">
              <select v-if="selectedItem.module === 'CAPA'" v-model="capaStage" class="rounded border px-2 py-1 text-xs">
                <option value="ActionPlan">Action Plan</option>
                <option value="Closure">Closure</option>
              </select>
              <select v-model="approvalDecision" class="rounded border px-2 py-1 text-xs">
                <option value="Approve">Approve</option>
                <option value="Reject">Reject</option>
              </select>
              <textarea
                v-model="approvalComments"
                class="rounded border px-2 py-1 text-xs"
                rows="2"
                placeholder="Approval comments"
              />
              <button class="rounded border border-slate-300 px-2 py-1.5 text-xs font-semibold text-slate-700" @click="submitApproval">
                Submit Decision
              </button>
            </div>
          </div>
          <p v-else-if="selectedItem.module === 'CAPA' || selectedItem.module === 'Change Control'" class="mt-3 text-xs text-slate-600">
            Current role/status does not allow approval action on this record.
          </p>

          <div class="mt-3">
            <p class="text-sm font-semibold text-slate-900">Workflow Timeline</p>
            <ul class="mt-2 max-h-64 space-y-2 overflow-auto text-xs">
              <li
                v-for="item in detailTimeline.slice(0, 25)"
                :key="item.id"
                class="rounded border border-slate-200 px-2 py-1"
              >
                <p class="font-semibold">{{ item.actionKey }}</p>
                <p class="text-slate-600">At: {{ item.occurredAt || 'Unknown time' }}</p>
                <p class="text-slate-600">Actor: {{ item.actorUserId || 'System' }}</p>
                <p class="text-slate-500">{{ item.summary }}</p>
              </li>
              <li v-if="detailTimeline.length === 0" class="text-slate-600">No timeline events.</li>
            </ul>
          </div>

          <RecordCollaborationPanel
            v-if="showCollaboration"
            class="mt-3"
            :record-key="selectedItem.taskKey"
            :comments="activeComments"
            :attachments="activeAttachments"
            :disabled="false"
            @add-comment="addComment"
            @add-attachment="addAttachment"
          />
        </template>
      </article>
    </section>

    <p v-if="message" class="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ message }}</p>
    <p v-if="error" class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
  </section>
</template>
