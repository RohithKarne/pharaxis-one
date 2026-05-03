import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import {
  API_BASE_URL,
  ApiError,
  fetchCasesList,
  fetchDashboardSummary,
  fetchHealth,
  fetchInboxList,
  fetchInboxSummary,
  fetchLoginOptions,
  fetchLoginOrgs,
  fetchMe,
  loginWithPassword,
  logout,
  sendTwoFactorEmailCode,
  skipTwoFactorSetup,
  startTotpSetup,
  verifyTwoFactor,
} from '../services/api';
import { registerPushForSession } from '../services/push';
import { connectAppRealtime } from '../services/realtime';
import {
  clearRememberedDeviceToken,
  clearStoredSession,
  loadRememberedDeviceToken,
  loadStoredSession,
  storeRememberedDeviceToken,
  storeSession,
} from '../services/storage';
import { mobileColors } from '../theme/colors';
import {
  AppTab,
  AuthSession,
  CaseRow,
  DashboardSummary,
  InboxRow,
  InboxSummary,
  LoginOptions,
  LoginOrg,
  LoginResponse,
  RealtimeConnectionState,
  SyncDomain,
  TwoFactorState,
} from '../types/mims';
import { AccountScreen } from './AccountScreen';
import { CasesScreen } from './CasesScreen';
import { ContentScreen } from './ContentScreen';
import { DashboardScreen } from './DashboardScreen';
import { InboxScreen } from './InboxScreen';
import { LoginScreen } from './LoginScreen';
import { NotificationsScreen } from './NotificationsScreen';
import { TabButton } from '../components/TabButton';

function buildSession(data: LoginResponse, fallbackToken?: string | null): AuthSession {
  return {
    token: data.token || fallbackToken || '',
    user: data.user!,
    modules: data.modules || [],
    orgId: data.orgId ?? null,
    orgName: data.orgName ?? null,
    siteId: data.siteId ?? null,
    siteName: data.siteName ?? null,
    allOrgs: data.allOrgs || [],
    sessionTimeout: data.sessionTimeout ?? 30,
    rememberedDeviceToken: data.rememberedDeviceToken || null,
  };
}

async function persistSession(session: AuthSession) {
  await storeSession(JSON.stringify(session));
  if (session.rememberedDeviceToken) {
    await storeRememberedDeviceToken(session.rememberedDeviceToken);
  }
}

const POLL_INTERVAL_MS = 30000;
const DEFAULT_SYNC_DOMAINS: SyncDomain[] = ['dashboard', 'inbox', 'cases', 'alerts'];

function normalizeSyncDomains(domains?: string[]): SyncDomain[] {
  const next = new Set<SyncDomain>();
  for (const domain of domains || []) {
    const normalized = String(domain || '').trim().toLowerCase();
    if (
      normalized === 'dashboard' ||
      normalized === 'inbox' ||
      normalized === 'cases' ||
      normalized === 'alerts' ||
      normalized === 'content' ||
      normalized === 'account'
    ) {
      next.add(normalized);
    }
  }
  return next.size ? [...next] : DEFAULT_SYNC_DOMAINS;
}

export function MimsMobileApp() {
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<LoginOrg[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [loginOptions, setLoginOptions] = useState<LoginOptions | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [tab, setTab] = useState<AppTab>('dashboard');
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [inboxSummary, setInboxSummary] = useState<InboxSummary | null>(null);
  const [inboxRows, setInboxRows] = useState<InboxRow[]>([]);
  const [casesRows, setCasesRows] = useState<CaseRow[]>([]);
  const [casesTotal, setCasesTotal] = useState(0);
  const [twoFactor, setTwoFactor] = useState<TwoFactorState | null>(null);
  const [totpQrUrl, setTotpQrUrl] = useState<string | null>(null);
  const [realtimeState, setRealtimeState] = useState<RealtimeConnectionState>('idle');
  const [refreshVersions, setRefreshVersions] = useState({
    account: 0,
    alerts: 0,
    cases: 0,
    content: 0,
    dashboard: 0,
    inbox: 0,
  });
  const refreshInFlightRef = useRef(false);
  const refreshQueuedRef = useRef(false);

  useEffect(() => {
    void bootApp();
  }, []);

  useEffect(() => {
    if (!session?.token) {
      setRealtimeState('idle');
      return;
    }

    const client = connectAppRealtime({
      token: session.token,
      onStatusChange: setRealtimeState,
      onMessage: (message) => {
        if (message.type === 'ready') return;
        if (message.type === 'notification.created') {
          void triggerSyncRefresh(['alerts', 'dashboard'], false);
          return;
        }
        if (message.type === 'sync.hint') {
          void triggerSyncRefresh(normalizeSyncDomains(message.domains), false);
        }
      },
    });

    return () => {
      client.close();
    };
  }, [session?.token]);

  useEffect(() => {
    if (!session?.token) return;
    const timer = setInterval(() => {
      void triggerSyncRefresh(DEFAULT_SYNC_DOMAINS, false);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [session?.token]);

  useEffect(() => {
    if (!session?.token) return;
    const sessionToken = session.token;
    let cancelled = false;

    async function registerPush() {
      try {
        await registerPushForSession(sessionToken);
      } catch (_) {
        if (!cancelled) {
          // push registration stays best-effort to avoid blocking the mobile shell
        }
      }
    }

    void registerPush();
    return () => {
      cancelled = true;
    };
  }, [session?.token]);

  useEffect(() => {
    if (!selectedOrgId) {
      setLoginOptions(null);
      return;
    }

    let cancelled = false;

    async function loadOptions() {
      try {
        const options = await fetchLoginOptions(Number(selectedOrgId));
        if (!cancelled) setLoginOptions(options);
      } catch (err) {
        if (!cancelled) {
          setLoginOptions(null);
          setError(err instanceof Error ? err.message : 'Failed to load login options.');
        }
      }
    }

    void loadOptions();
    return () => {
      cancelled = true;
    };
  }, [selectedOrgId]);

  async function bootApp() {
    setBooting(true);
    setError(null);

    try {
      await Promise.all([checkHealth(), loadPublicLoginSetup()]);

      const savedSession = await loadStoredSession();
      if (!savedSession) {
        setBooting(false);
        return;
      }

      const parsed = JSON.parse(savedSession) as AuthSession;
      if (!parsed?.token) {
        setBooting(false);
        return;
      }

      const me = await fetchMe(parsed.token);
      const nextSession = buildSession(me, parsed.token);
      await persistSession(nextSession);
      setSession(nextSession);
      setTab('dashboard');
      await loadWorkload(nextSession.token);
    } catch (err) {
      await clearStoredSession();
      setSession(null);
      setError(err instanceof Error ? err.message : 'Unable to restore mobile session.');
    } finally {
      setBooting(false);
    }
  }

  async function checkHealth() {
    try {
      await fetchHealth();
      setBackendOnline(true);
    } catch (_) {
      setBackendOnline(false);
    }
  }

  async function loadPublicLoginSetup() {
    try {
      const nextOrgs = await fetchLoginOrgs();
      setOrgs(nextOrgs);
      if (!selectedOrgId && nextOrgs[0]?.id) {
        setSelectedOrgId(String(nextOrgs[0].id));
      }
    } catch (err) {
      setOrgs([]);
      setError(err instanceof Error ? err.message : 'Failed to load organisations.');
    }
  }

  async function loadWorkload(token: string) {
    const [nextDashboard, nextInboxSummary, nextInboxList, nextCases] = await Promise.all([
      fetchDashboardSummary(token),
      fetchInboxSummary(token),
      fetchInboxList(token),
      fetchCasesList(token),
    ]);

    setDashboard(nextDashboard);
    setInboxSummary(nextInboxSummary);
    setInboxRows(nextInboxList.inquiries || []);
    setCasesRows(nextCases.rows || []);
    setCasesTotal(Number(nextCases.total || 0));
  }

  function bumpRefreshVersions(domains: SyncDomain[]) {
    setRefreshVersions((current) => {
      const next = { ...current };
      for (const domain of domains) {
        next[domain] += 1;
      }
      return next;
    });
  }

  async function triggerSyncRefresh(domains: SyncDomain[], showSpinner: boolean) {
    if (!session?.token) return;
    bumpRefreshVersions(domains);

    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true;
      return;
    }

    refreshInFlightRef.current = true;
    if (showSpinner) {
      setRefreshing(true);
    }

    try {
      await checkHealth();
      if (domains.some((domain) => domain === 'dashboard' || domain === 'inbox' || domain === 'cases' || domain === 'alerts')) {
        await loadWorkload(session.token);
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Refresh failed.';
      setError(message);
    } finally {
      refreshInFlightRef.current = false;
      if (showSpinner) {
        setRefreshing(false);
      }
      if (refreshQueuedRef.current) {
        refreshQueuedRef.current = false;
        void triggerSyncRefresh(DEFAULT_SYNC_DOMAINS, false);
      }
    }
  }

  async function handleLogin(params: { email: string; orgId: number; password: string }) {
    setBusy(true);
    setError(null);
    setInfo(null);
    setTotpQrUrl(null);

    try {
      const rememberedDeviceToken = await loadRememberedDeviceToken();
      const response = await loginWithPassword({
        ...params,
        rememberedDeviceToken,
      });

      if (response.noOrgAccess) {
        setError('No organisation assigned to this account.');
        return;
      }

      if (response.passwordResetRequired) {
        setError('Password reset is required before mobile access can continue.');
        return;
      }

      if (response.emailVerificationRequired) {
        setError(
          response.verificationCodeSent
            ? `Email verification required. A code was sent to ${response.maskedEmail || 'your inbox'}.`
            : 'Email verification required before sign-in.'
        );
        return;
      }

      if (response.twoFactorRequired || response.twoFactorSetupAvailable) {
        setTwoFactor({
          availableMethods: response.availableMethods || ['email'],
          challengeToken: response.challengeToken || '',
          maskedEmail: response.maskedEmail,
          preferredMethod: response.preferredMethod || null,
          rememberDays: response.rememberDays,
          twoFactorRequired: !!response.twoFactorRequired,
          twoFactorSetupAvailable: !!response.twoFactorSetupAvailable,
        });
        setInfo(
          response.twoFactorRequired
            ? 'Two-factor verification required for this login.'
            : 'Optional 2FA setup is available before entering the workspace.'
        );
        return;
      }

      await finalizeLogin(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setBusy(false);
    }
  }

  async function finalizeLogin(response: LoginResponse) {
    const nextSession = buildSession(response);
    await persistSession(nextSession);
    setSession(nextSession);
    setTwoFactor(null);
    setTotpQrUrl(null);
    setInfo('Mobile session is live against the shared MIMS backend.');
    setTab('dashboard');
    await loadWorkload(nextSession.token);
  }

  async function handleSendEmailCode() {
    if (!twoFactor?.challengeToken) return;
    setBusy(true);
    setError(null);

    try {
      const result = await sendTwoFactorEmailCode(twoFactor.challengeToken);
      setInfo(`Verification code sent to ${result.maskedEmail}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send email code.');
    } finally {
      setBusy(false);
    }
  }

  async function handleStartTotpSetup() {
    if (!twoFactor?.challengeToken) return;
    setBusy(true);
    setError(null);

    try {
      const result = await startTotpSetup(twoFactor.challengeToken);
      setTotpQrUrl(result.qrUrl);
      setInfo('Authenticator QR code generated for setup.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start TOTP setup.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCompleteTwoFactor(params: {
    backupCode?: string;
    code?: string;
    method: string;
    rememberDevice: boolean;
  }) {
    if (!twoFactor?.challengeToken) return;
    setBusy(true);
    setError(null);

    try {
      const response = await verifyTwoFactor({
        challengeToken: twoFactor.challengeToken,
        ...params,
      });
      await finalizeLogin(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSkipTwoFactorSetup() {
    if (!twoFactor?.challengeToken) return;
    setBusy(true);
    setError(null);

    try {
      const response = await skipTwoFactorSetup(twoFactor.challengeToken);
      await finalizeLogin(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not skip 2FA setup.');
    } finally {
      setBusy(false);
    }
  }

  async function refreshCurrentData() {
    setError(null);
    await triggerSyncRefresh(DEFAULT_SYNC_DOMAINS, true);
  }

  async function handleLogout() {
    if (!session?.token) return;
    setRefreshing(true);
    setError(null);

    try {
      await logout(session.token);
    } catch (_) {
      // Logout should still clear the local session if the backend request fails.
    } finally {
      await clearStoredSession();
      await clearRememberedDeviceToken();
      setSession(null);
      setDashboard(null);
      setInboxSummary(null);
      setInboxRows([]);
      setCasesRows([]);
      setCasesTotal(0);
      setTwoFactor(null);
      setTotpQrUrl(null);
      setRealtimeState('idle');
      setRefreshVersions({
        account: 0,
        alerts: 0,
        cases: 0,
        content: 0,
        dashboard: 0,
        inbox: 0,
      });
      setRefreshing(false);
      setTab('dashboard');
      setInfo('Signed out from mobile session.');
    }
  }

  function renderSignedInView() {
    if (!session) return null;
    const liveLabel =
      backendOnline === false
        ? 'Offline'
        : realtimeState === 'connected'
          ? 'Live Sync'
          : realtimeState === 'reconnecting'
            ? 'Reconnecting'
            : realtimeState === 'connecting'
              ? 'Connecting'
              : 'Live';

    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.appShell}>
          <View style={styles.headerBar}>
            <View>
              <Text style={styles.headerTitle}>MIMS Mobile</Text>
              <Text style={styles.headerSubtitle}>
                {session.orgName || 'Organisation'} · {session.user.name}
              </Text>
            </View>
            <View style={styles.liveBadge}>
              <Text style={styles.liveBadgeText}>{liveLabel}</Text>
            </View>
          </View>

          {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
          {info ? <Text style={styles.infoBanner}>{info}</Text> : null}

          <View style={styles.content}>
            {tab === 'dashboard' ? <DashboardScreen dashboard={dashboard} onRefresh={refreshCurrentData} refreshing={refreshing} /> : null}
            {tab === 'inbox' ? <InboxScreen initialInbox={inboxRows} initialSummary={inboxSummary} refreshVersion={refreshVersions.inbox} token={session.token} /> : null}
            {tab === 'cases' ? <CasesScreen initialCases={casesRows} initialTotal={casesTotal} refreshVersion={refreshVersions.cases} token={session.token} /> : null}
            {tab === 'content' ? <ContentScreen token={session.token} /> : null}
            {tab === 'alerts' ? <NotificationsScreen refreshVersion={refreshVersions.alerts} token={session.token} /> : null}
            {tab === 'account' ? <AccountScreen onLogout={handleLogout} refreshing={refreshing} session={session} /> : null}
          </View>

          <View style={styles.tabBar}>
            <TabButton active={tab === 'dashboard'} label="Dashboard" onPress={setTab} tab="dashboard" />
            <TabButton active={tab === 'inbox'} label="Inbox" onPress={setTab} tab="inbox" />
            <TabButton active={tab === 'cases'} label="Cases" onPress={setTab} tab="cases" />
            <TabButton active={tab === 'content'} label="Content" onPress={setTab} tab="content" />
            <TabButton active={tab === 'alerts'} label="Alerts" onPress={setTab} tab="alerts" />
            <TabButton active={tab === 'account'} label="Account" onPress={setTab} tab="account" />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (booting) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingShell}>
          <ActivityIndicator color="#7dd3fc" size="large" />
          <Text style={styles.loadingTitle}>Booting MIMS mobile</Text>
          <Text style={styles.loadingText}>Restoring session, backend health, and org login options.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <LoginScreen
          apiBaseUrl={API_BASE_URL}
          backendOnline={backendOnline}
          busy={busy}
          error={error}
          info={info}
          loginOptions={loginOptions}
          onCompleteTwoFactor={handleCompleteTwoFactor}
          onLogin={handleLogin}
          onSendEmailCode={handleSendEmailCode}
          onSkipTwoFactorSetup={handleSkipTwoFactorSetup}
          onStartTotpSetup={handleStartTotpSetup}
          orgs={orgs}
          selectedOrgId={selectedOrgId}
          setSelectedOrgId={setSelectedOrgId}
          twoFactor={twoFactor}
          totpQrUrl={totpQrUrl}
        />
      </SafeAreaView>
    );
  }

  return renderSignedInView();
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: mobileColors.page,
    flex: 1,
  },
  loadingShell: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  loadingTitle: {
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: '800',
  },
  loadingText: {
    color: '#cbd5e1',
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 360,
    textAlign: 'center',
  },
  appShell: {
    backgroundColor: mobileColors.pageSoft,
    flex: 1,
    marginHorizontal: 'auto',
    maxWidth: 430,
    width: '100%',
  },
  headerBar: {
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 18,
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  headerTitle: {
    color: '#f8fafc',
    fontSize: 24,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: '#cbd5e1',
    fontSize: 13,
    marginTop: 4,
  },
  liveBadge: {
    backgroundColor: '#dcfce7',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  liveBadgeText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  content: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  tabBar: {
    backgroundColor: '#ffffff',
    borderTopColor: '#e2e8f0',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 18,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  errorBanner: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    fontSize: 13,
    fontWeight: '700',
    marginHorizontal: 18,
    marginTop: 12,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
  },
  infoBanner: {
    backgroundColor: '#dbeafe',
    color: '#1d4ed8',
    fontSize: 13,
    fontWeight: '700',
    marginHorizontal: 18,
    marginTop: 12,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
  },
});
