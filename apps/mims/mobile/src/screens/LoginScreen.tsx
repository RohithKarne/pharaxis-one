import { Image, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useEffect, useState } from 'react';

import { API_BASE_URL } from '../services/api';
import { LoginOptions, LoginOrg, TwoFactorState } from '../types/mims';
import { mobileColors } from '../theme/colors';
import { StatusPill } from '../components/StatusPill';

type LoginScreenProps = {
  apiBaseUrl: string;
  backendOnline: boolean | null;
  busy: boolean;
  error: string | null;
  info: string | null;
  loginOptions: LoginOptions | null;
  onCompleteTwoFactor: (params: {
    backupCode?: string;
    code?: string;
    method: string;
    rememberDevice: boolean;
  }) => Promise<void>;
  onLogin: (params: { email: string; orgId: number; password: string }) => Promise<void>;
  onSendEmailCode: () => Promise<void>;
  onSkipTwoFactorSetup: () => Promise<void>;
  onStartTotpSetup: () => Promise<void>;
  orgs: LoginOrg[];
  selectedOrgId: string;
  setSelectedOrgId: (value: string) => void;
  twoFactor: TwoFactorState | null;
  totpQrUrl: string | null;
};

export function LoginScreen({
  apiBaseUrl,
  backendOnline,
  busy,
  error,
  info,
  loginOptions,
  onCompleteTwoFactor,
  onLogin,
  onSendEmailCode,
  onSkipTwoFactorSetup,
  onStartTotpSetup,
  orgs,
  selectedOrgId,
  setSelectedOrgId,
  twoFactor,
  totpQrUrl,
}: LoginScreenProps) {
  const [email, setEmail] = useState('aisha.verma@novartis-demo.com');
  const [password, setPassword] = useState('Test@1234');
  const [verificationCode, setVerificationCode] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [rememberDevice, setRememberDevice] = useState(true);
  const [selectedMethod, setSelectedMethod] = useState('email');

  useEffect(() => {
    if (!twoFactor) return;
    setSelectedMethod(twoFactor.preferredMethod || twoFactor.availableMethods[0] || 'email');
    setVerificationCode('');
    setBackupCode('');
    setRememberDevice(true);
  }, [twoFactor]);

  const localLoginAllowed = loginOptions?.local_login_allowed !== false;
  const providerCount = Array.isArray(loginOptions?.providers) ? loginOptions.providers.length : 0;

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.shell}>
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.heroText}>
              <Text style={styles.eyebrow}>MIMS MOBILE</Text>
              <Text style={styles.title}>Live mobile command center for Novartis workloads.</Text>
              <Text style={styles.subtitle}>
                Built on the existing MIMS backend. This preview uses real auth, real dashboard numbers, real inbox traffic, and real case workload from the shared MySQL system.
              </Text>
            </View>
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeTitle}>API target</Text>
              <Text style={styles.heroBadgeValue}>{apiBaseUrl.replace('http://', '')}</Text>
            </View>
          </View>

          <View style={styles.metricRow}>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Architecture</Text>
              <Text style={styles.metricValue}>React Native → MIMS API → MySQL</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Preview mode</Text>
              <Text style={styles.metricValue}>Expo web via Codex browser</Text>
            </View>
          </View>
        </View>

        <View style={styles.phoneFrame}>
          <View style={styles.phoneHeader}>
            <View>
              <Text style={styles.phoneTitle}>Secure sign in</Text>
              <Text style={styles.phoneMeta}>Org access, 2FA, and live workload sync</Text>
            </View>
            <StatusPill
              tone={backendOnline === false ? 'danger' : backendOnline === true ? 'success' : 'neutral'}
              value={backendOnline === false ? 'Backend offline' : backendOnline === true ? 'Backend online' : 'Checking'}
            />
          </View>

          <View style={styles.statusStrip}>
            <Text style={styles.statusStripText}>Target: {API_BASE_URL}</Text>
          </View>

          {!twoFactor ? (
            <>
              <View style={styles.inputBlock}>
                <Text style={styles.inputLabel}>Organisation</Text>
                <View style={styles.orgWrap}>
                  {orgs.map((org) => {
                    const active = selectedOrgId === String(org.id);
                    return (
                      <Pressable
                        key={org.id}
                        onPress={() => setSelectedOrgId(String(org.id))}
                        style={[styles.orgButton, active ? styles.orgButtonActive : null]}
                      >
                        <Text style={[styles.orgButtonText, active ? styles.orgButtonTextActive : null]}>
                          {org.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.inputBlock}>
                <Text style={styles.inputLabel}>Email</Text>
                <TextInput
                  autoCapitalize="none"
                  keyboardType="email-address"
                  onChangeText={setEmail}
                  placeholder="user@company.com"
                  placeholderTextColor={mobileColors.placeholder}
                  style={styles.input}
                  value={email}
                />
              </View>

              <View style={styles.inputBlock}>
                <Text style={styles.inputLabel}>Password</Text>
                <TextInput
                  onChangeText={setPassword}
                  placeholder="Enter password"
                  placeholderTextColor={mobileColors.placeholder}
                  secureTextEntry
                  style={styles.input}
                  value={password}
                />
              </View>

              <View style={styles.loginMeta}>
                <Text style={styles.helperText}>
                  {localLoginAllowed
                    ? 'Local login is enabled for the selected organisation.'
                    : 'This organisation requires SSO. Local password login is disabled.'}
                </Text>
                <Text style={styles.helperText}>Configured SSO providers: {providerCount}</Text>
              </View>

              <Pressable
                disabled={busy || !selectedOrgId || !localLoginAllowed}
                onPress={() => onLogin({ email, orgId: Number(selectedOrgId), password })}
                style={[styles.primaryButton, busy || !selectedOrgId || !localLoginAllowed ? styles.buttonDisabled : null]}
              >
                <Text style={styles.primaryButtonText}>{busy ? 'Connecting...' : 'Enter MIMS mobile'}</Text>
              </Pressable>
            </>
          ) : (
            <View style={styles.twoFactorPanel}>
              <Text style={styles.twoFactorTitle}>
                {twoFactor.twoFactorRequired ? 'Two-factor verification' : 'Security setup before access'}
              </Text>
              <Text style={styles.twoFactorText}>
                {twoFactor.twoFactorRequired
                  ? `Verify this sign in for ${twoFactor.maskedEmail || 'your account'}.`
                  : 'This org offers 2FA setup. You can complete it now or skip this step for the current session.'}
              </Text>

              <View style={styles.orgWrap}>
                {twoFactor.availableMethods.map((method) => {
                  const active = selectedMethod === method;
                  return (
                    <Pressable
                      key={method}
                      onPress={() => setSelectedMethod(method)}
                      style={[styles.orgButton, active ? styles.orgButtonActive : null]}
                    >
                      <Text style={[styles.orgButtonText, active ? styles.orgButtonTextActive : null]}>
                        {method.toUpperCase()}
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  onPress={() => setSelectedMethod('backup')}
                  style={[styles.orgButton, selectedMethod === 'backup' ? styles.orgButtonActive : null]}
                >
                  <Text style={[styles.orgButtonText, selectedMethod === 'backup' ? styles.orgButtonTextActive : null]}>
                    BACKUP
                  </Text>
                </Pressable>
              </View>

              {selectedMethod === 'totp' && twoFactor.twoFactorSetupAvailable ? (
                <View style={styles.qrPanel}>
                  <Text style={styles.helperText}>Start TOTP setup to pair an authenticator app.</Text>
                  <Pressable disabled={busy} onPress={onStartTotpSetup} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>Generate QR code</Text>
                  </Pressable>
                  {totpQrUrl ? <Image source={{ uri: totpQrUrl }} style={styles.qrImage} /> : null}
                </View>
              ) : null}

              {selectedMethod === 'email' ? (
                <Pressable disabled={busy} onPress={onSendEmailCode} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Send email code</Text>
                </Pressable>
              ) : null}

              <View style={styles.inputBlock}>
                <Text style={styles.inputLabel}>
                  {selectedMethod === 'backup' ? 'Backup code' : `${selectedMethod.toUpperCase()} code`}
                </Text>
                <TextInput
                  autoCapitalize="none"
                  onChangeText={selectedMethod === 'backup' ? setBackupCode : setVerificationCode}
                  placeholder={selectedMethod === 'backup' ? 'Enter backup code' : 'Enter verification code'}
                  placeholderTextColor={mobileColors.placeholder}
                  style={styles.input}
                  value={selectedMethod === 'backup' ? backupCode : verificationCode}
                />
              </View>

              <View style={styles.rememberRow}>
                <Text style={styles.helperText}>Remember this device for later sign-ins</Text>
                <Switch onValueChange={setRememberDevice} value={rememberDevice} />
              </View>

              <Pressable
                disabled={busy}
                onPress={() =>
                  onCompleteTwoFactor({
                    method: selectedMethod === 'backup' ? 'email' : selectedMethod,
                    code: selectedMethod === 'backup' ? undefined : verificationCode,
                    backupCode: selectedMethod === 'backup' ? backupCode : undefined,
                    rememberDevice,
                  })
                }
                style={[styles.primaryButton, busy ? styles.buttonDisabled : null]}
              >
                <Text style={styles.primaryButtonText}>{busy ? 'Verifying...' : 'Verify and continue'}</Text>
              </Pressable>

              {!twoFactor.twoFactorRequired && (
                <Pressable disabled={busy} onPress={onSkipTwoFactorSetup} style={styles.linkButton}>
                  <Text style={styles.linkButtonText}>Skip setup for now</Text>
                </Pressable>
              )}
            </View>
          )}

          {info ? <Text style={styles.infoBanner}>{info}</Text> : null}
          {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
  },
  shell: {
    backgroundColor: mobileColors.page,
    flexGrow: 1,
    gap: 24,
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  heroCard: {
    backgroundColor: '#0f172a',
    borderColor: '#1e293b',
    borderRadius: 32,
    borderWidth: 1,
    gap: 18,
    padding: 22,
  },
  heroTop: {
    gap: 18,
  },
  heroText: {
    gap: 10,
  },
  eyebrow: {
    color: '#7dd3fc',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  title: {
    color: '#f8fafc',
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 38,
  },
  subtitle: {
    color: '#cbd5e1',
    fontSize: 15,
    lineHeight: 22,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#082f49',
    borderRadius: 18,
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  heroBadgeTitle: {
    color: '#bae6fd',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  heroBadgeValue: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
  },
  metricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metricCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 18,
    flex: 1,
    gap: 6,
    minWidth: 240,
    padding: 16,
  },
  metricLabel: {
    color: '#0369a1',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  metricValue: {
    color: mobileColors.textStrong,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  phoneFrame: {
    alignSelf: 'center',
    backgroundColor: '#f8fafc',
    borderColor: '#dbeafe',
    borderRadius: 32,
    borderWidth: 1,
    gap: 16,
    maxWidth: 430,
    padding: 20,
    width: '100%',
  },
  phoneHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  phoneTitle: {
    color: mobileColors.textStrong,
    fontSize: 24,
    fontWeight: '800',
  },
  phoneMeta: {
    color: mobileColors.textMuted,
    fontSize: 13,
    marginTop: 4,
  },
  statusStrip: {
    backgroundColor: '#e2e8f0',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  statusStripText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '700',
  },
  inputBlock: {
    gap: 8,
  },
  inputLabel: {
    color: mobileColors.textStrong,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    borderRadius: 16,
    borderWidth: 1,
    color: mobileColors.textStrong,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  orgWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  orgButton: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  orgButtonActive: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  orgButtonText: {
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '700',
  },
  orgButtonTextActive: {
    color: '#f8fafc',
  },
  loginMeta: {
    gap: 6,
  },
  helperText: {
    color: mobileColors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  primaryButtonText: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#e0f2fe',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: '#0c4a6e',
    fontSize: 13,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  infoBanner: {
    backgroundColor: '#dbeafe',
    borderRadius: 14,
    color: '#1d4ed8',
    fontSize: 13,
    fontWeight: '700',
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorBanner: {
    backgroundColor: '#fee2e2',
    borderRadius: 14,
    color: '#991b1b',
    fontSize: 13,
    fontWeight: '700',
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  twoFactorPanel: {
    gap: 14,
  },
  twoFactorTitle: {
    color: mobileColors.textStrong,
    fontSize: 20,
    fontWeight: '800',
  },
  twoFactorText: {
    color: mobileColors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  rememberRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  linkButton: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  linkButtonText: {
    color: '#1d4ed8',
    fontSize: 13,
    fontWeight: '800',
  },
  qrPanel: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#dbeafe',
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  qrImage: {
    borderRadius: 12,
    height: 180,
    width: 180,
  },
});
