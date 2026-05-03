import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppTab } from '../types/mims';
import { mobileColors } from '../theme/colors';

type TabButtonProps = {
  active: boolean;
  label: string;
  tab: AppTab;
  onPress: (tab: AppTab) => void;
};

export function TabButton({ active, label, tab, onPress }: TabButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onPress(tab)}
      style={({ pressed }) => [
        styles.button,
        active ? styles.buttonActive : null,
        pressed ? styles.buttonPressed : null,
      ]}
    >
      <View style={styles.dotWrap}>
        <View style={[styles.dot, active ? styles.dotActive : null]} />
      </View>
      <Text style={[styles.label, active ? styles.labelActive : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: 18,
    flex: 1,
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  buttonActive: {
    backgroundColor: '#0f172a',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  dotWrap: {
    height: 8,
    justifyContent: 'center',
  },
  dot: {
    backgroundColor: '#cbd5e1',
    borderRadius: 999,
    height: 8,
    width: 8,
  },
  dotActive: {
    backgroundColor: '#7dd3fc',
  },
  label: {
    color: mobileColors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  labelActive: {
    color: '#f8fafc',
  },
});
