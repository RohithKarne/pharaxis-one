import { createRouter, createWebHistory } from 'vue-router';
import DashboardView from '../views/DashboardView.vue';
import DocumentControlView from '../views/DocumentControlView.vue';
import CapaView from '../views/CapaView.vue';
import DeviationView from '../views/DeviationView.vue';
import AuditView from '../views/AuditView.vue';
import ValidationView from '../views/ValidationView.vue';
import ChangeControlView from '../views/ChangeControlView.vue';
import EventHubView from '../views/EventHubView.vue';
import WorkflowInboxView from '../views/WorkflowInboxView.vue';
import NotificationsCenterView from '../views/NotificationsCenterView.vue';
import ComplaintsView from '../views/ComplaintsView.vue';
import NonconformanceView from '../views/NonconformanceView.vue';
import SupplierQualityView from '../views/SupplierQualityView.vue';
import RiskManagementView from '../views/RiskManagementView.vue';
import TrainingManagementView from '../views/TrainingManagementView.vue';
import ManagementReviewView from '../views/ManagementReviewView.vue';
import QualityInsightsView from '../views/QualityInsightsView.vue';
import IntegrationsView from '../views/IntegrationsView.vue';
import SuperadminView from '../views/SuperadminView.vue';
import LoginView from '../views/LoginView.vue';
import SuperadminLoginView from '../views/SuperadminLoginView.vue';
import { clearStoredAuth, getStoredAuth } from '../services/api';
import { canReadModule, normalizeRoles } from '../config/rbac';
import { isFeatureEnabled } from '../config/featureFlags';

const userRouteFallbackOrder = [
  { path: '/dashboard', moduleKey: 'dashboard' },
  { path: '/event-hub', moduleKey: 'eventHub' },
  { path: '/workflow-inbox', moduleKey: 'workflowInbox' },
  { path: '/notifications-center', moduleKey: 'notificationsCenter' },
  { path: '/document-control', moduleKey: 'documentControl' },
  { path: '/capa', moduleKey: 'capa' },
  { path: '/deviations', moduleKey: 'deviations' },
  { path: '/complaints', moduleKey: 'complaints' },
  { path: '/nonconformance', moduleKey: 'nonconformance' },
  { path: '/audits', moduleKey: 'audits' },
  { path: '/validation', moduleKey: 'validation' },
  { path: '/change-control', moduleKey: 'changeControl' },
  { path: '/supplier-quality', moduleKey: 'supplierQuality' },
  { path: '/risk-management', moduleKey: 'riskManagement' },
  { path: '/training-management', moduleKey: 'trainingManagement' },
  { path: '/management-review', moduleKey: 'managementReview' },
  { path: '/quality-insights', moduleKey: 'qualityInsights' },
  { path: '/integrations', moduleKey: 'integrations' }
];

function resolveFirstAccessibleUserPath(auth) {
  const roles = normalizeRoles(auth?.roles || []);
  for (const route of userRouteFallbackOrder) {
    if (route.moduleKey === 'workflowInbox' && !isFeatureEnabled('workflowInbox')) continue;
    if (route.moduleKey === 'notificationsCenter' && !isFeatureEnabled('notificationsCenter')) continue;
    if (canReadModule(route.moduleKey, roles)) return route.path;
  }
  return '/dashboard';
}

function resolveDefaultPath() {
  const auth = getStoredAuth();
  if (!auth?.token) return '/login';
  if (auth.isSuperadmin) return '/superadmin';
  return resolveFirstAccessibleUserPath(auth);
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
    meta: { requiresAuth: true, layout: 'user', moduleKey: 'dashboard' }
  },
  {
    path: '/document-control',
    component: DocumentControlView,
    meta: { requiresAuth: true, layout: 'user', moduleKey: 'documentControl' }
  },
  {
    path: '/capa',
    component: CapaView,
    meta: { requiresAuth: true, layout: 'user', moduleKey: 'capa' }
  },
  {
    path: '/deviations',
    component: DeviationView,
    meta: { requiresAuth: true, layout: 'user', moduleKey: 'deviations' }
  },
  {
    path: '/audits',
    component: AuditView,
    meta: { requiresAuth: true, layout: 'user', moduleKey: 'audits' }
  },
  {
    path: '/validation',
    component: ValidationView,
    meta: { requiresAuth: true, layout: 'user', moduleKey: 'validation' }
  },
  {
    path: '/change-control',
    component: ChangeControlView,
    meta: { requiresAuth: true, layout: 'user', moduleKey: 'changeControl' }
  },
  {
    path: '/event-hub',
    component: EventHubView,
    meta: { requiresAuth: true, layout: 'user', moduleKey: 'eventHub' }
  },
  {
    path: '/workflow-inbox',
    component: WorkflowInboxView,
    meta: { requiresAuth: true, layout: 'user', moduleKey: 'workflowInbox', featureFlag: 'workflowInbox' }
  },
  {
    path: '/notifications-center',
    component: NotificationsCenterView,
    meta: { requiresAuth: true, layout: 'user', moduleKey: 'notificationsCenter', featureFlag: 'notificationsCenter' }
  },
  {
    path: '/complaints',
    component: ComplaintsView,
    meta: { requiresAuth: true, layout: 'user', moduleKey: 'complaints' }
  },
  {
    path: '/nonconformance',
    component: NonconformanceView,
    meta: { requiresAuth: true, layout: 'user', moduleKey: 'nonconformance' }
  },
  {
    path: '/supplier-quality',
    component: SupplierQualityView,
    meta: { requiresAuth: true, layout: 'user', moduleKey: 'supplierQuality' }
  },
  {
    path: '/risk-management',
    component: RiskManagementView,
    meta: { requiresAuth: true, layout: 'user', moduleKey: 'riskManagement' }
  },
  {
    path: '/training-management',
    component: TrainingManagementView,
    meta: { requiresAuth: true, layout: 'user', moduleKey: 'trainingManagement' }
  },
  {
    path: '/management-review',
    component: ManagementReviewView,
    meta: { requiresAuth: true, layout: 'user', moduleKey: 'managementReview' }
  },
  {
    path: '/quality-insights',
    component: QualityInsightsView,
    meta: { requiresAuth: true, layout: 'user', moduleKey: 'qualityInsights' }
  },
  {
    path: '/integrations',
    component: IntegrationsView,
    meta: { requiresAuth: true, layout: 'user', moduleKey: 'integrations' }
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
  const userRoles = normalizeRoles(auth?.roles || []);

  if (to.meta.guestOnly && hasToken) {
    if (to.meta.surface === 'superadmin') {
      if (!auth.isSuperadmin) {
        clearStoredAuth();
        return true;
      }
      return auth.isSuperadmin ? '/superadmin' : resolveFirstAccessibleUserPath(auth);
    }
    return auth.isSuperadmin ? '/superadmin' : resolveFirstAccessibleUserPath(auth);
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
    return resolveFirstAccessibleUserPath(auth);
  }

  if (to.meta.layout === 'user' && hasToken && !auth?.isSuperadmin) {
    const featureFlag = to.meta?.featureFlag;
    if (featureFlag && !isFeatureEnabled(featureFlag)) {
      return resolveFirstAccessibleUserPath(auth);
    }

    const moduleKey = to.meta?.moduleKey;
    if (moduleKey && !canReadModule(moduleKey, userRoles)) {
      const fallbackPath = resolveFirstAccessibleUserPath(auth);
      if (to.path !== fallbackPath) return fallbackPath;
    }
  }

  return true;
});

export default router;
