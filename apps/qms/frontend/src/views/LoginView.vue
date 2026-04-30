<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { apiRequest, loginUser, verifyUserOtp } from '../services/api';

const router = useRouter();
const qmsIconUrl = `${import.meta.env.BASE_URL}qms-icon.svg`;

const form = ref({
  userId: 'admin',
  password: 'Admin@123',
  orgCode: ''
});
const loading = ref(false);
const error = ref('');
const orgsLoading = ref(false);
const orgLoadError = ref('');
const orgOptions = ref([]);
const otpState = ref({
  required: false,
  challengeId: '',
  otp: '',
  devOtp: ''
});

async function loadOrgOptions() {
  orgsLoading.value = true;
  orgLoadError.value = '';
  try {
    const response = await apiRequest('/auth/orgs', { skipAuth: true });
    orgOptions.value = Array.isArray(response.orgs) ? response.orgs : [];
    if (!form.value.orgCode && orgOptions.value.length > 0) {
      const preferred = orgOptions.value.find((org) => org.orgCode === 'PHA_DEV');
      form.value.orgCode = preferred?.orgCode || orgOptions.value[0].orgCode;
    }
  } catch (err) {
    orgLoadError.value = err.message || 'Unable to load organizations';
  } finally {
    orgsLoading.value = false;
  }
}

async function submit() {
  loading.value = true;
  error.value = '';
  try {
    if (!otpState.value.required) {
      const response = await loginUser(form.value);
      if (response.otpRequired) {
        otpState.value.required = true;
        otpState.value.challengeId = response.challengeId;
        otpState.value.devOtp = response.devOtp || '';
      } else {
        router.push('/dashboard');
      }
    } else {
      await verifyUserOtp({
        challengeId: otpState.value.challengeId,
        otp: otpState.value.otp
      });
      router.push('/dashboard');
    }
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

function backToCredentials() {
  otpState.value = {
    required: false,
    challengeId: '',
    otp: '',
    devOtp: ''
  };
  error.value = '';
}

onMounted(loadOrgOptions);
</script>

<template>
  <main class="login-page qms-login-page">
    <section class="login-card qms-login-card">
      <header class="login-card-header qms-login-card-header">
        <div class="qms-login-brand">
          <img :src="qmsIconUrl" alt="QMS" class="qms-login-brand-icon" />
          <p class="app-name">PHARAXIS QMS</p>
        </div>
        <p class="app-tagline">Quality Management System</p>
      </header>

      <section class="login-card-body">
        <h1 class="qms-login-title">Sign In</h1>
        <p class="qms-login-subtitle">
          Access quality modules, workflows, and audit-ready records.
        </p>

        <p v-if="error" class="alert alert-error">{{ error }}</p>

        <form @submit.prevent="submit">
          <template v-if="!otpState.required">
            <div class="form-group">
              <label for="user-id">User ID</label>
              <input id="user-id" v-model="form.userId" class="form-control" autocomplete="username" />
            </div>

            <div class="form-group">
              <label for="password">Password</label>
              <input id="password" v-model="form.password" class="form-control" type="password" autocomplete="current-password" />
            </div>

            <div class="form-group">
              <label for="org">Organization</label>
              <select id="org" v-model="form.orgCode" class="form-control" :disabled="orgsLoading">
                <option disabled value="">Select organization</option>
                <option v-for="org in orgOptions" :key="org.orgCode" :value="org.orgCode">
                  {{ org.orgName }}
                </option>
              </select>
            </div>

            <p v-if="orgsLoading" class="qms-login-hint">Loading organizations...</p>
            <p v-if="orgLoadError" class="qms-login-error-inline">{{ orgLoadError }}</p>
          </template>

          <template v-else>
            <div class="form-group">
              <label for="otp">Email OTP</label>
              <input id="otp" v-model="otpState.otp" class="form-control" maxlength="6" placeholder="Enter 6-digit OTP" />
            </div>
            <p class="qms-login-hint">OTP has been sent to your registered email.</p>
            <p v-if="otpState.devOtp" class="qms-login-otp-dev">
              Dev OTP: {{ otpState.devOtp }} (visible only in non-production mode)
            </p>
          </template>

          <button class="btn btn-primary btn-block mt-8" :disabled="loading" type="submit">
            {{
              loading
                ? 'Processing...'
                : otpState.required
                  ? 'Verify OTP and Sign In'
                  : 'Sign In'
            }}
          </button>

          <button
            v-if="otpState.required"
            class="btn btn-secondary btn-block mt-8"
            type="button"
            @click="backToCredentials"
          >
            Back to Credentials
          </button>
        </form>

        <p class="auth-linkline">
          Superadmin? <RouterLink to="/superadmin/login">Sign in to Platform Console</RouterLink>
        </p>
      </section>
    </section>
  </main>
</template>
