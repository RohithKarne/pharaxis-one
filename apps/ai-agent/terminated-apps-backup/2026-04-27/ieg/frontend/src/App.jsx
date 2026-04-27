import { useEffect, useMemo, useState } from 'react'
import { api } from './api'
import {
  emptyGrantSubmission,
  emptyIitSubmission,
  emptyEapSubmission,
  defaultAuthForm,
  defaultIntegrationSetup,
  modulesForExternalType
} from './components/utils'
import LandingAuth from './components/LandingAuth'
import TopBar from './components/TopBar'
import StatsGrid from './components/StatsGrid'
import InternalDashboard from './components/InternalDashboard'
import IntegrationSetupScreen from './components/IntegrationSetupScreen'
import ExternalPortal from './components/ExternalPortal'

export default function App() {
  const [token, setToken] = useState('')
  const [authType, setAuthType] = useState('internal')
  const [user, setUser] = useState(null)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const [authForm, setAuthForm] = useState(defaultAuthForm)
  const [moduleKey, setModuleKey] = useState('grants')
  const [workspaceView, setWorkspaceView] = useState('operations')

  const [tasks, setTasks] = useState([])
  const [grants, setGrants] = useState([])
  const [iit, setIit] = useState([])
  const [eap, setEap] = useState([])
  const [notifications, setNotifications] = useState([])
  const [submissions, setSubmissions] = useState([])

  const [grantSubmission, setGrantSubmission] = useState(emptyGrantSubmission)
  const [iitSubmission, setIitSubmission] = useState(emptyIitSubmission)
  const [eapSubmission, setEapSubmission] = useState(emptyEapSubmission)

  const [grantOps, setGrantOps] = useState({ id: '', comments: '', isComplete: true, coiDeclared: false })
  const [iitOps, setIitOps] = useState({ id: '', triageDecision: 'proceed', fmvReferenceValue: '' })
  const [eapOps, setEapOps] = useState({
    id: '',
    intakeDecision: 'eligible',
    pathway: 'individual_patient_ind',
    supplyState: 'allocated',
    safetyType: 'sae',
    seriousness: 'serious',
    comments: '',
    targetHours: 6,
    safetyEventId: ''
  })
  const [integrationOps, setIntegrationOps] = useState({
    provider: 'veeva',
    entityId: '',
    iitProposalId: '',
    nctId: '',
    clientCode: 'CLIENT_US_01',
    erpModuleKey: 'grants'
  })
  const [platformOps, setPlatformOps] = useState({
    convertIitId: '',
    aiModuleKey: 'grants',
    aiEntityId: '',
    overlayJurisdiction: 'US',
    overlayAmount: '',
    policySignalValue: '90',
    reason: 'Strategic conversion and policy tuning'
  })
  const [integrationSetup, setIntegrationSetup] = useState(defaultIntegrationSetup)
  const [integrationSecretMeta, setIntegrationSecretMeta] = useState({
    veevaClientSecret: false,
    msClientSecret: false,
    openaiApiKey: false,
    erpAuthToken: false
  })

  const modules = useMemo(() => (Array.isArray(user?.modules) ? user.modules : []), [user])
  const externalModules = useMemo(
    () => (authType === 'external' ? modulesForExternalType(user?.user_type) : []),
    [authType, user]
  )
  const envPreview = useMemo(() => [
    `VEEVA_INTEGRATION_ENABLED=${integrationSetup.veevaEnabled}`,
    `VEEVA_BASE_URL=${integrationSetup.veevaBaseUrl}`,
    `VEEVA_TOKEN_URL=${integrationSetup.veevaTokenUrl}`,
    `VEEVA_CLIENT_ID=${integrationSetup.veevaClientId}`,
    `VEEVA_CLIENT_SECRET=${integrationSetup.veevaClientSecret}`,
    `SHAREPOINT_INTEGRATION_ENABLED=${integrationSetup.sharePointEnabled}`,
    `MS_TENANT_ID=${integrationSetup.msTenantId}`,
    `MS_CLIENT_ID=${integrationSetup.msClientId}`,
    `MS_CLIENT_SECRET=${integrationSetup.msClientSecret}`,
    `SHAREPOINT_SITE_ID=${integrationSetup.sharePointSiteId}`,
    `SHAREPOINT_DRIVE_ID=${integrationSetup.sharePointDriveId}`,
    `CTG_LIVE_FETCH_ENABLED=${integrationSetup.ctgLiveEnabled}`,
    `LLM_LIVE_ENABLED=${integrationSetup.llmLiveEnabled}`,
    `OPENAI_MODEL=${integrationSetup.openaiModel}`,
    `OPENAI_API_KEY=${integrationSetup.openaiApiKey}`,
    `ERP_EXPORT_DELIVERY_ENABLED=${integrationSetup.erpDeliveryEnabled}`,
    `ERP_EXPORT_ENDPOINT_URL=${integrationSetup.erpEndpoint}`,
    `ERP_EXPORT_AUTH_TOKEN=${integrationSetup.erpAuthToken}`
  ].join('\n'), [integrationSetup])

  function updateIntegrationSetup(key, value) {
    setIntegrationSetup((prev) => ({ ...prev, [key]: value }))
  }

  async function refreshIntegrationSetup() {
    if (!token || authType !== 'internal') return
    try {
      const payload = await api.request('/api/integrations/setup', { token })
      setIntegrationSetup({ ...defaultIntegrationSetup, ...(payload.settings || {}) })
      setIntegrationSecretMeta({
        veevaClientSecret: Boolean(payload.secretMeta?.veevaClientSecret),
        msClientSecret: Boolean(payload.secretMeta?.msClientSecret),
        openaiApiKey: Boolean(payload.secretMeta?.openaiApiKey),
        erpAuthToken: Boolean(payload.secretMeta?.erpAuthToken)
      })
      setOk('Loaded shared integration setup')
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  async function saveIntegrationDraft() {
    try {
      const payload = await api.request('/api/integrations/setup', {
        method: 'PUT',
        token,
        body: { settings: integrationSetup }
      })
      setIntegrationSetup({ ...defaultIntegrationSetup, ...(payload.settings || {}) })
      setIntegrationSecretMeta({
        veevaClientSecret: Boolean(payload.secretMeta?.veevaClientSecret),
        msClientSecret: Boolean(payload.secretMeta?.msClientSecret),
        openaiApiKey: Boolean(payload.secretMeta?.openaiApiKey),
        erpAuthToken: Boolean(payload.secretMeta?.erpAuthToken)
      })
      setOk('Integration setup saved to shared backend storage')
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  async function resetIntegrationDraft() {
    try {
      const clearSecrets = {
        ...defaultIntegrationSetup,
        veevaClientSecret: '__CLEAR__',
        msClientSecret: '__CLEAR__',
        openaiApiKey: '__CLEAR__',
        erpAuthToken: '__CLEAR__'
      }
      const payload = await api.request('/api/integrations/setup', {
        method: 'PUT',
        token,
        body: { settings: clearSecrets }
      })
      setIntegrationSetup({ ...defaultIntegrationSetup, ...(payload.settings || {}) })
      setIntegrationSecretMeta({
        veevaClientSecret: false,
        msClientSecret: false,
        openaiApiKey: false,
        erpAuthToken: false
      })
      setOk('Integration setup reset in shared backend storage')
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  async function copyEnvDraft() {
    try {
      await navigator.clipboard.writeText(envPreview)
      setOk('.env snippet copied to clipboard')
      setError('')
    } catch (_error) {
      setError('Could not copy .env snippet automatically. Please copy from the preview box.')
    }
  }

  async function importIntegrationDraft(event) {
    const file = event.target?.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      setIntegrationSetup((prev) => ({ ...prev, ...parsed }))
      setOk('Integration credential draft imported')
      setError('')
    } catch (_error) {
      setError('Invalid JSON file for integration credential import')
    }
  }

  async function loginInternal() {
    try {
      setError('')
      setOk('')
      const response = await api.request('/api/auth/login', {
        method: 'POST',
        body: { email: authForm.email, password: authForm.password }
      })
      setToken(response.token)
      setUser(response.user)
      setAuthType('internal')
      setWorkspaceView('operations')
      if (response.user?.modules?.length) setModuleKey(response.user.modules[0])
      setOk('Internal login successful')
    } catch (err) {
      setError(err.message)
    }
  }

  async function registerExternal() {
    try {
      setError('')
      setOk('')
      const response = await api.request('/api/auth/external/register', {
        method: 'POST',
        body: {
          email: authForm.email,
          password: authForm.password,
          displayName: authForm.displayName,
          userType: authForm.userType
        }
      })
      setToken(response.token)
      setUser(response.user)
      setAuthType('external')
      setOk('External registration successful')
    } catch (err) {
      setError(err.message)
    }
  }

  async function loginExternal() {
    try {
      setError('')
      setOk('')
      const response = await api.request('/api/auth/external/login', {
        method: 'POST',
        body: { email: authForm.email, password: authForm.password }
      })
      setToken(response.token)
      setUser(response.user)
      setAuthType('external')
      setOk('External login successful')
    } catch (err) {
      setError(err.message)
    }
  }

  async function refreshInternalData() {
    if (!token || authType !== 'internal') return
    try {
      const [tasksRes, grantRes, iitRes, eapRes, notificationsRes] = await Promise.all([
        api.request(`/api/tasks?moduleKey=${moduleKey}`, { token }),
        api.request('/api/grants/applications', { token }),
        api.request('/api/iit/proposals', { token }),
        api.request('/api/eap/requests', { token }),
        api.request('/api/notifications', { token })
      ])
      setTasks(tasksRes.tasks || [])
      setGrants(grantRes.applications || [])
      setIit(iitRes.proposals || [])
      setEap(eapRes.requests || [])
      setNotifications(notificationsRes.notifications || [])
    } catch (err) {
      setError(err.message)
    }
  }

  async function refreshExternalData() {
    if (!token || authType !== 'external') return
    try {
      const [submissionRes, notificationsRes] = await Promise.all([
        api.request('/api/external/my-submissions', { token }),
        api.request('/api/notifications', { token })
      ])
      setSubmissions(submissionRes.submissions || [])
      setNotifications(notificationsRes.notifications || [])
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    if (!token) return
    if (authType === 'internal') {
      refreshInternalData()
      refreshIntegrationSetup()
    } else {
      refreshExternalData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, moduleKey, authType])

  async function runGrantCompleteness() {
    try {
      setError('')
      await api.request(`/api/grants/applications/${grantOps.id}/completeness-check`, {
        method: 'POST', token,
        body: { isComplete: Boolean(grantOps.isComplete), comments: grantOps.comments }
      })
      setOk('Grant completeness check submitted')
      refreshInternalData()
    } catch (err) { setError(err.message) }
  }

  async function runGrantCompliance() {
    try {
      setError('')
      await api.request(`/api/grants/applications/${grantOps.id}/compliance-screen`, {
        method: 'POST', token,
        body: { coiDeclared: Boolean(grantOps.coiDeclared) }
      })
      setOk('Grant compliance screening submitted')
      refreshInternalData()
    } catch (err) { setError(err.message) }
  }

  async function runIitTriage() {
    try {
      setError('')
      await api.request(`/api/iit/proposals/${iitOps.id}/triage`, {
        method: 'POST', token,
        body: { triageDecision: iitOps.triageDecision, comments: 'Triage from command center' }
      })
      setOk('IIT triage submitted')
      refreshInternalData()
    } catch (err) { setError(err.message) }
  }

  async function runIitFmv() {
    try {
      setError('')
      await api.request(`/api/iit/proposals/${iitOps.id}/fmv-review`, {
        method: 'POST', token,
        body: { fmvReferenceValue: Number(iitOps.fmvReferenceValue) }
      })
      setOk('IIT FMV review submitted')
      refreshInternalData()
    } catch (err) { setError(err.message) }
  }

  async function runEapIntakeReview() {
    try {
      setError('')
      await api.request(`/api/eap/requests/${eapOps.id}/intake-review`, {
        method: 'POST', token,
        body: { decision: eapOps.intakeDecision, comments: eapOps.comments }
      })
      setOk('EAP intake review submitted')
      refreshInternalData()
    } catch (err) { setError(err.message) }
  }

  async function runEapPathway() {
    try {
      setError('')
      await api.request(`/api/eap/requests/${eapOps.id}/regulatory-pathway`, {
        method: 'POST', token,
        body: { pathway: eapOps.pathway, comments: eapOps.comments }
      })
      setOk('EAP pathway updated')
      refreshInternalData()
    } catch (err) { setError(err.message) }
  }

  async function runEapEmergency() {
    try {
      setError('')
      await api.request(`/api/eap/requests/${eapOps.id}/emergency-activate`, {
        method: 'POST', token,
        body: { targetHours: Number(eapOps.targetHours || 6), notes: eapOps.comments }
      })
      setOk('Emergency pathway activated')
      refreshInternalData()
    } catch (err) { setError(err.message) }
  }

  async function runEapSupply() {
    try {
      setError('')
      await api.request(`/api/eap/requests/${eapOps.id}/supply-event`, {
        method: 'POST', token,
        body: { supplyState: eapOps.supplyState, notes: eapOps.comments }
      })
      setOk('EAP supply event recorded')
      refreshInternalData()
    } catch (err) { setError(err.message) }
  }

  async function runEapSafety() {
    try {
      setError('')
      const response = await api.request(`/api/eap/requests/${eapOps.id}/safety-event`, {
        method: 'POST', token,
        body: {
          eventType: eapOps.safetyType,
          seriousness: eapOps.seriousness,
          description: eapOps.comments || 'Safety event captured from command center'
        }
      })
      if (response?.safetyEvent?.id) {
        setEapOps((prev) => ({ ...prev, safetyEventId: String(response.safetyEvent.id) }))
      }
      setOk('EAP safety event logged')
      refreshInternalData()
    } catch (err) { setError(err.message) }
  }

  async function runEapSafetyReport() {
    try {
      setError('')
      const eventId = eapOps.safetyEventId
      if (!eventId) throw new Error('Safety event ID is required. Log a safety event first or enter the event ID.')
      await api.request(`/api/eap/safety-events/${eventId}/report`, {
        method: 'POST', token,
        body: { payload: { notes: eapOps.comments || 'Safety report generated from command center' } }
      })
      setOk('EAP safety report generated')
      refreshInternalData()
    } catch (err) { setError(err.message) }
  }

  async function runDmsSync() {
    try {
      setError('')
      const moduleForEntity = moduleKey || 'grants'
      await api.request('/api/integrations/dms/sync-jobs', {
        method: 'POST', token,
        body: {
          provider: integrationOps.provider,
          moduleKey: moduleForEntity,
          entityType: `${moduleForEntity}_record`,
          entityId: integrationOps.entityId,
          direction: 'export',
          mappingPayload: { initiatedFrom: 'ui_command_center' }
        }
      })
      setOk(`DMS sync queued (${integrationOps.provider})`)
    } catch (err) { setError(err.message) }
  }

  async function runClinicalTrialLink() {
    try {
      setError('')
      await api.request('/api/integrations/clinicaltrials/link', {
        method: 'POST', token,
        body: { iitProposalId: Number(integrationOps.iitProposalId), nctId: integrationOps.nctId }
      })
      setOk('ClinicalTrials.gov link created')
      refreshInternalData()
    } catch (err) { setError(err.message) }
  }

  async function runErpExport() {
    try {
      setError('')
      const exportResponse = await api.request('/api/integrations/erp/exports', {
        method: 'POST', token,
        body: { clientCode: integrationOps.clientCode, exportFormat: 'csv', moduleKey: integrationOps.erpModuleKey }
      })
      setOk(`ERP export generated (#${exportResponse.exportJob?.id || 'N/A'})`)
    } catch (err) { setError(err.message) }
  }

  async function runConvertIitToGrant() {
    try {
      setError('')
      const result = await api.request('/api/platform/convert/iit-to-grant', {
        method: 'POST', token,
        body: { iitProposalId: Number(platformOps.convertIitId), reason: platformOps.reason || 'Strategic conversion' }
      })
      setOk(`IIT converted to grant ${result.targetGrant?.application_code || ''}`)
      refreshInternalData()
    } catch (err) { setError(err.message) }
  }

  async function runAiSummary() {
    try {
      setError('')
      await api.request('/api/platform/ai/summary', {
        method: 'POST', token,
        body: { moduleKey: platformOps.aiModuleKey, entityType: `${platformOps.aiModuleKey}_record`, entityId: String(platformOps.aiEntityId) }
      })
      setOk('AI summary generated')
    } catch (err) { setError(err.message) }
  }

  async function runAiScore() {
    try {
      setError('')
      await api.request('/api/platform/ai/score', {
        method: 'POST', token,
        body: { moduleKey: platformOps.aiModuleKey, entityType: `${platformOps.aiModuleKey}_record`, entityId: String(platformOps.aiEntityId) }
      })
      setOk('AI recommendation score generated')
    } catch (err) { setError(err.message) }
  }

  async function runOverlayEvaluate() {
    try {
      setError('')
      const response = await api.request('/api/platform/compliance-overlay/evaluate', {
        method: 'POST', token,
        body: { jurisdiction: platformOps.overlayJurisdiction, moduleKey: platformOps.aiModuleKey, requestedAmount: Number(platformOps.overlayAmount || 0) }
      })
      setOk(`Overlay evaluated: ${response.warnings?.length || 0} warning(s)`)
    } catch (err) { setError(err.message) }
  }

  async function runSavePolicyRule() {
    try {
      setError('')
      await api.request('/api/platform/policies/rules', {
        method: 'POST', token,
        body: {
          moduleKey: platformOps.aiModuleKey,
          policyType: 'escalation',
          policyKey: 'high_signal_escalation',
          configPayload: { threshold: Number(platformOps.policySignalValue || 0), rationale: platformOps.reason || 'Configured from UI' },
          actions: [
            { actionType: 'notify', payload: { level: 'high' } },
            { actionType: 'escalate', payload: { toRole: 'superadmin' } }
          ]
        }
      })
      setOk('Policy rule saved')
    } catch (err) { setError(err.message) }
  }

  async function runEvaluatePolicy() {
    try {
      setError('')
      const response = await api.request('/api/platform/policies/evaluate', {
        method: 'POST', token,
        body: {
          moduleKey: platformOps.aiModuleKey,
          entityType: `${platformOps.aiModuleKey}_record`,
          entityId: String(platformOps.aiEntityId || 1),
          policyType: 'escalation',
          signalValue: Number(platformOps.policySignalValue || 0)
        }
      })
      setOk(`Policy evaluation created ${response.events?.length || 0} event(s)`)
    } catch (err) { setError(err.message) }
  }

  async function runAnalyticsSnapshot() {
    try {
      setError('')
      await api.request('/api/platform/analytics/snapshot', {
        method: 'POST', token,
        body: { snapshotType: 'portfolio' }
      })
      setOk('Portfolio analytics snapshot created')
    } catch (err) { setError(err.message) }
  }

  async function submitExternalGrant() {
    try {
      setError('')
      await api.request('/api/external/grants/submit', {
        method: 'POST', token,
        body: {
          applicantType: grantSubmission.applicantType,
          applicantName: grantSubmission.applicantName,
          requestedAmount: Number(grantSubmission.requestedAmount),
          payload: { objective: 'Medical education support', documents: ['proposal.pdf', 'budget.xlsx'] }
        }
      })
      setOk('External grant submission created')
      setGrantSubmission(emptyGrantSubmission)
      refreshExternalData()
    } catch (err) { setError(err.message) }
  }

  async function submitExternalIit() {
    try {
      setError('')
      await api.request('/api/external/iit/submit', {
        method: 'POST', token,
        body: {
          investigatorName: iitSubmission.investigatorName,
          supportType: iitSubmission.supportType,
          requestedAmount: Number(iitSubmission.requestedAmount),
          payload: { piCvDocument: 'pi-cv.pdf', protocolSynopsis: 'Phase IV observational proposal', budgetSummary: 'Budget includes site costs and monitoring support.' }
        }
      })
      setOk('External IIT submission created')
      setIitSubmission(emptyIitSubmission)
      refreshExternalData()
    } catch (err) { setError(err.message) }
  }

  async function submitExternalEap() {
    try {
      setError('')
      await api.request('/api/external/eap/submit', {
        method: 'POST', token,
        body: {
          physicianName: eapSubmission.physicianName,
          physicianEmail: eapSubmission.physicianEmail,
          requestedDrug: eapSubmission.requestedDrug,
          conditionCategory: eapSubmission.conditionCategory,
          urgencyLevel: eapSubmission.urgencyLevel,
          emergencyFlag: Boolean(eapSubmission.emergencyFlag),
          payload: { submissionChannel: 'external_portal' }
        }
      })
      setOk('External EAP submission created')
      setEapSubmission(emptyEapSubmission)
      refreshExternalData()
    } catch (err) { setError(err.message) }
  }

  function logout() {
    setToken('')
    setUser(null)
    setWorkspaceView('operations')
    setTasks([])
    setGrants([])
    setIit([])
    setEap([])
    setNotifications([])
    setSubmissions([])
    setIntegrationSetup(defaultIntegrationSetup)
    setIntegrationSecretMeta({ veevaClientSecret: false, msClientSecret: false, openaiApiKey: false, erpAuthToken: false })
    setAuthForm(defaultAuthForm)
    setError('')
    setOk('')
  }

  return (
    <div className="app-root">
      <div className="ambient-glow ambient-glow-a" />
      <div className="ambient-glow ambient-glow-b" />

      <div className="app-shell">
        {!token ? (
          <LandingAuth
            authForm={authForm}
            setAuthForm={setAuthForm}
            loginInternal={loginInternal}
            loginExternal={loginExternal}
            registerExternal={registerExternal}
            error={error}
            ok={ok}
          />
        ) : (
          <>
            <TopBar user={user} onLogout={logout} />

            <StatsGrid
              authType={authType}
              tasks={tasks}
              grants={grants}
              iit={iit}
              eap={eap}
              notifications={notifications}
              submissions={submissions}
            />

            {error ? <div className="banner error reveal-up">{error}</div> : null}
            {ok ? <div className="banner success reveal-up">{ok}</div> : null}

            {authType === 'internal' ? (
              <>
                <section className="workspace-tabs reveal-up">
                  <button
                    className={workspaceView === 'operations' ? 'tab-button active' : 'tab-button'}
                    onClick={() => setWorkspaceView('operations')}
                  >
                    Operations
                  </button>
                  <button
                    className={workspaceView === 'integrations' ? 'tab-button active' : 'tab-button'}
                    onClick={() => setWorkspaceView('integrations')}
                  >
                    Integration Setup
                  </button>
                </section>

                {workspaceView === 'operations' ? (
                  <InternalDashboard
                    moduleKey={moduleKey}
                    setModuleKey={setModuleKey}
                    modules={modules}
                    tasks={tasks}
                    grants={grants}
                    iit={iit}
                    eap={eap}
                    notifications={notifications}
                    grantOps={grantOps}
                    setGrantOps={setGrantOps}
                    iitOps={iitOps}
                    setIitOps={setIitOps}
                    eapOps={eapOps}
                    setEapOps={setEapOps}
                    integrationOps={integrationOps}
                    setIntegrationOps={setIntegrationOps}
                    platformOps={platformOps}
                    setPlatformOps={setPlatformOps}
                    runGrantCompleteness={runGrantCompleteness}
                    runGrantCompliance={runGrantCompliance}
                    runIitTriage={runIitTriage}
                    runIitFmv={runIitFmv}
                    runEapIntakeReview={runEapIntakeReview}
                    runEapPathway={runEapPathway}
                    runEapEmergency={runEapEmergency}
                    runEapSupply={runEapSupply}
                    runEapSafety={runEapSafety}
                    runEapSafetyReport={runEapSafetyReport}
                    runDmsSync={runDmsSync}
                    runClinicalTrialLink={runClinicalTrialLink}
                    runErpExport={runErpExport}
                    runConvertIitToGrant={runConvertIitToGrant}
                    runAiSummary={runAiSummary}
                    runAiScore={runAiScore}
                    runOverlayEvaluate={runOverlayEvaluate}
                    runSavePolicyRule={runSavePolicyRule}
                    runEvaluatePolicy={runEvaluatePolicy}
                    runAnalyticsSnapshot={runAnalyticsSnapshot}
                    refreshInternalData={refreshInternalData}
                  />
                ) : (
                  <IntegrationSetupScreen
                    integrationSetup={integrationSetup}
                    integrationSecretMeta={integrationSecretMeta}
                    updateIntegrationSetup={updateIntegrationSetup}
                    refreshIntegrationSetup={refreshIntegrationSetup}
                    saveIntegrationDraft={saveIntegrationDraft}
                    resetIntegrationDraft={resetIntegrationDraft}
                    importIntegrationDraft={importIntegrationDraft}
                    copyEnvDraft={copyEnvDraft}
                    envPreview={envPreview}
                  />
                )}
              </>
            ) : (
              <ExternalPortal
                grantSubmission={grantSubmission}
                setGrantSubmission={setGrantSubmission}
                iitSubmission={iitSubmission}
                setIitSubmission={setIitSubmission}
                eapSubmission={eapSubmission}
                setEapSubmission={setEapSubmission}
                submitExternalGrant={submitExternalGrant}
                submitExternalIit={submitExternalIit}
                submitExternalEap={submitExternalEap}
                refreshExternalData={refreshExternalData}
                submissions={submissions}
                notifications={notifications}
                externalModules={externalModules}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
