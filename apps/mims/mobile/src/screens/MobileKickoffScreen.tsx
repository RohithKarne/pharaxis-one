import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { InfoCard } from '../components/InfoCard';
import {
  mobileArchitectureGuardrails,
  mobilePreviewModules,
} from '../data/mobilePreview';
import { mobileColors } from '../theme/colors';

export function MobileKickoffScreen() {
  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.shell}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>MIMS MOBILE KICKOFF</Text>
          <Text style={styles.title}>Medical workflows built for the field, not the desktop.</Text>
          <Text style={styles.subtitle}>
            This first preview is the starting shell for the MIMS mobile app. The backend and database stay centralized, while mobile focuses on fast operational access.
          </Text>
        </View>

        <View style={styles.phoneFrame}>
          <View style={styles.phoneHeader}>
            <View>
              <Text style={styles.phoneTitle}>MIMS Mobile</Text>
              <Text style={styles.phoneMeta}>Novartis org preview · Phase 1</Text>
            </View>
            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>Online</Text>
            </View>
          </View>

          <View style={styles.summaryPanel}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Primary goal</Text>
              <Text style={styles.summaryValue}>Inbox and case execution</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Architecture</Text>
              <Text style={styles.summaryValue}>Mobile {'->'} API {'->'} MySQL</Text>
            </View>
          </View>

          <Text style={styles.sectionLabel}>Phase 1 modules</Text>
          <View style={styles.moduleList}>
            {mobilePreviewModules.map((module) => (
              <InfoCard
                key={module.title}
                title={module.title}
                detail={module.detail}
              />
            ))}
          </View>

          <Text style={styles.sectionLabel}>Architecture guardrails</Text>
          <View style={styles.pillWrap}>
            {mobileArchitectureGuardrails.map((item) => (
              <View key={item} style={styles.archPill}>
                <Text style={styles.archPillText}>{item}</Text>
              </View>
            ))}
          </View>

          <View style={styles.footerBanner}>
            <Text style={styles.footerBannerTitle}>Next mobile build slice</Text>
            <Text style={styles.footerBannerText}>
              Login, dashboard, inbox list, case list, and case summary cards using the existing MIMS backend routes.
            </Text>
          </View>
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
    flex: 1,
    backgroundColor: mobileColors.page,
    paddingHorizontal: 20,
    paddingVertical: 24,
    gap: 24,
  },
  hero: {
    gap: 12,
  },
  eyebrow: {
    color: mobileColors.accent,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  title: {
    color: mobileColors.textInverse,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
    maxWidth: 680,
  },
  subtitle: {
    color: mobileColors.footerText,
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 760,
  },
  phoneFrame: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 430,
    backgroundColor: mobileColors.frame,
    borderRadius: 32,
    padding: 20,
    gap: 18,
    borderWidth: 1,
    borderColor: mobileColors.frameBorder,
  },
  phoneHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
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
  statusPill: {
    backgroundColor: mobileColors.successSoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  statusPillText: {
    color: mobileColors.successText,
    fontWeight: '700',
    fontSize: 12,
  },
  summaryPanel: {
    flexDirection: 'row',
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: mobileColors.accentSoft,
    borderRadius: 20,
    padding: 14,
    gap: 6,
  },
  summaryLabel: {
    color: '#0369a1',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  summaryValue: {
    color: mobileColors.textStrong,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  sectionLabel: {
    color: mobileColors.sectionLabel,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  moduleList: {
    gap: 12,
  },
  pillWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  archPill: {
    backgroundColor: '#eff6ff',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: mobileColors.accentLine,
  },
  archPillText: {
    color: mobileColors.pillText,
    fontSize: 12,
    fontWeight: '700',
  },
  footerBanner: {
    backgroundColor: mobileColors.footer,
    borderRadius: 22,
    padding: 18,
    gap: 8,
  },
  footerBannerTitle: {
    color: mobileColors.textInverse,
    fontSize: 16,
    fontWeight: '800',
  },
  footerBannerText: {
    color: mobileColors.footerText,
    fontSize: 14,
    lineHeight: 20,
  },
});
