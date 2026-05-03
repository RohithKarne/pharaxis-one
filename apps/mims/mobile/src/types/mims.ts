export type AppTab =
  | 'dashboard'
  | 'inbox'
  | 'cases'
  | 'content'
  | 'alerts'
  | 'account';

export type LoginOrg = {
  id: number;
  name: string;
};

export type LoginProvider = {
  key: string;
  label: string;
  loginPath: string;
};

export type LoginOptions = {
  org?: {
    id: number;
    name: string;
    login_mode?: string;
  };
  local_login_allowed?: boolean;
  providers?: LoginProvider[];
};

export type UserSummary = {
  id: number;
  name: string;
  email: string;
  role: string;
};

export type OrgAccess = {
  orgId: number;
  orgName: string;
  siteId: number | null;
  siteName: string | null;
  roleAtOrg?: string | null;
};

export type AuthSession = {
  token: string;
  user: UserSummary;
  modules: string[];
  orgId: number | null;
  orgName: string | null;
  siteId: number | null;
  siteName: string | null;
  allOrgs: OrgAccess[];
  sessionTimeout: number;
  rememberedDeviceToken?: string | null;
};

export type LoginResponse = {
  error?: string;
  noOrgAccess?: boolean;
  passwordResetRequired?: boolean;
  emailVerificationRequired?: boolean;
  verificationCodeSent?: boolean;
  maskedEmail?: string;
  twoFactorRequired?: boolean;
  twoFactorSetupAvailable?: boolean;
  challengeToken?: string;
  availableMethods?: string[];
  rememberDays?: number;
  preferredMethod?: string | null;
  token?: string;
  user?: UserSummary;
  modules?: string[];
  orgId?: number | null;
  orgName?: string | null;
  siteId?: number | null;
  siteName?: string | null;
  allOrgs?: OrgAccess[];
  sessionTimeout?: number;
  rememberedDeviceToken?: string | null;
  backupCodes?: string[];
};

export type TwoFactorState = {
  availableMethods: string[];
  challengeToken: string;
  maskedEmail?: string;
  preferredMethod?: string | null;
  rememberDays?: number;
  twoFactorRequired: boolean;
  twoFactorSetupAvailable: boolean;
};

export type DashboardSummary = {
  stats: {
    total_cases: number;
    open_cases: number;
    my_cases: number;
    unassigned_cases: number;
    priority_cases: number;
  };
  mi_stats: {
    pending_responses: number;
    pending_approval: number;
    sent_today: number;
    sla_breached: number;
  };
  recentCases: CaseRow[];
  alerts: NotificationRow[];
  generatedAt: string;
};

export type InboxSummary = {
  total: number;
  unassigned: number;
  snoozed: number;
  exceptions: number;
  first_touch_breached: number;
  response_breached: number;
  triage: Record<string, number>;
  queue: Record<string, number>;
};

export type InboxRow = {
  id: number;
  subject: string;
  sender: string;
  recipient: string;
  received_at: string | null;
  status: string | null;
  queue_name: string | null;
  assigned_to: string | null;
  priority: string | null;
  mailbox_name: string | null;
  source_tag: string | null;
  attachments_count: number;
  is_read: boolean;
  read_at: string | null;
  triage_state?: string | null;
  routing_reason?: string | null;
};

export type InboxListResponse = {
  source: string;
  inquiries: InboxRow[];
  total: number;
};

export type CaseRow = {
  id: number;
  case_number: string | null;
  case_type: string | null;
  priority: string | null;
  updated_at: string | null;
  created_at: string | null;
  status_name: string | null;
  owner_name: string | null;
  communication_count?: number;
  last_comm_at?: string | null;
  last_comm_box?: string | null;
};

export type CasesListResponse = {
  rows: CaseRow[];
  total: number;
  limit: number;
  offset: number;
};

export type NotificationRow = {
  id: number;
  category: string;
  title: string;
  message: string;
  link_url: string | null;
  is_read: number | boolean;
  created_at: string;
};

export type CaseDetail = CaseRow & {
  org_name?: string | null;
  site_name?: string | null;
  description?: string | null;
  internal_notes?: string | null;
  intake_channel?: string | null;
  due_date?: string | null;
};

export type CaseComment = {
  id: number;
  case_id: number;
  user_id: number | null;
  comment: string;
  created_at: string;
  user_name?: string | null;
  user_email?: string | null;
};

export type CaseIntakePayload = {
  reporter?: Record<string, unknown> | null;
  patient?: Record<string, unknown> | null;
  ae_intake?: Record<string, unknown> | null;
  pc_intake?: Record<string, unknown> | null;
};

export type MiResponse = {
  id: number;
  created_at?: string | null;
  response_status?: string | null;
  response_subject?: string | null;
  response_text?: string | null;
  responded_at?: string | null;
  responded_by_name?: string | null;
  channel?: string | null;
  template_name?: string | null;
};

export type Transmission = {
  id: number;
  status?: string | null;
  priority?: string | null;
  due_date?: string | null;
  assigned_name?: string | null;
  assignee_name?: string | null;
  narrative?: string | null;
  notes?: string | null;
  resolution_notes?: string | null;
  created_at?: string | null;
  sla_status?: string | null;
};

export type CaseCorrespondence = {
  id: number;
  sender?: string | null;
  recipient?: string | null;
  subject?: string | null;
  body?: string | null;
  received_at?: string | null;
  status?: string | null;
  source_tag?: string | null;
};

export type InboxNote = {
  id?: number;
  user_name?: string | null;
  note: string;
  created_at: string;
};

export type InboxHistory = {
  contact?: Record<string, unknown> | null;
  linked_cases?: Array<Record<string, unknown>>;
  recent_messages?: Array<Record<string, unknown>>;
};

export type InboxRecommendation = Record<string, unknown>;

export type InboxReceipt = {
  user_id: number;
  user_name: string;
  email?: string | null;
  read_at?: string | null;
  last_viewed_at?: string | null;
};

export type InboxThreadItem = {
  id: number;
  sender?: string | null;
  recipient?: string | null;
  subject?: string | null;
  body?: string | null;
  received_at?: string | null;
  status?: string | null;
  source_tag?: string | null;
};

export type InboxAttachment = {
  id: number;
  filename: string;
  mime_type?: string | null;
  size_bytes?: number | null;
};

export type FolderRow = {
  id: number;
  name: string;
  description?: string | null;
  product_name?: string | null;
  site_name?: string | null;
};

export type DocumentRow = {
  id: number;
  doc_id?: string | null;
  name: string;
  status?: string | null;
  folder_id?: number | null;
  folder_name?: string | null;
  response_doc_type?: string | null;
  updated_at?: string | null;
  expiry_date?: string | null;
  document_category?: string | null;
};

export type DocumentListResponse = {
  documents: DocumentRow[];
  total: number;
  page: number;
  limit: number;
};

export type DocumentDetail = {
  document: Record<string, unknown> & {
    id: number;
    name: string;
    folder_name?: string | null;
    content_html?: string | null;
    assembled_html?: string | null;
    doc_id?: string | null;
    status?: string | null;
    updated_at?: string | null;
  };
  versions: Array<Record<string, unknown>>;
};

export type FaqRow = {
  id: number;
  question: string;
  category?: string | null;
  folder_id?: number | null;
  folder_name?: string | null;
  status?: string | null;
  updated_at?: string | null;
  expiry_date?: string | null;
};

export type FaqListResponse = {
  faqs: FaqRow[];
  total: number;
  page: number;
  limit: number;
};

export type FaqDetail = {
  faq: Record<string, unknown> & {
    id: number;
    question: string;
    answer_html?: string | null;
    category?: string | null;
    folder_name?: string | null;
    updated_at?: string | null;
  };
  versions: Array<Record<string, unknown>>;
};

export type ModuleRow = {
  id: number;
  module_id?: string | null;
  name: string;
  status?: string | null;
  folder_id?: number | null;
  folder_name?: string | null;
  updated_at?: string | null;
  content_html?: string | null;
};

export type NotificationsResponse = {
  notifications: NotificationItem[];
  total: number;
  unread: number;
  ack_pending: number;
  failed_delivery: number;
  limit: number;
  offset: number;
};

export type NotificationItem = NotificationRow & {
  metadata?: Record<string, unknown> | null;
  severity?: string | null;
  requires_acknowledgement?: number | boolean;
  event_key?: string | null;
  read_at?: string | null;
  acknowledged_at?: string | null;
  delivery_status?: string | null;
  failure_reason?: string | null;
};

export type SyncDomain =
  | 'dashboard'
  | 'inbox'
  | 'cases'
  | 'alerts'
  | 'content'
  | 'account';

export type RealtimeConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected';

export type AppRealtimeMessage =
  | {
      type: 'ready';
      user: {
        userId: number;
        email: string;
        role: string;
        orgId: number | null;
        siteId: number | null;
      };
    }
  | {
      type: 'sync.hint';
      domains?: string[];
      reason?: string;
      payload?: Record<string, unknown> | null;
      at?: string;
    }
  | {
      type: 'notification.created';
      notification?: NotificationItem | null;
      at?: string;
    };
