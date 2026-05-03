import { StyleSheet, Text, View } from 'react-native';

import { InboxRow } from '../types/mims';
import { mobileColors } from '../theme/colors';
import { formatDateTime, titleCase } from '../utils/format';
import { StatusPill } from './StatusPill';

type InboxCardProps = {
  item: InboxRow;
};

function resolveTone(item: InboxRow) {
  if (!item.is_read) return 'info';
  if (String(item.priority || '').toLowerCase() === 'urgent') return 'danger';
  return 'neutral';
}

export function InboxCard({ item }: InboxCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.subjectWrap}>
          <Text style={styles.subject}>{item.subject || '(No subject)'}</Text>
          <Text style={styles.metaText}>
            {item.sender || 'Unknown sender'} → {item.recipient || 'Unknown mailbox'}
          </Text>
        </View>
        <StatusPill tone={resolveTone(item)} value={item.is_read ? 'Read' : 'Unread'} />
      </View>

      <View style={styles.grid}>
        <View style={styles.infoTile}>
          <Text style={styles.label}>Queue</Text>
          <Text style={styles.value}>{item.queue_name || 'Unrouted'}</Text>
        </View>
        <View style={styles.infoTile}>
          <Text style={styles.label}>Assigned</Text>
          <Text style={styles.value}>{item.assigned_to || 'Pending owner'}</Text>
        </View>
      </View>

      <View style={styles.grid}>
        <View style={styles.infoTile}>
          <Text style={styles.label}>Priority</Text>
          <Text style={styles.value}>{titleCase(item.priority)}</Text>
        </View>
        <View style={styles.infoTile}>
          <Text style={styles.label}>Mailbox</Text>
          <Text style={styles.value}>{item.mailbox_name || 'Inbound stream'}</Text>
        </View>
      </View>

      <Text style={styles.footer}>
        Received {formatDateTime(item.received_at)} · {item.attachments_count} attachments
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderColor: mobileColors.cardBorder,
    borderRadius: 22,
    borderWidth: 1,
    gap: 14,
    padding: 18,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  subjectWrap: {
    flex: 1,
    gap: 4,
  },
  subject: {
    color: mobileColors.textStrong,
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 22,
  },
  metaText: {
    color: mobileColors.textMuted,
    fontSize: 13,
  },
  grid: {
    flexDirection: 'row',
    gap: 12,
  },
  infoTile: {
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    flex: 1,
    gap: 4,
    padding: 12,
  },
  label: {
    color: mobileColors.textSubtle,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  value: {
    color: mobileColors.textStrong,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  footer: {
    color: mobileColors.textMuted,
    fontSize: 12,
  },
});
