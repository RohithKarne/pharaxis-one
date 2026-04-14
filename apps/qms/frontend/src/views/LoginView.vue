<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { apiRequest, loginUser, verifyUserOtp } from '../services/api';

const router = useRouter();

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
  <main class="auth-screen">
    <section class="auth-panel">
      <p class="auth-kicker">Pharaxis QMS</p>
      <h1 class="auth-title">User Login</h1>
      <p class="auth-subtitle">Secure access for org users with role-based module control.</p>

      <form class="auth-form" @submit.prevent="submit">
        <template v-if="!otpState.required">
          <label class="auth-label" for="user-id">User ID</label>
          <input id="user-id" v-model="form.userId" class="auth-input" autocomplete="username" />

          <label class="auth-label" for="password">Password</label>
          <input id="password" v-model="form.password" class="auth-input" type="password" autocomplete="current-password" />

          <label class="auth-label" for="org">Organization</label>
          <select id="org" v-model="form.orgCode" class="auth-input" :disabled="orgsLoading">
            <option disabled value="">Select organization</option>
            <option v-for="org in orgOptions" :key="org.orgCode" :value="org.orgCode">
              {{ org.orgName }}
            </option>
          </select>
          <p v-if="orgsLoading" class="text-xs text-slate-500">Loading organizations...</p>
          <p v-if="orgLoadError" class="text-xs text-red-600">{{ orgLoadError }}</p>
        </template>

        <template v-else>
          <label class="auth-label" for="otp">Email OTP</label>
          <input id="otp" v-model="otpState.otp" class="auth-input" maxlength="6" placeholder="Enter 6-digit OTP" />
          <p class="text-xs text-slate-600">OTP has been sent to your registered email.</p>
          <p v-if="otpState.devOtp" class="text-xs text-amber-700">
            Dev OTP: {{ otpState.devOtp }} (visible only in non-production mode)
          </p>
        </template>

        <button class="auth-button" :disabled="loading">
          {{
            loading
              ? 'Processing...'
              : otpState.required
                ? 'Verify OTP and Sign In'
                : 'Sign In to QMS'
          }}
        </button>
        <button
          v-if="otpState.required"
          class="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
          type="button"
          @click="backToCredentials"
        >
          Back
        </button>
      </form>

      <p v-if="error" class="auth-error">{{ error }}</p>
    </section>
  </main>
</template>
