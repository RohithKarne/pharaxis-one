<script setup>
import { computed, onMounted, ref } from 'vue';
import { apiRequest } from '../services/api';
import { useModuleAccess } from '../composables/useModuleAccess';

const loading = ref(false);
const message = ref('');
const list = ref([]);
const selectedDocumentId = ref('');
const detail = ref(null);
const timeline = ref([]);
const previewData = ref(null);
const previewAcknowledged = ref(false);

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

const revisionForm = ref({
  contentSummary: '',
  reasonForChange: ''
});

const transitionForm = ref({
  versionId: '',
  toStatus: 'Review',
  notes: '',
  signatureId: ''
});

const reviewForm = ref({
  reviewId: '',
  result: 'Completed',
  notes: ''
});

const exportForm = ref({
  versionId: '',
  exportFormat: 'PDF',
  binderJobReference: ''
});

const policyRows = ref([
  { roleKey: 'admin', canView: true, canDownload: true, canPrint: true },
  { roleKey: 'author', canView: true, canDownload: false, canPrint: false },
  { roleKey: 'qa_reviewer', canView: true, canDownload: false, canPrint: false },
  { roleKey: 'approver', canView: true, canDownload: false, canPrint: false },
  { roleKey: 'viewer', canView: true, canDownload: false, canPrint: false }
]);

const docTypes = ['SOP', 'Work Instruction', 'Policy', 'Form', 'Protocol'];
const criticalityLevels = ['Low', 'Medium', 'High', 'Critical'];
const transitionTargets = ['Review', 'Approved', 'Effective', 'Retired'];
const selectedDocument = computed(() => detail.value?.document || null);
const versions = computed(() => detail.value?.versions || []);
const reviews = computed(() => detail.value?.reviews || []);
const pendingReviews = computed(() => reviews.value.filter((item) => item.status === 'Pending'));
const activeVersionId = computed(() => selectedDocument.value?.active_version_id || '');
const { isWriteDisabled, writeDisabledReason, withWriteAccess } = useModuleAccess('documentControl');

function setMessage(text) {
  message.value = text;
}

function hydratePolicyRowsFromDetail() {
  const incoming = detail.value?.policies || [];
  if (!incoming.length) return;

  const roleMap = new Map();
  for (const row of incoming) {
    roleMap.set(row.role_key, {
      roleKey: row.role_key,
      canView: Boolean(row.can_view),
      canDownload: Boolean(row.can_download),
      canPrint: Boolean(row.can_print)
    });
  }

  const orderedKeys = ['admin', 'author', 'qa_reviewer', 'approver', 'viewer', 'superadmin'];
  const rows = [];
  for (const key of orderedKeys) {
    if (roleMap.has(key)) rows.push(roleMap.get(key));
  }
  for (const [key, value] of roleMap.entries()) {
    if (!orderedKeys.includes(key)) rows.push(value);
  }

  if (rows.length) {
    policyRows.value = rows;
  }
}

function setDefaultVersionSelections() {
  const latest = versions.value[0];
  const active = activeVersionId.value || latest?.id || '';

  transitionForm.value.versionId = latest?.id || '';
  exportForm.value.versionId = active;
  reviewForm.value.reviewId = pendingReviews.value[0]?.id || '';
}

async function refreshList() {
  loading.value = true;
  try {
    const data = await apiRequest('/document-control/documents');
    list.value = data.documents || [];

    if (!selectedDocumentId.value && list.value.length > 0) {
      selectedDocumentId.value = list.value[0].id;
      await loadSelectedDocument();
    }
  } catch (error) {
    setMessage(error.message);
  } finally {
    loading.value = false;
  }
}

async function loadSelectedDocument() {
  if (!selectedDocumentId.value) {
    detail.value = null;
    timeline.value = [];
    previewData.value = null;
    previewAcknowledged.value = false;
    return;
  }

  try {
    const [docDetail, docTimeline] = await Promise.all([
      apiRequest(`/document-control/documents/${selectedDocumentId.value}`),
      apiRequest(`/document-control/documents/${selectedDocumentId.value}/timeline`)
    ]);

    detail.value = docDetail;
    timeline.value = docTimeline.timeline || [];
    hydratePolicyRowsFromDetail();
    setDefaultVersionSelections();

    if (activeVersionId.value) {
      await loadPreview(activeVersionId.value);
    } else {
      previewData.value = null;
    }
  } catch (error) {
    setMessage(error.message);
  }
}

async function createDocument() {
  if (!withWriteAccess(setMessage)) return;
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

    createForm.value.title = '';
    createForm.value.documentSubtype = '';
    createForm.value.siteCode = '';
    createForm.value.contentSummary = '';
    createForm.value.reasonForChange = '';
    setMessage('Document created successfully.');

    await refreshList();
  } catch (error) {
    setMessage(error.message);
  }
}

async function createRevision() {
  if (!selectedDocumentId.value) return;
  if (!withWriteAccess(setMessage)) return;
  try {
    await apiRequest(`/document-control/documents/${selectedDocumentId.value}/revisions`, {
      method: 'POST',
      body: {
        contentSummary: revisionForm.value.contentSummary || null,
        reasonForChange: revisionForm.value.reasonForChange || null
      }
    });

    revisionForm.value.contentSummary = '';
    revisionForm.value.reasonForChange = '';
    setMessage('Revision created in Draft state.');
    await loadSelectedDocument();
  } catch (error) {
    setMessage(error.message);
  }
}

async function transitionVersion() {
  if (!selectedDocumentId.value || !transitionForm.value.versionId) return;
  if (!withWriteAccess(setMessage)) return;
  try {
    await apiRequest(
      `/document-control/documents/${selectedDocumentId.value}/versions/${transitionForm.value.versionId}/transition`,
      {
        method: 'POST',
        body: {
          toStatus: transitionForm.value.toStatus,
          notes: transitionForm.value.notes || null,
          signatureId: transitionForm.value.signatureId || null
        }
      }
    );

    transitionForm.value.notes = '';
    transitionForm.value.signatureId = '';
    setMessage(`Version transitioned to ${transitionForm.value.toStatus}.`);
    await loadSelectedDocument();
  } catch (error) {
    setMessage(error.message);
  }
}

async function saveAccessPolicies() {
  if (!selectedDocumentId.value) return;
  if (!withWriteAccess(setMessage)) return;
  try {
    await apiRequest(`/document-control/documents/${selectedDocumentId.value}/access-policies`, {
      method: 'PUT',
      body: { policies: policyRows.value }
    });

    setMessage('Document access policies updated.');
    await loadSelectedDocument();
  } catch (error) {
    setMessage(error.message);
  }
}

async function completeReview() {
  if (!selectedDocumentId.value || !reviewForm.value.reviewId) return;
  if (!withWriteAccess(setMessage)) return;
  try {
    await apiRequest(
      `/document-control/documents/${selectedDocumentId.value}/reviews/${reviewForm.value.reviewId}/complete`,
      {
        method: 'POST',
        body: {
          result: reviewForm.value.result,
          notes: reviewForm.value.notes || null
        }
      }
    );

    reviewForm.value.notes = '';
    setMessage('Periodic review completed and next review scheduled.');
    await loadSelectedDocument();
  } catch (error) {
    setMessage(error.message);
  }
}

async function exportDocumentVersion() {
  if (!selectedDocumentId.value || !exportForm.value.versionId) return;
  if (!withWriteAccess(setMessage)) return;
  try {
    const result = await apiRequest(
      `/document-control/documents/${selectedDocumentId.value}/versions/${exportForm.value.versionId}/export`,
      {
        method: 'POST',
        body: {
          exportFormat: exportForm.value.exportFormat,
          binderJobReference: exportForm.value.binderJobReference || null
        }
      }
    );

    setMessage(`Export recorded with watermark: ${result.document?.watermarkLabel || 'CONTROLLED COPY'}`);
    await loadSelectedDocument();
  } catch (error) {
    setMessage(error.message);
  }
}

async function loadPreview(versionId) {
  if (!selectedDocumentId.value || !versionId) return;
  previewAcknowledged.value = false;
  try {
    const result = await apiRequest(
      `/document-control/documents/${selectedDocumentId.value}/versions/${versionId}/controlled-preview`
    );
    previewData.value = result;
  } catch (error) {
    previewData.value = null;
    setMessage(error.message);
  }
}

async function acknowledgePreview() {
  if (!selectedDocumentId.value || !previewData.value?.versionId) return;
  if (!withWriteAccess(setMessage)) return;
  try {
    await apiRequest(
      `/document-control/documents/${selectedDocumentId.value}/versions/${previewData.value.versionId}/acknowledge`,
      { method: 'POST' }
    );
    previewAcknowledged.value = true;
    await loadPreview(previewData.value.versionId);
  } catch (error) {
    setMessage(error.message);
  }
}

function canShowPreviewContent() {
  const policy = previewData.value?.policy;
  if (!policy) return false;
  if (!policy.mustAcknowledgeForCompliance) return true;
  return Boolean(policy.alreadyAcknowledged || previewAcknowledged.value);
}

function printControlledCopy() {
  window.print();
}

onMounted(refreshList);
</script>

<template>
  <section class="space-y-4">
    <header class="rounded-2xl border border-teal-100 bg-white p-4">
      <h2 class="text-xl font-bold text-teal-900">Document Control Workspace</h2>
      <p class="mt-1 text-sm text-slate-600">
        Create controlled documents, manage revisions, enforce role-based access, run periodic reviews, and track timeline evidence.
      </p>
      <p v-if="isWriteDisabled" class="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        {{ writeDisabledReason }}
      </p>
      <p v-if="message" class="mt-2 text-sm text-indigo-700">{{ message }}</p>
    </header>

    <section class="grid gap-4 xl:grid-cols-3">
      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Create Document</h3>
        <div class="mt-3 grid gap-2">
          <input v-model="createForm.title" class="rounded-lg border px-3 py-2 text-sm" placeholder="Document title" />
          <select v-model="createForm.documentType" class="rounded-lg border px-3 py-2 text-sm">
            <option v-for="docType in docTypes" :key="docType" :value="docType">{{ docType }}</option>
          </select>
          <input v-model="createForm.documentSubtype" class="rounded-lg border px-3 py-2 text-sm" placeholder="Subtype (optional)" />
          <input v-model="createForm.department" class="rounded-lg border px-3 py-2 text-sm" placeholder="Department" />
          <input v-model="createForm.siteCode" class="rounded-lg border px-3 py-2 text-sm" placeholder="Site code (optional)" />
          <select v-model="createForm.criticality" class="rounded-lg border px-3 py-2 text-sm">
            <option v-for="level in criticalityLevels" :key="level" :value="level">{{ level }}</option>
          </select>
          <input
            v-model.number="createForm.reviewIntervalDays"
            class="rounded-lg border px-3 py-2 text-sm"
            min="30"
            type="number"
            placeholder="Review interval days"
          />
          <label class="text-xs text-slate-600">
            <input v-model="createForm.trainingRequired" class="mr-1" type="checkbox" /> Training required
          </label>
          <label class="text-xs text-slate-600">
            <input v-model="createForm.controlledCopyRequired" class="mr-1" type="checkbox" /> Confidential watermark required
          </label>
          <textarea v-model="createForm.contentSummary" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Initial content summary"></textarea>
          <textarea v-model="createForm.reasonForChange" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Reason for change (optional)"></textarea>
        </div>
        <button class="mt-3 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white" :disabled="isWriteDisabled" @click="createDocument">
          Create Controlled Document
        </button>
      </article>

      <article class="rounded-2xl border border-slate-200 bg-white p-4 xl:col-span-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-lg font-semibold text-slate-900">Documents</h3>
          <button class="rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-700" @click="refreshList">
            Refresh
          </button>
        </div>
        <p v-if="loading" class="mt-2 text-sm text-slate-600">Loading documents...</p>
        <ul class="mt-3 max-h-72 space-y-2 overflow-auto text-sm">
          <li
            v-for="doc in list"
            :key="doc.id"
            class="cursor-pointer rounded-lg border px-3 py-2"
            :class="selectedDocumentId === doc.id ? 'border-teal-500 bg-teal-50' : 'border-slate-200'"
            @click="selectedDocumentId = doc.id; loadSelectedDocument()"
          >
            <p class="font-semibold text-slate-900">{{ doc.document_code }} - {{ doc.title }}</p>
            <p class="text-xs text-slate-600">
              {{ doc.document_type }} • {{ doc.department }} • v{{ doc.version_no || '-' }} • {{ doc.status || 'No active version' }}
            </p>
          </li>
        </ul>
      </article>
    </section>

    <section v-if="selectedDocument" class="grid gap-4 xl:grid-cols-3">
      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Document Overview</h3>
        <div class="mt-3 space-y-1 text-sm text-slate-700">
          <p><span class="font-semibold">Code:</span> {{ selectedDocument.document_code }}</p>
          <p><span class="font-semibold">Title:</span> {{ selectedDocument.title }}</p>
          <p><span class="font-semibold">Type:</span> {{ selectedDocument.document_type }}</p>
          <p><span class="font-semibold">Criticality:</span> {{ selectedDocument.criticality }}</p>
          <p><span class="font-semibold">Active Version:</span> {{ selectedDocument.active_version_no || 'N/A' }}</p>
          <p><span class="font-semibold">Status:</span> {{ selectedDocument.active_status || 'N/A' }}</p>
          <p><span class="font-semibold">Next Review:</span> {{ selectedDocument.next_review_due_date || 'N/A' }}</p>
        </div>

        <h4 class="mt-4 text-sm font-semibold text-slate-900">Create Revision</h4>
        <div class="mt-2 grid gap-2">
          <textarea v-model="revisionForm.contentSummary" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Revision summary"></textarea>
          <textarea v-model="revisionForm.reasonForChange" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Reason for revision"></textarea>
          <button class="rounded border border-teal-500 px-3 py-1 text-xs font-semibold text-teal-700" :disabled="isWriteDisabled" @click="createRevision">
            Add Revision
          </button>
        </div>
      </article>

      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Lifecycle & Export</h3>
        <div class="mt-3 grid gap-2">
          <label class="text-xs font-semibold text-slate-600">Version</label>
          <select v-model="transitionForm.versionId" class="rounded-lg border px-3 py-2 text-sm">
            <option v-for="version in versions" :key="version.id" :value="version.id">
              v{{ version.version_no }} - {{ version.status }}
            </option>
          </select>

          <label class="text-xs font-semibold text-slate-600">Transition</label>
          <select v-model="transitionForm.toStatus" class="rounded-lg border px-3 py-2 text-sm">
            <option v-for="status in transitionTargets" :key="status" :value="status">{{ status }}</option>
          </select>

          <textarea v-model="transitionForm.notes" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Transition notes"></textarea>
          <input v-model="transitionForm.signatureId" class="rounded-lg border px-3 py-2 text-sm" placeholder="Signature ID (required for Approved/Effective)" />

          <button class="rounded border border-teal-500 px-3 py-1 text-xs font-semibold text-teal-700" :disabled="isWriteDisabled" @click="transitionVersion">
            Apply Transition
          </button>

          <hr class="my-1 border-slate-200" />

          <label class="text-xs font-semibold text-slate-600">Export Version</label>
          <select v-model="exportForm.versionId" class="rounded-lg border px-3 py-2 text-sm">
            <option v-for="version in versions" :key="`export-${version.id}`" :value="version.id">
              v{{ version.version_no }} - {{ version.status }}
            </option>
          </select>
          <select v-model="exportForm.exportFormat" class="rounded-lg border px-3 py-2 text-sm">
            <option>PDF</option>
            <option>DOCX</option>
            <option>XLSX</option>
          </select>
          <input v-model="exportForm.binderJobReference" class="rounded-lg border px-3 py-2 text-sm" placeholder="Binder reference (optional)" />
          <button class="rounded border border-teal-500 px-3 py-1 text-xs font-semibold text-teal-700" :disabled="isWriteDisabled" @click="exportDocumentVersion">
            Record Export
          </button>
        </div>
      </article>

      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Periodic Reviews</h3>
        <div class="mt-3 grid gap-2">
          <select v-model="reviewForm.reviewId" class="rounded-lg border px-3 py-2 text-sm">
            <option value="">Select pending review</option>
            <option v-for="review in pendingReviews" :key="review.id" :value="review.id">
              Due {{ review.due_date }}
            </option>
          </select>
          <select v-model="reviewForm.result" class="rounded-lg border px-3 py-2 text-sm">
            <option>Completed</option>
            <option>Deferred</option>
            <option>Escalated</option>
          </select>
          <textarea v-model="reviewForm.notes" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Review notes"></textarea>
          <button class="rounded border border-teal-500 px-3 py-1 text-xs font-semibold text-teal-700" :disabled="isWriteDisabled" @click="completeReview">
            Complete Review
          </button>
        </div>

        <ul class="mt-3 max-h-44 space-y-2 overflow-auto text-xs">
          <li v-for="review in reviews" :key="`history-${review.id}`" class="rounded border border-slate-200 px-2 py-1">
            {{ review.due_date }} • {{ review.status }}
          </li>
        </ul>
      </article>
    </section>

    <section v-if="selectedDocument" class="grid gap-4 xl:grid-cols-2">
      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold text-slate-900">Access Policies</h3>
          <button class="rounded border border-teal-500 px-3 py-1 text-xs font-semibold text-teal-700" :disabled="isWriteDisabled" @click="saveAccessPolicies">
            Save Policies
          </button>
        </div>

        <div class="mt-3 space-y-2">
          <div v-for="row in policyRows" :key="row.roleKey" class="grid grid-cols-4 items-center gap-2 rounded border border-slate-200 px-2 py-2 text-xs">
            <p class="font-semibold text-slate-700">{{ row.roleKey }}</p>
            <label class="text-slate-600"><input v-model="row.canView" class="mr-1" type="checkbox" />View</label>
            <label class="text-slate-600"><input v-model="row.canDownload" class="mr-1" type="checkbox" />Download</label>
            <label class="text-slate-600"><input v-model="row.canPrint" class="mr-1" type="checkbox" />Print</label>
          </div>
        </div>
      </article>

      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Controlled Preview</h3>
        <div class="mt-3 grid gap-2">
          <select class="rounded-lg border px-3 py-2 text-sm" :value="previewData?.versionId || activeVersionId" @change="loadPreview($event.target.value)">
            <option v-for="version in versions" :key="`preview-${version.id}`" :value="version.id">
              v{{ version.version_no }} - {{ version.status }}
            </option>
          </select>

          <div v-if="previewData?.policy" class="space-y-2">
            <div class="rounded bg-red-600 px-3 py-2 text-center text-xs font-bold text-white">
              {{ previewData.policy.watermarkLabel }}
            </div>

            <div
              v-if="previewData.policy.mustAcknowledgeForCompliance && !previewData.policy.alreadyAcknowledged && !previewAcknowledged"
              class="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900"
            >
              Acknowledgement required before controlled copy access.
              <button class="ml-2 rounded border border-amber-500 px-2 py-1 font-semibold" :disabled="isWriteDisabled" @click="acknowledgePreview">Acknowledge</button>
            </div>

            <div v-if="canShowPreviewContent()" class="space-y-2 text-xs text-slate-700">
              <p>Preview: {{ previewData.policy.previewAllowed ? 'Allowed' : 'Blocked' }}</p>
              <p>Download: {{ previewData.policy.downloadAllowed ? 'Allowed' : 'Blocked' }}</p>
              <p>Print: {{ previewData.policy.printAllowed ? 'Allowed' : 'Blocked' }}</p>
              <div class="flex gap-2">
                <button
                  class="rounded border border-teal-500 px-3 py-1 font-semibold text-teal-700"
                  :disabled="!previewData.policy.downloadAllowed"
                >
                  Download
                </button>
                <button
                  class="rounded border border-teal-500 px-3 py-1 font-semibold text-teal-700"
                  :disabled="!previewData.policy.printAllowed"
                  @click="printControlledCopy"
                >
                  Print
                </button>
              </div>
            </div>
          </div>
        </div>
      </article>
    </section>

    <article v-if="selectedDocument" class="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 class="text-lg font-semibold text-slate-900">Timeline</h3>
      <p v-if="timeline.length === 0" class="mt-2 text-sm text-slate-600">No timeline events yet.</p>
      <ul v-else class="mt-3 max-h-72 space-y-2 overflow-auto text-sm">
        <li v-for="event in timeline" :key="`${event.event_type}-${event.id}`" class="rounded border border-slate-200 px-3 py-2">
          <p class="font-semibold text-slate-900">{{ event.event_type }} • {{ event.to_status || 'N/A' }}</p>
          <p class="text-xs text-slate-600">{{ event.event_at }} • {{ event.actor_name || event.actor_email || 'System' }}</p>
          <p v-if="event.notes" class="text-xs text-slate-700">{{ event.notes }}</p>
        </li>
      </ul>
    </article>
  </section>
</template>
