import { useEffect, useMemo, useState } from 'react'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5200/api'
const TOKEN_KEY = 'pharaxis_safety_token'

const TAB_ORDER = [
  'Org Management',
  'Client Hierarchy',
  'User Management',
  'Product Config',
  'Case Management',
  'Case ID Config',
  'System Config',
  'Audit Trail View'
]

const ROLE_OPTIONS = [
  'SUPER_ADMIN',
  'CRO_ADMIN',
  'SAFETY_SCIENTIST',
  'MEDICAL_REVIEWER',
  'READ_ONLY'
]

const ORG_SETTINGS_DEFAULTS = {
  safetyInboxEmail: '',
  caseIntakeMode: 'manual',
  defaultTriagePriority: 'medium',
  autoAssignMedicalReviewer: true,
  requireStudyCode: false,
  timezone: 'UTC',
  dashboardAccent: 'teal'
}

async function apiRequest(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  })

  const raw = await response.text()
  let payload = null
  try {
    payload = raw ? JSON.parse(raw) : null
  } catch {
    payload = null
  }

  if (!response.ok) {
    const errorMessage = payload?.error || payload?.message || `Request failed (${response.status})`
    throw new Error(errorMessage)
  }

  return payload
}

function SectionCard({ title, hint, children, accent = 'teal' }) {
  return (
    <section className={`section-card accent-${accent}`}>
      <div className="section-head">
        <h3>{title}</h3>
        {hint ? <p>{hint}</p> : null}
      </div>
      {children}
    </section>
  )
}

function StatTile({ label, value }) {
  return (
    <article className="stat-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '')
  const [user, setUser] = useState(null)
  const [activeTab, setActiveTab] = useState('Org Management')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [firstLoginToken, setFirstLoginToken] = useState('')
  const [loginForm, setLoginForm] = useState({
    orgSlug: 'pharaxis-platform',
    email: 'safety.superadmin@pharaxis.one',
    password: 'SafetyAdmin@123'
  })
  const [forgotForm, setForgotForm] = useState({ orgSlug: '', email: '' })
  const [resetPassword, setResetPassword] = useState('')

  const [orgs, setOrgs] = useState([])
  const [clients, setClients] = useState([])
  const [users, setUsers] = useState([])
  const [products, setProducts] = useState([])
  const [caseRows, setCaseRows] = useState([])
  const [caseDashboard, setCaseDashboard] = useState({
    totalCases: 0,
    openCases: 0,
    overdueCases: 0,
    byStatus: [],
    byPriority: [],
    byClient: [],
    overdueBuckets: {},
    activeAlerts: []
  })
  const [caseDrafts, setCaseDrafts] = useState({})
  const [statusDrafts, setStatusDrafts] = useState({})
  const [clockDrafts, setClockDrafts] = useState({})
  const [reviewerDrafts, setReviewerDrafts] = useState({})
  const [exceptionDrafts, setExceptionDrafts] = useState({})
  const [clockActionDrafts, setClockActionDrafts] = useState({})
  const [productCatalog, setProductCatalog] = useState([])
  const [reviewerOptions, setReviewerOptions] = useState([])
  const [savedCaseFilters, setSavedCaseFilters] = useState([])
  const [activeSavedFilterId, setActiveSavedFilterId] = useState('')
  const [caseAlerts, setCaseAlerts] = useState([])
  const [caseAuditRows, setCaseAuditRows] = useState([])
  const [selectedCaseId, setSelectedCaseId] = useState(null)
  const [selectedCaseWorkflow, setSelectedCaseWorkflow] = useState([])
  const [selectedCaseNarratives, setSelectedCaseNarratives] = useState([])
  const [selectedCaseListedness, setSelectedCaseListedness] = useState([])
  const [selectedCaseDuplicates, setSelectedCaseDuplicates] = useState([])
  const [draftList, setDraftList] = useState([])
  const [duplicatePrecheck, setDuplicatePrecheck] = useState(null)
  const [narrativeDraft, setNarrativeDraft] = useState('')
  const [listednessForm, setListednessForm] = useState({
    sourceReference: '',
    listedness: 'unknown',
    expectedness: 'unknown',
    rationale: ''
  })
  const [attachmentInput, setAttachmentInput] = useState('')
  const [caseFilterForm, setCaseFilterForm] = useState({
    search: '',
    status: '',
    priority: '',
    dueBucket: '',
    actionType: '',
    actorUserId: ''
  })
  const [saveFilterName, setSaveFilterName] = useState('')
  const [caseConfig, setCaseConfig] = useState(null)
  const [systemConfig, setSystemConfig] = useState({})
  const [auditRows, setAuditRows] = useState([])
  const [sessions, setSessions] = useState([])
  const [roleDrafts, setRoleDrafts] = useState({})
  const [orgSettingsTargetOrgId, setOrgSettingsTargetOrgId] = useState('')
  const [orgSettingsForm, setOrgSettingsForm] = useState(ORG_SETTINGS_DEFAULTS)

  const [orgCreateForm, setOrgCreateForm] = useState({ orgName: '', orgSlug: '', orgType: 'pharma_direct' })
  const [clientCreateForm, setClientCreateForm] = useState({ parentOrgId: '', clientName: '', clientCode: '' })
  const [userInviteForm, setUserInviteForm] = useState({ fullName: '', email: '', role: 'CRO_ADMIN', orgId: '', clientId: '' })
  const [productForm, setProductForm] = useState({ orgId: '', clientId: '', productName: '', productCode: '' })
  const [caseCreateForm, setCaseCreateForm] = useState({
    orgId: '',
    clientId: '',
    reporterName: '',
    reporterEmail: '',
    patientReference: '',
    aeDescription: '',
    suspectProductId: '',
    seriousness: 'non_serious',
    causality: 'unknown',
    priority: 'medium',
    reporterCountry: '',
    reporterQualification: '',
    patientAgeYears: '',
    patientSex: '',
    patientWeightKg: '',
    patientDateOfBirth: '',
    dose: '',
    route: '',
    aeOnsetDate: '',
    regulatoryClockDays: '15',
    timezone: 'UTC',
    draftKey: 'default'
  })
  const [caseForm, setCaseForm] = useState({ orgId: '', casePrefix: '', sequencePadding: 5, isActive: true })
  const [systemForm, setSystemForm] = useState({
    session_timeout_minutes: '480',
    max_concurrent_sessions: '2',
    audit_retention_days: '3650',
    smtp_host: '',
    smtp_port: '587',
    smtp_user: '',
    smtp_password: '',
    smtp_from_email: 'no-reply@pharaxis.one'
  })

  const allowedTabs = useMemo(() => {
    if (!user) return []
    return TAB_ORDER.filter((tab) => user.modules?.includes(tab))
  }, [user])

  const moduleStats = useMemo(() => {
    return {
      orgs: orgs.length,
      clients: clients.length,
      users: users.length,
      cases: caseRows.length,
      activeSessions: sessions.length,
      auditRows: auditRows.length
    }
  }, [orgs, clients, users, caseRows, sessions, auditRows])

  const defaultTabForUser = (profile) => {
    if (!profile?.modules?.length) return 'Org Management'
    return TAB_ORDER.find((tab) => profile.modules.includes(tab)) || profile.modules[0]
  }

  const clearBanners = () => {
    setError('')
    setNotice('')
  }

  const runAction = async (action, successMessage) => {
    setLoading(true)
    clearBanners()
    try {
      await action()
      if (successMessage) {
        setNotice(successMessage)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const fetchProfile = async (authToken) => {
    const profile = await apiRequest('/auth/me', { token: authToken })
    setUser(profile)
    setActiveTab((prev) => {
      if (profile.modules?.includes(prev)) return prev
      return defaultTabForUser(profile)
    })
    return profile
  }

  const loadOrgSettings = async (orgId, authToken = token) => {
    if (!orgId) return
    const payload = await apiRequest(`/orgs/${orgId}/settings`, { token: authToken })
    setOrgSettingsTargetOrgId(String(payload.org_id))
    setOrgSettingsForm({
      ...ORG_SETTINGS_DEFAULTS,
      ...(payload.settings || {})
    })
  }

  const buildCaseListQuery = () => {
    const params = new URLSearchParams()
    params.set('limit', '120')
    if (caseFilterForm.search) params.set('search', caseFilterForm.search)
    if (caseFilterForm.status) params.set('status', caseFilterForm.status)
    if (caseFilterForm.priority) params.set('priority', caseFilterForm.priority)
    if (caseFilterForm.dueBucket) params.set('dueBucket', caseFilterForm.dueBucket)
    if (activeSavedFilterId) params.set('savedFilterId', activeSavedFilterId)
    return params.toString()
  }

  const buildCaseAuditQuery = () => {
    const params = new URLSearchParams()
    params.set('limit', '120')
    if (caseFilterForm.actionType) params.set('actionType', caseFilterForm.actionType)
    if (caseFilterForm.actorUserId) params.set('actorUserId', caseFilterForm.actorUserId)
    if (caseFilterForm.search) params.set('search', caseFilterForm.search)
    return params.toString()
  }

  const loadCaseDetailCards = async (caseId, authToken = token) => {
    if (!caseId) return
    const [workflow, narratives, listedness, duplicates] = await Promise.all([
      apiRequest(`/cases/${caseId}/workflow`, { token: authToken }),
      apiRequest(`/cases/${caseId}/narrative`, { token: authToken }),
      apiRequest(`/cases/${caseId}/listedness`, { token: authToken }),
      apiRequest(`/cases/${caseId}/duplicates`, { token: authToken })
    ])

    setSelectedCaseWorkflow(workflow)
    setSelectedCaseNarratives(narratives)
    setSelectedCaseListedness(listedness)
    setSelectedCaseDuplicates(duplicates)

    if (narratives.length) {
      setNarrativeDraft(narratives[0].narrative_text || '')
    } else {
      setNarrativeDraft('')
    }
  }

  const loadTabData = async (tabName, authToken = token, profile = user) => {
    if (!authToken || !profile) return

    if (tabName === 'Org Management') {
      const data = await apiRequest('/orgs', { token: authToken })
      setOrgs(data)
      if (data.length && !clientCreateForm.parentOrgId) {
        setClientCreateForm((prev) => ({ ...prev, parentOrgId: String(data[0].org_id) }))
      }

      const preferredOrgId = profile.role === 'SUPER_ADMIN'
        ? Number(orgSettingsTargetOrgId || data[0]?.org_id || 0)
        : Number(profile.orgId)
      if (preferredOrgId > 0) {
        await loadOrgSettings(preferredOrgId, authToken)
      }
    }

    if (tabName === 'Client Hierarchy') {
      const data = await apiRequest('/clients', { token: authToken })
      setClients(data)
    }

    if (tabName === 'User Management') {
      const data = await apiRequest('/users', { token: authToken })
      setUsers(data)
      setRoleDrafts((prev) => {
        const next = { ...prev }
        for (const row of data) {
          if (!next[row.user_id]) next[row.user_id] = row.role
        }
        return next
      })
    }

    if (tabName === 'Product Config') {
      const data = await apiRequest('/products', { token: authToken })
      setProducts(data)
    }

    if (tabName === 'Case Management') {
      const [rows, summary, catalog, alerts, filters, usersData, auditData, draftsData] = await Promise.all([
        apiRequest(`/cases?${buildCaseListQuery()}`, { token: authToken }),
        apiRequest('/cases/dashboard/summary', { token: authToken }),
        apiRequest('/products/catalog', { token: authToken }),
        apiRequest('/cases/regulatory/alerts?limit=80', { token: authToken }),
        apiRequest('/cases/dashboard/filters', { token: authToken }),
        apiRequest('/users', { token: authToken }),
        apiRequest(`/cases/audit?${buildCaseAuditQuery()}`, { token: authToken }),
        apiRequest('/cases/drafts', { token: authToken })
      ])

      setCaseRows(rows)
      setCaseDashboard(summary)
      setProductCatalog(catalog)
      setCaseAlerts(alerts)
      setSavedCaseFilters(filters)
      setCaseAuditRows(auditData)
      setDraftList(draftsData)
      setReviewerOptions(usersData.filter((entry) => entry.role === 'MEDICAL_REVIEWER' && entry.status === 'active'))

      setCaseDrafts((prev) => {
        const next = { ...prev }
        for (const row of rows) {
          if (!next[row.case_pk_id]) {
            next[row.case_pk_id] = {
              seriousness: row.seriousness,
              causality: row.causality,
              priority: row.priority
            }
          }
        }
        return next
      })

      setStatusDrafts((prev) => {
        const next = { ...prev }
        for (const row of rows) {
          if (!next[row.case_pk_id]) next[row.case_pk_id] = row.status
        }
        return next
      })

      setClockDrafts((prev) => {
        const next = { ...prev }
        for (const row of rows) {
          if (!next[row.case_pk_id]) next[row.case_pk_id] = String(row.regulatory_clock_days || 15)
        }
        return next
      })

      setReviewerDrafts((prev) => {
        const next = { ...prev }
        for (const row of rows) {
          if (!next[row.case_pk_id]) {
            next[row.case_pk_id] = row.assigned_medical_reviewer_id ? String(row.assigned_medical_reviewer_id) : ''
          }
        }
        return next
      })

      setExceptionDrafts((prev) => {
        const next = { ...prev }
        for (const row of rows) {
          if (!next[row.case_pk_id]) next[row.case_pk_id] = ''
        }
        return next
      })

      setClockActionDrafts((prev) => {
        const next = { ...prev }
        for (const row of rows) {
          if (!next[row.case_pk_id]) next[row.case_pk_id] = 'pause'
        }
        return next
      })

      const nextSelectedCaseId = selectedCaseId || rows[0]?.case_pk_id || null
      setSelectedCaseId(nextSelectedCaseId)
      if (nextSelectedCaseId) {
        await loadCaseDetailCards(nextSelectedCaseId, authToken)
      } else {
        setSelectedCaseWorkflow([])
        setSelectedCaseNarratives([])
        setSelectedCaseListedness([])
        setSelectedCaseDuplicates([])
      }
    }

    if (tabName === 'Case ID Config') {
      const data = await apiRequest('/case-config', { token: authToken })
      setCaseConfig(data)
      setCaseForm((prev) => ({
        ...prev,
        orgId: String(data.org_id || profile.orgId),
        casePrefix: data.case_prefix,
        sequencePadding: Number(data.sequence_padding || 5),
        isActive: Boolean(data.is_active)
      }))
    }

    if (tabName === 'System Config') {
      const data = await apiRequest('/system-config', { token: authToken })
      setSystemConfig(data)
      setSystemForm((prev) => ({ ...prev, ...data }))
    }

    if (tabName === 'Audit Trail View') {
      const data = await apiRequest('/audit?limit=150', { token: authToken })
      setAuditRows(data)
      const sessionRows = await apiRequest('/sessions/active', { token: authToken })
      setSessions(sessionRows)
    }
  }

  useEffect(() => {
    if (!token) return

    setLoading(true)
    clearBanners()
    fetchProfile(token)
      .catch((err) => {
        setError(err.message)
        setToken('')
        setUser(null)
        localStorage.removeItem(TOKEN_KEY)
      })
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => {
    if (!user || !token) return

    setLoading(true)
    clearBanners()
    loadTabData(activeTab)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [activeTab, user, token])

  const handleLogin = async (event) => {
    event.preventDefault()
    await runAction(async () => {
      const response = await apiRequest('/auth/login', {
        method: 'POST',
        body: loginForm
      })

      if (response.requiresPasswordReset) {
        setFirstLoginToken(response.firstLoginToken)
        setNotice('First login reset required. Set a new password to continue.')
        return
      }

      localStorage.setItem(TOKEN_KEY, response.token)
      setToken(response.token)
      setUser(response.user)
      setActiveTab(defaultTabForUser(response.user))
      setNotice('Login successful')
    })
  }

  const handleForgotPassword = async (event) => {
    event.preventDefault()
    await runAction(async () => {
      const response = await apiRequest('/auth/forgot-password', {
        method: 'POST',
        body: forgotForm
      })
      setNotice(response.message + (response.resetToken ? ` (Dev reset token: ${response.resetToken})` : ''))
    })
  }

  const handleFirstLoginReset = async (event) => {
    event.preventDefault()
    await runAction(async () => {
      const response = await apiRequest('/auth/first-login-reset', {
        method: 'POST',
        body: {
          token: firstLoginToken,
          newPassword: resetPassword
        }
      })
      localStorage.setItem(TOKEN_KEY, response.token)
      setToken(response.token)
      setUser(response.user)
      setFirstLoginToken('')
      setResetPassword('')
      setActiveTab(defaultTabForUser(response.user))
      setNotice('Password reset complete and session started.')
    })
  }

  const handleLogout = async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST', token })
    } catch {
      // Ignore logout errors and clear local state anyway.
    }

    localStorage.removeItem(TOKEN_KEY)
    setToken('')
    setUser(null)
    setActiveTab('Org Management')
    setNotice('Logged out')
  }

  const refreshTab = async () => {
    await runAction(async () => {
      await loadTabData(activeTab)
    }, 'Refreshed')
  }

  const createOrg = async (event) => {
    event.preventDefault()
    await runAction(async () => {
      await apiRequest('/orgs', { method: 'POST', token, body: orgCreateForm })
      setOrgCreateForm({ orgName: '', orgSlug: '', orgType: 'pharma_direct' })
      await loadTabData('Org Management')
    }, 'Organisation created')
  }

  const updateOrgStatus = async (orgId, status) => {
    await runAction(async () => {
      await apiRequest(`/orgs/${orgId}/status`, {
        method: 'PATCH',
        token,
        body: { status }
      })
      await loadTabData('Org Management')
    }, `Organisation ${status}`)
  }

  const saveOrgSettings = async (event) => {
    event.preventDefault()
    await runAction(async () => {
      const targetOrgId = Number(orgSettingsTargetOrgId || user?.orgId)
      if (!targetOrgId) {
        throw new Error('Select an organisation before saving settings')
      }

      const response = await apiRequest(`/orgs/${targetOrgId}/settings`, {
        method: 'PATCH',
        token,
        body: { settings: orgSettingsForm }
      })

      setOrgSettingsForm({
        ...ORG_SETTINGS_DEFAULTS,
        ...(response.settings || {})
      })
      await loadTabData('Org Management')
    }, 'Organisation settings updated')
  }

  const changeOrgSettingsTarget = async (nextOrgId) => {
    if (!nextOrgId) return
    await runAction(async () => {
      await loadOrgSettings(Number(nextOrgId))
    })
  }

  const createClient = async (event) => {
    event.preventDefault()
    await runAction(async () => {
      await apiRequest('/clients', {
        method: 'POST',
        token,
        body: {
          parentOrgId: Number(clientCreateForm.parentOrgId),
          clientName: clientCreateForm.clientName,
          clientCode: clientCreateForm.clientCode
        }
      })
      setClientCreateForm((prev) => ({ ...prev, clientName: '', clientCode: '' }))
      await loadTabData('Client Hierarchy')
    }, 'Client created')
  }

  const updateClientStatus = async (clientId, status) => {
    await runAction(async () => {
      await apiRequest(`/clients/${clientId}/status`, {
        method: 'PATCH',
        token,
        body: { status }
      })
      await loadTabData('Client Hierarchy')
    }, `Client ${status}`)
  }

  const inviteUser = async (event) => {
    event.preventDefault()
    await runAction(async () => {
      const response = await apiRequest('/users/invite', {
        method: 'POST',
        token,
        body: {
          ...userInviteForm,
          orgId: userInviteForm.orgId ? Number(userInviteForm.orgId) : undefined,
          clientId: userInviteForm.clientId ? Number(userInviteForm.clientId) : undefined
        }
      })
      setUserInviteForm((prev) => ({ ...prev, fullName: '', email: '' }))
      await loadTabData('User Management')
      setNotice(`User invited. ${response.activationToken ? `Dev token: ${response.activationToken}` : ''}`)
    })
  }

  const updateUserStatus = async (userId, status) => {
    await runAction(async () => {
      await apiRequest(`/users/${userId}/status`, {
        method: 'PATCH',
        token,
        body: { status }
      })
      await loadTabData('User Management')
    }, `User ${status}`)
  }

  const updateUserRole = async (userId, fallbackRole) => {
    const role = roleDrafts[userId] || fallbackRole
    await runAction(async () => {
      await apiRequest(`/users/${userId}/role`, {
        method: 'PATCH',
        token,
        body: { role }
      })
      await loadTabData('User Management')
    }, 'User role updated')
  }

  const createProduct = async (event) => {
    event.preventDefault()
    await runAction(async () => {
      await apiRequest('/products', {
        method: 'POST',
        token,
        body: {
          ...productForm,
          orgId: productForm.orgId ? Number(productForm.orgId) : undefined,
          clientId: productForm.clientId ? Number(productForm.clientId) : undefined
        }
      })
      setProductForm((prev) => ({ ...prev, productName: '', productCode: '' }))
      await loadTabData('Product Config')
    }, 'Product created')
  }

  const createCase = async (event) => {
    event.preventDefault()
    await runAction(async () => {
      const attachments = attachmentInput
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
        .map((url, index) => ({
          name: `Attachment ${index + 1}`,
          url,
          type: 'external_link'
        }))

      const duplicateCheck = await apiRequest('/cases/precheck/duplicates', {
        method: 'POST',
        token,
        body: {
          orgId: caseCreateForm.orgId ? Number(caseCreateForm.orgId) : undefined,
          clientId: caseCreateForm.clientId ? Number(caseCreateForm.clientId) : undefined,
          patientReference: caseCreateForm.patientReference,
          patientSex: caseCreateForm.patientSex || undefined,
          patientAgeYears: caseCreateForm.patientAgeYears ? Number(caseCreateForm.patientAgeYears) : undefined,
          patientWeightKg: caseCreateForm.patientWeightKg ? Number(caseCreateForm.patientWeightKg) : undefined,
          aeDescription: caseCreateForm.aeDescription,
          aeOnsetDate: caseCreateForm.aeOnsetDate || undefined,
          suspectProductId: Number(caseCreateForm.suspectProductId)
        }
      })
      setDuplicatePrecheck(duplicateCheck)

      const payload = {
        ...caseCreateForm,
        orgId: caseCreateForm.orgId ? Number(caseCreateForm.orgId) : undefined,
        clientId: caseCreateForm.clientId ? Number(caseCreateForm.clientId) : undefined,
        suspectProductId: Number(caseCreateForm.suspectProductId),
        patientAgeYears: caseCreateForm.patientAgeYears ? Number(caseCreateForm.patientAgeYears) : undefined,
        patientWeightKg: caseCreateForm.patientWeightKg ? Number(caseCreateForm.patientWeightKg) : undefined,
        patientDateOfBirth: caseCreateForm.patientDateOfBirth || undefined,
        aeOnsetDate: caseCreateForm.aeOnsetDate || undefined,
        regulatoryClockDays: caseCreateForm.regulatoryClockDays ? Number(caseCreateForm.regulatoryClockDays) : undefined,
        attachments
      }

      await apiRequest('/cases', {
        method: 'POST',
        token,
        body: payload
      })

      setCaseCreateForm((prev) => ({
        ...prev,
        reporterName: '',
        reporterEmail: '',
        patientReference: '',
        aeDescription: '',
        suspectProductId: '',
        patientAgeYears: '',
        patientSex: '',
        patientWeightKg: '',
        patientDateOfBirth: '',
        dose: '',
        route: '',
        aeOnsetDate: ''
      }))
      setAttachmentInput('')

      await loadTabData('Case Management')
    }, 'Case intake created')
  }

  const saveCaseTriage = async (caseId) => {
    const draft = caseDrafts[caseId]
    if (!draft) return
    await runAction(async () => {
      await apiRequest(`/cases/${caseId}/triage`, {
        method: 'PATCH',
        token,
        body: draft
      })
      await loadTabData('Case Management')
    }, 'Case triage updated')
  }

  const moveCaseStatus = async (caseId) => {
    const status = statusDrafts[caseId]
    if (!status) return
    await runAction(async () => {
      await apiRequest(`/cases/${caseId}/status`, {
        method: 'POST',
        token,
        body: { status, note: 'ui_transition' }
      })
      await loadTabData('Case Management')
    }, `Case moved to ${status}`)
  }

  const recalcRegulatoryClock = async (caseId) => {
    const rawDays = Number(clockDrafts[caseId])
    await runAction(async () => {
      await apiRequest(`/cases/${caseId}/regulatory-clock`, {
        method: 'PATCH',
        token,
        body: {
          clockDays: Number.isInteger(rawDays) ? rawDays : 15
        }
      })
      await loadTabData('Case Management')
    }, 'Regulatory clock updated')
  }

  const saveCaseDraft = async () => {
    await runAction(async () => {
      await apiRequest(`/cases/drafts/${encodeURIComponent(caseCreateForm.draftKey || 'default')}`, {
        method: 'PUT',
        token,
        body: {
          orgId: caseCreateForm.orgId ? Number(caseCreateForm.orgId) : undefined,
          draftPayload: caseCreateForm
        }
      })
      await loadTabData('Case Management')
    }, 'Intake draft saved')
  }

  const loadCaseDraft = async (draftPayload) => {
    setCaseCreateForm((prev) => ({ ...prev, ...draftPayload }))
    setNotice('Draft loaded into intake form')
  }

  const deleteCaseDraft = async (draftKey) => {
    await runAction(async () => {
      await apiRequest(`/cases/drafts/${encodeURIComponent(draftKey)}`, {
        method: 'DELETE',
        token
      })
      await loadTabData('Case Management')
    }, 'Draft deleted')
  }

  const runDuplicatePrecheck = async () => {
    await runAction(async () => {
      const result = await apiRequest('/cases/precheck/duplicates', {
        method: 'POST',
        token,
        body: {
          orgId: caseCreateForm.orgId ? Number(caseCreateForm.orgId) : undefined,
          clientId: caseCreateForm.clientId ? Number(caseCreateForm.clientId) : undefined,
          patientReference: caseCreateForm.patientReference,
          patientSex: caseCreateForm.patientSex || undefined,
          patientAgeYears: caseCreateForm.patientAgeYears ? Number(caseCreateForm.patientAgeYears) : undefined,
          patientWeightKg: caseCreateForm.patientWeightKg ? Number(caseCreateForm.patientWeightKg) : undefined,
          aeDescription: caseCreateForm.aeDescription,
          aeOnsetDate: caseCreateForm.aeOnsetDate || undefined,
          suspectProductId: Number(caseCreateForm.suspectProductId)
        }
      })
      setDuplicatePrecheck(result)
    }, 'Duplicate precheck completed')
  }

  const assignCaseReviewer = async (caseId) => {
    const reviewerUserId = Number(reviewerDrafts[caseId])
    if (!Number.isInteger(reviewerUserId) || reviewerUserId <= 0) {
      setError('Select a reviewer first')
      return
    }
    await runAction(async () => {
      await apiRequest(`/cases/${caseId}/assign-reviewer`, {
        method: 'PATCH',
        token,
        body: { reviewerUserId }
      })
      await loadTabData('Case Management')
    }, 'Reviewer assigned')
  }

  const markCaseException = async (caseId) => {
    const reason = (exceptionDrafts[caseId] || '').trim()
    if (!reason) {
      setError('Exception reason is required')
      return
    }
    await runAction(async () => {
      await apiRequest(`/cases/${caseId}/exception`, {
        method: 'POST',
        token,
        body: { reason }
      })
      await loadTabData('Case Management')
    }, 'Case moved to exception')
  }

  const runRegClockAction = async (caseId) => {
    const action = clockActionDrafts[caseId] || 'pause'
    await runAction(async () => {
      await apiRequest(`/cases/${caseId}/regulatory-clock/action`, {
        method: 'POST',
        token,
        body: { action }
      })
      await loadTabData('Case Management')
    }, `Regulatory clock ${action}`)
  }

  const runRegulatoryAlerts = async () => {
    await runAction(async () => {
      await apiRequest('/cases/regulatory/alerts/run', {
        method: 'POST',
        token
      })
      await loadTabData('Case Management')
    }, 'Regulatory alerts refreshed')
  }

  const saveCaseFilter = async () => {
    if (!saveFilterName.trim()) {
      setError('Filter name is required')
      return
    }
    await runAction(async () => {
      await apiRequest('/cases/dashboard/filters', {
        method: 'POST',
        token,
        body: {
          filterName: saveFilterName.trim(),
          filterPayload: {
            search: caseFilterForm.search,
            status: caseFilterForm.status,
            priority: caseFilterForm.priority,
            dueBucket: caseFilterForm.dueBucket
          }
        }
      })
      setSaveFilterName('')
      await loadTabData('Case Management')
    }, 'Case filter saved')
  }

  const applyCaseSavedFilter = async (filterId) => {
    setActiveSavedFilterId(String(filterId))
    await runAction(async () => {
      await loadTabData('Case Management')
    }, 'Saved filter applied')
  }

  const clearCaseSavedFilter = async () => {
    setActiveSavedFilterId('')
    await runAction(async () => {
      await loadTabData('Case Management')
    }, 'Saved filter cleared')
  }

  const runCaseSearch = async () => {
    await runAction(async () => {
      await loadTabData('Case Management')
    }, 'Case filters applied')
  }

  const selectCase = async (caseId) => {
    setSelectedCaseId(caseId)
    await runAction(async () => {
      await loadCaseDetailCards(caseId)
    })
  }

  const generateNarrative = async () => {
    if (!selectedCaseId) return
    await runAction(async () => {
      await apiRequest(`/cases/${selectedCaseId}/narrative/generate`, {
        method: 'POST',
        token
      })
      await loadCaseDetailCards(selectedCaseId)
    }, 'Narrative generated')
  }

  const saveNarrativeText = async () => {
    if (!selectedCaseId || !selectedCaseNarratives.length) return
    const latest = selectedCaseNarratives[0]
    await runAction(async () => {
      await apiRequest(`/cases/${selectedCaseId}/narrative/${latest.narrative_id}`, {
        method: 'PATCH',
        token,
        body: {
          narrativeText: narrativeDraft
        }
      })
      await loadCaseDetailCards(selectedCaseId)
    }, 'Narrative updated')
  }

  const approveNarrative = async () => {
    if (!selectedCaseId || !selectedCaseNarratives.length) return
    const latest = selectedCaseNarratives[0]
    await runAction(async () => {
      await apiRequest(`/cases/${selectedCaseId}/narrative/${latest.narrative_id}`, {
        method: 'PATCH',
        token,
        body: {
          approve: true
        }
      })
      await loadCaseDetailCards(selectedCaseId)
    }, 'Narrative approved')
  }

  const assessListedness = async () => {
    if (!selectedCaseId) return
    await runAction(async () => {
      await apiRequest(`/cases/${selectedCaseId}/listedness`, {
        method: 'POST',
        token,
        body: {
          sourceReference: listednessForm.sourceReference,
          listedness: listednessForm.listedness,
          expectedness: listednessForm.expectedness,
          rationale: listednessForm.rationale
        }
      })
      await loadCaseDetailCards(selectedCaseId)
      setListednessForm({
        sourceReference: '',
        listedness: 'unknown',
        expectedness: 'unknown',
        rationale: ''
      })
    }, 'Listedness assessed')
  }

  const exportCaseAudit = async () => {
    await runAction(async () => {
      const response = await fetch(`${API_BASE_URL}/cases/audit/export`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const csv = await response.text()
      if (!response.ok) {
        throw new Error(csv || 'Failed to export case audit')
      }
      setNotice(`Case audit CSV ready (${csv.split('\n').length - 1} rows).`)
    })
  }

  const saveCaseConfig = async (event) => {
    event.preventDefault()
    await runAction(async () => {
      const result = await apiRequest('/case-config', {
        method: 'PUT',
        token,
        body: {
          orgId: caseForm.orgId ? Number(caseForm.orgId) : undefined,
          casePrefix: caseForm.casePrefix,
          sequencePadding: Number(caseForm.sequencePadding),
          isActive: caseForm.isActive
        }
      })
      setCaseConfig(result.config)
    }, 'Case ID configuration updated')
  }

  const generateCaseId = async () => {
    await runAction(async () => {
      const generated = await apiRequest('/case-config/generate', {
        method: 'POST',
        token,
        body: { orgId: caseForm.orgId ? Number(caseForm.orgId) : undefined }
      })
      await loadTabData('Case ID Config')
      setNotice(`Generated Case ID: ${generated.caseId}`)
    })
  }

  const saveSystemConfig = async (event) => {
    event.preventDefault()
    await runAction(async () => {
      const response = await apiRequest('/system-config', {
        method: 'PUT',
        token,
        body: { config: systemForm }
      })
      setSystemConfig(response.config)
    }, 'System configuration saved')
  }

  const sendTestEmail = async () => {
    await runAction(async () => {
      await apiRequest('/system-config/test-email', {
        method: 'POST',
        token,
        body: { toEmail: user?.email }
      })
    }, 'SMTP test email sent')
  }

  const revokeSession = async (sessionId) => {
    await runAction(async () => {
      await apiRequest(`/sessions/${sessionId}/revoke`, {
        method: 'POST',
        token,
        body: { reason: 'manual_revoke_from_ui' }
      })
      await loadTabData('Audit Trail View')
    }, 'Session revoked')
  }

  if (!token || !user) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-brand">
            <h1>Pharaxis Safety</h1>
            <p className="sub">Sprint 1 Foundation Console</p>
          </div>

          {firstLoginToken ? (
            <form onSubmit={handleFirstLoginReset} className="stack">
              <h2>First Login Reset</h2>
              <label>
                First Login Token
                <input value={firstLoginToken} onChange={(e) => setFirstLoginToken(e.target.value)} required />
              </label>
              <label>
                New Password
                <input type="password" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} required />
              </label>
              <button type="submit" disabled={loading}>Complete Reset</button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="stack">
              <h2>Login</h2>
              <label>
                Org Slug
                <input value={loginForm.orgSlug} onChange={(e) => setLoginForm((prev) => ({ ...prev, orgSlug: e.target.value }))} required />
              </label>
              <label>
                Email
                <input type="email" value={loginForm.email} onChange={(e) => setLoginForm((prev) => ({ ...prev, email: e.target.value }))} required />
              </label>
              <label>
                Password
                <input type="password" value={loginForm.password} onChange={(e) => setLoginForm((prev) => ({ ...prev, password: e.target.value }))} required />
              </label>
              <button type="submit" disabled={loading}>Login</button>
            </form>
          )}

          <form onSubmit={handleForgotPassword} className="stack">
            <h2>Forgot Password</h2>
            <label>
              Org Slug
              <input value={forgotForm.orgSlug} onChange={(e) => setForgotForm((prev) => ({ ...prev, orgSlug: e.target.value }))} required />
            </label>
            <label>
              Email
              <input type="email" value={forgotForm.email} onChange={(e) => setForgotForm((prev) => ({ ...prev, email: e.target.value }))} required />
            </label>
            <button type="submit" disabled={loading}>Send Reset Link</button>
          </form>

          {error ? <p className="error">{error}</p> : null}
          {notice ? <p className="notice">{notice}</p> : null}
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>Pharaxis Safety</h1>
          <p>{user.orgName} · {user.role}</p>
        </div>
        <div className="header-actions">
          <button onClick={refreshTab} disabled={loading}>Refresh</button>
          <button onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <section className="stat-strip">
        <StatTile label="Organisations" value={moduleStats.orgs} />
        <StatTile label="Clients" value={moduleStats.clients} />
        <StatTile label="Users" value={moduleStats.users} />
        <StatTile label="Cases" value={moduleStats.cases} />
        <StatTile label="Active Sessions" value={moduleStats.activeSessions} />
        <StatTile label="Audit Rows" value={moduleStats.auditRows} />
      </section>

      <nav className="tab-row">
        {allowedTabs.map((tab) => (
          <button
            key={tab}
            className={tab === activeTab ? 'tab active' : 'tab'}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </nav>

      {error ? <div className="error-banner">{error}</div> : null}
      {notice ? <div className="notice-banner">{notice}</div> : null}

      <main className="content-grid">
        {activeTab === 'Org Management' ? (
          <>
            <SectionCard title="Organisations" hint="Super Admin controls platform-level org lifecycle" accent="teal">
              <table>
                <thead>
                  <tr>
                    <th>Org</th>
                    <th>Slug</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {orgs.map((org) => (
                    <tr key={org.org_id}>
                      <td>{org.org_name}</td>
                      <td>{org.org_slug}</td>
                      <td>{org.org_type}</td>
                      <td><span className={`badge ${org.status}`}>{org.status}</span></td>
                      <td>
                        {user.role === 'SUPER_ADMIN' ? (
                          <button
                            className="mini"
                            onClick={() => updateOrgStatus(org.org_id, org.status === 'active' ? 'inactive' : 'active')}
                            disabled={loading}
                          >
                            {org.status === 'active' ? 'Deactivate' : 'Activate'}
                          </button>
                        ) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </SectionCard>

            <SectionCard title="Org Settings" hint="Configuration stored at organisation level with audit tracking" accent="blue">
              <form onSubmit={saveOrgSettings} className="stack compact">
                {user.role === 'SUPER_ADMIN' ? (
                  <label>
                    Organisation
                    <select
                      value={orgSettingsTargetOrgId}
                      onChange={(e) => {
                        setOrgSettingsTargetOrgId(e.target.value)
                        changeOrgSettingsTarget(e.target.value)
                      }}
                    >
                      {orgs.map((org) => (
                        <option key={org.org_id} value={org.org_id}>
                          {org.org_name} ({org.org_type})
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                <label>
                  Safety Inbox Email
                  <input
                    type="email"
                    placeholder="safety-inbox@client.com"
                    value={orgSettingsForm.safetyInboxEmail || ''}
                    onChange={(e) => setOrgSettingsForm((prev) => ({ ...prev, safetyInboxEmail: e.target.value }))}
                  />
                </label>

                <label>
                  Timezone
                  <input
                    placeholder="UTC / Asia/Kolkata"
                    value={orgSettingsForm.timezone || ''}
                    onChange={(e) => setOrgSettingsForm((prev) => ({ ...prev, timezone: e.target.value }))}
                  />
                </label>

                <label>
                  Case Intake Mode
                  <select
                    value={orgSettingsForm.caseIntakeMode || 'manual'}
                    onChange={(e) => setOrgSettingsForm((prev) => ({ ...prev, caseIntakeMode: e.target.value }))}
                  >
                    <option value="manual">manual</option>
                    <option value="email">email</option>
                    <option value="api">api</option>
                  </select>
                </label>

                <label>
                  Default Triage Priority
                  <select
                    value={orgSettingsForm.defaultTriagePriority || 'medium'}
                    onChange={(e) => setOrgSettingsForm((prev) => ({ ...prev, defaultTriagePriority: e.target.value }))}
                  >
                    <option value="low">low</option>
                    <option value="medium">medium</option>
                    <option value="high">high</option>
                    <option value="critical">critical</option>
                  </select>
                </label>

                <label>
                  Dashboard Accent
                  <select
                    value={orgSettingsForm.dashboardAccent || 'teal'}
                    onChange={(e) => setOrgSettingsForm((prev) => ({ ...prev, dashboardAccent: e.target.value }))}
                  >
                    <option value="teal">teal</option>
                    <option value="blue">blue</option>
                    <option value="emerald">emerald</option>
                    <option value="sunset">sunset</option>
                  </select>
                </label>

                <label className="inline">
                  <input
                    type="checkbox"
                    checked={Boolean(orgSettingsForm.autoAssignMedicalReviewer)}
                    onChange={(e) => setOrgSettingsForm((prev) => ({ ...prev, autoAssignMedicalReviewer: e.target.checked }))}
                  />
                  Auto-Assign Medical Reviewer
                </label>

                <label className="inline">
                  <input
                    type="checkbox"
                    checked={Boolean(orgSettingsForm.requireStudyCode)}
                    onChange={(e) => setOrgSettingsForm((prev) => ({ ...prev, requireStudyCode: e.target.checked }))}
                  />
                  Require Study Code During Intake
                </label>

                <button type="submit" disabled={loading}>Save Org Settings</button>
              </form>
            </SectionCard>

            {user.role === 'SUPER_ADMIN' ? (
              <SectionCard title="Create Organisation" hint="Only Super Admin can create organisations" accent="blue">
                <form onSubmit={createOrg} className="stack compact">
                  <input placeholder="Organisation Name" value={orgCreateForm.orgName} onChange={(e) => setOrgCreateForm((prev) => ({ ...prev, orgName: e.target.value }))} required />
                  <input placeholder="Org Slug" value={orgCreateForm.orgSlug} onChange={(e) => setOrgCreateForm((prev) => ({ ...prev, orgSlug: e.target.value }))} />
                  <select value={orgCreateForm.orgType} onChange={(e) => setOrgCreateForm((prev) => ({ ...prev, orgType: e.target.value }))}>
                    <option value="pharma_direct">pharma_direct</option>
                    <option value="CRO">CRO</option>
                  </select>
                  <button type="submit" disabled={loading}>Create Org</button>
                </form>
              </SectionCard>
            ) : null}
          </>
        ) : null}

        {activeTab === 'Client Hierarchy' ? (
          <>
            <SectionCard title="Pharma Clients" hint="CRO client hierarchy with data isolation" accent="teal">
              <table>
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Code</th>
                    <th>Parent Org</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client) => (
                    <tr key={client.client_id}>
                      <td>{client.client_name}</td>
                      <td>{client.client_code}</td>
                      <td>{client.parent_org_id}</td>
                      <td><span className={`badge ${client.status}`}>{client.status}</span></td>
                      <td>
                        <button
                          className="mini"
                          onClick={() => updateClientStatus(client.client_id, client.status === 'active' ? 'inactive' : 'active')}
                          disabled={loading}
                        >
                          {client.status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </SectionCard>

            <SectionCard title="Create Client" hint="Parent org must be CRO type" accent="blue">
              <form onSubmit={createClient} className="stack compact">
                <input placeholder="Parent Org ID" value={clientCreateForm.parentOrgId} onChange={(e) => setClientCreateForm((prev) => ({ ...prev, parentOrgId: e.target.value }))} required />
                <input placeholder="Client Name" value={clientCreateForm.clientName} onChange={(e) => setClientCreateForm((prev) => ({ ...prev, clientName: e.target.value }))} required />
                <input placeholder="Client Code" value={clientCreateForm.clientCode} onChange={(e) => setClientCreateForm((prev) => ({ ...prev, clientCode: e.target.value }))} required />
                <button type="submit" disabled={loading}>Create Client</button>
              </form>
            </SectionCard>
          </>
        ) : null}

        {activeTab === 'User Management' ? (
          <>
            <SectionCard title="Users" hint="Invite, activate/deactivate, and role controls" accent="teal">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Role Action</th>
                    <th>Status Action</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((entry) => (
                    <tr key={entry.user_id}>
                      <td>{entry.full_name}</td>
                      <td>{entry.email}</td>
                      <td>
                        <select
                          className="inline-select"
                          value={roleDrafts[entry.user_id] || entry.role}
                          onChange={(e) => setRoleDrafts((prev) => ({ ...prev, [entry.user_id]: e.target.value }))}
                        >
                          {ROLE_OPTIONS.map((role) => (
                            <option key={role} value={role}>{role}</option>
                          ))}
                        </select>
                      </td>
                      <td><span className={`badge ${entry.status === 'active' ? 'active' : 'inactive'}`}>{entry.status}</span></td>
                      <td>
                        <button className="mini" onClick={() => updateUserRole(entry.user_id, entry.role)} disabled={loading}>
                          Save Role
                        </button>
                      </td>
                      <td>
                        <button
                          className="mini"
                          onClick={() => updateUserStatus(entry.user_id, entry.status === 'inactive' ? 'active' : 'inactive')}
                          disabled={loading}
                        >
                          {entry.status === 'inactive' ? 'Activate' : 'Deactivate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </SectionCard>

            <SectionCard title="Invite User" hint="Activation link includes final password setup" accent="blue">
              <form onSubmit={inviteUser} className="stack compact">
                <input placeholder="Full Name" value={userInviteForm.fullName} onChange={(e) => setUserInviteForm((prev) => ({ ...prev, fullName: e.target.value }))} required />
                <input type="email" placeholder="Email" value={userInviteForm.email} onChange={(e) => setUserInviteForm((prev) => ({ ...prev, email: e.target.value }))} required />
                <select value={userInviteForm.role} onChange={(e) => setUserInviteForm((prev) => ({ ...prev, role: e.target.value }))}>
                  <option value="CRO_ADMIN">CRO_ADMIN</option>
                  <option value="SAFETY_SCIENTIST">SAFETY_SCIENTIST</option>
                  <option value="MEDICAL_REVIEWER">MEDICAL_REVIEWER</option>
                  <option value="READ_ONLY">READ_ONLY</option>
                  {user.role === 'SUPER_ADMIN' ? <option value="SUPER_ADMIN">SUPER_ADMIN</option> : null}
                </select>
                <input placeholder="Org ID (optional for Super Admin)" value={userInviteForm.orgId} onChange={(e) => setUserInviteForm((prev) => ({ ...prev, orgId: e.target.value }))} />
                <input placeholder="Client ID (optional)" value={userInviteForm.clientId} onChange={(e) => setUserInviteForm((prev) => ({ ...prev, clientId: e.target.value }))} />
                <button type="submit" disabled={loading}>Invite User</button>
              </form>
            </SectionCard>
          </>
        ) : null}

        {activeTab === 'Product Config' ? (
          <>
            <SectionCard title="Products" hint="Product setup linked to org/client scope" accent="teal">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Code</th>
                    <th>Org</th>
                    <th>Client</th>
                    <th>Indications</th>
                    <th>Study Codes</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.product_id}>
                      <td>{product.product_name}</td>
                      <td>{product.product_code}</td>
                      <td>{product.org_id}</td>
                      <td>{product.client_name || '-'}</td>
                      <td>{product.indication_count}</td>
                      <td>{product.study_code_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </SectionCard>

            <SectionCard title="Create Product" hint="Configure product source for case intake dropdown" accent="blue">
              <form onSubmit={createProduct} className="stack compact">
                <input placeholder="Org ID (optional for Super Admin)" value={productForm.orgId} onChange={(e) => setProductForm((prev) => ({ ...prev, orgId: e.target.value }))} />
                <input placeholder="Client ID (optional)" value={productForm.clientId} onChange={(e) => setProductForm((prev) => ({ ...prev, clientId: e.target.value }))} />
                <input placeholder="Product Name" value={productForm.productName} onChange={(e) => setProductForm((prev) => ({ ...prev, productName: e.target.value }))} required />
                <input placeholder="Product Code" value={productForm.productCode} onChange={(e) => setProductForm((prev) => ({ ...prev, productCode: e.target.value }))} required />
                <button type="submit" disabled={loading}>Create Product</button>
              </form>
            </SectionCard>
          </>
        ) : null}

        {activeTab === 'Case Management' ? (
          <>
            <SectionCard title="Case Dashboard" hint="Live operational summary for case processing" accent="teal">
              <div className="stat-strip">
                <StatTile label="Total Cases" value={caseDashboard.totalCases || 0} />
                <StatTile label="Open Cases" value={caseDashboard.openCases || 0} />
                <StatTile label="Overdue Cases" value={caseDashboard.overdueCases || 0} />
                <StatTile label="Rows Loaded" value={caseRows.length} />
              </div>
              <p className="mini-note">
                Status: {(caseDashboard.byStatus || []).map((item) => `${item.status}:${item.count}`).join(' · ') || 'No cases'}
              </p>
              <p className="mini-note">
                Overdue Segments: {Object.entries(caseDashboard.overdueBuckets || {}).map(([key, value]) => `${key}:${value}`).join(' · ') || 'No data'}
              </p>
              <p className="mini-note">
                Client Mix: {(caseDashboard.byClient || []).slice(0, 4).map((item) => `${item.clientName}:${item.count}`).join(' · ') || 'No data'}
              </p>
            </SectionCard>

            <SectionCard title="Filters and Alerts" hint="Saved filters, alert refresh, and audit export" accent="blue">
              <form
                className="stack compact"
                onSubmit={(event) => {
                  event.preventDefault()
                  runCaseSearch()
                }}
              >
                <input
                  placeholder="Search case/patient/reporter/AE"
                  value={caseFilterForm.search}
                  onChange={(e) => setCaseFilterForm((prev) => ({ ...prev, search: e.target.value }))}
                />
                <select value={caseFilterForm.status} onChange={(e) => setCaseFilterForm((prev) => ({ ...prev, status: e.target.value }))}>
                  <option value="">All Status</option>
                  <option value="new">new</option>
                  <option value="triaged">triaged</option>
                  <option value="in_review">in_review</option>
                  <option value="closed">closed</option>
                  <option value="exception">exception</option>
                </select>
                <select value={caseFilterForm.priority} onChange={(e) => setCaseFilterForm((prev) => ({ ...prev, priority: e.target.value }))}>
                  <option value="">All Priority</option>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                  <option value="critical">critical</option>
                </select>
                <select value={caseFilterForm.dueBucket} onChange={(e) => setCaseFilterForm((prev) => ({ ...prev, dueBucket: e.target.value }))}>
                  <option value="">All Due Buckets</option>
                  <option value="overdue">overdue</option>
                  <option value="due_0_2">due_0_2</option>
                  <option value="due_3_7">due_3_7</option>
                  <option value="due_8_plus">due_8_plus</option>
                </select>
                <button type="submit" disabled={loading}>Apply Filters</button>
              </form>
              <div className="inline">
                <input
                  placeholder="Save current filter as"
                  value={saveFilterName}
                  onChange={(e) => setSaveFilterName(e.target.value)}
                />
                <button className="mini" onClick={saveCaseFilter} disabled={loading}>Save Filter</button>
              </div>
              <div className="chip-row">
                {savedCaseFilters.map((filter) => (
                  <button key={filter.filter_id} className="mini" onClick={() => applyCaseSavedFilter(filter.filter_id)}>
                    {filter.filter_name}
                  </button>
                ))}
                {activeSavedFilterId ? (
                  <button className="mini" onClick={clearCaseSavedFilter} disabled={loading}>Clear Saved</button>
                ) : null}
              </div>
              <div className="inline">
                <button className="mini" onClick={runRegulatoryAlerts} disabled={loading}>Run Alerts</button>
                <button className="mini" onClick={exportCaseAudit} disabled={loading}>Export Audit CSV</button>
              </div>
              <p className="mini-note">
                Active alerts: {(caseAlerts || []).slice(0, 4).map((alert) => `${alert.case_number}:${alert.alert_type}`).join(' · ') || 'No active alerts'}
              </p>
            </SectionCard>

            <SectionCard title="Case Intake" hint="Reporter + patient + AE + suspect product" accent="blue">
              <form onSubmit={createCase} className="stack compact">
                {user.role === 'SUPER_ADMIN' ? (
                  <input
                    placeholder="Org ID"
                    value={caseCreateForm.orgId}
                    onChange={(e) => setCaseCreateForm((prev) => ({ ...prev, orgId: e.target.value }))}
                  />
                ) : null}
                <input
                  placeholder="Client ID (required for CRO)"
                    value={caseCreateForm.clientId}
                    onChange={(e) => setCaseCreateForm((prev) => ({ ...prev, clientId: e.target.value }))}
                  />
                <input
                  placeholder="Draft Key"
                  value={caseCreateForm.draftKey}
                  onChange={(e) => setCaseCreateForm((prev) => ({ ...prev, draftKey: e.target.value }))}
                />
                <input
                  placeholder="Reporter Name"
                  value={caseCreateForm.reporterName}
                  onChange={(e) => setCaseCreateForm((prev) => ({ ...prev, reporterName: e.target.value }))}
                  required
                />
                <input
                  type="email"
                  placeholder="Reporter Email (optional)"
                  value={caseCreateForm.reporterEmail}
                  onChange={(e) => setCaseCreateForm((prev) => ({ ...prev, reporterEmail: e.target.value }))}
                />
                <input
                  placeholder="Reporter Country"
                  value={caseCreateForm.reporterCountry}
                  onChange={(e) => setCaseCreateForm((prev) => ({ ...prev, reporterCountry: e.target.value }))}
                />
                <input
                  placeholder="Reporter Qualification"
                  value={caseCreateForm.reporterQualification}
                  onChange={(e) => setCaseCreateForm((prev) => ({ ...prev, reporterQualification: e.target.value }))}
                />
                <input
                  placeholder="Patient Reference"
                  value={caseCreateForm.patientReference}
                  onChange={(e) => setCaseCreateForm((prev) => ({ ...prev, patientReference: e.target.value }))}
                  required
                />
                <input
                  type="number"
                  placeholder="Patient Age (years)"
                  value={caseCreateForm.patientAgeYears}
                  onChange={(e) => setCaseCreateForm((prev) => ({ ...prev, patientAgeYears: e.target.value }))}
                />
                <input
                  type="date"
                  placeholder="Patient Date of Birth"
                  value={caseCreateForm.patientDateOfBirth}
                  onChange={(e) => setCaseCreateForm((prev) => ({ ...prev, patientDateOfBirth: e.target.value }))}
                />
                <select
                  value={caseCreateForm.patientSex}
                  onChange={(e) => setCaseCreateForm((prev) => ({ ...prev, patientSex: e.target.value }))}
                >
                  <option value="">Patient Sex (optional)</option>
                  <option value="male">male</option>
                  <option value="female">female</option>
                  <option value="other">other</option>
                </select>
                <input
                  type="number"
                  step="0.1"
                  placeholder="Patient Weight (kg)"
                  value={caseCreateForm.patientWeightKg}
                  onChange={(e) => setCaseCreateForm((prev) => ({ ...prev, patientWeightKg: e.target.value }))}
                />
                <textarea
                  className="textarea"
                  placeholder="Adverse Event Description"
                  value={caseCreateForm.aeDescription}
                  onChange={(e) => setCaseCreateForm((prev) => ({ ...prev, aeDescription: e.target.value }))}
                  required
                />
                <input
                  type="date"
                  placeholder="AE Onset Date"
                  value={caseCreateForm.aeOnsetDate}
                  onChange={(e) => setCaseCreateForm((prev) => ({ ...prev, aeOnsetDate: e.target.value }))}
                  required
                />
                <input
                  placeholder="Dose (optional)"
                  value={caseCreateForm.dose}
                  onChange={(e) => setCaseCreateForm((prev) => ({ ...prev, dose: e.target.value }))}
                />
                <input
                  placeholder="Route (optional)"
                  value={caseCreateForm.route}
                  onChange={(e) => setCaseCreateForm((prev) => ({ ...prev, route: e.target.value }))}
                />
                <label>
                  Suspect Product
                  <select
                    value={caseCreateForm.suspectProductId}
                    onChange={(e) => setCaseCreateForm((prev) => ({ ...prev, suspectProductId: e.target.value }))}
                    required
                  >
                    <option value="">Select product</option>
                    {productCatalog.map((product) => (
                      <option key={product.product_id} value={product.product_id}>
                        {product.product_name} ({product.product_code})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Seriousness
                  <select
                    value={caseCreateForm.seriousness}
                    onChange={(e) => setCaseCreateForm((prev) => ({ ...prev, seriousness: e.target.value }))}
                  >
                    <option value="non_serious">non_serious</option>
                    <option value="serious">serious</option>
                  </select>
                </label>
                <label>
                  Causality
                  <select
                    value={caseCreateForm.causality}
                    onChange={(e) => setCaseCreateForm((prev) => ({ ...prev, causality: e.target.value }))}
                  >
                    <option value="unknown">unknown</option>
                    <option value="related">related</option>
                    <option value="not_related">not_related</option>
                  </select>
                </label>
                <label>
                  Priority
                  <select
                    value={caseCreateForm.priority}
                    onChange={(e) => setCaseCreateForm((prev) => ({ ...prev, priority: e.target.value }))}
                  >
                    <option value="low">low</option>
                    <option value="medium">medium</option>
                    <option value="high">high</option>
                    <option value="critical">critical</option>
                  </select>
                </label>
                <label>
                  Regulatory Clock (days)
                  <input
                    type="number"
                    min="1"
                    max="90"
                    value={caseCreateForm.regulatoryClockDays}
                    onChange={(e) => setCaseCreateForm((prev) => ({ ...prev, regulatoryClockDays: e.target.value }))}
                  />
                </label>
                <input
                  placeholder="Timezone (e.g., UTC, Asia/Kolkata)"
                  value={caseCreateForm.timezone}
                  onChange={(e) => setCaseCreateForm((prev) => ({ ...prev, timezone: e.target.value }))}
                />
                <input
                  placeholder="Attachment URLs (comma separated)"
                  value={attachmentInput}
                  onChange={(e) => setAttachmentInput(e.target.value)}
                />
                <div className="inline">
                  <button type="button" className="mini" onClick={saveCaseDraft} disabled={loading || user.role === 'READ_ONLY'}>Save Draft</button>
                  <button type="button" className="mini" onClick={runDuplicatePrecheck} disabled={loading}>Precheck Duplicates</button>
                </div>
                <button type="submit" disabled={loading || user.role === 'READ_ONLY'}>Create Case</button>
              </form>
              <div className="chip-row">
                {draftList.map((draft) => (
                  <div key={draft.draft_id} className="inline">
                    <button className="mini" onClick={() => loadCaseDraft(draft.draft_payload)}>{draft.draft_key}</button>
                    <button className="mini" onClick={() => deleteCaseDraft(draft.draft_key)}>x</button>
                  </div>
                ))}
              </div>
              {duplicatePrecheck ? (
                <div className="stack compact">
                  <p className="mini-note">
                    Duplicate precheck: {duplicatePrecheck.duplicateCount || 0} candidates, probable {duplicatePrecheck.probableDuplicates?.length || 0}, onset window {duplicatePrecheck.onsetDateWindowDays || 30} days.
                  </p>
                  {(duplicatePrecheck.allCandidates || []).slice(0, 6).map((row) => (
                    <p key={row.case_pk_id} className="mini-note">
                      {row.case_number} | score {row.duplicateScore} | criteria: {(row.matchedCriteria || []).join(', ') || 'none'}
                    </p>
                  ))}
                </div>
              ) : null}
            </SectionCard>

            <SectionCard title="Cases" hint="Triage, status progression, and regulatory clock control" accent="teal">
              <table>
                <thead>
                  <tr>
                    <th>Case #</th>
                    <th>Patient</th>
                    <th>Product</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>Reviewer</th>
                    <th>Clock</th>
                    <th>Due</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {caseRows.map((row) => (
                    <tr key={row.case_pk_id}>
                      <td>{row.case_number}</td>
                      <td>{row.patient_reference}</td>
                      <td>{row.suspect_product_name || row.suspect_product_id}</td>
                      <td><span className={`badge ${row.status === 'closed' ? 'inactive' : 'active'}`}>{row.status}</span></td>
                      <td>{row.priority}</td>
                      <td>{row.assigned_medical_reviewer_name || '-'}</td>
                      <td>{row.regulatory_clock_days}d</td>
                      <td>{row.regulatory_due_at ? new Date(row.regulatory_due_at).toLocaleDateString() : '-'}</td>
                      <td>
                        {user.role === 'READ_ONLY' ? (
                          <span className="mini-note">view only</span>
                        ) : (
                          <div className="action-grid">
                            <select
                              className="inline-select"
                              value={caseDrafts[row.case_pk_id]?.priority || row.priority}
                              onChange={(e) => setCaseDrafts((prev) => ({
                                ...prev,
                                [row.case_pk_id]: {
                                  ...(prev[row.case_pk_id] || { seriousness: row.seriousness, causality: row.causality, priority: row.priority }),
                                  priority: e.target.value
                                }
                              }))}
                            >
                              <option value="low">low</option>
                              <option value="medium">medium</option>
                              <option value="high">high</option>
                              <option value="critical">critical</option>
                            </select>
                            <button className="mini" onClick={() => saveCaseTriage(row.case_pk_id)} disabled={loading}>Save Triage</button>
                            <select
                              className="inline-select"
                              value={statusDrafts[row.case_pk_id] || row.status}
                              onChange={(e) => setStatusDrafts((prev) => ({ ...prev, [row.case_pk_id]: e.target.value }))}
                            >
                              <option value="new">new</option>
                              <option value="triaged">triaged</option>
                              <option value="in_review">in_review</option>
                              <option value="closed">closed</option>
                              <option value="exception">exception</option>
                            </select>
                            <button className="mini" onClick={() => moveCaseStatus(row.case_pk_id)} disabled={loading}>Move</button>
                            <input
                              className="inline-input"
                              type="number"
                              min="1"
                              max="90"
                              value={clockDrafts[row.case_pk_id] || row.regulatory_clock_days}
                              onChange={(e) => setClockDrafts((prev) => ({ ...prev, [row.case_pk_id]: e.target.value }))}
                            />
                            <button className="mini" onClick={() => recalcRegulatoryClock(row.case_pk_id)} disabled={loading}>Recalc Clock</button>
                            <select
                              className="inline-select"
                              value={reviewerDrafts[row.case_pk_id] || ''}
                              onChange={(e) => setReviewerDrafts((prev) => ({ ...prev, [row.case_pk_id]: e.target.value }))}
                            >
                              <option value="">Reviewer</option>
                              {reviewerOptions.map((reviewer) => (
                                <option key={reviewer.user_id} value={reviewer.user_id}>
                                  {reviewer.full_name}
                                </option>
                              ))}
                            </select>
                            <button className="mini" onClick={() => assignCaseReviewer(row.case_pk_id)} disabled={loading}>Assign</button>
                            <input
                              className="inline-input wide"
                              placeholder="Exception reason"
                              value={exceptionDrafts[row.case_pk_id] || ''}
                              onChange={(e) => setExceptionDrafts((prev) => ({ ...prev, [row.case_pk_id]: e.target.value }))}
                            />
                            <button className="mini" onClick={() => markCaseException(row.case_pk_id)} disabled={loading}>Exception</button>
                            <select
                              className="inline-select"
                              value={clockActionDrafts[row.case_pk_id] || 'pause'}
                              onChange={(e) => setClockActionDrafts((prev) => ({ ...prev, [row.case_pk_id]: e.target.value }))}
                            >
                              <option value="pause">pause</option>
                              <option value="resume">resume</option>
                              <option value="stop">stop</option>
                              <option value="start">start</option>
                            </select>
                            <button className="mini" onClick={() => runRegClockAction(row.case_pk_id)} disabled={loading}>Clock Action</button>
                            <button className="mini" onClick={() => selectCase(row.case_pk_id)} disabled={loading}>Details</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </SectionCard>

            <SectionCard title="Selected Case Deep View" hint="Workflow, duplicates, narrative, listedness/expectedness" accent="blue">
              {selectedCaseId ? (
                <>
                  <p className="mini-note">Selected case id: {selectedCaseId}</p>
                  <p className="mini-note">Workflow: {(selectedCaseWorkflow || []).slice(0, 4).map((row) => `${row.from_status || 'start'}→${row.to_status}`).join(' · ') || 'No workflow events'}</p>
                  <p className="mini-note">
                    Duplicate candidates: {(selectedCaseDuplicates || []).slice(0, 4).map((row) => `${row.case_number}(${row.duplicateScore}) [${(row.matchedCriteria || []).join('/') || 'none'}]`).join(' · ') || 'None'}
                  </p>
                  <div className="stack compact">
                    <div className="inline">
                      <button className="mini" onClick={generateNarrative} disabled={loading || user.role === 'READ_ONLY'}>Generate Narrative</button>
                      <button className="mini" onClick={saveNarrativeText} disabled={loading || user.role === 'READ_ONLY' || !selectedCaseNarratives.length}>Save Narrative</button>
                      <button className="mini" onClick={approveNarrative} disabled={loading || user.role === 'READ_ONLY' || !selectedCaseNarratives.length}>Approve Narrative</button>
                    </div>
                    <textarea
                      className="textarea"
                      placeholder="Narrative text"
                      value={narrativeDraft}
                      onChange={(e) => setNarrativeDraft(e.target.value)}
                    />
                    <input
                      placeholder="Source Reference (SmPC/IB/RSI section)"
                      value={listednessForm.sourceReference}
                      onChange={(e) => setListednessForm((prev) => ({ ...prev, sourceReference: e.target.value }))}
                    />
                    <select
                      value={listednessForm.listedness}
                      onChange={(e) => setListednessForm((prev) => ({ ...prev, listedness: e.target.value }))}
                    >
                      <option value="unknown">listedness: unknown</option>
                      <option value="listed">listedness: listed</option>
                      <option value="unlisted">listedness: unlisted</option>
                    </select>
                    <select
                      value={listednessForm.expectedness}
                      onChange={(e) => setListednessForm((prev) => ({ ...prev, expectedness: e.target.value }))}
                    >
                      <option value="unknown">expectedness: unknown</option>
                      <option value="expected">expectedness: expected</option>
                      <option value="unexpected">expectedness: unexpected</option>
                    </select>
                    <textarea
                      className="textarea"
                      placeholder="Listedness rationale"
                      value={listednessForm.rationale}
                      onChange={(e) => setListednessForm((prev) => ({ ...prev, rationale: e.target.value }))}
                    />
                    <button className="mini" onClick={assessListedness} disabled={loading || user.role === 'READ_ONLY'}>Assess Listedness</button>
                    <p className="mini-note">Latest listedness: {(selectedCaseListedness || [])[0] ? `${selectedCaseListedness[0].listedness} / ${selectedCaseListedness[0].expectedness}` : 'No assessment'}</p>
                  </div>
                </>
              ) : (
                <p className="mini-note">Select a case row to open deep view cards.</p>
              )}
            </SectionCard>

            <SectionCard title="Case Audit Feed" hint="Filtered case audit view (search/action/actor)" accent="teal">
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Case</th>
                    <th>Actor</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {caseAuditRows.map((row) => (
                    <tr key={row.audit_id}>
                      <td>{new Date(row.created_at).toLocaleString()}</td>
                      <td>{row.case_number || row.case_pk_id}</td>
                      <td>{row.actor_name || row.actor_user_id}</td>
                      <td>{row.action_type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </SectionCard>
          </>
        ) : null}

        {activeTab === 'Case ID Config' ? (
          <SectionCard title="Case ID Configuration" hint="Prefix + year + auto-sequence" accent="teal">
            <form onSubmit={saveCaseConfig} className="stack compact">
              <input placeholder="Org ID" value={caseForm.orgId} onChange={(e) => setCaseForm((prev) => ({ ...prev, orgId: e.target.value }))} />
              <input placeholder="Prefix" value={caseForm.casePrefix} onChange={(e) => setCaseForm((prev) => ({ ...prev, casePrefix: e.target.value }))} required />
              <input type="number" min="3" max="12" placeholder="Sequence Padding" value={caseForm.sequencePadding} onChange={(e) => setCaseForm((prev) => ({ ...prev, sequencePadding: e.target.value }))} required />
              <label className="inline">
                <input type="checkbox" checked={caseForm.isActive} onChange={(e) => setCaseForm((prev) => ({ ...prev, isActive: e.target.checked }))} />
                Active
              </label>
              <button type="submit" disabled={loading}>Save Case Config</button>
            </form>
            <button onClick={generateCaseId} disabled={loading}>Generate Next Case ID</button>
            {caseConfig ? <p className="mini-note">Current sequence this year: {caseConfig.currentYearSequence || 0}</p> : null}
          </SectionCard>
        ) : null}

        {activeTab === 'System Config' ? (
          <SectionCard title="System Configuration" hint="SMTP, timeout, retention, notifications" accent="teal">
            <form onSubmit={saveSystemConfig} className="stack compact">
              {Object.keys(systemForm).map((key) => (
                <label key={key}>
                  {key}
                  <input
                    value={systemForm[key] ?? ''}
                    onChange={(e) => setSystemForm((prev) => ({ ...prev, [key]: e.target.value }))}
                  />
                </label>
              ))}
              <button type="submit" disabled={loading}>Save System Config</button>
            </form>
            <button onClick={sendTestEmail} disabled={loading}>Send Test Email</button>
          </SectionCard>
        ) : null}

        {activeTab === 'Audit Trail View' ? (
          <>
            <SectionCard title="Active Sessions" hint="Admin can revoke live sessions" accent="teal">
              <table>
                <thead>
                  <tr>
                    <th>Session ID</th>
                    <th>User</th>
                    <th>Email</th>
                    <th>Last Activity</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session) => (
                    <tr key={session.session_id}>
                      <td>{session.session_id}</td>
                      <td>{session.full_name}</td>
                      <td>{session.email}</td>
                      <td>{new Date(session.last_activity_at).toLocaleString()}</td>
                      <td><span className="badge active">{session.status}</span></td>
                      <td>
                        <button className="mini" onClick={() => revokeSession(session.session_id)} disabled={loading}>Revoke</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </SectionCard>

            <SectionCard title="Audit Trail" hint="Read-only log of admin actions" accent="blue">
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Actor</th>
                    <th>Action</th>
                    <th>Entity</th>
                  </tr>
                </thead>
                <tbody>
                  {auditRows.map((row) => (
                    <tr key={row.audit_id}>
                      <td>{new Date(row.created_at).toLocaleString()}</td>
                      <td>{row.actor_name || row.actor_user_id}</td>
                      <td>{row.action_type}</td>
                      <td>{row.entity_type}:{row.entity_id || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </SectionCard>
          </>
        ) : null}
      </main>
    </div>
  )
}

export default App
