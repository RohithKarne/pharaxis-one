export const emptyGrantSubmission = {
  applicantType: 'hcp',
  applicantName: '',
  requestedAmount: ''
}

export const emptyIitSubmission = {
  investigatorName: '',
  supportType: 'funding',
  requestedAmount: ''
}

export const emptyEapSubmission = {
  physicianName: '',
  physicianEmail: '',
  requestedDrug: '',
  conditionCategory: 'oncology',
  urgencyLevel: 'standard',
  emergencyFlag: false
}

export const defaultAuthForm = {
  email: 'superadmin.ieg@pharaxis.one',
  password: 'Admin@123',
  displayName: '',
  userType: 'grants_applicant'
}

export const defaultIntegrationSetup = {
  veevaEnabled: 'false',
  veevaBaseUrl: '',
  veevaTokenUrl: '',
  veevaClientId: '',
  veevaClientSecret: '',
  sharePointEnabled: 'false',
  msTenantId: '',
  msClientId: '',
  msClientSecret: '',
  sharePointSiteId: '',
  sharePointDriveId: '',
  ctgLiveEnabled: 'false',
  llmLiveEnabled: 'false',
  openaiModel: 'gpt-4.1-mini',
  openaiApiKey: '',
  erpDeliveryEnabled: 'false',
  erpEndpoint: '',
  erpAuthToken: ''
}

export function formatCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount)) return 'USD 0'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(amount)
}

export function statusClass(status) {
  if (!status) return 'chip'
  const safe = String(status).toLowerCase()
  if (safe.includes('approved') || safe.includes('completed') || safe.includes('sent') || safe.includes('active')) return 'chip success'
  if (safe.includes('rejected') || safe.includes('failed') || safe.includes('returned') || safe.includes('closed')) return 'chip danger'
  if (safe.includes('pending') || safe.includes('review') || safe.includes('queued')) return 'chip warning'
  return 'chip'
}

export function modulesForExternalType(userType) {
  if (userType === 'grants_applicant') return ['grants']
  if (userType === 'iit_investigator') return ['iit']
  if (userType === 'eap_physician') return ['eap']
  if (userType === 'institution') return ['grants', 'iit', 'eap']
  return ['grants', 'iit', 'eap']
}
