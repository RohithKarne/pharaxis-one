<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { apiRequest } from '../services/api';

const loading = ref(false);
const message = ref('');
const activeSection = ref('dashboard');

const orgs = ref([]);
const users = ref([]);
const loginAudit = ref([]);
const emailConfig = ref(null);
const uploadPolicy = ref(null);
const securityPolicy = ref(null);
const availableGroups = ref([]);
const readiness = ref(null);

const selectedOrgId = ref('');

const createOrgForm = ref({
  orgCode: '',
  orgName: ''
});

const createUserForm = ref({
  orgId: '',
  email: '',
  fullName: '',
  password: '',
  roleKeys: ['author']
});

const twoFaResetForm = ref({
  userId: ''
});

const emailConfigForm = ref({
  smtpHost: '',
  smtpPort: 587,
  smtpUsername: '',
  smtpPassword: '',
  smtpFromEmail: '',
  smtpFromName: '',
  useTls: true,
  isActive: true
});

const uploadPolicyForm = ref({
  maxUploadMb: 25,
  allowedExtensionsCsv: 'pdf,doc,docx,xls,xlsx,ppt,pptx,csv,txt,png,jpg,jpeg,tiff,eml,msg',
  viewerDefaultCanDownload: false,
  viewerDownloadRequiresWatermark: true
});

const securityPolicyForm = ref({
  emailOtpRequired: true,
  allowOrgAdmin2faReset: true
});

const defaultGroupTemplate = ['admin', 'author', 'qa_reviewer', 'approver', 'viewer'];

const sectionItems = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'orgs', label: 'Organizations' },
  { key: 'users', label: 'Users & Groups' },
  { key: 'security', label: 'Security & 2FA' },
  { key: 'email', label: 'Email Config' },
  { key: 'upload', label: 'Upload Policy' },
  { key: 'audit', label: 'Login Audit' }
];

const usersForSelectedOrg = computed(() =>
  users.value.filter((user) => !selectedOrgId.value || user.org_id === selectedOrgId.value)
);

const selectedOrg = computed(() => orgs.value.find((org) => org.id === selectedOrgId.value) || null);
const hasSelectedOrg = computed(() => Boolean(selectedOrgId.value));
const canCreateOrg = computed(() => {
  const orgCode = createOrgForm.value.orgCode.trim();
  const orgName = createOrgForm.value.orgName.trim();
  return Boolean(orgCode && orgName);
});
const canCreateUser = computed(() => {
  const fullName = createUserForm.value.fullName.trim();
  const email = createUserForm.value.email.trim();
  const password = createUserForm.value.password;
  return Boolean(
    createUserForm.value.orgId &&
      fullName &&
      email &&
      password &&
      password.length >= 8 &&
      Array.isArray(createUserForm.value.roleKeys) &&
      createUserForm.value.roleKeys.length > 0
  );
});
const canReset2fa = computed(() => Boolean(twoFaResetForm.value.userId));

const dashboardCards = computed(() => {
  const activeUsers = users.value.filter((user) => user.is_active).length;
  const inactiveUsers = users.value.filter((user) => !user.is_active).length;
  const failedLogins24h = loginAudit.value.filter((event) => {
    if (event.outcome !== 'Failed' || !event.occurred_at) return false;
    return Date.now() - new Date(event.occurred_at).getTime() <= 24 * 60 * 60 * 1000;
  }).length;

  return [
    { label: 'Organizations', value: orgs.value.length },
    { label: 'Active Users', value: activeUsers },
    { label: 'Inactive Users', value: inactiveUsers },
    { label: 'Failed Logins (24h)', value: failedLogins24h },
    { label: 'Upload Policy Coverage', value: `${readiness.value?.policies?.uploadPolicyCoverage ?? 0}%` },
    { label: 'Security Policy Coverage', value: `${readiness.value?.policies?.securityPolicyCoverage ?? 0}%` }
  ];
});

function setActionError(error, fallbackMessage) {
  message.value = error?.message || fallbackMessage;
}

async function refreshCore() {
  loading.value = true;
  message.value = '';
  try {
    const [orgResponse, userResponse, emailResponse, auditResponse, readinessResponse] = await Promise.all([
      apiRequest('/superadmin/orgs'),
      apiRequest('/superadmin/users'),
      apiRequest('/superadmin/platform/email-config'),
      apiRequest('/superadmin/reports/login-audit?limit=120'),
      apiRequest('/superadmin/platform/readiness')
    ]);

    orgs.value = orgResponse.orgs || [];
    users.value = userResponse.users || [];
    loginAudit.value = auditResponse.loginAudit || [];
    emailConfig.value = emailResponse.emailConfig;
    readiness.value = readinessResponse.readiness || null;

    if (!selectedOrgId.value && orgs.value.length > 0) {
      selectedOrgId.value = orgs.value[0].id;
    }

    if (emailConfig.value) {
      emailConfigForm.value = {
        smtpHost: emailConfig.value.smtp_host || '',
        smtpPort: Number(emailConfig.value.smtp_port || 587),
        smtpUsername: emailConfig.value.smtp_username || '',
        smtpPassword: '',
        smtpFromEmail: emailConfig.value.smtp_from_email || '',
        smtpFromName: emailConfig.value.smtp_from_name || '',
        useTls: Boolean(emailConfig.value.use_tls),
        isActive: Boolean(emailConfig.value.is_active)
      };
    }
  } catch (error) {
    setActionError(error, 'Unable to refresh platform data.');
  } finally {
    loading.value = false;
  }
}

async function createOrg() {
  if (!canCreateOrg.value) {
    message.value = 'Org code and organization name are required.';
    return;
  }

  try {
    await apiRequest('/superadmin/orgs', {
      method: 'POST',
      body: createOrgForm.value
    });
    createOrgForm.value = { orgCode: '', orgName: '' };
    message.value = 'Organization created with default security groups template.';
    await refreshCore();
  } catch (error) {
    setActionError(error, 'Unable to create organization.');
  }
}

async function toggleOrgStatus(org) {
  try {
    await apiRequest(`/superadmin/orgs/${org.id}/status`, {
      method: 'PATCH',
      body: { isActive: !org.is_active }
    });
    message.value = `Organization ${org.is_active ? 'deactivated' : 'activated'} successfully.`;
    await refreshCore();
  } catch (error) {
    setActionError(error, 'Unable to update organization status.');
  }
}

async function createUser() {
  if (!canCreateUser.value) {
    message.value =
      'Select org, fill full name, email, password (minimum 8 characters), and at least one security group.';
    return;
  }

  try {
    const body = {
      orgId: createUserForm.value.orgId,
      email: createUserForm.value.email,
      fullName: createUserForm.value.fullName,
      password: createUserForm.value.password,
      roleKeys: createUserForm.value.roleKeys
    };
    await apiRequest('/superadmin/users', {
      method: 'POST',
      body
    });
    createUserForm.value.email = '';
    createUserForm.value.fullName = '';
    createUserForm.value.password = '';
    createUserForm.value.roleKeys = ['author'];
    message.value = 'User created and security groups assigned.';
    await refreshCore();
  } catch (error) {
    setActionError(error, 'Unable to create user.');
  }
}

async function toggleUserStatus(user) {
  try {
    await apiRequest(`/superadmin/users/${user.id}/status`, {
      method: 'PATCH',
      body: { isActive: !user.is_active }
    });
    message.value = 'User status updated.';
    await refreshCore();
  } catch (error) {
    setActionError(error, 'Unable to update user status.');
  }
}

async function saveUserGroups(user) {
  if (!Array.isArray(user.security_groups) || user.security_groups.length === 0) {
    message.value = 'At least one security group is required.';
    return;
  }

  try {
    await apiRequest(`/superadmin/users/${user.id}/security-groups`, {
      method: 'PATCH',
      body: { roleKeys: user.security_groups || [] }
    });
    message.value = 'Security groups updated.';
    await refreshCore();
  } catch (error) {
    setActionError(error, 'Unable to update security groups.');
  }
}

function toggleGroup(target, roleKey) {
  const exists = target.includes(roleKey);
  if (exists) return target.filter((item) => item !== roleKey);
  return [...target, roleKey];
}

async function saveEmailConfig() {
  try {
    await apiRequest('/superadmin/platform/email-config', {
      method: 'PUT',
      body: emailConfigForm.value
    });
    message.value = 'Platform email config saved.';
    await refreshCore();
  } catch (error) {
    setActionError(error, 'Unable to save email config.');
  }
}

async function loadOrgSecurityGroups() {
  if (!selectedOrgId.value) {
    availableGroups.value = [];
    return;
  }
  try {
    const response = await apiRequest(`/superadmin/users/security-groups/${selectedOrgId.value}`);
    availableGroups.value = response.securityGroups || [];
    if (!createUserForm.value.orgId) {
      createUserForm.value.orgId = selectedOrgId.value;
    }
  } catch (error) {
    setActionError(error, 'Unable to load org security groups.');
  }
}

async function loadUploadPolicy() {
  if (!selectedOrgId.value) {
    uploadPolicy.value = null;
    return;
  }
  try {
    const response = await apiRequest(`/superadmin/platform/upload-policy/${selectedOrgId.value}`);
    uploadPolicy.value = response.uploadPolicy;
    if (uploadPolicy.value) {
      uploadPolicyForm.value = {
        maxUploadMb: Number(uploadPolicy.value.max_upload_mb || 25),
        allowedExtensionsCsv: (uploadPolicy.value.allowed_extensions || []).join(','),
        viewerDefaultCanDownload: Boolean(uploadPolicy.value.viewer_default_can_download),
        viewerDownloadRequiresWatermark: Boolean(uploadPolicy.value.viewer_download_requires_watermark)
      };
    }
  } catch (error) {
    setActionError(error, 'Unable to load upload policy.');
  }
}

async function loadSecurityPolicy() {
  if (!selectedOrgId.value) {
    securityPolicy.value = null;
    return;
  }
  try {
    const response = await apiRequest(`/superadmin/platform/security-policy/${selectedOrgId.value}`);
    securityPolicy.value = response.securityPolicy;
    if (securityPolicy.value) {
      securityPolicyForm.value = {
        emailOtpRequired: Boolean(securityPolicy.value.email_otp_required),
        allowOrgAdmin2faReset: Boolean(securityPolicy.value.allow_org_admin_2fa_reset)
      };
    }
  } catch (error) {
    setActionError(error, 'Unable to load security policy.');
  }
}

async function saveSecurityPolicy() {
  if (!selectedOrgId.value) {
    message.value = 'Select an organization before saving security policy.';
    return;
  }
  try {
    await apiRequest(`/superadmin/platform/security-policy/${selectedOrgId.value}`, {
      method: 'PUT',
      body: {
        emailOtpRequired: securityPolicyForm.value.emailOtpRequired,
        allowOrgAdmin2faReset: securityPolicyForm.value.allowOrgAdmin2faReset
      }
    });
    message.value = 'Security policy updated.';
    await loadSecurityPolicy();
  } catch (error) {
    setActionError(error, 'Unable to save security policy.');
  }
}

async function resetUser2fa() {
  if (!twoFaResetForm.value.userId) {
    message.value = 'Select a user before resetting 2FA.';
    return;
  }

  try {
    await apiRequest(`/security/users/${twoFaResetForm.value.userId}/2fa-reset`, {
      method: 'POST'
    });
    message.value = 'User 2FA reset initiated successfully.';
    twoFaResetForm.value.userId = '';
  } catch (error) {
    setActionError(error, 'Unable to reset user 2FA.');
  }
}

async function saveUploadPolicy() {
  if (!selectedOrgId.value) {
    message.value = 'Select an organization before saving upload policy.';
    return;
  }
  try {
    const extensions = uploadPolicyForm.value.allowedExtensionsCsv
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);

    if (extensions.length === 0) {
      message.value = 'At least one allowed extension is required.';
      return;
    }

    const maxUploadMb = Number(uploadPolicyForm.value.maxUploadMb || 25);
    if (!Number.isFinite(maxUploadMb) || maxUploadMb < 1 || maxUploadMb > 500) {
      message.value = 'maxUploadMb must be between 1 and 500.';
      return;
    }

    await apiRequest(`/superadmin/platform/upload-policy/${selectedOrgId.value}`, {
      method: 'PUT',
      body: {
        maxUploadMb,
        allowedExtensions: extensions,
        viewerDefaultCanDownload: uploadPolicyForm.value.viewerDefaultCanDownload,
        viewerDownloadRequiresWatermark: uploadPolicyForm.value.viewerDownloadRequiresWatermark
      }
    });
    message.value = 'Upload and viewer policy updated.';
    await loadUploadPolicy();
  } catch (error) {
    setActionError(error, 'Unable to save upload policy.');
  }
}

function switchSection(sectionKey) {
  activeSection.value = sectionKey;
}

watch(selectedOrgId, async () => {
  await loadOrgSecurityGroups();
  await loadUploadPolicy();
  await loadSecurityPolicy();
});

onMounted(async () => {
  await refreshCore();
  await loadOrgSecurityGroups();
  await loadUploadPolicy();
  await loadSecurityPolicy();
});
</script>

<template>
  <section class="space-y-4">
    <header class="rounded-2xl border border-slate-200 bg-white p-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-xs uppercase tracking-[0.14em] text-slate-500">Platform Governance</p>
          <h2 class="mt-2 text-2xl font-bold text-slate-900">Superadmin Console</h2>
          <p class="mt-2 text-sm text-slate-600">
            Dashboard-first layout with focused sections for orgs, users, security, and platform controls.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <select v-model="selectedOrgId" class="rounded-lg border px-3 py-2 text-sm">
            <option value="">Select organization</option>
            <option v-for="org in orgs" :key="org.id" :value="org.id">
              {{ org.org_name }}
            </option>
          </select>
          <button
            class="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="loading"
            @click="refreshCore"
          >
            Refresh Platform Data
          </button>
        </div>
      </div>

      <p v-if="message" class="mt-2 text-sm text-indigo-700">{{ message }}</p>
    </header>

    <section class="grid gap-4 xl:grid-cols-[230px_minmax(0,1fr)]">
      <aside class="rounded-2xl border border-slate-200 bg-white p-3">
        <p class="px-2 pb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Sections</p>
        <div class="grid gap-1">
          <button
            v-for="item in sectionItems"
            :key="item.key"
            class="rounded-lg px-3 py-2 text-left text-sm font-semibold"
            :class="activeSection === item.key ? 'bg-indigo-100 text-indigo-700' : 'text-slate-700 hover:bg-slate-100'"
            @click="switchSection(item.key)"
          >
            {{ item.label }}
          </button>
        </div>
      </aside>

      <div class="space-y-4">
        <template v-if="activeSection === 'dashboard'">
          <section class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <article v-for="card in dashboardCards" :key="card.label" class="rounded-xl border border-slate-200 bg-white p-4">
              <p class="text-xs uppercase tracking-[0.08em] text-slate-500">{{ card.label }}</p>
              <p class="mt-2 text-3xl font-extrabold text-slate-900">{{ card.value }}</p>
            </article>
          </section>

          <section class="grid gap-4 xl:grid-cols-2">
            <article class="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 class="text-lg font-semibold text-slate-900">Quick Actions</h3>
              <p class="mt-1 text-xs text-slate-500">Jump directly to frequently used operational actions.</p>
              <div class="mt-3 flex flex-wrap gap-2">
                <button class="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700" @click="switchSection('orgs')">Create Organization</button>
                <button class="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700" @click="switchSection('users')">Create User</button>
                <button class="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700" @click="switchSection('security')">2FA Controls</button>
              </div>
            </article>

            <article class="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 class="text-lg font-semibold text-slate-900">Selected Organization</h3>
              <p class="mt-3 text-sm text-slate-700">
                {{ selectedOrg ? selectedOrg.org_name : 'Select an organization from top bar.' }}
              </p>
              <p class="text-xs text-slate-500">
                {{ selectedOrg ? selectedOrg.org_code : 'No org selected' }}
              </p>
            </article>
          </section>

          <section class="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 class="text-lg font-semibold text-slate-900">Platform Readiness</h3>
            <p class="mt-1 text-xs text-slate-500">
              Snapshot:
              {{ readiness?.generatedAt ? new Date(readiness.generatedAt).toLocaleString() : 'not available' }}
            </p>
            <div class="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <article class="rounded-lg border border-slate-200 p-3">
                <p class="text-xs uppercase tracking-[0.08em] text-slate-500">Total Orgs</p>
                <p class="mt-1 text-xl font-bold text-slate-900">{{ readiness?.orgs?.total ?? 0 }}</p>
              </article>
              <article class="rounded-lg border border-slate-200 p-3">
                <p class="text-xs uppercase tracking-[0.08em] text-slate-500">Active Orgs</p>
                <p class="mt-1 text-xl font-bold text-slate-900">{{ readiness?.orgs?.active ?? 0 }}</p>
              </article>
              <article class="rounded-lg border border-slate-200 p-3">
                <p class="text-xs uppercase tracking-[0.08em] text-slate-500">Email Config</p>
                <p class="mt-1 text-xl font-bold" :class="readiness?.security?.activePlatformEmailConfig ? 'text-emerald-700' : 'text-rose-700'">
                  {{ readiness?.security?.activePlatformEmailConfig ? 'Active' : 'Missing' }}
                </p>
              </article>
              <article class="rounded-lg border border-slate-200 p-3">
                <p class="text-xs uppercase tracking-[0.08em] text-slate-500">Failed Logins (24h)</p>
                <p class="mt-1 text-xl font-bold text-slate-900">{{ readiness?.security?.failedLoginsLast24h ?? 0 }}</p>
              </article>
            </div>
          </section>
        </template>

        <template v-else-if="activeSection === 'orgs'">
          <section class="grid gap-4 xl:grid-cols-2">
            <article class="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 class="text-lg font-semibold text-slate-900">Create Organization</h3>
              <p class="mt-1 text-xs text-slate-500">Default groups: {{ defaultGroupTemplate.join(', ') }}</p>
              <div class="mt-3 grid gap-2">
                <input v-model="createOrgForm.orgCode" class="rounded-lg border px-3 py-2 text-sm" placeholder="Org code (e.g., NOVA_QMS)" />
                <input v-model="createOrgForm.orgName" class="rounded-lg border px-3 py-2 text-sm" placeholder="Organization name" />
                <button
                  class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="loading || !canCreateOrg"
                  @click="createOrg"
                >
                  Create Org
                </button>
              </div>
            </article>

            <article class="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 class="text-lg font-semibold text-slate-900">Organizations</h3>
              <div class="mt-3 max-h-80 space-y-2 overflow-auto">
                <div v-for="org in orgs" :key="org.id" class="rounded-lg border border-slate-200 px-3 py-2">
                  <div class="flex items-center justify-between gap-2">
                    <div>
                      <p class="font-semibold text-slate-900">{{ org.org_name }}</p>
                      <p class="text-xs text-slate-500">{{ org.org_code }}</p>
                    </div>
                    <button
                      class="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                      :disabled="loading"
                      @click="toggleOrgStatus(org)"
                    >
                      {{ org.is_active ? 'Deactivate' : 'Activate' }}
                    </button>
                  </div>
                </div>
              </div>
            </article>
          </section>
        </template>

        <template v-else-if="activeSection === 'users'">
          <section class="grid gap-4 xl:grid-cols-3">
            <article class="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 class="text-lg font-semibold text-slate-900">Create User</h3>
              <div class="mt-3 grid gap-2">
                <select v-model="createUserForm.orgId" class="rounded-lg border px-3 py-2 text-sm">
                  <option value="">Select organization</option>
                  <option v-for="org in orgs" :key="org.id" :value="org.id">
                    {{ org.org_name }}
                  </option>
                </select>
                <input v-model="createUserForm.fullName" class="rounded-lg border px-3 py-2 text-sm" placeholder="Full name" />
                <input v-model="createUserForm.email" class="rounded-lg border px-3 py-2 text-sm" placeholder="Email / User ID" />
                <input v-model="createUserForm.password" class="rounded-lg border px-3 py-2 text-sm" type="password" placeholder="Password" />
              </div>
              <p class="mt-3 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Security Groups</p>
              <div class="mt-2 flex flex-wrap gap-2">
                <button
                  v-for="group in availableGroups"
                  :key="`create-${group.role_key}`"
                  class="rounded border px-2 py-1 text-xs"
                  :class="createUserForm.roleKeys.includes(group.role_key) ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-300 text-slate-600'"
                  @click="createUserForm.roleKeys = toggleGroup(createUserForm.roleKeys, group.role_key)"
                >
                  {{ group.role_name }}
                </button>
              </div>
              <button
                class="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="loading || !canCreateUser"
                @click="createUser"
              >
                Create User
              </button>
            </article>

            <article class="rounded-2xl border border-slate-200 bg-white p-4 xl:col-span-2">
              <h3 class="text-lg font-semibold text-slate-900">Users and Security Groups</h3>
              <div class="mt-3 overflow-x-auto">
                <table class="min-w-full border-collapse text-sm">
                  <thead>
                    <tr class="border-b border-slate-200 text-left text-xs uppercase tracking-[0.06em] text-slate-500">
                      <th class="py-2 pr-3">User</th>
                      <th class="py-2 pr-3">Org</th>
                      <th class="py-2 pr-3">Groups</th>
                      <th class="py-2 pr-3">Status</th>
                      <th class="py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="user in usersForSelectedOrg.slice(0, 60)" :key="user.id" class="border-b border-slate-100 align-top">
                      <td class="py-2 pr-3">
                        <div class="font-semibold text-slate-900">{{ user.full_name }}</div>
                        <div class="text-xs text-slate-500">{{ user.email }}</div>
                      </td>
                      <td class="py-2 pr-3">{{ user.org_code }}</td>
                      <td class="py-2 pr-3">
                        <div class="flex flex-wrap gap-1">
                          <button
                            v-for="group in availableGroups"
                            :key="`${user.id}-${group.role_key}`"
                            class="rounded border px-2 py-0.5 text-xs"
                            :class="(user.security_groups || []).includes(group.role_key) ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-300 text-slate-600'"
                            @click="user.security_groups = toggleGroup(user.security_groups || [], group.role_key)"
                          >
                            {{ group.role_name }}
                          </button>
                        </div>
                      </td>
                      <td class="py-2 pr-3">
                        <span class="rounded px-2 py-0.5 text-xs font-semibold" :class="user.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'">
                          {{ user.is_active ? 'Active' : 'Inactive' }}
                        </span>
                      </td>
                      <td class="py-2">
                        <div class="flex flex-wrap gap-2">
                          <button
                            class="rounded border border-indigo-300 px-2 py-1 text-xs font-semibold text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                            :disabled="loading || !(user.security_groups || []).length"
                            @click="saveUserGroups(user)"
                          >
                            Save Groups
                          </button>
                          <button
                            class="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                            :disabled="loading"
                            @click="toggleUserStatus(user)"
                          >
                            {{ user.is_active ? 'Deactivate' : 'Activate' }}
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        </template>

        <template v-else-if="activeSection === 'security'">
          <section class="grid gap-4 xl:grid-cols-2">
            <article class="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 class="text-lg font-semibold text-slate-900">Security Policy</h3>
              <p class="mt-1 text-xs text-slate-500">Configure OTP and org-admin reset permissions.</p>
              <div class="mt-3 flex flex-col gap-3 text-sm">
                <label class="inline-flex items-center gap-2">
                  <input v-model="securityPolicyForm.emailOtpRequired" type="checkbox" />
                  Require Email OTP for user login
                </label>
                <label class="inline-flex items-center gap-2">
                  <input v-model="securityPolicyForm.allowOrgAdmin2faReset" type="checkbox" />
                  Allow Org Admin to reset user 2FA
                </label>
              </div>
              <button
                class="mt-3 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="loading || !hasSelectedOrg"
                @click="saveSecurityPolicy"
              >
                Save Security Policy
              </button>
            </article>

            <article class="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 class="text-lg font-semibold text-slate-900">Reset User 2FA</h3>
              <p class="mt-1 text-xs text-slate-500">Force email OTP reset for a selected user.</p>
              <div class="mt-3 grid gap-2">
                <select v-model="twoFaResetForm.userId" class="rounded-lg border px-3 py-2 text-sm">
                  <option value="">Select user</option>
                  <option v-for="user in usersForSelectedOrg" :key="`reset-${user.id}`" :value="user.id">
                    {{ user.full_name }} ({{ user.email }})
                  </option>
                </select>
                <button
                  class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="loading || !canReset2fa"
                  @click="resetUser2fa"
                >
                  Reset 2FA
                </button>
              </div>
            </article>
          </section>
        </template>

        <template v-else-if="activeSection === 'email'">
          <article class="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 class="text-lg font-semibold text-slate-900">Platform Email (OTP)</h3>
            <div class="mt-3 grid gap-2 md:grid-cols-2">
              <input v-model="emailConfigForm.smtpHost" class="rounded-lg border px-3 py-2 text-sm" placeholder="SMTP host" />
              <input v-model.number="emailConfigForm.smtpPort" class="rounded-lg border px-3 py-2 text-sm" type="number" placeholder="Port" />
              <input v-model="emailConfigForm.smtpUsername" class="rounded-lg border px-3 py-2 text-sm" placeholder="SMTP username" />
              <input v-model="emailConfigForm.smtpPassword" class="rounded-lg border px-3 py-2 text-sm" type="password" placeholder="SMTP password (leave blank to keep)" />
              <input v-model="emailConfigForm.smtpFromEmail" class="rounded-lg border px-3 py-2 text-sm" placeholder="From email" />
              <input v-model="emailConfigForm.smtpFromName" class="rounded-lg border px-3 py-2 text-sm" placeholder="From name" />
            </div>
            <div class="mt-3 flex flex-wrap items-center gap-4 text-sm">
              <label class="inline-flex items-center gap-2"><input v-model="emailConfigForm.useTls" type="checkbox" /> Use TLS</label>
              <label class="inline-flex items-center gap-2"><input v-model="emailConfigForm.isActive" type="checkbox" /> Active</label>
            </div>
            <button
              class="mt-3 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="loading"
              @click="saveEmailConfig"
            >
              Save Email Config
            </button>
          </article>
        </template>

        <template v-else-if="activeSection === 'upload'">
          <article class="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 class="text-lg font-semibold text-slate-900">Upload + Viewer Policy</h3>
            <p class="mt-1 text-xs text-slate-500">Selected Org: {{ selectedOrg ? selectedOrg.org_name : 'Select an org from top bar' }}</p>
            <div class="mt-3 grid gap-2">
              <input v-model.number="uploadPolicyForm.maxUploadMb" class="rounded-lg border px-3 py-2 text-sm" type="number" min="1" max="500" placeholder="Max upload MB" />
              <textarea v-model="uploadPolicyForm.allowedExtensionsCsv" class="rounded-lg border px-3 py-2 text-sm" rows="3" placeholder="Allowed extensions (comma separated)"></textarea>
            </div>
            <div class="mt-3 flex flex-wrap gap-4 text-sm">
              <label class="inline-flex items-center gap-2"><input v-model="uploadPolicyForm.viewerDefaultCanDownload" type="checkbox" /> Viewer can download by default</label>
              <label class="inline-flex items-center gap-2"><input v-model="uploadPolicyForm.viewerDownloadRequiresWatermark" type="checkbox" /> Download requires confidential watermark</label>
            </div>
            <button
              class="mt-3 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="loading || !hasSelectedOrg"
              @click="saveUploadPolicy"
            >
              Save Upload Policy
            </button>
          </article>
        </template>

        <template v-else-if="activeSection === 'audit'">
          <article class="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 class="text-lg font-semibold text-slate-900">Login Audit Trail</h3>
            <p class="mt-1 text-xs text-slate-500">Latest user and superadmin login events</p>
            <ul class="mt-3 max-h-[32rem] space-y-2 overflow-auto text-sm">
              <li v-for="event in loginAudit" :key="event.id" class="rounded-lg border border-slate-200 px-3 py-2">
                <p class="font-semibold text-slate-800">
                  {{ event.login_surface }} • {{ event.outcome }} • {{ event.email || 'unknown' }}
                </p>
                <p class="text-xs text-slate-500">
                  {{ event.reason }} • {{ event.ip_address || 'n/a' }} • {{ new Date(event.occurred_at).toLocaleString() }}
                </p>
              </li>
            </ul>
          </article>
        </template>
      </div>
    </section>

    <p v-if="loading" class="text-sm text-slate-600">Loading platform data...</p>
  </section>
</template>
