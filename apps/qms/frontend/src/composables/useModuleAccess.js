import { computed, onMounted, onUnmounted, ref } from 'vue';
import { MODULE_ACCESS, describeRequiredRoles, hasAnyRole, normalizeRoles } from '../config/rbac';
import { getStoredAuth } from '../services/api';

export function useModuleAccess(moduleKey) {
  const auth = ref(getStoredAuth());

  function syncAuth() {
    auth.value = getStoredAuth();
  }

  const roles = computed(() => normalizeRoles(auth.value?.roles || []));
  const moduleConfig = computed(() => MODULE_ACCESS[moduleKey] || null);
  const isWriteDisabled = computed(() => !hasAnyRole(roles.value, moduleConfig.value?.writeRoles || []));
  const writeDisabledReason = computed(() => {
    const label = moduleConfig.value?.label || 'This module';
    return `${label} is read-only for your current role.`;
  });

  function hasRoles(requiredRoles = []) {
    return hasAnyRole(roles.value, requiredRoles);
  }

  function withRoles(requiredRoles, setMessage, fallbackMessage = 'You do not have permission for this action.') {
    if (hasRoles(requiredRoles)) return true;
    if (typeof setMessage === 'function') {
      setMessage(`${fallbackMessage} Required role: ${describeRequiredRoles(requiredRoles)}.`);
    }
    return false;
  }

  function withWriteAccess(setMessage) {
    return withRoles(moduleConfig.value?.writeRoles || [], setMessage);
  }

  onMounted(() => {
    window.addEventListener('qms-auth-changed', syncAuth);
  });

  onUnmounted(() => {
    window.removeEventListener('qms-auth-changed', syncAuth);
  });

  return {
    roles,
    isWriteDisabled,
    writeDisabledReason,
    hasRoles,
    withRoles,
    withWriteAccess
  };
}
