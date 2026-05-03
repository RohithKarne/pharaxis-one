import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthSession } from '../types/mims';
import { mobileColors } from '../theme/colors';

type AccountScreenProps = {
  onLogout: () => Promise<void>;
  refreshing: boolean;
  session: AuthSession;
};

export function AccountScreen({ onLogout, refreshing, session }: AccountScreenProps) {
  return (
    <View style={styles.shell}>
      <Text style={styles.eyebrow}>Account</Text>
      <Text style={styles.title}>{session.user.name}</Text>
      <Text style={styles.subtitle}>
        {session.user.role} · {session.orgName || 'No organisation'}
      </Text>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Session details</Text>
        <Text style={styles.detail}>Email: {session.user.email}</Text>
        <Text style={styles.detail}>Modules: {session.modules.length ? session.modules.join(', ') : 'None returned'}</Text>
        <Text style={styles.detail}>Site: {session.siteName || 'No site selected'}</Text>
        <Text style={styles.detail}>Timeout: {session.sessionTimeout} minutes</Text>
      </View>

      <Pressable disabled={refreshing} onPress={() => void onLogout()} style={styles.button}>
        <Text style={styles.buttonText}>{refreshing ? 'Signing out...' : 'Sign out'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    gap: 18,
    paddingBottom: 30,
  },
  eyebrow: {
    color: '#0369a1',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    color: mobileColors.textStrong,
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: mobileColors.textMuted,
    fontSize: 15,
  },
  panel: {
    backgroundColor: '#ffffff',
    borderColor: mobileColors.cardBorder,
    borderRadius: 24,
    borderWidth: 1,
    gap: 10,
    padding: 18,
  },
  sectionTitle: {
    color: mobileColors.textStrong,
    fontSize: 18,
    fontWeight: '800',
  },
  detail: {
    color: mobileColors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#7f1d1d',
    borderRadius: 18,
    paddingVertical: 16,
  },
  buttonText: {
    color: '#fef2f2',
    fontSize: 15,
    fontWeight: '800',
  },
});
