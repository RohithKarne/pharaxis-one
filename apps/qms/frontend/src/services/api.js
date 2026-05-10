import { describeRequiredRoles, hasAnyRole, normalizeRoles } from '../config/rbac';
import { findClientRbacRule } from '../config/apiRbacRules';
import { FEATURE_FLAGS } from '../config/featureFlags';

const RUNTIME_DEFAULT_API_BASE =
  typeof window === 'undefined'
    ? 'http://127.0.0.1:3145/api/v1'
    : `${window.location.protocol}//${window.location.hostname}:3145/api/v1`;
const API_BASE = import.meta.env.VITE_QMS_API_BASE || RUNTIME_DEFAULT_API_BASE;
const AUTH_STORAGE_KEY = 'qms_auth_session';
const GET_CACHE_TTL_MS = Number(import.meta.env.VITE_QMS_GET_CACHE_TTL_MS || 15000);
const getCache = new Map();

function emitAuthChanged() {
  window.dispatchEvent(new CustomEvent('qms-auth-changed'));
}

function parseStoredAuth(rawValue) {
  if (!rawValue) return null;
  try {
    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getStoredAuth() {
  return parseStoredAuth(localStorage.getItem(AUTH_STORAGE_KEY));
}

function getAuthCacheScope() {
  const auth = getStoredAuth();
  const user = auth?.user || {};
  return String(user.id || user.userId || user.email || auth?.surface || 'anon');
}

function assertClientSidePermission(path, method) {
  const rule = findClientRbacRule(path, method);
  if (!rule) return;

  const userRoles = normalizeRoles(getStoredAuth()?.roles || []);
  if (hasAnyRole(userRoles, rule.roles)) return;

  const error = new Error(
    `You do not have permission for this action. Required role: ${describeRequiredRoles(rule.roles)}.`
  );
  error.status = 403;
  throw error;
}

export function setStoredAuth(auth) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
  emitAuthChanged();
}

export function clearStoredAuth() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  emitAuthChanged();
}

function makeAuthSession(payload, surface) {
  const securityGroups = Array.isArray(payload?.user?.securityGroups) ? payload.user.securityGroups : [];
  return {
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
  const method = options.method || 'GET';

  if (!options.skipAuth) {
    assertClientSidePermission(path, method);
  }

  const cacheKey = `${method}:${path}:${getAuthCacheScope()}`;
  const skipCache = options.forceRefresh || options.skipCache || !FEATURE_FLAGS.apiGetCache;
  if (method === 'GET' && !skipCache) {
    const cached = getCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.payload;
    }
  }

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    credentials: 'include',
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

  if (method === 'GET' && !skipCache) {
    const ttl = Number(options.cacheTtlMs || GET_CACHE_TTL_MS);
    getCache.set(cacheKey, {
      payload,
      expiresAt: Date.now() + Math.max(1000, ttl)
    });
  } else if (method !== 'GET') {
    getCache.clear();
  }

  return payload;
}
