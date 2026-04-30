<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import { clearStoredAuth, getStoredAuth } from './services/api';
import { canReadModule, normalizeRoles } from './config/rbac';
import { FEATURE_FLAGS } from './config/featureFlags';

const route = useRoute();
const router = useRouter();
const qmsIconUrl = `${import.meta.env.BASE_URL}qms-icon.svg`;
const auth = ref(getStoredAuth());
const selectedGroupKey = ref('overview');
const moduleSearch = ref('');
const utilitySearch = ref('');
const utilitySearchInput = ref(null);

const userNavGroups = [
  {
    key: 'overview',
    label: 'Overview',
    items: [{ to: '/dashboard', label: 'Dashboard', moduleKey: 'dashboard' }]
  },
  {
    key: 'quality_ops',
    label: 'Quality Ops',
    items: [
      { to: '/document-control', label: 'Document Control', moduleKey: 'documentControl' },
      { to: '/capa', label: 'CAPA', moduleKey: 'capa' },
      { to: '/deviations', label: 'Deviation', moduleKey: 'deviations' },
      { to: '/complaints', label: 'Complaints', moduleKey: 'complaints' },
      { to: '/nonconformance', label: 'Nonconformance', moduleKey: 'nonconformance' }
    ]
  },
  {
    key: 'compliance',
    label: 'Compliance',
    items: [
      { to: '/audits', label: 'Audit', moduleKey: 'audits' },
      { to: '/validation', label: 'Validation', moduleKey: 'validation' },
      { to: '/change-control', label: 'Change Control', moduleKey: 'changeControl' },
      { to: '/management-review', label: 'Mgmt Review', moduleKey: 'managementReview' }
    ]
  },
  {
    key: 'risk_partners',
    label: 'Risk & Partners',
    items: [
      { to: '/risk-management', label: 'Risk Management', moduleKey: 'riskManagement' },
      { to: '/supplier-quality', label: 'Supplier Quality', moduleKey: 'supplierQuality' }
    ]
  },
  {
    key: 'workforce',
    label: 'Workforce',
    items: [{ to: '/training-management', label: 'Training Matrix', moduleKey: 'trainingManagement' }]
  },
  {
    key: 'intelligence',
    label: 'Intelligence',
    items: [
      { to: '/event-hub', label: 'Event Hub', moduleKey: 'eventHub' },
      { to: '/workflow-inbox', label: 'Workflow Inbox', moduleKey: 'workflowInbox' },
      { to: '/notifications-center', label: 'Notifications Center', moduleKey: 'notificationsCenter' },
      { to: '/quality-insights', label: 'AI Insights', moduleKey: 'qualityInsights' }
    ]
  },
  {
    key: 'platform',
    label: 'Platform',
    items: [{ to: '/integrations', label: 'Integrations', moduleKey: 'integrations' }]
  }
];

const superadminNavGroups = [
  {
    key: 'superadmin_platform',
    label: 'Platform',
    items: [{ to: '/superadmin', label: 'Platform Console' }]
  }
];

function syncAuth() {
  auth.value = getStoredAuth();
}

const activeLayout = computed(() => route.meta.layout || 'user');
const isAuthLayout = computed(() => activeLayout.value === 'auth');
const isSuperadminLayout = computed(() => activeLayout.value === 'superadmin');
const userRoles = computed(() => normalizeRoles(auth.value?.roles || []));

const visibleUserGroups = computed(() =>
  userNavGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.moduleKey === 'workflowInbox' && !FEATURE_FLAGS.workflowInbox) return false;
        if (item.moduleKey === 'notificationsCenter' && !FEATURE_FLAGS.notificationsCenter) return false;
        return canReadModule(item.moduleKey, userRoles.value);
      })
    }))
    .filter((group) => group.items.length > 0)
);

const navGroups = computed(() => (isSuperadminLayout.value ? superadminNavGroups : visibleUserGroups.value));

const allVisibleItems = computed(() => navGroups.value.flatMap((group) => group.items));
const utilityResults = computed(() => {
  const query = utilitySearch.value.trim().toLowerCase();
  const items = allVisibleItems.value.map((item) => {
    const parentGroup = navGroups.value.find((group) => group.items.some((child) => child.to === item.to));
    return {
      ...item,
      groupLabel: parentGroup?.label || 'Workspace'
    };
  });
  if (!query) return items;
  return items.filter(
    (item) => item.label.toLowerCase().includes(query) || item.groupLabel.toLowerCase().includes(query)
  );
});

function getCurrentGroupKey() {
  const foundGroup = navGroups.value.find((group) =>
    group.items.some((item) => route.path === item.to || route.path.startsWith(`${item.to}/`))
  );
  return foundGroup?.key || navGroups.value[0]?.key || '';
}

const selectedGroup = computed(
  () => navGroups.value.find((group) => group.key === selectedGroupKey.value) || navGroups.value[0] || null
);

const visibleSecondaryItems = computed(() => {
  const query = moduleSearch.value.trim().toLowerCase();
  const groupItems = selectedGroup.value?.items || [];
  if (!query || isSuperadminLayout.value) return groupItems;
  return groupItems.filter((item) => item.label.toLowerCase().includes(query));
});

const activeItem = computed(
  () =>
    allVisibleItems.value.find((item) => route.path === item.to || route.path.startsWith(`${item.to}/`)) || null
);

const appTitle = computed(() => (isSuperadminLayout.value ? 'QMS Superadmin Platform' : 'QMS User Workspace'));
const userName = computed(() => auth.value?.user?.fullName || auth.value?.user?.email || 'QMS User');
const userInitial = computed(() => userName.value.trim().charAt(0).toUpperCase() || 'Q');
const userRoleText = computed(() => {
  if (isSuperadminLayout.value) return 'Superadmin';
  if (userRoles.value.length === 0) return 'No role assigned';
  return userRoles.value.join(', ');
});
const activeGroupLabel = computed(() => selectedGroup.value?.label || 'Workspace');
const activeModuleLabel = computed(() => activeItem.value?.label || appTitle.value);
const breadcrumbLabel = computed(
  () => `${isSuperadminLayout.value ? 'Platform' : 'Home'} / ${activeGroupLabel.value} / ${activeModuleLabel.value}`
);
const todayLabel = computed(() =>
  new Intl.DateTimeFormat('en-US', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date())
);
const dashboardPath = computed(() => allVisibleItems.value.find((item) => item.to === '/dashboard')?.to || '');
const workflowInboxPath = computed(() => allVisibleItems.value.find((item) => item.to === '/workflow-inbox')?.to || '');
const notificationsCenterPath = computed(
  () => allVisibleItems.value.find((item) => item.to === '/notifications-center')?.to || ''
);
const utilitySearchOptions = computed(() =>
  utilityResults.value.map((item) => `${item.label} (${item.groupLabel})`)
);

function selectGroup(groupKey) {
  selectedGroupKey.value = groupKey;
  moduleSearch.value = '';
}

function logout() {
  const target = isSuperadminLayout.value ? '/superadmin/login' : '/login';
  clearStoredAuth();
  router.push(target);
}

function isRouteActive(path) {
  return route.path === path || route.path.startsWith(`${path}/`);
}

function goToRoute(path) {
  if (!path || isRouteActive(path)) return;
  router.push(path);
}

function submitUtilitySearch() {
  const raw = utilitySearch.value.trim();
  if (!raw) return;
  const directMatch = utilityResults.value.find(
    (item) => `${item.label} (${item.groupLabel})`.toLowerCase() === raw.toLowerCase()
  );
  const partialMatch = utilityResults.value.find((item) => item.label.toLowerCase().includes(raw.toLowerCase()));
  const target = directMatch || partialMatch;
  if (target) {
    goToRoute(target.to);
    utilitySearch.value = '';
  }
}

function handleGlobalKeydown(event) {
  if (event.key !== '/') return;
  const targetTag = event.target?.tagName?.toLowerCase();
  if (targetTag === 'input' || targetTag === 'textarea' || targetTag === 'select') return;
  event.preventDefault();
  utilitySearchInput.value?.focus();
}

watch(
  [route, navGroups],
  () => {
    selectedGroupKey.value = getCurrentGroupKey();
  },
  { immediate: true, deep: true }
);

onMounted(() => {
  window.addEventListener('qms-auth-changed', syncAuth);
  window.addEventListener('keydown', handleGlobalKeydown);
});

onUnmounted(() => {
  window.removeEventListener('qms-auth-changed', syncAuth);
  window.removeEventListener('keydown', handleGlobalKeydown);
});
</script>

<template>
  <RouterView v-if="isAuthLayout" />

  <div v-else class="qms-shell qms-shell-top">
    <div class="qms-utility-strip">
      <div class="qms-utility-brand">
        <span class="qms-utility-logo">
          <img :src="qmsIconUrl" alt="QMS" class="qms-utility-logo-mark" />
        </span>
        <span>Pharaxis Quality Vault</span>
      </div>
      <div class="qms-utility-search-wrap">
        <input
          ref="utilitySearchInput"
          v-model="utilitySearch"
          class="qms-utility-search"
          type="search"
          list="qms-module-list"
          placeholder="Jump to module (type CAPA, Audit, Training...)"
          @keydown.enter.prevent="submitUtilitySearch"
        />
        <datalist id="qms-module-list">
          <option v-for="option in utilitySearchOptions" :key="option" :value="option" />
        </datalist>
      </div>
      <div class="qms-utility-actions">
        <button
          v-if="notificationsCenterPath"
          type="button"
          class="qms-utility-action"
          @click="goToRoute(notificationsCenterPath)"
        >
          Notifications
        </button>
        <button
          v-if="workflowInboxPath || dashboardPath"
          type="button"
          class="qms-utility-action"
          @click="goToRoute(workflowInboxPath || dashboardPath)"
        >
          My Tasks
        </button>
        <span class="qms-utility-action qms-utility-date">{{ todayLabel }}</span>
        <span class="qms-utility-avatar">{{ userInitial }}</span>
      </div>
    </div>

    <header class="qms-header-bar">
      <div class="qms-brand-block">
        <p class="qms-brand-kicker">{{ isSuperadminLayout ? 'Platform' : 'Workspace' }}</p>
        <h1 class="qms-brand-title">{{ appTitle }}</h1>
      </div>

      <nav class="qms-primary-nav" aria-label="Primary sections">
        <button
          v-for="group in navGroups"
          :key="group.key"
          type="button"
          class="qms-primary-tab"
          :class="{ 'qms-primary-tab-active': selectedGroupKey === group.key }"
          @click="selectGroup(group.key)"
        >
          {{ group.label }}
        </button>
      </nav>

      <div class="qms-header-actions">
        <div class="qms-user-meta">
          <p class="qms-user-name">{{ userName }}</p>
          <p class="qms-user-roles">{{ userRoleText }}</p>
        </div>
        <button class="qms-logout" @click="logout">Logout</button>
      </div>
    </header>

    <section v-if="visibleSecondaryItems.length > 0" class="qms-subnav-row">
      <nav class="qms-secondary-nav" aria-label="Modules">
        <RouterLink
          v-for="item in visibleSecondaryItems"
          :key="item.to"
          :to="item.to"
          class="qms-secondary-link"
          :class="{ 'qms-secondary-link-active': isRouteActive(item.to) }"
        >
          {{ item.label }}
        </RouterLink>
      </nav>

      <div v-if="!isSuperadminLayout" class="qms-subnav-tools">
        <input
          v-model="moduleSearch"
          class="qms-module-search"
          type="search"
          placeholder="Filter modules in this tab"
        />
      </div>
    </section>

    <main class="qms-main qms-main-top">
      <section class="qms-context-banner">
        <div class="qms-context-copy">
          <p class="qms-context-kicker">{{ activeGroupLabel }}</p>
          <h2 class="qms-context-title">{{ activeModuleLabel }}</h2>
          <p class="qms-context-breadcrumb">{{ breadcrumbLabel }}</p>
        </div>
        <div class="qms-context-meta">
          <span class="qms-context-badge">Lifecycle Active</span>
          <span class="qms-context-date">{{ todayLabel }}</span>
        </div>
      </section>

      <section class="qms-content">
        <RouterView />
      </section>
    </main>
  </div>
</template>
