import { lazy, Suspense } from 'react'
import { findSystemLabel } from '../configItems'
import { useAuth } from '../../../../shared/context/AuthContext'
const AdminQASection = lazy(() => import('../../../admin/components/AdminQASection'))
const AdminUATPanel = lazy(() => import('../../../admin/components/AdminUATPanel'))
const CopyDivision = lazy(() => import('./CopyDivision'))
const DivisionParameters = lazy(() => import('./DivisionParameters'))
const CustomizeForms = lazy(() => import('./CustomizeForms'))
const ExceptionLog = lazy(() => import('./ExceptionLog'))
const FeatureFlags = lazy(() => import('./FeatureFlags'))
const SmartFields = lazy(() => import('./SmartFields'))
const ValidationRules = lazy(() => import('./ValidationRules'))
const GridTemplates = lazy(() => import('./GridTemplates'))
const CaseActionsAdmin = lazy(() => import('./CaseActionsAdmin'))
const ComplianceAdmin = lazy(() => import('./ComplianceAdmin'))
// Sprint 2 Week 1 admin surfaces
const DocumentTypesAdmin = lazy(() => import('./DocumentTypesAdmin'))
const ComplaintCodesAdmin = lazy(() => import('./ComplaintCodesAdmin'))
const LotMasterAdmin = lazy(() => import('./LotMasterAdmin'))
const FieldActionsAdmin = lazy(() => import('./FieldActionsAdmin'))
const CapaAdmin = lazy(() => import('./CapaAdmin'))
const PiiRedactionRules = lazy(() => import('./PiiRedactionRules'))
// import GroupSecurity from './GroupSecurity' // legacy nav-key version — kept on disk for rollback
const CapabilityGroupSecurity = lazy(() => import('./CapabilityGroupSecurity'))
const LoggedInUsers = lazy(() => import('./LoggedInUsers'))
const ReportsAccess = lazy(() => import('./ReportsAccess'))
const SetupAlerts = lazy(() => import('./SetupAlerts'))
const SetupAuthPolicy = lazy(() => import('./SetupAuthPolicy'))
const SetupChangeApprovals = lazy(() => import('./SetupChangeApprovals'))
const SetupEmailAccounts = lazy(() => import('./SetupEmailAccounts'))
const SetupIntegrations = lazy(() => import('./SetupIntegrations'))
const SetupWorkflowEngine = lazy(() => import('./SetupWorkflowEngine'))
const SetupTwoFactor = lazy(() => import('./SetupTwoFactor'))
const SetupWorkflow = lazy(() => import('./SetupWorkflow'))
const AiConfig = lazy(() => import('./AiConfig'))
const DeveloperApiAdmin = lazy(() => import('./DeveloperApiAdmin'))
const SystemParameters = lazy(() => import('./SystemParameters'))
const Users = lazy(() => import('./Users'))
const ViewData = lazy(() => import('./ViewData'))
const DPPRPage = lazy(() => import('../../../admin/pages/DPPRPage'))
const RegressionPage = lazy(() => import('../../../regression/pages/RegressionPage'))

function SystemSectionLoader() {
  return (
    <div style={{ minHeight: 240, display: 'grid', placeItems: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
      Loading system tool...
    </div>
  )
}

export default function System({ selectedItem, auditItem = 'admin', onAuditSelect }) {
  const { token } = useAuth()
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  const tool = (
    selectedItem === 'sys-maint-copy-division' ? <CopyDivision />
    : selectedItem === 'sys-division-params' ? <DivisionParameters H={H} />
    : selectedItem === 'sys-setup-customize-forms' ? <CustomizeForms />
    : selectedItem === 'sys-exception-log' ? <ExceptionLog />
    : selectedItem === 'sys-sec-group' ? <CapabilityGroupSecurity />
    : selectedItem === 'sys-sec-logged-in' ? <LoggedInUsers />
    : selectedItem === 'sys-sec-users' ? <Users />
    : selectedItem === 'sys-sec-auth-policy' ? <SetupAuthPolicy />
    : selectedItem === 'sys-setup-2fa-config' ? <SetupTwoFactor />
    : selectedItem === 'sys-setup-alerts' ? <SetupAlerts />
    : selectedItem === 'sys-setup-workflow' ? <SetupWorkflow />
    : selectedItem === 'sys-setup-workflow-engine' ? <SetupWorkflowEngine />
    : selectedItem === 'sys-setup-ai-config' ? <AiConfig />
    : selectedItem === 'sys-setup-developer-api' ? <DeveloperApiAdmin />
    : selectedItem === 'sys-setup-email-accounts' ? <SetupEmailAccounts />
    : selectedItem === 'sys-setup-change-approvals' ? <SetupChangeApprovals />
    : selectedItem === 'sys-setup-feature-flags' ? <FeatureFlags />
    : selectedItem === 'sys-setup-smart-fields' ? <SmartFields />
    : selectedItem === 'sys-setup-validation' ? <ValidationRules />
    : selectedItem === 'sys-setup-grid-templates' ? <GridTemplates />
    : selectedItem === 'sys-setup-case-actions' ? <CaseActionsAdmin />
    : selectedItem === 'sys-setup-compliance' ? <ComplianceAdmin />
    : selectedItem === 'sys-setup-document-types' ? <DocumentTypesAdmin />
    : selectedItem === 'sys-setup-complaint-codes' ? <ComplaintCodesAdmin />
    : selectedItem === 'sys-setup-lot-master' ? <LotMasterAdmin />
    : selectedItem === 'sys-setup-field-actions' ? <FieldActionsAdmin />
    : selectedItem === 'sys-setup-capa' ? <CapaAdmin />
    : selectedItem === 'sys-setup-pii-redaction' ? <PiiRedactionRules />
    : selectedItem === 'sys-setup-data-protect' ? <DPPRPage embedded />
    : selectedItem?.startsWith('sys-setup-int-') ? <SetupIntegrations selectedItem={selectedItem} />
    : selectedItem === 'sys-system-params' ? <SystemParameters />
    : selectedItem === 'sys-reports-access' ? <ReportsAccess />
    : selectedItem === 'sys-view-data' ? <ViewData selectedItem={auditItem} onSelect={onAuditSelect} />
    : selectedItem === 'sys-uat-bugs' ? <AdminUATPanel initialTab="bugs" />
    : selectedItem === 'sys-uat-features' ? <AdminUATPanel initialTab="features" />
    : selectedItem === 'sys-uat-regression' ? <RegressionPage embedded />
    : selectedItem === 'sys-ai-qa-reports' ? <AdminQASection contentSection="qa-reports" H={H} />
    : selectedItem === 'sys-ai-qa-rules' ? <AdminQASection contentSection="qa-rules" H={H} />
    : selectedItem === 'sys-ai-qa-overrides' ? <AdminQASection contentSection="qa-overrides" H={H} />
    : null
  )

  if (tool) {
    return <Suspense fallback={<SystemSectionLoader />}>{tool}</Suspense>
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
      {!selectedItem ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', color: 'var(--text-muted)', gap: 12 }}>
          <div style={{ fontSize: 36 }}>🔧</div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            Hover over <strong>System</strong> in the top nav and select an item.
          </div>
        </div>
      ) : (
        <div style={{ maxWidth: 560 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <span style={{ fontSize: 20 }}>🔧</span>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
              {findSystemLabel(selectedItem)}
            </h2>
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '32px 28px', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🚧</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Under Development</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Configuration for <strong>{findSystemLabel(selectedItem)}</strong> is coming soon.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
