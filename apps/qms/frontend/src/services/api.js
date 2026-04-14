const API_BASE = import.meta.env.VITE_QMS_API_BASE || 'http://127.0.0.1:3145/api';
const AUTH_STORAGE_KEY = 'qms_auth_session';
const LEGACY_TOKEN_KEY = 'qms_access_token';

function emitAuthChanged() {
  window.dispatchEvent(new CustomEvent('qms-auth-changed'));
}

function parseStoredAuth(rawValue) {
  if (!rawValue) return null;
  try {
    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.token || typeof parsed.token !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getStoredAuth() {
  const stored = parseStoredAuth(localStorage.getItem(AUTH_STORAGE_KEY));
  if (stored) return stored;

  const legacyToken = localStorage.getItem(LEGACY_TOKEN_KEY);
  if (!legacyToken) return null;
  return {
    token: legacyToken,
    surface: 'user',
    isSuperadmin: false,
    roles: [],
    user: null
  };
}

export function getStoredToken() {
  return getStoredAuth()?.token || '';
}

export function setStoredAuth(auth) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
  if (auth?.token) {
    localStorage.setItem(LEGACY_TOKEN_KEY, auth.token);
  }
  emitAuthChanged();
}

export function clearStoredAuth() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  emitAuthChanged();
}

function makeAuthSession(payload, surface) {
  const securityGroups = Array.isArray(payload?.user?.securityGroups) ? payload.user.securityGroups : [];
  return {
    token: payload.accessToken,
    surface,
    isSuperadmin: securityGroups.includes('superadmin') || surface === 'superadmin',
    roles: securityGroups,
    user: payload.user || null
  };
}

export async function loginUser(payload) {
  const response = await apiRequest('/auth/login', {
    method: 'POST',
    body: payload,
    skipAuth: true
  });
  if (response.accessToken) {
    setStoredAuth(makeAuthSession(response, 'user'));
  }
  return response;
}

export async function verifyUserOtp(payload) {
  const response = await apiRequest('/auth/login/verify-otp', {
    method: 'POST',
    body: payload,
    skipAuth: true
  });
  if (response.accessToken) {
    setStoredAuth(makeAuthSession(response, 'user'));
  }
  return response;
}

export async function loginSuperadmin(payload) {
  const response = await apiRequest('/auth/superadmin/login', {
    method: 'POST',
    body: payload,
    skipAuth: true
  });
  setStoredAuth(makeAuthSession(response, 'superadmin'));
  return response;
}

export async function apiRequest(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (!options.skipAuth) {
    const token = getStoredToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }

  if (!response.ok) {
    const error = new Error(payload.error || 'API request failed');
    error.status = response.status;
    throw error;
  }

  return payload;
}
