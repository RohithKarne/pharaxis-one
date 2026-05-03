import { StyleSheet, Text, View } from 'react-native';

import { CaseRow } from '../types/mims';
import { mobileColors } from '../theme/colors';
import { formatDateTime, formatRelativeLabel, titleCase } from '../utils/format';
import { StatusPill } from './StatusPill';

type CaseCardProps = {
  item: CaseRow;
};

function resolvePriorityTone(priority?: string | null) {
  const normalized = String(priority || '').toLowerCase();
  if (normalized === 'urgent' || normalized === 'high') return 'danger';
  if (normalized === 'medium') return 'info';
  return 'neutral';
}

export function CaseCard({ item }: CaseCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.heading}>
          <Text style={styles.caseNumber}>{item.case_number || 'Case pending number'}</Text>
          <Text style={styles.metaText}>
            {titleCase(item.case_type)} · {item.owner_name || 'Unassigned'}
          </Text>
        </View>
        <StatusPill tone={resolvePriorityTone(item.priority)} value={item.priority || 'normal'} />
      </View>

      <View style={styles.row}>
        <View style={styles.infoBlock}>
          <Text style={styles.label}>Workflow status</Text>
          <Text style={styles.value}>{item.status_name || 'Not set'}</Text>
        </View>
        <View style={styles.infoBlock}>
          <Text style={styles.label}>Last touch</Text>
          <Text style={styles.value}>{formatRelativeLabel(item.updated_at)}</Text>
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.infoBlock}>
          <Text style={styles.label}>Communications</Text>
          <Text style={styles.value}>{Number(item.communication_count || 0)}</Text>
        </View>
        <View style={styles.infoBlock}>
          <Text style={styles.label}>Last channel</Text>
          <Text style={styles.value}>{item.last_comm_box || 'No linked inbox yet'}</Text>
        </View>
      </View>

      <Text style={styles.footer}>
        Updated {formatDateTime(item.updated_at)} · Created {formatDateTime(item.created_at)}
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
    gap: 12,
    justifyContent: 'space-between',
  },
  heading: {
    flex: 1,
    gap: 4,
  },
  caseNumber: {
    color: mobileColors.textStrong,
    fontSize: 18,
    fontWeight: '800',
  },
  metaText: {
    color: mobileColors.textMuted,
    fontSize: 13,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  infoBlock: {
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
