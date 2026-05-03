import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { MetricCard } from '../components/MetricCard';
import { CaseRow, DashboardSummary } from '../types/mims';
import { mobileColors } from '../theme/colors';
import { formatDateTime } from '../utils/format';

type DashboardScreenProps = {
  dashboard: DashboardSummary | null;
  onRefresh: () => Promise<void>;
  refreshing: boolean;
};

function RecentCaseRow({ item }: { item: CaseRow }) {
  return (
    <View style={styles.listRow}>
      <View style={styles.listRowCopy}>
        <Text style={styles.listPrimary}>{item.case_number || 'Case pending number'}</Text>
        <Text style={styles.listSecondary}>
          {item.status_name || 'No status'} · {item.owner_name || 'Unassigned'}
        </Text>
      </View>
      <Text style={styles.listMeta}>{formatDateTime(item.updated_at)}</Text>
    </View>
  );
}

export function DashboardScreen({ dashboard, onRefresh, refreshing }: DashboardScreenProps) {
  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Dashboard</Text>
          <Text style={styles.title}>Field-ready workload summary</Text>
        </View>
        <Text onPress={() => void onRefresh()} style={styles.refreshLink}>
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </Text>
      </View>

      <View style={styles.metricWrap}>
        <MetricCard accent="sky" label="Open cases" value={dashboard?.stats.open_cases || 0} />
        <MetricCard accent="amber" label="Priority queue" value={dashboard?.stats.priority_cases || 0} />
        <MetricCard accent="mint" label="My cases" value={dashboard?.stats.my_cases || 0} />
      </View>

      <View style={styles.metricWrap}>
        <MetricCard accent="sky" label="Pending responses" value={dashboard?.mi_stats.pending_responses || 0} />
        <MetricCard accent="amber" label="Awaiting approval" value={dashboard?.mi_stats.pending_approval || 0} />
        <MetricCard accent="amber" label="SLA breached" value={dashboard?.mi_stats.sla_breached || 0} />
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Recent cases</Text>
        {dashboard?.recentCases?.length ? (
          dashboard.recentCases.map((item) => <RecentCaseRow item={item} key={item.id} />)
        ) : (
          <Text style={styles.emptyText}>No recent cases returned yet.</Text>
        )}
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Alerts</Text>
        {dashboard?.alerts?.length ? (
          dashboard.alerts.map((alert) => (
            <View key={alert.id} style={styles.alertCard}>
              <Text style={styles.alertTitle}>{alert.title}</Text>
              <Text style={styles.alertMessage}>{alert.message}</Text>
              <Text style={styles.alertMeta}>
                {alert.category} · {formatDateTime(alert.created_at)}
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.emptyText}>No mobile alerts returned for this session.</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    gap: 18,
    paddingBottom: 30,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
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
    fontSize: 24,
    fontWeight: '800',
    marginTop: 4,
  },
  refreshLink: {
    color: '#1d4ed8',
    fontSize: 13,
    fontWeight: '800',
  },
  metricWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  panel: {
    backgroundColor: '#ffffff',
    borderColor: mobileColors.cardBorder,
    borderRadius: 24,
    borderWidth: 1,
    gap: 12,
    padding: 18,
  },
  sectionTitle: {
    color: mobileColors.textStrong,
    fontSize: 18,
    fontWeight: '800',
  },
  listRow: {
    alignItems: 'flex-start',
    borderTopColor: '#e2e8f0',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    paddingTop: 12,
  },
  listRowCopy: {
    flex: 1,
    gap: 4,
  },
  listPrimary: {
    color: mobileColors.textStrong,
    fontSize: 15,
    fontWeight: '700',
  },
  listSecondary: {
    color: mobileColors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  listMeta: {
    color: mobileColors.textSubtle,
    fontSize: 12,
    fontWeight: '700',
  },
  alertCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 18,
    gap: 6,
    padding: 14,
  },
  alertTitle: {
    color: mobileColors.textStrong,
    fontSize: 14,
    fontWeight: '800',
  },
  alertMessage: {
    color: mobileColors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  alertMeta: {
    color: mobileColors.textSubtle,
    fontSize: 12,
    fontWeight: '700',
  },
  emptyText: {
    color: mobileColors.textMuted,
    fontSize: 14,
  },
});
