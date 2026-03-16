/**
 * dashboard.js — JavaScript for the Dashboard Page
 *
 * WHAT THIS FILE DOES:
 * - Checks if the user is logged in (has a valid token in localStorage)
 * - Loads and displays the logged-in user's name and role in the sidebar
 * - Handles sidebar navigation (will load different views as modules are built)
 * - Handles logout
 */

// ─── Auth Guard ────────────────────────────────────────────────
// Runs immediately when the page loads.
// If no token is found, kick the user back to the login page.
(function authGuard() {
  const token = localStorage.getItem('mims_token');
  if (!token) {
    window.location.href = '/index.html';
  }
})();

// ─── Load User Info into Topbar (right side) ──────────────────
(function loadUserInfo() {
  const userJson = localStorage.getItem('mims_user');
  if (!userJson) return;

  const user = JSON.parse(userJson);

  // Build initials from name (e.g. "John Smith" → "JS")
  const initials = (user.name || 'U')
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  // Populate topbar profile elements
  const avatarEl = document.getElementById('topbar-avatar');
  if (avatarEl) avatarEl.textContent = initials;

  const nameEl = document.getElementById('topbar-user-name');
  if (nameEl) nameEl.textContent = user.name || user.email;

  const roleEl = document.getElementById('topbar-user-role');
  if (roleEl) roleEl.textContent = formatRole(user.role);

  // Set welcome message in dashboard body
  const welcomeEl = document.getElementById('welcome-msg');
  if (welcomeEl) {
    const firstName = (user.name || 'there').split(' ')[0];
    welcomeEl.textContent = `Welcome back, ${firstName}!`;
  }
})();

// ─── Set Current Date in Topbar ───────────────────────────────
(function setDate() {
  const dateEl = document.getElementById('current-date');
  if (dateEl) {
    const now = new Date();
    dateEl.textContent = now.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  }
})();

// ─── Sidebar Navigation ────────────────────────────────────────
// `el` is the clicked element — passed via onclick="navigateTo('x', this)"
function navigateTo(section, el) {
  // Remove active from all nav items and sub-nav items
  document.querySelectorAll('.nav-item, .sub-nav-item').forEach(item => item.classList.remove('active'));
  if (el) el.classList.add('active');

  // Update page title in topbar
  const titleEl = document.getElementById('page-title');
  const titles = {
    dashboard:        'Dashboard',
    inbox:            'Inbox',
    'case-query':     'Case Query',
    'unassigned-cases': 'Unassigned Cases',
    'my-cases':       'My Cases',
    'team-cases':     'Team Cases',
    utilities:        'Utilities',
    transmissions:    'Transmissions',
    'browse-content': 'Browse Content',
    analytics:        'Analytics',
    users:            'User Management',
    admin:            'Admin Console'
  };
  if (titleEl) titleEl.textContent = titles[section] || section;

  // Show "coming soon" placeholder for unbuilt sections
  if (section !== 'dashboard') {
    const content = document.getElementById('page-content');
    if (content) {
      content.innerHTML = `
        <div class="card" style="margin-top: 40px; text-align: center; padding: 48px 24px;">
          <div style="font-size: 48px; margin-bottom: 16px;">🚧</div>
          <div style="font-size: 18px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px;">
            ${titles[section] || section} — Coming Soon
          </div>
          <div style="font-size: 13px; color: var(--text-muted); max-width: 400px; margin: 0 auto;">
            This module is part of the next build phase. Check back as we progress through the MIMS roadmap.
          </div>
          <button class="btn btn-outline" onclick="location.reload()" style="margin-top: 16px;">
            ← Back to Dashboard
          </button>
        </div>
      `;
    }
  }
}

// ─── Sub-nav Toggle (Case Management expand/collapse) ──────────
// `el` is the parent nav-item that was clicked
function toggleSubNav(subNavId, el) {
  const subNav = document.getElementById(subNavId);
  if (!subNav) return;

  const isOpen = subNav.classList.contains('open');

  // Close all open sub-navs first
  document.querySelectorAll('.sub-nav.open').forEach(s => s.classList.remove('open'));
  document.querySelectorAll('.nav-item.expanded').forEach(n => n.classList.remove('expanded'));

  // If it was closed, open it now
  if (!isOpen) {
    subNav.classList.add('open');
    if (el) el.classList.add('expanded');
  }
}

// ─── Sidebar Toggle (collapse / expand) ───────────────────────
function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  sidebar.classList.toggle('collapsed');
  // Remember the user's preference across page refreshes
  localStorage.setItem('mims_sidebar_collapsed', sidebar.classList.contains('collapsed'));
}

// ─── Theme Switcher ────────────────────────────────────────────
function setTheme(theme) {
  // Apply the theme by setting a data attribute on the root <html> element
  // CSS then uses [data-theme="dark"] { ... } to swap variables
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('mims_theme', theme);

  // Update active state on the two theme buttons
  document.getElementById('theme-light-btn')?.classList.toggle('active', theme === 'light');
  document.getElementById('theme-dark-btn')?.classList.toggle('active', theme === 'dark');
}

// Runs on page load — restores saved theme and sidebar state
(function loadPreferences() {
  // Theme
  const savedTheme = localStorage.getItem('mims_theme') || 'light';
  setTheme(savedTheme);

  // Sidebar collapsed state
  const isCollapsed = localStorage.getItem('mims_sidebar_collapsed') === 'true';
  if (isCollapsed) {
    document.querySelector('.sidebar')?.classList.add('collapsed');
  }
})();

// ─── Logout ────────────────────────────────────────────────────
function logout() {
  localStorage.removeItem('mims_token');
  localStorage.removeItem('mims_user');
  window.location.href = '/index.html';
}

// ─── Helper: Format role names for display ─────────────────────
function formatRole(role) {
  const labels = {
    admin: 'Administrator',
    agent: 'MI Agent',
    reviewer: 'Reviewer',
    content_manager: 'Content Manager'
  };
  return labels[role] || role;
}
