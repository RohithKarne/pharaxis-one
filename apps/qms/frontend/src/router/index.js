import { createRouter, createWebHistory } from 'vue-router';
import DashboardView from '../views/DashboardView.vue';
import DocumentControlView from '../views/DocumentControlView.vue';
import CapaView from '../views/CapaView.vue';
import DeviationView from '../views/DeviationView.vue';
import AuditView from '../views/AuditView.vue';
import ValidationView from '../views/ValidationView.vue';
import SuperadminView from '../views/SuperadminView.vue';

const routes = [
  { path: '/', component: DashboardView },
  { path: '/document-control', component: DocumentControlView },
  { path: '/capa', component: CapaView },
  { path: '/deviations', component: DeviationView },
  { path: '/audits', component: AuditView },
  { path: '/validation', component: ValidationView },
  { path: '/superadmin', component: SuperadminView }
];

export default createRouter({
  history: createWebHistory(),
  routes
});

