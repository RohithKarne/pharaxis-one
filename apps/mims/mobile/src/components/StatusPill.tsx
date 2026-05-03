import { StyleSheet, Text, View } from 'react-native';

import { mobileColors } from '../theme/colors';

type StatusPillProps = {
  tone?: 'danger' | 'info' | 'neutral' | 'success';
  value: string;
};

const TONES = {
  danger: { backgroundColor: '#fee2e2', color: '#991b1b' },
  info: { backgroundColor: '#dbeafe', color: '#1d4ed8' },
  neutral: { backgroundColor: '#e2e8f0', color: '#334155' },
  success: { backgroundColor: '#dcfce7', color: '#166534' },
} as const;

export function StatusPill({ tone = 'neutral', value }: StatusPillProps) {
  const palette = TONES[tone];

  return (
    <View style={[styles.pill, { backgroundColor: palette.backgroundColor }]}>
      <Text style={[styles.text, { color: palette.color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
});
