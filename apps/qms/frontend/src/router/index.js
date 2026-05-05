import { createRouter, createWebHistory } from 'vue-router';
import DashboardView from '../modules/core/pages/DashboardView.vue';
import DocumentControlView from '../modules/quality/pages/DocumentControlView.vue';
import CapaView from '../modules/quality/pages/CapaView.vue';
import CapaDetailView from '../modules/quality/pages/CapaDetailView.vue';
import DeviationView from '../modules/quality/pages/DeviationView.vue';
import DeviationDetailView from '../modules/quality/pages/DeviationDetailView.vue';
import AuditView from '../modules/quality/pages/AuditView.vue';
import AuditDetailView from '../modules/quality/pages/AuditDetailView.vue';
import ValidationView from '../modules/quality/pages/ValidationView.vue';
import ValidationDetailView from '../modules/quality/pages/ValidationDetailView.vue';
import ChangeControlView from '../modules/quality/pages/ChangeControlView.vue';
import ChangeControlDetailView from '../modules/quality/pages/ChangeControlDetailView.vue';
import EventHubView from '../modules/platform/pages/EventHubView.vue';
import WorkflowInboxView from '../modules/platform/pages/WorkflowInboxView.vue';
import NotificationsCenterView from '../modules/platform/pages/NotificationsCenterView.vue';
import ComplaintsView from '../modules/quality/pages/ComplaintsView.vue';
import ComplaintsDetailView from '../modules/quality/pages/ComplaintsDetailView.vue';
import NonconformanceView from '../modules/quality/pages/NonconformanceView.vue';
import NonconformanceDetailView from '../modules/quality/pages/NonconformanceDetailView.vue';
import SupplierQualityView from '../modules/quality/pages/SupplierQualityView.vue';
import SupplierQualityDetailView from '../modules/quality/pages/SupplierQualityDetailView.vue';
import DocumentControlDetailView from '../modules/quality/pages/DocumentControlDetailView.vue';
import RiskManagementView from '../modules/quality/pages/RiskManagementView.vue';
import TrainingManagementView from '../modules/quality/pages/TrainingManagementView.vue';
import ManagementReviewView from '../modules/quality/pages/ManagementReviewView.vue';
import QualityInsightsView from '../modules/platform/pages/QualityInsightsView.vue';
import IntegrationsView from '../modules/platform/pages/IntegrationsView.vue';
import SuperadminView from '../modules/superadmin/pages/SuperadminView.vue';
import LoginView from '../modules/auth/pages/LoginView.vue';
import SuperadminLoginView from '../modules/auth/pages/SuperadminLoginView.vue';
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
  if (!auth) return '/login';
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
    path: '/document-control/:id',
    component: DocumentControlDetailView,
    meta: { requiresAuth: true, layout: 'user', moduleKey: 'documentControl' }
  },
  {
    path: '/capa',
    component: CapaView,
    meta: { requiresAuth: true, layout: 'user', moduleKey: 'capa' }
  },
  {
    path: '/capa/:id',
    component: CapaDetailView,
    meta: { requiresAuth: true, layout: 'user', moduleKey: 'capa' }
  },
  {
    path: '/deviations',
    component: DeviationView,
    meta: { requiresAuth: true, layout: 'user', moduleKey: 'deviations' }
  },
  {
    path: '/deviations/:id',
    component: DeviationDetailView,
    meta: { requiresAuth: true, layout: 'user', moduleKey: 'deviations' }
  },
  {
    path: '/audits',
    component: AuditView,
    meta: { requiresAuth: true, layout: 'user', moduleKey: 'audits' }
  },
  {
    path: '/audits/:id',
    component: AuditDetailView,
    meta: { requiresAuth: true, layout: 'user', moduleKey: 'audits' }
  },
  {
    path: '/validation',
    component: ValidationView,
    meta: { requiresAuth: true, layout: 'user', moduleKey: 'validation' }
  },
  {
    path: '/validation/:id',
    component: ValidationDetailView,
    meta: { requiresAuth: true, layout: 'user', moduleKey: 'validation' }
  },
  {
    path: '/change-control',
    component: ChangeControlView,
    meta: { requiresAuth: true, layout: 'user', moduleKey: 'changeControl' }
  },
  {
    path: '/change-control/:id',
    component: ChangeControlDetailView,
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
    path: '/complaints/:id',
    component: ComplaintsDetailView,
    meta: { requiresAuth: true, layout: 'user', moduleKey: 'complaints' }
  },
  {
    path: '/nonconformance',
    component: NonconformanceView,
    meta: { requiresAuth: true, layout: 'user', moduleKey: 'nonconformance' }
  },
  {
    path: '/nonconformance/:id',
    component: NonconformanceDetailView,
    meta: { requiresAuth: true, layout: 'user', moduleKey: 'nonconformance' }
  },
  {
    path: '/supplier-quality',
    component: SupplierQualityView,
    meta: { requiresAuth: true, layout: 'user', moduleKey: 'supplierQuality' }
  },
  {
    path: '/supplier-quality/:id',
    component: SupplierQualityDetailView,
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
  const hasSession = Boolean(auth);
  const userRoles = normalizeRoles(auth?.roles || []);

  if (to.meta.guestOnly && hasSession) {
    if (to.meta.surface === 'superadmin') {
      if (!auth.isSuperadmin) {
        clearStoredAuth();
        return true;
      }
      return auth.isSuperadmin ? '/superadmin' : resolveFirstAccessibleUserPath(auth);
    }
    return auth.isSuperadmin ? '/superadmin' : resolveFirstAccessibleUserPath(auth);
  }

  if (to.meta.requiresAuth && !hasSession) {
    return to.meta.requiresSuperadmin ? '/superadmin/login' : '/login';
  }

  if (to.meta.requiresSuperadmin && !auth?.isSuperadmin) {
    return '/login';
  }

  if (to.meta.layout === 'user' && auth?.isSuperadmin) {
    return '/superadmin';
  }

  if (to.meta.layout === 'superadmin' && hasSession && !auth?.isSuperadmin) {
    return resolveFirstAccessibleUserPath(auth);
  }

  if (to.meta.layout === 'user' && hasSession && !auth?.isSuperadmin) {
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
