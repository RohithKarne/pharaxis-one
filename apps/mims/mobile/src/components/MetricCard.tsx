import { StyleSheet, Text, View } from 'react-native';

import { mobileColors } from '../theme/colors';

type MetricCardProps = {
  accent?: 'sky' | 'amber' | 'mint';
  label: string;
  value: number | string;
};

const ACCENTS = {
  amber: { border: '#f59e0b', tone: '#78350f', wash: '#fef3c7' },
  mint: { border: '#10b981', tone: '#064e3b', wash: '#d1fae5' },
  sky: { border: '#0284c7', tone: '#0c4a6e', wash: '#e0f2fe' },
} as const;

export function MetricCard({ accent = 'sky', label, value }: MetricCardProps) {
  const tone = ACCENTS[accent];

  return (
    <View style={[styles.card, { backgroundColor: tone.wash, borderColor: tone.border }]}>
      <Text style={[styles.label, { color: tone.tone }]}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    gap: 6,
    minWidth: 144,
    padding: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  value: {
    color: mobileColors.textStrong,
    fontSize: 24,
    fontWeight: '800',
  },
});
