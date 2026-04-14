<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import { clearStoredAuth, getStoredAuth } from './services/api';

const route = useRoute();
const router = useRouter();
const auth = ref(getStoredAuth());

const userNavItems = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/document-control', label: 'Document Control' },
  { to: '/capa', label: 'CAPA' },
  { to: '/deviations', label: 'Deviation' },
  { to: '/audits', label: 'Audit' },
  { to: '/validation', label: 'Validation' },
  { to: '/change-control', label: 'Change Control' }
];

const superadminNavItems = [{ to: '/superadmin', label: 'Platform Console' }];

function syncAuth() {
  auth.value = getStoredAuth();
}

const activeLayout = computed(() => route.meta.layout || 'user');
const isAuthLayout = computed(() => activeLayout.value === 'auth');
const isSuperadminLayout = computed(() => activeLayout.value === 'superadmin');
const navItems = computed(() => (isSuperadminLayout.value ? superadminNavItems : userNavItems));
const appTitle = computed(() =>
  isSuperadminLayout.value ? 'QMS Superadmin Platform' : 'QMS User Workspace'
);
const userName = computed(() => auth.value?.user?.fullName || auth.value?.user?.email || 'QMS User');

function logout() {
  const target = isSuperadminLayout.value ? '/superadmin/login' : '/login';
  clearStoredAuth();
  router.push(target);
}

onMounted(() => {
  window.addEventListener('qms-auth-changed', syncAuth);
});

onUnmounted(() => {
  window.removeEventListener('qms-auth-changed', syncAuth);
});
</script>

<template>
  <RouterView v-if="isAuthLayout" />

  <div v-else class="qms-shell">
    <aside class="qms-sidebar" :class="{ 'qms-sidebar-super': isSuperadminLayout }">
      <p class="qms-sidebar-kicker">{{ isSuperadminLayout ? 'Platform' : 'Workspace' }}</p>
      <h1 class="qms-sidebar-title">{{ appTitle }}</h1>
      <p class="qms-sidebar-subtitle">
        {{ isSuperadminLayout ? 'Org controls, users, audit and platform settings' : 'Quality modules and operational actions' }}
      </p>

      <nav class="qms-sidebar-nav">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="qms-nav-link"
          :class="{ 'qms-nav-link-active': route.path === item.to }"
        >
          {{ item.label }}
        </RouterLink>
      </nav>
    </aside>

    <section class="qms-main">
      <header class="qms-topbar">
        <div>
          <p class="qms-topbar-title">{{ appTitle }}</p>
          <p class="qms-topbar-subtitle">
            Logged in as {{ userName }}
          </p>
        </div>
        <button class="qms-logout" @click="logout">Logout</button>
      </header>

      <main class="qms-content">
        <RouterView />
      </main>
    </section>
  </div>
</template>
