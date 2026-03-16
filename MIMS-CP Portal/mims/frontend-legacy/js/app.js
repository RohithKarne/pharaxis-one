/**
 * app.js — Frontend JavaScript for the Login Page
 *
 * WHAT THIS FILE DOES:
 * - Listens for form submissions (login and register)
 * - Sends the form data to the backend API using the Fetch API
 * - Handles the response: saves the token on success, shows errors on failure
 * - Redirects to the dashboard after successful login
 *
 * KEY CONCEPT — The Fetch API:
 * fetch() is the modern browser way to make HTTP requests to a server
 * without reloading the page. You send a request, await the response,
 * and update the UI accordingly. This is what makes web apps feel fast.
 *
 * KEY CONCEPT — localStorage:
 * After login, the server returns a JWT token. We store it in localStorage
 * so it persists across page refreshes. Every subsequent API request sends
 * this token in the Authorization header to prove the user is logged in.
 */

const API_BASE = '/api'; // All API calls go to the same server

// ─── Tab Switching ─────────────────────────────────────────────
function switchTab(tab) {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const alert = document.getElementById('alert-box');

  // Hide any existing alerts when switching tabs
  hideAlert();

  if (tab === 'login') {
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
  } else {
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
    tabLogin.classList.remove('active');
    tabRegister.classList.add('active');
  }
}

// ─── Alert Helpers ─────────────────────────────────────────────
function showAlert(message, type = 'error') {
  const box = document.getElementById('alert-box');
  box.textContent = message;
  box.className = `alert alert-${type} show`;
}

function hideAlert() {
  const box = document.getElementById('alert-box');
  box.className = 'alert alert-error';
  box.textContent = '';
}

// ─── Login Form Handler ────────────────────────────────────────
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault(); // Stop the browser from reloading the page

  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const btn = document.getElementById('login-btn');

  // Disable button and show loading state
  btn.disabled = true;
  btn.textContent = 'Signing in...';
  hideAlert();

  try {
    // Send POST request to the backend login endpoint
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (!response.ok) {
      // Server returned an error (e.g. wrong password)
      showAlert(data.error || 'Login failed. Please try again.');
      return;
    }

    // ✅ Login successful — save user data and redirect
    localStorage.setItem('mims_token', data.token);
    localStorage.setItem('mims_user', JSON.stringify(data.user));

    // Redirect to the dashboard
    window.location.href = '/pages/dashboard.html';

  } catch (err) {
    // Network error or server is down
    showAlert('Cannot connect to server. Is it running?');
    console.error('Login fetch error:', err);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
});

// ─── Register Form Handler ─────────────────────────────────────
document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const role = document.getElementById('reg-role').value;
  const btn = document.getElementById('register-btn');

  btn.disabled = true;
  btn.textContent = 'Creating account...';
  hideAlert();

  try {
    const response = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, role })
    });

    const data = await response.json();

    if (!response.ok) {
      showAlert(data.error || 'Registration failed. Please try again.');
      return;
    }

    // ✅ Registration successful — switch to login tab with a success message
    showAlert('Account created! Please sign in.', 'success');
    switchTab('login');
    document.getElementById('login-email').value = email;

  } catch (err) {
    showAlert('Cannot connect to server. Is it running?');
    console.error('Register fetch error:', err);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create Account';
  }
});

// ─── Auto-redirect if already logged in ───────────────────────
// If the user already has a valid token, send them straight to the dashboard
(function checkExistingSession() {
  const token = localStorage.getItem('mims_token');
  if (token) {
    window.location.href = '/pages/dashboard.html';
  }
})();
