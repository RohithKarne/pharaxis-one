import {
  CaseComment,
  CaseDetail,
  CaseIntakePayload,
  CasesListResponse,
  DashboardSummary,
  DocumentDetail,
  DocumentListResponse,
  FaqDetail,
  FaqListResponse,
  FolderRow,
  InboxAttachment,
  InboxHistory,
  InboxListResponse,
  InboxNote,
  InboxReceipt,
  InboxRecommendation,
  InboxSummary,
  LoginOptions,
  LoginOrg,
  LoginResponse,
  MiResponse,
  ModuleRow,
  NotificationItem,
  NotificationsResponse,
  Transmission,
} from '../types/mims';

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:3000';

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_MIMS_API_URL?.trim() || DEFAULT_API_BASE_URL;

export function buildRealtimeWebSocketUrl() {
  const base = API_BASE_URL.replace(/^http/i, 'ws').replace(/\/$/, '');
  return `${base}/api/mobile-sync/ws`;
}

type RequestOptions = {
  body?: unknown;
  cache?: RequestCache;
  method?: string;
  token?: string | null;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function requestJson<T>(path: string, options: RequestOptions = {}) {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: options.cache,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(
      String((data as { error?: string }).error || 'Request failed.'),
      response.status
    );
  }

  return data as T;
}

export async function fetchHealth() {
  return requestJson<{ status: string }>('/api/health', { cache: 'no-store' });
}

export async function fetchLoginOrgs() {
  const data = await requestJson<{ orgs: LoginOrg[] }>('/api/auth/login/orgs', {
    cache: 'no-store',
  });
  return Array.isArray(data.orgs) ? data.orgs : [];
}

export async function fetchLoginOptions(orgId: number) {
  return requestJson<LoginOptions>(
    `/api/auth/login/options?org_id=${encodeURIComponent(String(orgId))}`,
    { cache: 'no-store' }
  );
}

export async function loginWithPassword(params: {
  email: string;
  orgId: number;
  password: string;
  rememberedDeviceToken?: string | null;
}) {
  return requestJson<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: {
      email: params.email,
      password: params.password,
      org_id: params.orgId,
      rememberedDeviceToken: params.rememberedDeviceToken || '',
    },
  });
}

export async function sendTwoFactorEmailCode(challengeToken: string) {
  return requestJson<{ maskedEmail: string; expiresInMinutes: number }>(
    '/api/auth/2fa/send-email-code',
    {
      method: 'POST',
      body: { challengeToken },
    }
  );
}

export async function startTotpSetup(challengeToken: string) {
  return requestJson<{ qrUrl: string; secret: string; otpauthUrl: string }>(
    '/api/auth/2fa/setup/totp',
    {
      method: 'POST',
      body: { challengeToken },
    }
  );
}

export async function verifyTwoFactor(params: {
  backupCode?: string;
  challengeToken: string;
  code?: string;
  method: string;
  rememberDevice: boolean;
}) {
  return requestJson<LoginResponse>('/api/auth/2fa/verify', {
    method: 'POST',
    body: params,
  });
}

export async function skipTwoFactorSetup(challengeToken: string) {
  return requestJson<LoginResponse>('/api/auth/2fa/skip-setup', {
    method: 'POST',
    body: { challengeToken },
  });
}

export async function fetchMe(token: string) {
  return requestJson<LoginResponse>('/api/auth/me', {
    token,
    cache: 'no-store',
  });
}

export async function logout(token: string) {
  return requestJson<{ message: string }>('/api/auth/logout', {
    method: 'POST',
    token,
  });
}

export async function fetchDashboardSummary(token: string) {
  return requestJson<DashboardSummary>('/api/cases/dashboard-summary', {
    token,
    cache: 'no-store',
  });
}

export async function fetchInboxSummary(token: string) {
  return requestJson<InboxSummary>('/api/inbox/summary', {
    token,
    cache: 'no-store',
  });
}

export async function fetchInboxList(token: string) {
  return requestJson<InboxListResponse>('/api/inbox', {
    token,
    cache: 'no-store',
  });
}

export async function fetchCasesList(
  token: string,
  params?: { limit?: number; offset?: number; search?: string; type?: string }
) {
  const searchParams = new URLSearchParams();
  searchParams.set('include_meta', 'true');
  searchParams.set('limit', String(params?.limit || 40));
  searchParams.set('offset', String(params?.offset || 0));
  if (params?.search) searchParams.set('search', params.search);
  if (params?.type && params.type !== 'ALL') searchParams.set('type', params.type);

  return requestJson<CasesListResponse>(`/api/cases?${searchParams.toString()}`, {
    token,
    cache: 'no-store',
  });
}

export async function fetchCaseDetail(token: string, caseId: number) {
  return requestJson<CaseDetail>(`/api/cases/${caseId}`, {
    token,
    cache: 'no-store',
  });
}

export async function fetchCaseComments(token: string, caseId: number) {
  return requestJson<CaseComment[]>(`/api/cases/${caseId}/comments`, {
    token,
    cache: 'no-store',
  });
}

export async function createCaseComment(token: string, caseId: number, comment: string) {
  return requestJson<CaseComment>(`/api/cases/${caseId}/comments`, {
    method: 'POST',
    token,
    body: { comment },
  });
}

export async function fetchCaseIntake(token: string, caseId: number) {
  return requestJson<CaseIntakePayload>(`/api/cases/${caseId}/intake`, {
    token,
    cache: 'no-store',
  });
}

export async function fetchCaseMiResponses(token: string, caseId: number) {
  return requestJson<MiResponse[]>(`/api/cases/${caseId}/mi-responses`, {
    token,
    cache: 'no-store',
  });
}

export async function fetchCaseAeTransmissions(token: string, caseId: number) {
  return requestJson<Transmission[]>(`/api/cases/${caseId}/ae-transmissions`, {
    token,
    cache: 'no-store',
  });
}

export async function fetchCasePcTransmissions(token: string, caseId: number) {
  return requestJson<Transmission[]>(`/api/cases/${caseId}/pc-transmissions`, {
    token,
    cache: 'no-store',
  });
}

export async function fetchCaseCorrespondence(token: string, caseId: number) {
  return requestJson<{ items: Array<Record<string, unknown>>; total: number }>(
    `/api/inbox/case/${caseId}/correspondence`,
    {
      token,
      cache: 'no-store',
    }
  );
}

export async function fetchInboxHistory(token: string, inquiryId: number) {
  return requestJson<InboxHistory>(`/api/inbox/${inquiryId}/history`, {
    token,
    cache: 'no-store',
  });
}

export async function fetchInboxRecommendations(token: string, inquiryId: number) {
  return requestJson<{ recommendations: InboxRecommendation[] }>(
    `/api/inbox/${inquiryId}/recommendations`,
    {
      token,
      cache: 'no-store',
    }
  );
}

export async function fetchInboxReceipts(token: string, inquiryId: number) {
  return requestJson<{ receipts: InboxReceipt[]; total: number }>(
    `/api/inbox/${inquiryId}/read-receipts`,
    {
      token,
      cache: 'no-store',
    }
  );
}

export async function fetchInboxNotes(token: string, inquiryId: number) {
  return requestJson<{ notes: InboxNote[] }>(`/api/inbox/${inquiryId}/notes`, {
    token,
    cache: 'no-store',
  });
}

export async function createInboxNote(token: string, inquiryId: number, note: string) {
  return requestJson<{ message: string; note: InboxNote }>(`/api/inbox/${inquiryId}/notes`, {
    method: 'POST',
    token,
    body: { note },
  });
}

export async function fetchInboxThread(token: string, inquiryId: number) {
  return requestJson<{ root_id: number; thread: Array<Record<string, unknown>> }>(
    `/api/inbox/${inquiryId}/thread`,
    {
      token,
      cache: 'no-store',
    }
  );
}

export async function fetchInboxAttachments(token: string, inquiryId: number) {
  return requestJson<{ attachments: InboxAttachment[] }>(
    `/api/inbox/${inquiryId}/attachments`,
    {
      token,
      cache: 'no-store',
    }
  );
}

export async function patchInbox(
  token: string,
  inquiryId: number,
  body: Record<string, unknown>
) {
  return requestJson<{ message: string }>(`/api/inbox/${inquiryId}`, {
    method: 'PATCH',
    token,
    body,
  });
}

export async function fetchFolders(token: string) {
  return requestJson<{ folders: FolderRow[] }>('/api/cm/folders', {
    token,
    cache: 'no-store',
  });
}

export async function fetchDocuments(
  token: string,
  params?: { folderId?: number | null; page?: number; limit?: number; search?: string }
) {
  const searchParams = new URLSearchParams();
  searchParams.set('page', String(params?.page || 1));
  searchParams.set('limit', String(params?.limit || 20));
  if (params?.folderId) searchParams.set('folder_id', String(params.folderId));
  if (params?.search) searchParams.set('search', params.search);
  return requestJson<DocumentListResponse>(`/api/cm/documents?${searchParams.toString()}`, {
    token,
    cache: 'no-store',
  });
}

export async function searchDocuments(token: string, query: string) {
  return requestJson<{ documents: Array<Record<string, unknown>> }>(
    `/api/cm/documents/search?q=${encodeURIComponent(query)}`,
    {
      token,
      cache: 'no-store',
    }
  );
}

export async function fetchDocumentDetail(token: string, documentId: number) {
  return requestJson<DocumentDetail>(`/api/cm/documents/${documentId}`, {
    token,
    cache: 'no-store',
  });
}

export async function fetchFaqs(
  token: string,
  params?: { folderId?: number | null; page?: number; limit?: number; search?: string }
) {
  const searchParams = new URLSearchParams();
  searchParams.set('page', String(params?.page || 1));
  searchParams.set('limit', String(params?.limit || 20));
  if (params?.folderId) searchParams.set('folder_id', String(params.folderId));
  if (params?.search) searchParams.set('search', params.search);
  return requestJson<FaqListResponse>(`/api/cm/faqs?${searchParams.toString()}`, {
    token,
    cache: 'no-store',
  });
}

export async function fetchFaqDetail(token: string, faqId: number) {
  return requestJson<FaqDetail>(`/api/cm/faqs/${faqId}`, {
    token,
    cache: 'no-store',
  });
}

export async function fetchModules(
  token: string,
  params?: { folderId?: number | null; search?: string }
) {
  const searchParams = new URLSearchParams();
  if (params?.folderId) searchParams.set('folder_id', String(params.folderId));
  if (params?.search) searchParams.set('search', params.search);
  const suffix = searchParams.toString();
  return requestJson<{ modules: ModuleRow[] }>(`/api/cm/modules${suffix ? `?${suffix}` : ''}`, {
    token,
    cache: 'no-store',
  });
}

export async function fetchModuleDetail(token: string, moduleId: number) {
  return requestJson<{ module: ModuleRow & Record<string, unknown> }>(`/api/cm/modules/${moduleId}`, {
    token,
    cache: 'no-store',
  });
}

export async function fetchNotifications(
  token: string,
  params?: { limit?: number; offset?: number; unreadOnly?: boolean }
) {
  const searchParams = new URLSearchParams();
  searchParams.set('limit', String(params?.limit || 25));
  searchParams.set('offset', String(params?.offset || 0));
  if (params?.unreadOnly) searchParams.set('unread_only', 'true');

  return requestJson<NotificationsResponse>(`/api/notifications?${searchParams.toString()}`, {
    token,
    cache: 'no-store',
  });
}

export async function markNotificationRead(token: string, notificationId: number) {
  return requestJson<{ success: boolean }>(`/api/notifications/${notificationId}/read`, {
    method: 'POST',
    token,
  });
}

export async function acknowledgeNotification(token: string, notificationId: number) {
  return requestJson<{ success: boolean }>(`/api/notifications/${notificationId}/acknowledge`, {
    method: 'POST',
    token,
  });
}

export async function markAllNotificationsRead(token: string) {
  return requestJson<{ success: boolean; updated: number }>('/api/notifications/read-all', {
    method: 'POST',
    token,
  });
}

export async function registerMobilePushDevice(
  token: string,
  payload: {
    pushToken: string;
    platform: string;
    deviceLabel?: string | null;
    appBuild?: string | null;
    provider?: string;
  }
) {
  return requestJson<{ success: boolean; device: Record<string, unknown> | null }>(
    '/api/mobile-sync/push/register',
    {
      method: 'POST',
      token,
      body: payload,
    }
  );
}

export async function unregisterMobilePushDevice(token: string, pushToken: string) {
  return requestJson<{ success: boolean; affected: number }>('/api/mobile-sync/push/unregister', {
    method: 'POST',
    token,
    body: { pushToken },
  });
}
