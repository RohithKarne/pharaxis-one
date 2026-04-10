const API_BASE = import.meta.env.VITE_QMS_API_BASE || 'http://127.0.0.1:3145/api';

export function getStoredToken() {
  return localStorage.getItem('qms_access_token') || '';
}

export function setStoredToken(token) {
  localStorage.setItem('qms_access_token', token);
}

export async function apiRequest(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const token = getStoredToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
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

