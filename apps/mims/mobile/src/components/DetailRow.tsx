import { StyleSheet, Text, View } from 'react-native';

import { mobileColors } from '../theme/colors';

type DetailRowProps = {
  label: string;
  value: string;
};

export function DetailRow({ label, value }: DetailRowProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 4,
  },
  label: {
    color: mobileColors.textSubtle,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  value: {
    color: mobileColors.textStrong,
    fontSize: 14,
    lineHeight: 20,
  },
});
