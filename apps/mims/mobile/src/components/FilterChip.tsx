import { Pressable, StyleSheet, Text } from 'react-native';

type FilterChipProps = {
  active: boolean;
  label: string;
  onPress: () => void;
};

export function FilterChip({ active, label, onPress }: FilterChipProps) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active ? styles.chipActive : null]}>
      <Text style={[styles.text, active ? styles.textActive : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  chipActive: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  text: {
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '700',
  },
  textActive: {
    color: '#f8fafc',
  },
});
