import { reactive, computed } from 'vue';
import { getStoredAuth, setStoredAuth, clearStoredAuth, loginUser as apiLoginUser, loginSuperadmin as apiLoginSuperadmin, verifyUserOtp as apiVerifyUserOtp } from '../services/api';

const state = reactive({
  auth: getStoredAuth()
});

if (typeof window !== 'undefined') {
  window.addEventListener('qms-auth-changed', () => {
    state.auth = getStoredAuth();
  });
}

export function useAuthStore() {
  const isAuthenticated = computed(() => Boolean(state.auth && state.auth.user));
  const isSuperadmin = computed(() => Boolean(state.auth?.isSuperadmin));
  const user = computed(() => state.auth?.user || null);
  const roles = computed(() => state.auth?.roles || []);
  const orgCode = computed(() => state.auth?.user?.orgCode || '');
  const orgName = computed(() => state.auth?.user?.orgName || '');

  async function login(credentials) {
    const result = await apiLoginUser(credentials);
    state.auth = getStoredAuth();
    return result;
  }

  async function loginSuperadmin(credentials) {
    const result = await apiLoginSuperadmin(credentials);
    state.auth = getStoredAuth();
    return result;
  }

  async function verifyOtp(payload) {
    const result = await apiVerifyUserOtp(payload);
    state.auth = getStoredAuth();
    return result;
  }

  function logout() {
    clearStoredAuth();
    state.auth = null;
  }

  function hasRole(roleKey) {
    return roles.value.includes(roleKey);
  }

  return {
    state,
    isAuthenticated,
    isSuperadmin,
    user,
    roles,
    orgCode,
    orgName,
    login,
    loginSuperadmin,
    verifyOtp,
    logout,
    hasRole
  };
}
