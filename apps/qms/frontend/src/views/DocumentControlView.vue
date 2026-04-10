<script setup>
import { ref } from 'vue';
import { apiRequest } from '../services/api';

const form = ref({
  title: 'SOP for CAPA Workflow',
  documentType: 'SOP',
  department: 'Quality'
});
const state = ref('');
const docs = ref([]);
const selectedDoc = ref(null);
const previewPolicy = ref(null);
const previewError = ref('');
const acknowledgedLocally = ref(false);
const loadingPreviewPolicy = ref(false);

async function createDocument() {
  try {
    const me = await apiRequest('/protected/me');
    const payload = await apiRequest('/document-control/documents', {
      method: 'POST',
      body: {
        ...form.value,
        ownerUserId: me.auth.userId,
        reviewIntervalDays: 365,
        contentSummary: 'Initial controlled document baseline'
      }
    });
    state.value = `Created ${payload.document.document_code}`;
    await refresh();
  } catch (e) {
    state.value = e.message;
  }
}

async function refresh() {
  try {
    const data = await apiRequest('/document-control/documents');
    docs.value = data.documents || [];
  } catch (e) {
    state.value = e.message;
  }
}

async function selectDocument(doc) {
  selectedDoc.value = doc;
  previewPolicy.value = null;
  previewError.value = '';
  acknowledgedLocally.value = false;
  await fetchPreviewPolicy();
}

async function fetchPreviewPolicy() {
  if (!selectedDoc.value) return;
  loadingPreviewPolicy.value = true;
  try {
    const versionId = selectedDoc.value.latest_version_id || selectedDoc.value.id;
    previewPolicy.value = await apiRequest(
      `/document-control/documents/${selectedDoc.value.id}/versions/${versionId}/controlled-preview`
    );
  } catch (e) {
    previewError.value = e.message;
  } finally {
    loadingPreviewPolicy.value = false;
  }
}

function acknowledgeAndProceed() {
  acknowledgedLocally.value = true;
}
</script>

<template>
  <section class="grid gap-4 lg:grid-cols-2">
    <article class="rounded-2xl border border-teal-100 bg-white p-4">
      <h2 class="text-lg font-semibold text-teal-900">Create Controlled Document</h2>
      <div class="mt-3 grid gap-2">
        <input v-model="form.title" class="rounded-lg border px-3 py-2 text-sm" placeholder="Title" />
        <select v-model="form.documentType" class="rounded-lg border px-3 py-2 text-sm">
          <option>SOP</option>
          <option>Work Instruction</option>
          <option>Policy</option>
          <option>Form</option>
          <option>Protocol</option>
        </select>
        <input v-model="form.department" class="rounded-lg border px-3 py-2 text-sm" placeholder="Department" />
      </div>
      <button class="mt-3 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white" @click="createDocument">Create</button>
      <button class="mt-3 ml-2 rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-700" @click="refresh">Refresh</button>
      <p class="mt-2 text-xs text-slate-600">{{ state }}</p>
    </article>
    <article class="rounded-2xl border border-teal-100 bg-white p-4">
      <h2 class="text-lg font-semibold text-teal-900">Latest Documents</h2>
      <ul class="mt-3 space-y-2 text-sm">
        <li
          v-for="item in docs.slice(0, 8)"
          :key="item.id"
          class="cursor-pointer rounded-lg border px-3 py-2 transition"
          :class="selectedDoc && selectedDoc.id === item.id ? 'border-teal-500 bg-teal-50' : 'border-slate-200 hover:border-teal-200'"
          @click="selectDocument(item)"
        >
          <span class="font-semibold">{{ item.document_code }}</span> - {{ item.title }} ({{ item.status }})
        </li>
      </ul>
    </article>
  </section>
  <article class="mt-4 rounded-2xl border border-teal-100 bg-white p-4">
    <h2 class="text-lg font-semibold text-teal-900">Controlled Preview</h2>

    <p v-if="!selectedDoc" class="mt-3 text-sm text-slate-600">
      Select a document from the list to view its controlled preview policy.
    </p>

    <div v-else class="mt-3">
      <p v-if="loadingPreviewPolicy" class="text-sm text-slate-600">Loading controlled preview policy...</p>
      <p v-else-if="previewError" class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {{ previewError }}
      </p>

      <div v-else-if="previewPolicy" class="space-y-3">
        <div
          v-if="
            previewPolicy.mustAcknowledgeForCompliance &&
            !previewPolicy.alreadyAcknowledged &&
            !acknowledgedLocally
          "
          class="rounded-lg border border-yellow-200 bg-yellow-50 p-3"
        >
          <p class="text-sm text-yellow-900">
            You must read and acknowledge this document before viewing the controlled copy.
          </p>
          <button
            class="mt-3 rounded-lg border border-yellow-500 bg-yellow-100 px-3 py-2 text-sm font-semibold text-yellow-900"
            @click="acknowledgeAndProceed"
          >
            Acknowledge &amp; Proceed
          </button>
        </div>

        <div
          v-if="
            !previewPolicy.mustAcknowledgeForCompliance ||
            previewPolicy.alreadyAcknowledged ||
            acknowledgedLocally
          "
          class="space-y-3"
        >
          <div class="rounded-lg bg-red-600 px-3 py-2 text-center text-sm font-bold text-white">
            {{ previewPolicy.watermarkLabel }}
          </div>

          <div class="rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
            <p><span class="font-semibold text-teal-900">Code:</span> {{ selectedDoc.document_code }}</p>
            <p><span class="font-semibold text-teal-900">Title:</span> {{ selectedDoc.title }}</p>
            <p><span class="font-semibold text-teal-900">Status:</span> {{ selectedDoc.status }}</p>
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <button
              v-if="previewPolicy.downloadAllowed"
              class="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white"
            >
              Download
            </button>
            <p v-else class="text-xs text-slate-600">Download is disabled for this controlled document.</p>

            <button
              v-if="previewPolicy.printAllowed"
              class="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white"
              @click="window.print()"
            >
              Print
            </button>
            <p v-else class="text-xs text-slate-600">Printing is disabled for this controlled document.</p>
          </div>
        </div>
      </div>
    </div>
  </article>
</template>
