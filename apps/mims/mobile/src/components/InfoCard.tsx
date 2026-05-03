import { StyleSheet, Text, View } from 'react-native';

import { mobileColors } from '../theme/colors';

type InfoCardProps = {
  detail: string;
  title: string;
};

export function InfoCard({ detail, title }: InfoCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.detail}>{detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: mobileColors.cardBorder,
    gap: 6,
  },
  title: {
    color: mobileColors.textStrong,
    fontSize: 17,
    fontWeight: '800',
  },
  detail: {
    color: mobileColors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
});
