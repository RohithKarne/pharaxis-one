import { StyleSheet, TextInput, View } from 'react-native';

import { mobileColors } from '../theme/colors';

type SearchFieldProps = {
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
};

export function SearchField({ onChangeText, placeholder, value }: SearchFieldProps) {
  return (
    <View style={styles.wrap}>
      <TextInput
        autoCapitalize="none"
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={mobileColors.placeholder}
        style={styles.input}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  input: {
    color: mobileColors.textStrong,
    fontSize: 14,
    paddingVertical: 12,
  },
});
