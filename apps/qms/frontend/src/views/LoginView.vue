<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { apiRequest, loginSuperadmin, loginUser, verifyUserOtp } from '../services/api';

const router = useRouter();
const qmsIconUrl = `${import.meta.env.BASE_URL}qms-icon.svg`;

const form = ref({
  userId: 'admin',
  password: 'Admin@123',
  orgCode: ''
});
const loginMode = ref('user');
const superadminForm = ref({
  userId: 'Superadmin',
  password: 'Manager@123'
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

async function submitSuperadmin() {
  loading.value = true;
  error.value = '';
  try {
    await loginSuperadmin(superadminForm.value);
    router.push('/superadmin');
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

function switchLoginMode(nextMode) {
  loginMode.value = nextMode;
  error.value = '';
  backToCredentials();
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
  <main :class="['login-page', 'qms-login-page', loginMode === 'superadmin' ? 'qms-login-page-superadmin' : '']">
    <section :class="['login-card', 'qms-login-card', loginMode === 'superadmin' ? 'qms-login-card-superadmin' : '']">
      <header :class="['login-card-header', 'qms-login-card-header', loginMode === 'superadmin' ? 'qms-login-card-header-superadmin' : '']">
        <div class="qms-login-brand">
          <img :src="qmsIconUrl" alt="QMS" class="qms-login-brand-icon" />
          <p class="app-name">PHARAXIS QMS</p>
          <button
            v-if="loginMode === 'user'"
            class="qms-superadmin-switch"
            type="button"
            @click="switchLoginMode('superadmin')"
          >
            Superadmin
          </button>
        </div>
        <p class="app-tagline">{{ loginMode === 'superadmin' ? 'Platform Control' : 'Quality Management System' }}</p>
      </header>

      <section class="login-card-body">
        <h1 class="qms-login-title">{{ loginMode === 'superadmin' ? 'Superadmin Sign In' : 'Sign In' }}</h1>
        <p class="qms-login-subtitle">
          {{
            loginMode === 'superadmin'
              ? 'Manage organizations, users, security groups, and global platform policies.'
              : 'Access quality modules, workflows, and audit-ready records.'
          }}
        </p>

        <p v-if="error" class="alert alert-error">{{ error }}</p>

        <form v-if="loginMode === 'superadmin'" @submit.prevent="submitSuperadmin">
          <div class="form-group">
            <label for="sa-user-id">User ID</label>
            <input id="sa-user-id" v-model="superadminForm.userId" class="form-control" autocomplete="username" />
          </div>

          <div class="form-group">
            <label for="sa-password">Password</label>
            <input id="sa-password" v-model="superadminForm.password" class="form-control" type="password" autocomplete="current-password" />
          </div>

          <button class="btn btn-primary btn-block mt-8" :disabled="loading" type="submit">
            {{ loading ? 'Signing in...' : 'Sign In' }}
          </button>

          <button class="btn btn-secondary btn-block mt-8" :disabled="loading" type="button" @click="switchLoginMode('user')">
            Back to App Login
          </button>
        </form>

        <form v-else @submit.prevent="submit">
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

      </section>
    </section>
  </main>
</template>
