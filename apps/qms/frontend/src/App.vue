<script setup>
import { ref } from 'vue';
import { RouterLink, RouterView } from 'vue-router';
import { apiRequest, setStoredToken, getStoredToken } from './services/api';

const login = ref({
  email: 'admin@pharaxis.local',
  password: 'Admin@123',
  orgCode: 'PHA_DEV'
});
const loginState = ref(getStoredToken() ? 'Token loaded from browser storage' : 'Not authenticated');
const loginError = ref('');

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/document-control', label: 'Document Control' },
  { to: '/capa', label: 'CAPA' },
  { to: '/deviations', label: 'Deviation' },
  { to: '/audits', label: 'Audit' },
  { to: '/validation', label: 'Validation' },
  { to: '/superadmin', label: 'Superadmin' }
];

async function runLogin() {
  loginError.value = '';
  try {
    const payload = await apiRequest('/auth/login', {
      method: 'POST',
      body: {
        email: login.value.email,
        password: login.value.password,
        orgCode: login.value.orgCode
      }
    });
    setStoredToken(payload.accessToken);
    loginState.value = `Logged in as ${payload.user.email}`;
  } catch (error) {
    loginError.value = error.message;
  }
}
</script>

<template>
  <div class="min-h-screen px-4 py-6 md:px-8">
    <div class="mx-auto max-w-7xl rounded-3xl border border-white/70 bg-white/85 p-5 shadow-aura backdrop-blur">
      <header class="mb-6 grid gap-4 rounded-2xl border border-teal-100 bg-gradient-to-r from-teal-950 to-qms-teal p-5 text-white lg:grid-cols-[1.25fr_1fr]">
        <div>
          <p class="text-xs uppercase tracking-[0.2em] text-teal-100">Pharaxis Quality Management Suite</p>
          <h1 class="mt-2 text-2xl font-bold md:text-3xl">Sprint 1 Multi-Module Build Workspace</h1>
          <p class="mt-2 text-sm text-teal-50">
            Live module workspace for Document Control, CAPA, Deviation, Audit Binder, Validation, and Superadmin control.
          </p>
          <p class="mt-3 text-xs text-teal-100">Auth status: {{ loginState }}</p>
          <p v-if="loginError" class="mt-1 text-xs text-amber-200">{{ loginError }}</p>
        </div>
        <form class="rounded-2xl bg-white/10 p-4 backdrop-blur" @submit.prevent="runLogin">
          <p class="mb-2 text-xs uppercase tracking-wider text-teal-100">Quick Login</p>
          <input v-model="login.email" class="mb-2 w-full rounded-lg border border-white/25 bg-white/15 px-3 py-2 text-sm text-white placeholder:text-white/60" placeholder="email" />
          <input v-model="login.password" class="mb-2 w-full rounded-lg border border-white/25 bg-white/15 px-3 py-2 text-sm text-white placeholder:text-white/60" type="password" placeholder="password" />
          <input v-model="login.orgCode" class="mb-3 w-full rounded-lg border border-white/25 bg-white/15 px-3 py-2 text-sm text-white placeholder:text-white/60" placeholder="org code" />
          <button class="w-full rounded-lg bg-amber-300 px-3 py-2 text-sm font-bold text-slate-900">Login and Store Token</button>
        </form>
      </header>

      <nav class="mb-6 flex flex-wrap gap-2">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800 transition hover:bg-teal-100"
        >
          {{ item.label }}
        </RouterLink>
      </nav>

      <RouterView />
    </div>
  </div>
</template>

