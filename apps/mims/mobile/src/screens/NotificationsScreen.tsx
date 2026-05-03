import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { DetailRow } from '../components/DetailRow';
import { FilterChip } from '../components/FilterChip';
import { MetricCard } from '../components/MetricCard';
import { SectionCard } from '../components/SectionCard';
import {
  acknowledgeNotification,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/api';
import { NotificationItem, NotificationsResponse } from '../types/mims';
import { mobileColors } from '../theme/colors';
import { formatDateTime, summarizeText } from '../utils/format';

type NotificationsScreenProps = {
  refreshVersion?: number;
  token: string;
};

export function NotificationsScreen({
  refreshVersion = 0,
  token,
}: NotificationsScreenProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [response, setResponse] = useState<NotificationsResponse | null>(null);
  const [selected, setSelected] = useState<NotificationItem | null>(null);

  useEffect(() => {
    void loadNotifications();
  }, [page, unreadOnly, refreshVersion, token]);

  async function loadNotifications() {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchNotifications(token, {
        limit: 20,
        offset: page * 20,
        unreadOnly,
      });
      setResponse(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notifications.');
    } finally {
      setLoading(false);
    }
  }

  async function handleMarkRead(item: NotificationItem) {
    setError(null);
    try {
      await markNotificationRead(token, item.id);
      await loadNotifications();
      if (selected?.id === item.id) {
        setSelected({ ...item, is_read: true, read_at: new Date().toISOString() });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark notification as read.');
    }
  }

  async function handleAcknowledge(item: NotificationItem) {
    setError(null);
    try {
      await acknowledgeNotification(token, item.id);
      await loadNotifications();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to acknowledge notification.');
    }
  }

  async function handleReadAll() {
    setError(null);
    try {
      await markAllNotificationsRead(token);
      await loadNotifications();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark all as read.');
    }
  }

  const totalPages = Math.max(1, Math.ceil(Number(response?.total || 0) / 20));

  if (selected) {
    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>Notification detail</Text>
            <Text style={styles.title}>{selected.title}</Text>
          </View>
          <Pressable onPress={() => setSelected(null)}>
            <Text style={styles.refreshLink}>Back to alerts</Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

        <SectionCard title="Summary">
          <DetailRow label="Category" value={selected.category} />
          <DetailRow label="Severity" value={String(selected.severity || 'info')} />
          <DetailRow label="Read state" value={selected.is_read ? 'Read' : 'Unread'} />
          <DetailRow label="Created" value={formatDateTime(selected.created_at)} />
          <DetailRow label="Message" value={selected.message} />
          <DetailRow label="Metadata" value={JSON.stringify(selected.metadata || {}, null, 2)} />
        </SectionCard>

        <SectionCard title="Actions">
          {!selected.is_read ? (
            <Pressable onPress={() => void handleMarkRead(selected)} style={styles.actionButton}>
              <Text style={styles.actionButtonText}>Mark as read</Text>
            </Pressable>
          ) : null}
          {selected.requires_acknowledgement && !selected.acknowledged_at ? (
            <Pressable onPress={() => void handleAcknowledge(selected)} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Acknowledge</Text>
            </Pressable>
          ) : null}
        </SectionCard>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Alerts</Text>
          <Text style={styles.title}>Notifications and follow-ups</Text>
        </View>
        <Text onPress={() => void loadNotifications()} style={styles.refreshLink}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </Text>
      </View>

      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

      <View style={styles.metricWrap}>
        <MetricCard accent="sky" label="Total" value={response?.total || 0} />
        <MetricCard accent="amber" label="Unread" value={response?.unread || 0} />
        <MetricCard accent="mint" label="Ack pending" value={response?.ack_pending || 0} />
      </View>

      <View style={styles.filterWrap}>
        <FilterChip active={!unreadOnly} label="All" onPress={() => { setUnreadOnly(false); setPage(0); }} />
        <FilterChip active={unreadOnly} label="Unread only" onPress={() => { setUnreadOnly(true); setPage(0); }} />
        <FilterChip active={false} label="Read all now" onPress={() => void handleReadAll()} />
      </View>

      <View style={styles.paginationRow}>
        <Pressable disabled={page === 0} onPress={() => setPage((current) => Math.max(0, current - 1))}>
          <Text style={[styles.refreshLink, page === 0 ? styles.mutedLink : null]}>Previous</Text>
        </Pressable>
        <Text style={styles.pageText}>
          {page + 1} / {totalPages}
        </Text>
        <Pressable disabled={page + 1 >= totalPages} onPress={() => setPage((current) => current + 1)}>
          <Text style={[styles.refreshLink, page + 1 >= totalPages ? styles.mutedLink : null]}>Next</Text>
        </Pressable>
      </View>

      <SectionCard title="Latest notifications">
        {loading ? <ActivityIndicator color="#1d4ed8" size="large" /> : null}
        {(response?.notifications || []).map((item) => (
          <Pressable key={item.id} onPress={() => setSelected(item)} style={styles.listCard}>
            <Text style={styles.listTitle}>{item.title}</Text>
            <Text style={styles.listMeta}>
              {item.category} · {item.severity || 'info'} · {item.is_read ? 'Read' : 'Unread'}
            </Text>
            <Text style={styles.listMeta}>{summarizeText(item.message, 120)}</Text>
            <Text style={styles.listMeta}>{formatDateTime(item.created_at)}</Text>
          </Pressable>
        ))}
      </SectionCard>
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
  mutedLink: {
    color: '#94a3b8',
  },
  metricWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  filterWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  paginationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pageText: {
    color: mobileColors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  listCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 18,
    gap: 6,
    padding: 14,
  },
  listTitle: {
    color: mobileColors.textStrong,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 22,
  },
  listMeta: {
    color: mobileColors.textMuted,
    fontSize: 13,
    lineHeight: 18,
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
  actionButton: {
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 16,
    paddingVertical: 14,
  },
  actionButtonText: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '800',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#e0f2fe',
    borderRadius: 16,
    paddingVertical: 14,
  },
  secondaryButtonText: {
    color: '#0c4a6e',
    fontSize: 14,
    fontWeight: '800',
  },
});
