<script setup>
import { ref } from 'vue';
import { apiRequest } from '../services/api';

const message = ref('');
const orgs = ref([]);
const users = ref([]);

async function refresh() {
  try {
    const [o, u] = await Promise.all([apiRequest('/superadmin/orgs'), apiRequest('/superadmin/users')]);
    orgs.value = o.orgs || [];
    users.value = u.users || [];
    message.value = 'Superadmin datasets refreshed';
  } catch (e) {
    message.value = e.message;
  }
}

async function applyBilling(orgId) {
  try {
    await apiRequest(`/superadmin/billing/${orgId}`, {
      method: 'PUT',
      body: {
        planKey: 'enterprise',
        billingStatus: 'active',
        licenseLimit: 250,
        reportingEmail: 'finance@pharaxis.local'
      }
    });
    message.value = 'Billing control updated';
  } catch (e) {
    message.value = e.message;
  }
}
</script>

<template>
  <section class="grid gap-4 lg:grid-cols-2">
    <article class="rounded-2xl border border-teal-100 bg-white p-4">
      <h2 class="text-lg font-semibold text-teal-900">Organizations</h2>
      <button class="mt-2 rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-700" @click="refresh">Refresh</button>
      <p class="mt-2 text-xs text-slate-600">{{ message }}</p>
      <ul class="mt-3 space-y-2 text-sm">
        <li v-for="org in orgs" :key="org.id" class="rounded-lg border border-slate-200 px-3 py-2">
          <div>{{ org.org_code }} - {{ org.org_name }}</div>
          <button class="mt-2 rounded bg-teal-700 px-3 py-1 text-xs font-semibold text-white" @click="applyBilling(org.id)">Apply Billing Control</button>
        </li>
      </ul>
    </article>
    <article class="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 class="text-lg font-semibold text-slate-900">Users</h2>
      <ul class="mt-3 space-y-2 text-sm">
        <li v-for="user in users.slice(0, 20)" :key="user.id" class="rounded-lg border border-slate-200 px-3 py-2">
          {{ user.email }} ({{ user.role_key }}) - {{ user.org_code }}
        </li>
      </ul>
    </article>
  </section>
</template>

