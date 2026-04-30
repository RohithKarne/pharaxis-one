<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { loginSuperadmin } from '../services/api';

const router = useRouter();
const qmsIconUrl = `${import.meta.env.BASE_URL}qms-icon.svg`;

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
  <main class="login-page qms-login-page qms-login-page-superadmin">
    <section class="login-card qms-login-card qms-login-card-superadmin">
      <header class="login-card-header qms-login-card-header qms-login-card-header-superadmin">
        <div class="qms-login-brand">
          <img :src="qmsIconUrl" alt="QMS" class="qms-login-brand-icon" />
          <p class="app-name">PHARAXIS QMS</p>
        </div>
        <p class="app-tagline">Platform Control</p>
      </header>

      <section class="login-card-body">
        <h1 class="qms-login-title">Superadmin Sign In</h1>
        <p class="qms-login-subtitle">
          Manage organizations, users, security groups, and global platform policies.
        </p>

        <p v-if="error" class="alert alert-error">{{ error }}</p>

        <form @submit.prevent="submit">
          <div class="form-group">
            <label for="sa-user-id">User ID</label>
            <input id="sa-user-id" v-model="form.userId" class="form-control" autocomplete="username" />
          </div>

          <div class="form-group">
            <label for="sa-password">Password</label>
            <input id="sa-password" v-model="form.password" class="form-control" type="password" autocomplete="current-password" />
          </div>

          <button class="btn btn-primary btn-block mt-8" :disabled="loading" type="submit">
            {{ loading ? 'Signing in...' : 'Sign In' }}
          </button>
        </form>

        <p class="auth-linkline">
          Org User? <RouterLink to="/login">Sign in to QMS Workspace</RouterLink>
        </p>
      </section>
    </section>
  </main>
</template>
