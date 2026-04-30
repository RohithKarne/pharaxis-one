const env =
  (typeof import.meta !== 'undefined' && import.meta.env)
    ? import.meta.env
    : (typeof process !== 'undefined' ? process.env : {});

function flag(name, fallback = true) {
  const raw = env[name];
  if (raw === undefined || raw === null || raw === '') return fallback;
  const normalized = String(raw).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

export const FEATURE_FLAGS = {
  workflowInbox: flag('VITE_FEATURE_WORKFLOW_INBOX', true),
  notificationsCenter: flag('VITE_FEATURE_NOTIFICATIONS_CENTER', true),
  collaborationPanel: flag('VITE_FEATURE_COLLAB_PANEL', true),
  apiGetCache: flag('VITE_FEATURE_API_GET_CACHE', true)
};

export function isFeatureEnabled(flagKey) {
  return Boolean(FEATURE_FLAGS[flagKey]);
}
