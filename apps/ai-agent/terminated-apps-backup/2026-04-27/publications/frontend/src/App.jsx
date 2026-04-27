import { useEffect, useMemo, useState } from 'react'
import { api, apiUpload } from './api'
import Sprint2Panel from './Sprint2Panel'

const nextStatusMap = {
  concept: 'planning',
  planning: 'writing',
  writing: 'internal_review',
  internal_review: 'journal_submission',
  journal_submission: 'accepted',
  accepted: 'published'
}

const defaultLogin = {
  email: 'superadmin.publications@pharaxis.one',
  password: 'Admin@123'
}

const defaultTenant = {
  name: '',
  slug: ''
}

const defaultInvite = {
  fullName: '',
  email: '',
  role: 'publications_manager'
}

const defaultPublication = {
  title: '',
  publicationType: 'journal_article',
  drugName: '',
  therapeuticArea: '',
  targetVenue: ''
}

const defaultAuthor = {
  fullName: '',
  email: '',
  affiliation: '',
  disclosureStatus: 'incomplete',
  icmjeCategories: ''
}

const defaultMilestone = {
  milestoneName: '',
  dueDate: ''
}

const defaultReviewAssign = {
  reviewerUserIdsCsv: ''
}

const defaultReviewDecision = {
  reviewId: '',
  decision: 'approved',
  comments: ''
}

const defaultPreference = {
  eventKey: 'publication.status_changed',
  emailEnabled: true
}

const defaultInviteAccept = {
  token: '',
  fullName: '',
  password: ''
}

const defaultResetConfirm = {
  token: '',
  newPassword: ''
}

const defaultDisclosureRequest = {
  authorId: '',
  requestNote: ''
}

const defaultDisclosureUpdate = {
  authorId: '',
  signoffStatus: 'signed',
  financialInterests: '',
  companyRelationships: '',
  coiDeclaration: ''
}

const defaultSubmission = {
  submissionType: 'journal',
  venueName: '',
  referenceId: '',
  submissionDate: '',
  peerReviewStatus: 'under_review',
  revisionRound: 0,
  congressDecision: '',
  notes: ''
}

const defaultSubmissionUpdate = {
  submissionId: '',
  venueName: '',
  referenceId: '',
  submissionDate: '',
  peerReviewStatus: '',
  revisionRound: '',
  congressDecision: '',
  notes: ''
}

function toNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function getTransitionBlockMessage(err) {
  const missingRequiredGppItems = Array.isArray(err?.data?.missingRequiredGppItems)
    ? err.data.missingRequiredGppItems
    : []
  const pendingDisclosures = Array.isArray(err?.data?.pendingDisclosures)
    ? err.data.pendingDisclosures
    : []

  if (!missingRequiredGppItems.length && !pendingDisclosures.length) {
    return err.message
  }

  const parts = []
  if (missingRequiredGppItems.length) {
    parts.push(
      `Missing required GPP: ${missingRequiredGppItems.map((item) => item.itemKey || item.itemText || 'item').join(', ')}`
    )
  }
  if (pendingDisclosures.length) {
    parts.push(
      `Pending disclosures: ${pendingDisclosures.map((item) => item.authorName || item.authorId).join(', ')}`
    )
  }

  return `${err.message}. ${parts.join(' | ')}`
}

function buildScopeParams(user, selectedTenantId) {
  const params = new URLSearchParams()
  if (user?.isSuperadmin && selectedTenantId) {
    params.set('tenantId', String(selectedTenantId))
  }
  return params
}

function scopeBody(user, selectedTenantId, body = {}) {
  if (user?.isSuperadmin && selectedTenantId) {
    return { ...body, tenantId: Number(selectedTenantId) }
  }
  return body
}

function App() {
  const [health, setHealth] = useState(null)
  const [token, setToken] = useState('')
  const [user, setUser] = useState(null)

  const [loginForm, setLoginForm] = useState(defaultLogin)
  const [tenantForm, setTenantForm] = useState(defaultTenant)
  const [inviteForm, setInviteForm] = useState(defaultInvite)
  const [publicationForm, setPublicationForm] = useState(defaultPublication)
  const [authorForm, setAuthorForm] = useState(defaultAuthor)
  const [milestoneForm, setMilestoneForm] = useState(defaultMilestone)
  const [reviewAssignForm, setReviewAssignForm] = useState(defaultReviewAssign)
  const [reviewDecisionForm, setReviewDecisionForm] = useState(defaultReviewDecision)
  const [preferenceForm, setPreferenceForm] = useState(defaultPreference)
  const [inviteAcceptForm, setInviteAcceptForm] = useState(defaultInviteAccept)
  const [resetConfirmForm, setResetConfirmForm] = useState(defaultResetConfirm)
  const [disclosureRequestForm, setDisclosureRequestForm] = useState(defaultDisclosureRequest)
  const [disclosureUpdateForm, setDisclosureUpdateForm] = useState(defaultDisclosureUpdate)
  const [submissionForm, setSubmissionForm] = useState(defaultSubmission)
  const [submissionUpdateForm, setSubmissionUpdateForm] = useState(defaultSubmissionUpdate)

  const [tenants, setTenants] = useState([])
  const [selectedTenantId, setSelectedTenantId] = useState('')
  const [users, setUsers] = useState([])
  const [publications, setPublications] = useState([])
  const [selectedPublicationId, setSelectedPublicationId] = useState('')
  const [selectedPublicationDetails, setSelectedPublicationDetails] = useState(null)
  const [dashboard, setDashboard] = useState(null)
  const [auditEntries, setAuditEntries] = useState([])
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [preferences, setPreferences] = useState([])
  const [gppDefaults, setGppDefaults] = useState([])

  const [uploadFile, setUploadFile] = useState(null)

  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const tenantScope = useMemo(() => {
    if (!user) return null
    if (user.isSuperadmin) return Number(selectedTenantId || 0) || null
    return user.tenantId || null
  }, [user, selectedTenantId])

  const canManageGppRequirements = Boolean(
    user?.isSuperadmin || user?.role === 'org_admin' || user?.role === 'publications_manager'
  )
  const canManageTenantGppDefaults = Boolean(user?.isSuperadmin || user?.role === 'org_admin')

  async function checkHealth() {
    try {
      const data = await api('/api/health')
      setHealth(data)
    } catch (err) {
      setError(err.message)
    }
  }

  async function fetchMe(activeToken) {
    const data = await api('/api/auth/me', { token: activeToken })
    setUser(data.user)
  }

  async function loadTenants(activeToken) {
    if (!user?.isSuperadmin) return
    const data = await api('/api/admin/tenants', { token: activeToken })
    setTenants(data.tenants || [])

    if (!selectedTenantId && data.tenants?.[0]?.id) {
      setSelectedTenantId(String(data.tenants[0].id))
    }
  }

  async function loadUsers(activeToken) {
    if (!user) return
    const params = buildScopeParams(user, selectedTenantId)
    const suffix = params.toString() ? `?${params.toString()}` : ''
    const data = await api(`/api/admin/users${suffix}`, { token: activeToken })
    setUsers(data.users || [])
  }

  async function loadPublications(activeToken) {
    if (!user) return
    const params = buildScopeParams(user, selectedTenantId)
    const suffix = params.toString() ? `?${params.toString()}` : ''
    const data = await api(`/api/publications${suffix}`, { token: activeToken })
    setPublications(data.publications || [])
  }

  async function loadPublicationDetails(activeToken, publicationId) {
    if (!publicationId) {
      setSelectedPublicationDetails(null)
      return
    }
    const data = await api(`/api/publications/${publicationId}`, { token: activeToken })
    setSelectedPublicationDetails(data)
  }

  async function loadDashboard(activeToken) {
    if (!user) return
    const params = buildScopeParams(user, selectedTenantId)
    const suffix = params.toString() ? `?${params.toString()}` : ''
    const data = await api(`/api/dashboard/summary${suffix}`, { token: activeToken })
    setDashboard(data)
  }

  async function loadAudit(activeToken) {
    if (!user) return
    const params = buildScopeParams(user, selectedTenantId)
    const suffix = params.toString() ? `?${params.toString()}` : ''
    const data = await api(`/api/audit${suffix}`, { token: activeToken })
    setAuditEntries(data.entries || [])
  }

  async function loadNotifications(activeToken) {
    if (!user) return
    const data = await api('/api/notifications/feed', { token: activeToken })
    setNotifications(data.notifications || [])
    setUnreadCount(Number(data.unreadCount || 0))
  }

  async function loadPreferences(activeToken) {
    if (!user) return
    const data = await api('/api/notifications/preferences', { token: activeToken })
    setPreferences(data.preferences || [])
  }

  async function markNotificationRead(notificationId) {
    if (!token) return
    try {
      const data = await api(`/api/notifications/${notificationId}/read`, {
        method: 'POST',
        token
      })
      setUnreadCount(Number(data.unreadCount || 0))
      setNotifications((prev) =>
        prev.map((item) =>
          Number(item.id) === Number(notificationId)
            ? { ...item, isRead: true, readAt: item.readAt || new Date().toISOString() }
            : item
        )
      )
    } catch (err) {
      setError(err.message)
    }
  }

  async function markAllNotificationsRead() {
    if (!token) return
    try {
      const data = await api('/api/notifications/read-all', {
        method: 'POST',
        token
      })
      setUnreadCount(Number(data.unreadCount || 0))
      setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true, readAt: item.readAt || new Date().toISOString() })))
    } catch (err) {
      setError(err.message)
    }
  }

  async function loadGppDefaults(activeToken) {
    if (!user) return
    if (!canManageTenantGppDefaults) return
    const params = buildScopeParams(user, selectedTenantId)
    const suffix = params.toString() ? `?${params.toString()}` : ''
    const data = await api(`/api/admin/gpp/defaults${suffix}`, { token: activeToken })
    setGppDefaults(data.items || [])
  }

  async function refreshAll(activeToken = token) {
    if (!activeToken || !user) return
    await Promise.all([
      loadUsers(activeToken),
      loadPublications(activeToken),
      loadDashboard(activeToken),
      loadAudit(activeToken),
      loadNotifications(activeToken),
      loadPreferences(activeToken),
      loadGppDefaults(activeToken)
    ])

    if (selectedPublicationId) {
      await loadPublicationDetails(activeToken, selectedPublicationId)
    }
  }

  async function handleLogin(event) {
    event.preventDefault()
    setError('')
    setNotice('')

    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: loginForm
      })

      setToken(data.token)
      await fetchMe(data.token)
      setNotice('Login successful')
    } catch (err) {
      setError(err.message)
    }
  }

  function handleLogout() {
    setToken('')
    setUser(null)
    setTenants([])
    setSelectedTenantId('')
    setUsers([])
    setPublications([])
    setSelectedPublicationId('')
    setSelectedPublicationDetails(null)
    setDashboard(null)
    setAuditEntries([])
    setNotifications([])
    setUnreadCount(0)
    setPreferences([])
    setGppDefaults([])
    setDisclosureRequestForm(defaultDisclosureRequest)
    setDisclosureUpdateForm(defaultDisclosureUpdate)
    setSubmissionForm(defaultSubmission)
    setSubmissionUpdateForm(defaultSubmissionUpdate)
    setNotice('Logged out')
    setError('')
  }

  async function createTenant(event) {
    event.preventDefault()
    if (!token) return
    setError('')
    setNotice('')

    try {
      const data = await api('/api/admin/tenants', {
        method: 'POST',
        token,
        body: tenantForm
      })
      setNotice(`Tenant created: ${data.tenant.name}`)
      setTenantForm(defaultTenant)
      await loadTenants(token)
    } catch (err) {
      setError(err.message)
    }
  }

  async function inviteUser(event) {
    event.preventDefault()
    if (!token) return
    setError('')
    setNotice('')

    try {
      const data = await api('/api/admin/users/invite', {
        method: 'POST',
        token,
        body: scopeBody(user, selectedTenantId, inviteForm)
      })
      setNotice(`Invite created for ${data.invite.email}. Token: ${data.invite.inviteToken}`)
      setInviteForm(defaultInvite)
      await refreshAll(token)
    } catch (err) {
      setError(err.message)
    }
  }

  async function toggleUserStatus(targetUser) {
    if (!token) return
    setError('')
    setNotice('')

    try {
      const nextIsActive = !Boolean(Number(targetUser.isActive))
      await api(`/api/admin/users/${targetUser.id}/status`, {
        method: 'POST',
        token,
        body: { isActive: nextIsActive }
      })
      setNotice(`User ${targetUser.email} is now ${nextIsActive ? 'active' : 'inactive'}`)
      await refreshAll(token)
    } catch (err) {
      setError(err.message)
    }
  }

  async function requestReset(targetUser) {
    if (!token) return
    setError('')
    setNotice('')

    try {
      const data = await api(`/api/admin/users/${targetUser.id}/reset-password`, {
        method: 'POST',
        token,
        body: {}
      })
      setNotice(`Reset token for ${targetUser.email}: ${data.resetToken}`)
      await refreshAll(token)
    } catch (err) {
      setError(err.message)
    }
  }

  async function createPublication(event) {
    event.preventDefault()
    if (!token) return
    setError('')
    setNotice('')

    try {
      const payload = scopeBody(user, selectedTenantId, publicationForm)

      const data = await api('/api/publications', {
        method: 'POST',
        token,
        body: payload
      })

      setNotice(`Publication created: ${data.publication.title}`)
      setPublicationForm(defaultPublication)
      await refreshAll(token)
      setSelectedPublicationId(String(data.publication.id))
      await loadPublicationDetails(token, data.publication.id)
    } catch (err) {
      setError(err.message)
    }
  }

  async function selectPublication(publicationId) {
    setSelectedPublicationId(String(publicationId))
    setDisclosureRequestForm(defaultDisclosureRequest)
    setDisclosureUpdateForm(defaultDisclosureUpdate)
    setSubmissionForm(defaultSubmission)
    setSubmissionUpdateForm(defaultSubmissionUpdate)
    setError('')
    try {
      await loadPublicationDetails(token, publicationId)
    } catch (err) {
      setError(err.message)
    }
  }

  async function advanceStatus() {
    if (!selectedPublicationDetails?.publication) return
    setError('')
    setNotice('')

    const current = selectedPublicationDetails.publication.status
    const next = nextStatusMap[current]
    if (!next) {
      setNotice('No further status transition available')
      return
    }

    try {
      await api(`/api/publications/${selectedPublicationDetails.publication.id}/status`, {
        method: 'PATCH',
        token,
        body: { status: next }
      })
      setNotice(`Status moved to ${next}`)
      await refreshAll(token)
      await loadPublicationDetails(token, selectedPublicationDetails.publication.id)
    } catch (err) {
      setError(getTransitionBlockMessage(err))
    }
  }

  async function addAuthor(event) {
    event.preventDefault()
    if (!selectedPublicationDetails?.publication) return
    setError('')
    setNotice('')

    try {
      const icmjeCategories = authorForm.icmjeCategories
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)

      await api(`/api/publications/${selectedPublicationDetails.publication.id}/authors`, {
        method: 'POST',
        token,
        body: {
          fullName: authorForm.fullName,
          email: authorForm.email,
          affiliation: authorForm.affiliation,
          disclosureStatus: authorForm.disclosureStatus,
          icmjeCategories
        }
      })

      setNotice('Author added')
      setAuthorForm(defaultAuthor)
      await refreshAll(token)
      await loadPublicationDetails(token, selectedPublicationDetails.publication.id)
    } catch (err) {
      setError(err.message)
    }
  }

  async function addMilestone(event) {
    event.preventDefault()
    if (!selectedPublicationDetails?.publication) return

    setError('')
    setNotice('')

    try {
      await api(`/api/publications/${selectedPublicationDetails.publication.id}/milestones`, {
        method: 'POST',
        token,
        body: milestoneForm
      })

      setNotice('Milestone added')
      setMilestoneForm(defaultMilestone)
      await refreshAll(token)
      await loadPublicationDetails(token, selectedPublicationDetails.publication.id)
    } catch (err) {
      setError(err.message)
    }
  }

  async function updateMilestoneStatus(milestoneId, status) {
    if (!selectedPublicationDetails?.publication) return
    setError('')
    setNotice('')

    try {
      await api(`/api/publications/${selectedPublicationDetails.publication.id}/milestones/${milestoneId}`, {
        method: 'PATCH',
        token,
        body: { status }
      })
      setNotice(`Milestone set to ${status}`)
      await refreshAll(token)
      await loadPublicationDetails(token, selectedPublicationDetails.publication.id)
    } catch (err) {
      setError(err.message)
    }
  }

  async function toggleChecklist(itemKey, currentChecked) {
    if (!selectedPublicationDetails?.publication) return
    setError('')

    try {
      await api(`/api/publications/${selectedPublicationDetails.publication.id}/gpp/${itemKey}`, {
        method: 'PATCH',
        token,
        body: { isChecked: !Boolean(Number(currentChecked)) }
      })
      await refreshAll(token)
      await loadPublicationDetails(token, selectedPublicationDetails.publication.id)
    } catch (err) {
      setError(err.message)
    }
  }

  async function toggleChecklistRequired(itemKey, currentRequired) {
    if (!selectedPublicationDetails?.publication) return
    setError('')
    setNotice('')

    try {
      await api(`/api/publications/${selectedPublicationDetails.publication.id}/gpp/${itemKey}/required`, {
        method: 'PATCH',
        token,
        body: { isRequired: !Boolean(Number(currentRequired)) }
      })
      setNotice(`Requirement updated for ${itemKey}`)
      await refreshAll(token)
      await loadPublicationDetails(token, selectedPublicationDetails.publication.id)
    } catch (err) {
      setError(err.message)
    }
  }

  async function requestDisclosure(event) {
    event.preventDefault()
    if (!selectedPublicationDetails?.publication) return
    setError('')
    setNotice('')

    try {
      await api(`/api/publications/${selectedPublicationDetails.publication.id}/disclosures/request`, {
        method: 'POST',
        token,
        body: {
          authorId: toNumber(disclosureRequestForm.authorId),
          requestNote: disclosureRequestForm.requestNote
        }
      })
      setNotice('Disclosure request sent')
      setDisclosureRequestForm(defaultDisclosureRequest)
      await refreshAll(token)
      await loadPublicationDetails(token, selectedPublicationDetails.publication.id)
    } catch (err) {
      setError(err.message)
    }
  }

  async function updateDisclosure(event) {
    event.preventDefault()
    if (!selectedPublicationDetails?.publication) return
    const authorId = toNumber(disclosureUpdateForm.authorId)
    if (!authorId) {
      setError('Select an author for disclosure update')
      return
    }

    setError('')
    setNotice('')
    try {
      await api(`/api/publications/${selectedPublicationDetails.publication.id}/disclosures/${authorId}`, {
        method: 'PATCH',
        token,
        body: {
          signoffStatus: disclosureUpdateForm.signoffStatus,
          financialInterests: disclosureUpdateForm.financialInterests,
          companyRelationships: disclosureUpdateForm.companyRelationships,
          coiDeclaration: disclosureUpdateForm.coiDeclaration
        }
      })
      setNotice('Disclosure updated')
      setDisclosureUpdateForm(defaultDisclosureUpdate)
      await refreshAll(token)
      await loadPublicationDetails(token, selectedPublicationDetails.publication.id)
    } catch (err) {
      setError(err.message)
    }
  }

  async function createSubmission(event) {
    event.preventDefault()
    if (!selectedPublicationDetails?.publication) return
    setError('')
    setNotice('')

    try {
      await api(`/api/publications/${selectedPublicationDetails.publication.id}/submissions`, {
        method: 'POST',
        token,
        body: {
          submissionType: submissionForm.submissionType,
          venueName: submissionForm.venueName,
          referenceId: submissionForm.referenceId,
          submissionDate: submissionForm.submissionDate,
          peerReviewStatus: submissionForm.peerReviewStatus,
          revisionRound: Number(submissionForm.revisionRound || 0),
          congressDecision: submissionForm.congressDecision,
          notes: submissionForm.notes
        }
      })
      setNotice('Submission record added')
      setSubmissionForm(defaultSubmission)
      await refreshAll(token)
      await loadPublicationDetails(token, selectedPublicationDetails.publication.id)
    } catch (err) {
      setError(err.message)
    }
  }

  function setSubmissionUpdateFromSelection(submissionId) {
    const match = (selectedPublicationDetails?.submissionHistory || []).find(
      (item) => Number(item.id) === Number(submissionId)
    )

    if (!match) {
      setSubmissionUpdateForm(defaultSubmissionUpdate)
      return
    }

    setSubmissionUpdateForm({
      submissionId: String(match.id),
      venueName: match.venueName || '',
      referenceId: match.referenceId || '',
      submissionDate: match.submissionDate ? String(match.submissionDate).slice(0, 10) : '',
      peerReviewStatus: match.peerReviewStatus || '',
      revisionRound: Number.isFinite(Number(match.revisionRound)) ? String(match.revisionRound) : '',
      congressDecision: match.congressDecision || '',
      notes: match.notes || ''
    })
  }

  async function updateSubmission(event) {
    event.preventDefault()
    if (!selectedPublicationDetails?.publication) return
    const submissionId = toNumber(submissionUpdateForm.submissionId)
    if (!submissionId) {
      setError('Select a submission to update')
      return
    }

    setError('')
    setNotice('')

    try {
      await api(`/api/publications/${selectedPublicationDetails.publication.id}/submissions/${submissionId}`, {
        method: 'PATCH',
        token,
        body: {
          venueName: submissionUpdateForm.venueName,
          referenceId: submissionUpdateForm.referenceId,
          submissionDate: submissionUpdateForm.submissionDate,
          peerReviewStatus: submissionUpdateForm.peerReviewStatus || undefined,
          revisionRound: submissionUpdateForm.revisionRound === '' ? undefined : Number(submissionUpdateForm.revisionRound),
          congressDecision: submissionUpdateForm.congressDecision || undefined,
          notes: submissionUpdateForm.notes
        }
      })
      setNotice('Submission record updated')
      setSubmissionUpdateForm(defaultSubmissionUpdate)
      await refreshAll(token)
      await loadPublicationDetails(token, selectedPublicationDetails.publication.id)
    } catch (err) {
      setError(err.message)
    }
  }

  async function assignReviewers(event) {
    event.preventDefault()
    if (!selectedPublicationDetails?.publication) return
    setError('')
    setNotice('')

    try {
      const reviewerUserIds = reviewAssignForm.reviewerUserIdsCsv
        .split(',')
        .map((item) => toNumber(item.trim()))
        .filter((value) => Number.isFinite(value))

      await api(`/api/publications/${selectedPublicationDetails.publication.id}/reviews/assign`, {
        method: 'POST',
        token,
        body: { reviewerUserIds }
      })

      setNotice('Reviewers assigned')
      setReviewAssignForm(defaultReviewAssign)
      await refreshAll(token)
      await loadPublicationDetails(token, selectedPublicationDetails.publication.id)
    } catch (err) {
      setError(err.message)
    }
  }

  async function submitReviewDecision(event) {
    event.preventDefault()
    if (!selectedPublicationDetails?.publication) return
    setError('')
    setNotice('')

    try {
      const data = await api(
        `/api/publications/${selectedPublicationDetails.publication.id}/reviews/${reviewDecisionForm.reviewId}/decision`,
        {
          method: 'POST',
          token,
          body: {
            decision: reviewDecisionForm.decision,
            comments: reviewDecisionForm.comments
          }
        }
      )

      if (data.transitionBlocked) {
        const gppPending = (data.missingRequiredGppItems || []).map((item) => item.itemKey).join(', ')
        const disclosurePending = (data.pendingDisclosures || []).map((item) => item.authorName).join(', ')
        const suffix = [gppPending ? `GPP: ${gppPending}` : '', disclosurePending ? `Disclosures: ${disclosurePending}` : '']
          .filter(Boolean)
          .join(' | ')
        setNotice(`Review decision saved, but transition blocked. ${suffix}`)
      } else {
        setNotice('Review decision submitted')
      }
      setReviewDecisionForm(defaultReviewDecision)
      await refreshAll(token)
      await loadPublicationDetails(token, selectedPublicationDetails.publication.id)
    } catch (err) {
      setError(getTransitionBlockMessage(err))
    }
  }

  async function uploadDocument(event) {
    event.preventDefault()
    if (!selectedPublicationDetails?.publication || !uploadFile) {
      setError('Please choose a file first')
      return
    }

    setError('')
    setNotice('')

    try {
      const formData = new FormData()
      formData.append('file', uploadFile)

      await apiUpload(`/api/publications/${selectedPublicationDetails.publication.id}/documents/upload`, {
        token,
        formData
      })

      setNotice('Document uploaded')
      setUploadFile(null)
      await refreshAll(token)
      await loadPublicationDetails(token, selectedPublicationDetails.publication.id)
    } catch (err) {
      setError(err.message)
    }
  }

  async function savePreference(event) {
    event.preventDefault()
    if (!token) return
    setError('')
    setNotice('')

    try {
      await api('/api/notifications/preferences', {
        method: 'PUT',
        token,
        body: preferenceForm
      })
      setNotice('Notification preference updated')
      await refreshAll(token)
    } catch (err) {
      setError(err.message)
    }
  }

  function toggleTenantDefaultRequired(itemKey, currentRequired) {
    setGppDefaults((prev) =>
      prev.map((item) =>
        item.itemKey === itemKey ? { ...item, isRequired: !Boolean(currentRequired) } : item
      )
    )
  }

  async function saveTenantGppDefaults() {
    if (!token) return
    if (!gppDefaults.length) return

    setError('')
    setNotice('')
    try {
      await api('/api/admin/gpp/defaults', {
        method: 'PUT',
        token,
        body: scopeBody(user, selectedTenantId, { items: gppDefaults })
      })
      setNotice('Tenant GPP defaults saved')
      await refreshAll(token)
    } catch (err) {
      setError(err.message)
    }
  }

  async function acceptInvite(event) {
    event.preventDefault()
    if (!token) return

    setError('')
    setNotice('')
    try {
      const data = await api('/api/admin/invites/accept', {
        method: 'POST',
        body: inviteAcceptForm
      })
      setNotice(`Invite accepted for ${data.user.email}`)
      setInviteAcceptForm(defaultInviteAccept)
      await refreshAll(token)
    } catch (err) {
      setError(err.message)
    }
  }

  async function confirmReset(event) {
    event.preventDefault()
    if (!token) return

    setError('')
    setNotice('')
    try {
      await api('/api/admin/reset-password/confirm', {
        method: 'POST',
        body: resetConfirmForm
      })
      setNotice('Password reset confirmed')
      setResetConfirmForm(defaultResetConfirm)
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    checkHealth()
  }, [])

  useEffect(() => {
    if (!token) return
    fetchMe(token).catch((err) => setError(err.message))
  }, [token])

  useEffect(() => {
    if (!token || !user) return
    loadTenants(token).catch((err) => setError(err.message))
  }, [token, user])

  useEffect(() => {
    if (!token || !user) return
    if (user.isSuperadmin && !selectedTenantId) return
    refreshAll(token).catch((err) => setError(err.message))
  }, [token, user, selectedTenantId])

  useEffect(() => {
    if (!token || !user) return undefined

    const streamUrl = `/api/notifications/stream?token=${encodeURIComponent(token)}`
    const source = new EventSource(streamUrl)

    const handleMessage = (event) => {
      try {
        const payload = JSON.parse(event.data || '{}')
        if (Number.isFinite(Number(payload.unreadCount))) {
          setUnreadCount(Number(payload.unreadCount))
        }
        const notification = payload.notification
        if (!notification || !notification.id) return

        setNotifications((prev) => {
          const exists = prev.some((item) => Number(item.id) === Number(notification.id))
          if (exists) {
            return prev.map((item) => (Number(item.id) === Number(notification.id) ? { ...item, ...notification } : item))
          }
          return [notification, ...prev].slice(0, 200)
        })
      } catch (_error) {
        // ignore malformed stream message
      }
    }

    source.addEventListener('notification', handleMessage)
    source.onerror = () => {
      // stream will auto-reconnect
    }

    return () => {
      source.removeEventListener('notification', handleMessage)
      source.close()
    }
  }, [token, user])

  return (
    <div className="app-shell">
      <header className="header">
        <div>
          <p className="kicker">Pharaxis One</p>
          <h1>Publications Command Center</h1>
        </div>
        <div className="health-pill">
          {health ? `API: ${health.status} | DB: ${health.database}` : 'Checking health...'}
        </div>
      </header>

      {error ? <div className="alert error">{error}</div> : null}
      {notice ? <div className="alert success">{notice}</div> : null}

      {!token ? (
        <section className="panel">
          <h2>Login</h2>
          <p>Use super admin first to create tenants, users, and publication workflows.</p>
          <form className="form-grid" onSubmit={handleLogin}>
            <input
              placeholder="Email"
              value={loginForm.email}
              onChange={(e) => setLoginForm((prev) => ({ ...prev, email: e.target.value }))}
            />
            <input
              type="password"
              placeholder="Password"
              value={loginForm.password}
              onChange={(e) => setLoginForm((prev) => ({ ...prev, password: e.target.value }))}
            />
            <button type="submit">Login</button>
          </form>
        </section>
      ) : (
        <>
          <section className="panel row between">
            <div>
              <h2>Session</h2>
              <p>{user?.fullName} ({user?.role})</p>
              <p className="muted">{user?.email}</p>
            </div>
            <button className="ghost" onClick={handleLogout}>Logout</button>
          </section>

          {user?.isSuperadmin ? (
            <section className="panel">
              <h2>Tenant Management</h2>
              <form className="form-grid inline" onSubmit={createTenant}>
                <input
                  placeholder="Tenant name"
                  value={tenantForm.name}
                  onChange={(e) => setTenantForm((prev) => ({ ...prev, name: e.target.value }))}
                />
                <input
                  placeholder="tenant-slug"
                  value={tenantForm.slug}
                  onChange={(e) => setTenantForm((prev) => ({ ...prev, slug: e.target.value }))}
                />
                <button type="submit">Create Tenant</button>
              </form>

              <label>Active tenant scope</label>
              <select value={selectedTenantId} onChange={(e) => setSelectedTenantId(e.target.value)}>
                <option value="">Select tenant</option>
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name} ({tenant.slug})
                  </option>
                ))}
              </select>
            </section>
          ) : null}

          {tenantScope ? (
            <>
              <section className="panel">
                <h2>User Invite & Access</h2>
                <form className="form-grid grid-4" onSubmit={inviteUser}>
                  <input
                    placeholder="Full name"
                    value={inviteForm.fullName}
                    onChange={(e) => setInviteForm((prev) => ({ ...prev, fullName: e.target.value }))}
                  />
                  <input
                    placeholder="Email"
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm((prev) => ({ ...prev, email: e.target.value }))}
                  />
                  <select
                    value={inviteForm.role}
                    onChange={(e) => setInviteForm((prev) => ({ ...prev, role: e.target.value }))}
                  >
                    <option value="publications_manager">Publications Manager</option>
                    <option value="medical_writer">Medical Writer</option>
                    <option value="reviewer">Reviewer</option>
                  </select>
                  <button type="submit">Create Invite</button>
                </form>

                <div className="list-stack">
                  {users.map((teamUser) => (
                    <article key={teamUser.id} className="list-item">
                      <div>
                        <h3>{teamUser.fullName || teamUser.email}</h3>
                        <p className="muted small">{teamUser.email} | {teamUser.role}</p>
                      </div>
                      <div className="chips wrap">
                        <span className={`chip ${Number(teamUser.isActive) ? 'ok' : 'warn'}`}>
                          {Number(teamUser.isActive) ? 'active' : 'inactive'}
                        </span>
                        <button className="ghost compact" onClick={() => toggleUserStatus(teamUser)}>
                          {Number(teamUser.isActive) ? 'Deactivate' : 'Activate'}
                        </button>
                        <button className="ghost compact" onClick={() => requestReset(teamUser)}>Reset Password</button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="panel">
                <h2>Create Publication</h2>
                <form className="form-grid grid-5" onSubmit={createPublication}>
                  <input
                    placeholder="Publication title"
                    value={publicationForm.title}
                    onChange={(e) => setPublicationForm((prev) => ({ ...prev, title: e.target.value }))}
                  />
                  <select
                    value={publicationForm.publicationType}
                    onChange={(e) => setPublicationForm((prev) => ({ ...prev, publicationType: e.target.value }))}
                  >
                    <option value="journal_article">Journal Article</option>
                    <option value="congress_abstract">Congress Abstract</option>
                    <option value="poster">Poster</option>
                    <option value="oral_presentation">Oral Presentation</option>
                  </select>
                  <input
                    placeholder="Drug / compound"
                    value={publicationForm.drugName}
                    onChange={(e) => setPublicationForm((prev) => ({ ...prev, drugName: e.target.value }))}
                  />
                  <input
                    placeholder="Therapeutic area"
                    value={publicationForm.therapeuticArea}
                    onChange={(e) => setPublicationForm((prev) => ({ ...prev, therapeuticArea: e.target.value }))}
                  />
                  <input
                    placeholder="Target journal or conference"
                    value={publicationForm.targetVenue}
                    onChange={(e) => setPublicationForm((prev) => ({ ...prev, targetVenue: e.target.value }))}
                  />
                  <button type="submit">Create</button>
                </form>
              </section>

              {canManageTenantGppDefaults ? (
                <section className="panel">
                  <div className="row between">
                    <h2>Tenant GPP Defaults</h2>
                    <button className="ghost" onClick={saveTenantGppDefaults}>Save Defaults</button>
                  </div>
                  <p className="muted small">
                    These required flags apply to newly created publications in this tenant.
                  </p>
                  <div className="mini-list">
                    {gppDefaults.map((item) => (
                      <div key={item.itemKey} className="mini-row">
                        <span>{item.itemKey}: {item.itemText}</span>
                        <span className="chips wrap">
                          <span className={`chip ${item.isRequired ? 'ok' : 'light'}`}>
                            {item.isRequired ? 'required' : 'optional'}
                          </span>
                          <button
                            className="ghost compact"
                            onClick={() => toggleTenantDefaultRequired(item.itemKey, item.isRequired)}
                          >
                            Toggle
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="panel">
                <div className="row between">
                  <h2>Publications</h2>
                  <button className="ghost" onClick={() => refreshAll(token)}>Refresh</button>
                </div>

                {publications.length === 0 ? <p className="muted">No publications yet.</p> : null}

                <div className="list-stack">
                  {publications.map((publication) => (
                    <article key={publication.id} className={`list-item ${Number(selectedPublicationId) === Number(publication.id) ? 'active' : ''}`}>
                      <div>
                        <h3>{publication.title}</h3>
                        <p className="muted small">
                          {publication.publicationType} | {publication.therapeuticArea || 'n/a'}
                        </p>
                      </div>
                      <div className="chips wrap">
                        <span className="chip">{publication.status}</span>
                        <button className="ghost compact" onClick={() => selectPublication(publication.id)}>Open</button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              {selectedPublicationDetails?.publication ? (
                <section className="panel">
                  <div className="row between">
                    <h2>Publication Workspace: {selectedPublicationDetails.publication.title}</h2>
                    <button className="ghost" onClick={advanceStatus}>Advance Status</button>
                  </div>

                  <div className="meta-grid">
                    <div><strong>Status:</strong> {selectedPublicationDetails.publication.status}</div>
                    <div><strong>Checklist:</strong> {selectedPublicationDetails.checklistCompletion}% complete</div>
                    <div><strong>Tenant:</strong> {selectedPublicationDetails.publication.tenantName}</div>
                  </div>

                  <div className="sub-section">
                    <h3>Add Author</h3>
                    <form className="form-grid grid-5" onSubmit={addAuthor}>
                      <input
                        placeholder="Full name"
                        value={authorForm.fullName}
                        onChange={(e) => setAuthorForm((prev) => ({ ...prev, fullName: e.target.value }))}
                      />
                      <input
                        placeholder="Email"
                        value={authorForm.email}
                        onChange={(e) => setAuthorForm((prev) => ({ ...prev, email: e.target.value }))}
                      />
                      <input
                        placeholder="Affiliation"
                        value={authorForm.affiliation}
                        onChange={(e) => setAuthorForm((prev) => ({ ...prev, affiliation: e.target.value }))}
                      />
                      <select
                        value={authorForm.disclosureStatus}
                        onChange={(e) => setAuthorForm((prev) => ({ ...prev, disclosureStatus: e.target.value }))}
                      >
                        <option value="incomplete">Disclosure Incomplete</option>
                        <option value="complete">Disclosure Complete</option>
                      </select>
                      <input
                        placeholder="ICMJE categories (comma separated)"
                        value={authorForm.icmjeCategories}
                        onChange={(e) => setAuthorForm((prev) => ({ ...prev, icmjeCategories: e.target.value }))}
                      />
                      <button type="submit">Add Author</button>
                    </form>
                    <div className="mini-list">
                      {selectedPublicationDetails.authors?.map((author) => (
                        <div key={`${author.id}-${author.authorOrder}`} className="mini-row">
                          <span>{author.authorOrder}. {author.fullName}</span>
                          <span className="muted small">
                            legacy: {author.disclosureStatus} | signoff: {author.signoffStatus || 'pending'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="sub-section">
                    <h3>Milestones</h3>
                    <form className="form-grid inline" onSubmit={addMilestone}>
                      <input
                        placeholder="Milestone name"
                        value={milestoneForm.milestoneName}
                        onChange={(e) => setMilestoneForm((prev) => ({ ...prev, milestoneName: e.target.value }))}
                      />
                      <input
                        type="date"
                        value={milestoneForm.dueDate}
                        onChange={(e) => setMilestoneForm((prev) => ({ ...prev, dueDate: e.target.value }))}
                      />
                      <button type="submit">Add Milestone</button>
                    </form>
                    <div className="mini-list">
                      {selectedPublicationDetails.milestones?.map((milestone) => (
                        <div key={milestone.id} className="mini-row">
                          <span>
                            {milestone.milestoneName} - {milestone.dueDate} {Number(milestone.isOverdue) ? '(overdue)' : ''}
                          </span>
                          <span className="chips wrap">
                            <span className={`chip ${milestone.status === 'completed' ? 'ok' : ''}`}>{milestone.status}</span>
                            {milestone.status !== 'completed' ? (
                              <button className="ghost compact" onClick={() => updateMilestoneStatus(milestone.id, 'completed')}>
                                Complete
                              </button>
                            ) : (
                              <button className="ghost compact" onClick={() => updateMilestoneStatus(milestone.id, 'pending')}>
                                Reopen
                              </button>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="sub-section">
                    <h3>GPP Checklist</h3>
                    <div className="mini-list">
                      {selectedPublicationDetails.gppChecklist?.map((item) => (
                        <div key={item.itemKey} className="mini-row checkbox-row">
                          <input
                            type="checkbox"
                            checked={Boolean(Number(item.isChecked))}
                            onChange={() => toggleChecklist(item.itemKey, item.isChecked)}
                          />
                          <span>{item.itemText}</span>
                          {Number(item.isRequired) ? <span className="chip light">required</span> : null}
                          {canManageGppRequirements ? (
                            <button
                              type="button"
                              className="ghost compact"
                              onClick={() => toggleChecklistRequired(item.itemKey, item.isRequired)}
                            >
                              {Number(item.isRequired) ? 'Make Optional' : 'Make Required'}
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="sub-section">
                    <h3>Disclosure Sign-off</h3>
                    <form className="form-grid grid-3" onSubmit={requestDisclosure}>
                      <select
                        value={disclosureRequestForm.authorId}
                        onChange={(e) => setDisclosureRequestForm((prev) => ({ ...prev, authorId: e.target.value }))}
                      >
                        <option value="">Select author</option>
                        {selectedPublicationDetails.authors?.map((author) => (
                          <option key={author.id} value={author.id}>
                            {author.fullName} (#{author.id})
                          </option>
                        ))}
                      </select>
                      <input
                        placeholder="Request note (optional)"
                        value={disclosureRequestForm.requestNote}
                        onChange={(e) => setDisclosureRequestForm((prev) => ({ ...prev, requestNote: e.target.value }))}
                      />
                      <button type="submit">Request Disclosure</button>
                    </form>

                    <form className="form-grid grid-5" onSubmit={updateDisclosure}>
                      <select
                        value={disclosureUpdateForm.authorId}
                        onChange={(e) => setDisclosureUpdateForm((prev) => ({ ...prev, authorId: e.target.value }))}
                      >
                        <option value="">Select author</option>
                        {selectedPublicationDetails.authors?.map((author) => (
                          <option key={author.id} value={author.id}>
                            {author.fullName} (#{author.id})
                          </option>
                        ))}
                      </select>
                      <select
                        value={disclosureUpdateForm.signoffStatus}
                        onChange={(e) => setDisclosureUpdateForm((prev) => ({ ...prev, signoffStatus: e.target.value }))}
                      >
                        <option value="pending">Pending</option>
                        <option value="signed">Signed</option>
                        <option value="waived">Waived</option>
                      </select>
                      <input
                        placeholder="Financial interests"
                        value={disclosureUpdateForm.financialInterests}
                        onChange={(e) => setDisclosureUpdateForm((prev) => ({ ...prev, financialInterests: e.target.value }))}
                      />
                      <input
                        placeholder="Company relationships"
                        value={disclosureUpdateForm.companyRelationships}
                        onChange={(e) => setDisclosureUpdateForm((prev) => ({ ...prev, companyRelationships: e.target.value }))}
                      />
                      <input
                        placeholder="COI declaration"
                        value={disclosureUpdateForm.coiDeclaration}
                        onChange={(e) => setDisclosureUpdateForm((prev) => ({ ...prev, coiDeclaration: e.target.value }))}
                      />
                      <button type="submit">Update Disclosure</button>
                    </form>

                    <div className="mini-list">
                      {selectedPublicationDetails.authors?.map((author) => (
                        <div key={`disclosure-${author.id}-${author.authorOrder}`} className="mini-row">
                          <span>{author.fullName}</span>
                          <span className="chip">{author.signoffStatus || 'pending'}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="sub-section">
                    <h3>Submission Tracking</h3>
                    <form className="form-grid grid-5" onSubmit={createSubmission}>
                      <select
                        value={submissionForm.submissionType}
                        onChange={(e) => setSubmissionForm((prev) => ({ ...prev, submissionType: e.target.value }))}
                      >
                        <option value="journal">Journal</option>
                        <option value="congress">Congress</option>
                      </select>
                      <input
                        placeholder="Journal / Congress"
                        value={submissionForm.venueName}
                        onChange={(e) => setSubmissionForm((prev) => ({ ...prev, venueName: e.target.value }))}
                      />
                      <input
                        placeholder="Reference ID"
                        value={submissionForm.referenceId}
                        onChange={(e) => setSubmissionForm((prev) => ({ ...prev, referenceId: e.target.value }))}
                      />
                      <input
                        type="date"
                        value={submissionForm.submissionDate}
                        onChange={(e) => setSubmissionForm((prev) => ({ ...prev, submissionDate: e.target.value }))}
                      />
                      {submissionForm.submissionType === 'journal' ? (
                        <select
                          value={submissionForm.peerReviewStatus}
                          onChange={(e) => setSubmissionForm((prev) => ({ ...prev, peerReviewStatus: e.target.value }))}
                        >
                          <option value="under_review">Under Review</option>
                          <option value="revision_requested">Revision Requested</option>
                          <option value="accepted">Accepted</option>
                          <option value="rejected">Rejected</option>
                        </select>
                      ) : (
                        <select
                          value={submissionForm.congressDecision}
                          onChange={(e) => setSubmissionForm((prev) => ({ ...prev, congressDecision: e.target.value }))}
                        >
                          <option value="">Decision Pending</option>
                          <option value="accepted">Accepted</option>
                          <option value="rejected">Rejected</option>
                          <option value="poster">Poster</option>
                          <option value="oral_reassigned">Oral Reassigned</option>
                        </select>
                      )}
                      <input
                        placeholder="Revision round"
                        type="number"
                        min="0"
                        value={submissionForm.revisionRound}
                        onChange={(e) => setSubmissionForm((prev) => ({ ...prev, revisionRound: e.target.value }))}
                      />
                      <input
                        placeholder="Notes"
                        value={submissionForm.notes}
                        onChange={(e) => setSubmissionForm((prev) => ({ ...prev, notes: e.target.value }))}
                      />
                      <button type="submit">Add Submission</button>
                    </form>

                    <form className="form-grid grid-5" onSubmit={updateSubmission}>
                      <select
                        value={submissionUpdateForm.submissionId}
                        onChange={(e) => setSubmissionUpdateFromSelection(e.target.value)}
                      >
                        <option value="">Select submission</option>
                        {selectedPublicationDetails.submissionHistory?.map((submission) => (
                          <option key={submission.id} value={submission.id}>
                            #{submission.id} {submission.submissionType} attempt {submission.attemptNo}
                          </option>
                        ))}
                      </select>
                      <input
                        placeholder="Journal / Congress"
                        value={submissionUpdateForm.venueName}
                        onChange={(e) => setSubmissionUpdateForm((prev) => ({ ...prev, venueName: e.target.value }))}
                      />
                      <input
                        placeholder="Reference ID"
                        value={submissionUpdateForm.referenceId}
                        onChange={(e) => setSubmissionUpdateForm((prev) => ({ ...prev, referenceId: e.target.value }))}
                      />
                      <input
                        type="date"
                        value={submissionUpdateForm.submissionDate}
                        onChange={(e) => setSubmissionUpdateForm((prev) => ({ ...prev, submissionDate: e.target.value }))}
                      />
                      <input
                        type="number"
                        min="0"
                        placeholder="Revision round"
                        value={submissionUpdateForm.revisionRound}
                        onChange={(e) => setSubmissionUpdateForm((prev) => ({ ...prev, revisionRound: e.target.value }))}
                      />
                      <select
                        value={submissionUpdateForm.peerReviewStatus}
                        onChange={(e) => setSubmissionUpdateForm((prev) => ({ ...prev, peerReviewStatus: e.target.value }))}
                      >
                        <option value="">Peer review status</option>
                        <option value="under_review">Under Review</option>
                        <option value="revision_requested">Revision Requested</option>
                        <option value="accepted">Accepted</option>
                        <option value="rejected">Rejected</option>
                      </select>
                      <select
                        value={submissionUpdateForm.congressDecision}
                        onChange={(e) => setSubmissionUpdateForm((prev) => ({ ...prev, congressDecision: e.target.value }))}
                      >
                        <option value="">Congress decision</option>
                        <option value="accepted">Accepted</option>
                        <option value="rejected">Rejected</option>
                        <option value="poster">Poster</option>
                        <option value="oral_reassigned">Oral Reassigned</option>
                      </select>
                      <input
                        placeholder="Notes"
                        value={submissionUpdateForm.notes}
                        onChange={(e) => setSubmissionUpdateForm((prev) => ({ ...prev, notes: e.target.value }))}
                      />
                      <button type="submit">Update Submission</button>
                    </form>

                    <div className="mini-list">
                      {selectedPublicationDetails.submissionHistory?.map((submission) => (
                        <div key={`submission-${submission.id}`} className="mini-row">
                          <span>
                            [{submission.submissionType}] attempt {submission.attemptNo} - {submission.venueName} ({submission.submissionDate})
                          </span>
                          <span className="muted small">
                            {submission.submissionType === 'journal'
                              ? `peer:${submission.peerReviewStatus || 'n/a'} round:${submission.revisionRound ?? 0}`
                              : `decision:${submission.congressDecision || 'pending'}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="sub-section">
                    <h3>Review Workflow</h3>
                    <form className="form-grid inline" onSubmit={assignReviewers}>
                      <input
                        placeholder="Reviewer user IDs (comma separated)"
                        value={reviewAssignForm.reviewerUserIdsCsv}
                        onChange={(e) => setReviewAssignForm((prev) => ({ ...prev, reviewerUserIdsCsv: e.target.value }))}
                      />
                      <button type="submit">Assign Reviewers</button>
                    </form>

                    <form className="form-grid grid-3" onSubmit={submitReviewDecision}>
                      <select
                        value={reviewDecisionForm.reviewId}
                        onChange={(e) => setReviewDecisionForm((prev) => ({ ...prev, reviewId: e.target.value }))}
                      >
                        <option value="">Select review</option>
                        {selectedPublicationDetails.reviews?.map((review) => (
                          <option key={review.id} value={review.id}>
                            #{review.id} - {review.reviewerName} ({review.reviewStatus})
                          </option>
                        ))}
                      </select>
                      <select
                        value={reviewDecisionForm.decision}
                        onChange={(e) => setReviewDecisionForm((prev) => ({ ...prev, decision: e.target.value }))}
                      >
                        <option value="approved">Approve</option>
                        <option value="returned">Return</option>
                      </select>
                      <input
                        placeholder="Comments (required for return)"
                        value={reviewDecisionForm.comments}
                        onChange={(e) => setReviewDecisionForm((prev) => ({ ...prev, comments: e.target.value }))}
                      />
                      <button type="submit">Submit Decision</button>
                    </form>

                    <div className="mini-list">
                      {selectedPublicationDetails.reviews?.map((review) => (
                        <div key={review.id} className="mini-row">
                          <span>#{review.id} {review.reviewerName}</span>
                          <span className="chip">{review.reviewStatus}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="sub-section">
                    <h3>Documents</h3>
                    <form className="form-grid inline" onSubmit={uploadDocument}>
                      <input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />
                      <button type="submit">Upload Version</button>
                    </form>
                    <div className="mini-list">
                      {selectedPublicationDetails.documentVersions?.map((version) => (
                        <div key={version.id} className="mini-row">
                          <span>v{version.versionNo} - {version.fileName}</span>
                          <a className="link-btn" href={`/api/publications/documents/version/${version.id}/download`} target="_blank" rel="noreferrer">Download</a>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              ) : null}

              <section className="panel">
                <h2>Dashboard Snapshot</h2>
                <div className="stats-grid">
                  <article className="stat-tile">
                    <div className="stat-label">Statuses</div>
                    <div className="stat-note">{dashboard?.byStatus?.map((item) => `${item.status}:${item.count}`).join(' | ') || 'n/a'}</div>
                  </article>
                  <article className="stat-tile">
                    <div className="stat-label">Types</div>
                    <div className="stat-note">{dashboard?.byPublicationType?.map((item) => `${item.publicationType}:${item.count}`).join(' | ') || 'n/a'}</div>
                  </article>
                  <article className="stat-tile">
                    <div className="stat-label">My Review Queue</div>
                    <div className="stat-value">{dashboard?.myReviewQueue?.length || 0}</div>
                  </article>
                  <article className="stat-tile">
                    <div className="stat-label">Overdue Milestones</div>
                    <div className="stat-value">{dashboard?.overdueMilestones?.length || 0}</div>
                  </article>
                </div>
              </section>

              <Sprint2Panel
                token={token}
                user={user}
                selectedTenantId={selectedTenantId}
                publications={publications}
                users={users}
                selectedPublicationDetails={selectedPublicationDetails}
                onRefresh={() => refreshAll(token)}
                onReloadPublication={() => loadPublicationDetails(token, selectedPublicationDetails?.publication?.id)}
                setError={setError}
                setNotice={setNotice}
              />

              <section className="panel">
                <h2>Notification Preferences</h2>
                <form className="form-grid inline" onSubmit={savePreference}>
                  <input
                    placeholder="event key"
                    value={preferenceForm.eventKey}
                    onChange={(e) => setPreferenceForm((prev) => ({ ...prev, eventKey: e.target.value }))}
                  />
                  <select
                    value={String(preferenceForm.emailEnabled)}
                    onChange={(e) => setPreferenceForm((prev) => ({ ...prev, emailEnabled: e.target.value === 'true' }))}
                  >
                    <option value="true">Email Enabled</option>
                    <option value="false">Email Disabled</option>
                  </select>
                  <button type="submit">Save Preference</button>
                </form>
                <div className="mini-list">
                  {preferences.map((pref) => (
                    <div key={pref.eventKey} className="mini-row">
                      <span>{pref.eventKey}</span>
                      <span className="chip light">{pref.emailEnabled ? 'enabled' : 'disabled'}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="panel">
                <h2>Token Tools (Invite / Reset)</h2>
                <form className="form-grid grid-3" onSubmit={acceptInvite}>
                  <input
                    placeholder="Invite token"
                    value={inviteAcceptForm.token}
                    onChange={(e) => setInviteAcceptForm((prev) => ({ ...prev, token: e.target.value }))}
                  />
                  <input
                    placeholder="Full name"
                    value={inviteAcceptForm.fullName}
                    onChange={(e) => setInviteAcceptForm((prev) => ({ ...prev, fullName: e.target.value }))}
                  />
                  <input
                    placeholder="Password"
                    type="password"
                    value={inviteAcceptForm.password}
                    onChange={(e) => setInviteAcceptForm((prev) => ({ ...prev, password: e.target.value }))}
                  />
                  <button type="submit">Accept Invite</button>
                </form>

                <form className="form-grid inline" onSubmit={confirmReset}>
                  <input
                    placeholder="Reset token"
                    value={resetConfirmForm.token}
                    onChange={(e) => setResetConfirmForm((prev) => ({ ...prev, token: e.target.value }))}
                  />
                  <input
                    placeholder="New password"
                    type="password"
                    value={resetConfirmForm.newPassword}
                    onChange={(e) => setResetConfirmForm((prev) => ({ ...prev, newPassword: e.target.value }))}
                  />
                  <button type="submit">Confirm Reset</button>
                </form>
              </section>

              <section className="panel">
                <div className="row between">
                  <h2>Notifications Feed</h2>
                  <div className="chips wrap">
                    <span className="chip">{unreadCount} unread</span>
                    <button className="ghost compact" onClick={markAllNotificationsRead}>Mark All Read</button>
                  </div>
                </div>
                <div className="mini-list">
                  {notifications.map((item) => (
                    <div key={item.id} className="mini-row">
                      <span>{item.title}</span>
                      <span className="chips wrap">
                        <span className="chip light">{item.status}</span>
                        <span className={`chip ${item.isRead ? 'light' : 'warn'}`}>{item.isRead ? 'read' : 'unread'}</span>
                        {!item.isRead ? (
                          <button className="ghost compact" onClick={() => markNotificationRead(item.id)}>Mark Read</button>
                        ) : null}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="panel">
                <h2>Audit Trail</h2>
                <div className="mini-list">
                  {auditEntries.map((entry) => (
                    <div key={entry.id} className="mini-row">
                      <span>{entry.actionType} ({entry.entityType} #{entry.entityId || '-'})</span>
                      <span className="muted small">{entry.occurredAt}</span>
                    </div>
                  ))}
                </div>
              </section>
            </>
          ) : (
            <section className="panel">
              <h2>Tenant Scope Needed</h2>
              <p className="muted">Select a tenant to continue.</p>
            </section>
          )}
        </>
      )}
    </div>
  )
}

export default App
