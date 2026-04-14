<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { loginSuperadmin } from '../services/api';

const router = useRouter();

const form = ref({
  userId: 'Superadmin',
  password: 'Manager@123'
});
const loading = ref(false);
const error = ref('');

async function submit() {
  loading.value = true;
  error.value = '';
  try {
    await loginSuperadmin(form.value);
    router.push('/superadmin');
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <main class="auth-screen superadmin-screen">
    <section class="auth-panel superadmin-panel">
      <p class="auth-kicker">Pharaxis Platform Control</p>
      <h1 class="auth-title">Superadmin Login</h1>
      <p class="auth-subtitle">
        Dedicated platform console for organizations, users, security groups, email config, and policies.
      </p>

      <form class="auth-form" @submit.prevent="submit">
        <label class="auth-label" for="sa-user-id">User ID</label>
        <input id="sa-user-id" v-model="form.userId" class="auth-input" autocomplete="username" />

        <label class="auth-label" for="sa-password">Password</label>
        <input id="sa-password" v-model="form.password" class="auth-input" type="password" autocomplete="current-password" />

        <button class="auth-button" :disabled="loading">
          {{ loading ? 'Signing In...' : 'Sign In to Superadmin' }}
        </button>
      </form>

      <p v-if="error" class="auth-error">{{ error }}</p>
    </section>
  </main>
</template>
