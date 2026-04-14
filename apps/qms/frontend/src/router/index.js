import { createRouter, createWebHistory } from 'vue-router';
import DashboardView from '../views/DashboardView.vue';
import DocumentControlView from '../views/DocumentControlView.vue';
import CapaView from '../views/CapaView.vue';
import DeviationView from '../views/DeviationView.vue';
import AuditView from '../views/AuditView.vue';
import ValidationView from '../views/ValidationView.vue';
import ChangeControlView from '../views/ChangeControlView.vue';
import SuperadminView from '../views/SuperadminView.vue';
import LoginView from '../views/LoginView.vue';
import SuperadminLoginView from '../views/SuperadminLoginView.vue';
import { clearStoredAuth, getStoredAuth } from '../services/api';

function resolveDefaultPath() {
  const auth = getStoredAuth();
  if (!auth?.token) return '/login';
  if (auth.isSuperadmin) return '/superadmin';
  return '/dashboard';
}

const routes = [
  {
    path: '/',
    redirect: () => resolveDefaultPath()
  },
  {
    path: '/login',
    component: LoginView,
    meta: { layout: 'auth', guestOnly: true, surface: 'user' }
  },
  {
    path: '/superadmin/login',
    alias: '/login/superadmin',
    component: SuperadminLoginView,
    meta: { layout: 'auth', guestOnly: true, surface: 'superadmin' }
  },
  {
    path: '/dashboard',
    component: DashboardView,
    meta: { requiresAuth: true, layout: 'user' }
  },
  {
    path: '/document-control',
    component: DocumentControlView,
    meta: { requiresAuth: true, layout: 'user' }
  },
  {
    path: '/capa',
    component: CapaView,
    meta: { requiresAuth: true, layout: 'user' }
  },
  {
    path: '/deviations',
    component: DeviationView,
    meta: { requiresAuth: true, layout: 'user' }
  },
  {
    path: '/audits',
    component: AuditView,
    meta: { requiresAuth: true, layout: 'user' }
  },
  {
    path: '/validation',
    component: ValidationView,
    meta: { requiresAuth: true, layout: 'user' }
  },
  {
    path: '/change-control',
    component: ChangeControlView,
    meta: { requiresAuth: true, layout: 'user' }
  },
  {
    path: '/superadmin',
    component: SuperadminView,
    meta: { requiresAuth: true, requiresSuperadmin: true, layout: 'superadmin' }
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: () => resolveDefaultPath()
  }
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
});

router.beforeEach((to) => {
  const auth = getStoredAuth();
  const hasToken = Boolean(auth?.token);

  if (to.meta.guestOnly && hasToken) {
    if (to.meta.surface === 'superadmin') {
      if (!auth.isSuperadmin) {
        clearStoredAuth();
        return true;
      }
      return auth.isSuperadmin ? '/superadmin' : '/dashboard';
    }
    return auth.isSuperadmin ? '/superadmin' : '/dashboard';
  }

  if (to.meta.requiresAuth && !hasToken) {
    return to.meta.requiresSuperadmin ? '/superadmin/login' : '/login';
  }

  if (to.meta.requiresSuperadmin && !auth?.isSuperadmin) {
    return '/login';
  }

  if (to.meta.layout === 'user' && auth?.isSuperadmin) {
    return '/superadmin';
  }

  if (to.meta.layout === 'superadmin' && hasToken && !auth?.isSuperadmin) {
    return '/dashboard';
  }

  return true;
});

export default router;
