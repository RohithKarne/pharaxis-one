<script setup>
import { computed, onMounted, ref } from 'vue';
import { apiRequest } from '../services/api';
import { useModuleAccess } from '../composables/useModuleAccess';

const loading = ref(false);
const error = ref('');
const message = ref('');

const suppliers = ref([]);
const supplierAudits = ref([]);
const scars = ref([]);
const selectedSupplierId = ref('');
const selectedSupplier = computed(() => suppliers.value.find((item) => item.id === selectedSupplierId.value) || null);
const { isWriteDisabled, writeDisabledReason, withRoles } = useModuleAccess('supplierQuality');

const supplierForm = ref({
  supplierName: '',
  supplierType: 'RawMaterial',
  contactEmail: '',
  riskLevel: 'Medium',
  qualificationStatus: 'Pending'
});

const auditForm = ref({
  auditType: 'Remote',
  plannedDate: '',
  outcome: 'InProgress',
  findingsCount: 0,
  summary: ''
});

const scarForm = ref({
  issueSummary: '',
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
    const payload = await apiRequest('/supplier-quality');
    suppliers.value = payload.suppliers || [];
    supplierAudits.value = payload.supplierAudits || [];
    scars.value = payload.scars || [];
    if (!selectedSupplierId.value && suppliers.value[0]) {
      selectedSupplierId.value = suppliers.value[0].id;
    }
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

async function createSupplier() {
  if (!withRoles(['qa_reviewer', 'admin', 'superadmin'], setMessage)) return;
  try {
    await apiRequest('/supplier-quality/suppliers', { method: 'POST', body: supplierForm.value });
    setMessage('Supplier created.');
    supplierForm.value.supplierName = '';
    supplierForm.value.contactEmail = '';
    await load();
  } catch (err) {
    error.value = err.message;
  }
}

async function createAudit() {
  if (!selectedSupplierId.value) return;
  if (!withRoles(['qa_reviewer', 'admin', 'superadmin'], setMessage)) return;
  try {
    await apiRequest(`/supplier-quality/suppliers/${selectedSupplierId.value}/audits`, {
      method: 'POST',
      body: auditForm.value
    });
    setMessage('Supplier audit logged.');
    auditForm.value.plannedDate = '';
    auditForm.value.summary = '';
    await load();
  } catch (err) {
    error.value = err.message;
  }
}

async function createScar() {
  if (!selectedSupplierId.value) return;
  if (!withRoles(['qa_reviewer', 'admin', 'superadmin'], setMessage)) return;
  try {
    await apiRequest(`/supplier-quality/suppliers/${selectedSupplierId.value}/scars`, {
      method: 'POST',
      body: scarForm.value
    });
    setMessage('SCAR created.');
    scarForm.value.issueSummary = '';
    scarForm.value.dueDate = '';
    await load();
  } catch (err) {
    error.value = err.message;
  }
}

const currentSupplierAudits = computed(() => supplierAudits.value.filter((item) => item.supplier_id === selectedSupplierId.value));
const currentSupplierScars = computed(() => scars.value.filter((item) => item.supplier_id === selectedSupplierId.value));

onMounted(load);
</script>

<template>
  <section class="space-y-4">
    <header class="rounded-2xl border border-slate-200 bg-white p-5">
      <p class="text-xs uppercase tracking-[0.14em] text-slate-500">Phase 2</p>
      <h2 class="mt-1 text-2xl font-bold text-slate-900">Supplier Quality Workspace</h2>
      <p class="mt-2 text-sm text-slate-600">Manage supplier onboarding, audits, and supplier corrective action requests (SCAR).</p>
      <p v-if="isWriteDisabled" class="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        {{ writeDisabledReason }}
      </p>
    </header>

    <section class="grid gap-4 xl:grid-cols-3">
      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Create Supplier</h3>
        <fieldset :disabled="isWriteDisabled" class="mt-3 grid gap-2">
          <input v-model="supplierForm.supplierName" class="rounded-lg border px-3 py-2 text-sm" placeholder="Supplier name" />
          <select v-model="supplierForm.supplierType" class="rounded-lg border px-3 py-2 text-sm">
            <option>RawMaterial</option><option>ContractManufacturer</option><option>ServiceProvider</option><option>Laboratory</option><option>Distributor</option>
          </select>
          <input v-model="supplierForm.contactEmail" class="rounded-lg border px-3 py-2 text-sm" placeholder="Contact email" />
          <select v-model="supplierForm.riskLevel" class="rounded-lg border px-3 py-2 text-sm">
            <option>Low</option><option>Medium</option><option>High</option><option>Critical</option>
          </select>
          <select v-model="supplierForm.qualificationStatus" class="rounded-lg border px-3 py-2 text-sm">
            <option>Pending</option><option>Qualified</option><option>Conditional</option><option>Disqualified</option>
          </select>
        </fieldset>
        <button class="mt-3 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white" :disabled="isWriteDisabled" @click="createSupplier">Create Supplier</button>
      </article>

      <article class="rounded-2xl border border-slate-200 bg-white p-4 xl:col-span-2">
        <h3 class="text-lg font-semibold text-slate-900">Supplier Registry</h3>
        <p v-if="loading" class="mt-3 text-sm text-slate-600">Loading suppliers...</p>
        <ul v-else class="mt-3 space-y-2">
          <li
            v-for="supplier in suppliers"
            :key="supplier.id"
            class="cursor-pointer rounded-lg border px-3 py-2 text-sm"
            :class="selectedSupplierId === supplier.id ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white'"
            @click="selectedSupplierId = supplier.id"
          >
            <p class="font-semibold">{{ supplier.supplier_code }} - {{ supplier.supplier_name }}</p>
            <p class="text-xs text-slate-600">{{ supplier.supplier_type }} • {{ supplier.qualification_status }} • Risk {{ supplier.risk_level }}</p>
          </li>
        </ul>
      </article>
    </section>

    <section v-if="selectedSupplier" class="grid gap-4 xl:grid-cols-2">
      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Supplier Audits</h3>
        <fieldset :disabled="isWriteDisabled" class="mt-3 grid gap-2">
          <select v-model="auditForm.auditType" class="rounded-lg border px-3 py-2 text-sm"><option>Onsite</option><option>Remote</option><option>DocumentReview</option></select>
          <input v-model="auditForm.plannedDate" class="rounded-lg border px-3 py-2 text-sm" type="date" />
          <select v-model="auditForm.outcome" class="rounded-lg border px-3 py-2 text-sm"><option>InProgress</option><option>Pass</option><option>Conditional</option><option>Fail</option></select>
          <input v-model.number="auditForm.findingsCount" class="rounded-lg border px-3 py-2 text-sm" type="number" min="0" placeholder="Findings count" />
          <textarea v-model="auditForm.summary" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Audit summary"></textarea>
        </fieldset>
        <button class="mt-3 rounded-lg border border-indigo-400 px-4 py-2 text-sm font-semibold text-indigo-700" :disabled="isWriteDisabled" @click="createAudit">Log Audit</button>
        <ul class="mt-4 space-y-2 text-sm">
          <li v-for="item in currentSupplierAudits" :key="item.id" class="rounded border border-slate-200 px-3 py-2">
            {{ item.audit_code }} • {{ item.audit_type }} • {{ item.outcome }} • Findings: {{ item.findings_count }}
          </li>
        </ul>
      </article>

      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">SCAR Management</h3>
        <fieldset :disabled="isWriteDisabled" class="mt-3 grid gap-2">
          <textarea v-model="scarForm.issueSummary" class="rounded-lg border px-3 py-2 text-sm" rows="2" placeholder="Issue summary"></textarea>
          <input v-model="scarForm.dueDate" class="rounded-lg border px-3 py-2 text-sm" type="date" />
        </fieldset>
        <button class="mt-3 rounded-lg border border-indigo-400 px-4 py-2 text-sm font-semibold text-indigo-700" :disabled="isWriteDisabled" @click="createScar">Create SCAR</button>
        <ul class="mt-4 space-y-2 text-sm">
          <li v-for="item in currentSupplierScars" :key="item.id" class="rounded border border-slate-200 px-3 py-2">
            {{ item.scar_code }} • {{ item.status }} • Due: {{ item.due_date || 'n/a' }}
          </li>
        </ul>
      </article>
    </section>

    <p v-if="message" class="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ message }}</p>
    <p v-if="error" class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
  </section>
</template>
