import { findSystemLabel } from '../configItems'
import { useAuth } from '../../../../shared/context/AuthContext'
import AdminQASection from '../../../admin/components/AdminQASection'
import AdminUATPanel from '../../../admin/components/AdminUATPanel'
import CopyDivision from './CopyDivision'
import DivisionParameters from './DivisionParameters'
import CustomizeForms from './CustomizeForms'
import ExceptionLog from './ExceptionLog'
import FeatureFlags from './FeatureFlags'
import SmartFields from './SmartFields'
import ValidationRules from './ValidationRules'
import GridTemplates from './GridTemplates'
import CaseActionsAdmin from './CaseActionsAdmin'
import ComplianceAdmin from './ComplianceAdmin'
// Sprint 2 Week 1 admin surfaces
import DocumentTypesAdmin from './DocumentTypesAdmin'
import ComplaintCodesAdmin from './ComplaintCodesAdmin'
import LotMasterAdmin from './LotMasterAdmin'
import FieldActionsAdmin from './FieldActionsAdmin'
import CapaAdmin from './CapaAdmin'
import PiiRedactionRules from './PiiRedactionRules'
// import GroupSecurity from './GroupSecurity' // legacy nav-key version — kept on disk for rollback
import CapabilityGroupSecurity from './CapabilityGroupSecurity'
import LoggedInUsers from './LoggedInUsers'
import ReportsAccess from './ReportsAccess'
import SetupAlerts from './SetupAlerts'
import SetupAuthPolicy from './SetupAuthPolicy'
import SetupChangeApprovals from './SetupChangeApprovals'
import SetupEmailAccounts from './SetupEmailAccounts'
import SetupIntegrations from './SetupIntegrations'
import SetupWorkflowEngine from './SetupWorkflowEngine'
import SetupTwoFactor from './SetupTwoFactor'
import SetupWorkflow from './SetupWorkflow'
import AiConfig from './AiConfig'
import DeveloperApiAdmin from './DeveloperApiAdmin'
import SystemParameters from './SystemParameters'
import Users from './Users'
import ViewData from './ViewData'
import DPPRPage from '../../../admin/pages/DPPRPage'
import RegressionPage from '../../../regression/pages/RegressionPage'

export default function System({ selectedItem, auditItem = 'admin' }) {
  const { token } = useAuth()
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  if (selectedItem === 'sys-maint-copy-division')   return <CopyDivision />
  if (selectedItem === 'sys-division-params')       return <DivisionParameters H={H} />
  if (selectedItem === 'sys-setup-customize-forms') return <CustomizeForms />
  if (selectedItem === 'sys-exception-log')         return <ExceptionLog />
  if (selectedItem === 'sys-sec-group')             return <CapabilityGroupSecurity />
  if (selectedItem === 'sys-sec-logged-in')         return <LoggedInUsers />
  if (selectedItem === 'sys-sec-users')             return <Users />
  if (selectedItem === 'sys-sec-auth-policy')       return <SetupAuthPolicy />
  if (selectedItem === 'sys-setup-2fa-config')      return <SetupTwoFactor />
  if (selectedItem === 'sys-setup-alerts')          return <SetupAlerts />
  if (selectedItem === 'sys-setup-workflow')        return <SetupWorkflow />
  if (selectedItem === 'sys-setup-workflow-engine') return <SetupWorkflowEngine />
  if (selectedItem === 'sys-setup-ai-config')       return <AiConfig />
  if (selectedItem === 'sys-setup-developer-api')    return <DeveloperApiAdmin />
  if (selectedItem === 'sys-setup-email-accounts')  return <SetupEmailAccounts />
  if (selectedItem === 'sys-setup-change-approvals') return <SetupChangeApprovals />
  if (selectedItem === 'sys-setup-feature-flags')   return <FeatureFlags />
  if (selectedItem === 'sys-setup-smart-fields')    return <SmartFields />
  if (selectedItem === 'sys-setup-validation')      return <ValidationRules />
  if (selectedItem === 'sys-setup-grid-templates')  return <GridTemplates />
  if (selectedItem === 'sys-setup-case-actions')    return <CaseActionsAdmin />
  if (selectedItem === 'sys-setup-compliance')      return <ComplianceAdmin />
  // Sprint 2 Week 1 admin surfaces
  if (selectedItem === 'sys-setup-document-types')  return <DocumentTypesAdmin />
  if (selectedItem === 'sys-setup-complaint-codes') return <ComplaintCodesAdmin />
  if (selectedItem === 'sys-setup-lot-master')      return <LotMasterAdmin />
  if (selectedItem === 'sys-setup-field-actions')   return <FieldActionsAdmin />
  if (selectedItem === 'sys-setup-capa')            return <CapaAdmin />
  if (selectedItem === 'sys-setup-pii-redaction')   return <PiiRedactionRules />
  if (selectedItem === 'sys-setup-data-protect')    return <DPPRPage embedded />
  if (selectedItem?.startsWith('sys-setup-int-'))   return <SetupIntegrations selectedItem={selectedItem} />
  if (selectedItem === 'sys-system-params')         return <SystemParameters />
  if (selectedItem === 'sys-reports-access')        return <ReportsAccess />
  if (selectedItem === 'sys-view-data')             return <ViewData selectedItem={auditItem} />
  if (selectedItem === 'sys-uat-bugs')              return <AdminUATPanel initialTab="bugs" />
  if (selectedItem === 'sys-uat-features')          return <AdminUATPanel initialTab="features" />
  if (selectedItem === 'sys-uat-regression')        return <RegressionPage embedded />
  if (selectedItem === 'sys-ai-qa-reports')         return <AdminQASection contentSection="qa-reports" H={H} />
  if (selectedItem === 'sys-ai-qa-rules')           return <AdminQASection contentSection="qa-rules" H={H} />
  if (selectedItem === 'sys-ai-qa-overrides')       return <AdminQASection contentSection="qa-overrides" H={H} />

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
