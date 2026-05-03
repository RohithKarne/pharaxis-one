import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { mobileColors } from '../theme/colors';

type SectionCardProps = {
  children: ReactNode;
  title: string;
};

export function SectionCard({ children, title }: SectionCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderColor: mobileColors.cardBorder,
    borderRadius: 24,
    borderWidth: 1,
    gap: 12,
    padding: 18,
  },
  title: {
    color: mobileColors.textStrong,
    fontSize: 18,
    fontWeight: '800',
  },
});
