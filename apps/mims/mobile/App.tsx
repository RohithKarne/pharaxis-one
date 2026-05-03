import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';

import { MimsMobileApp } from './src/screens/MimsMobileApp';
import { mobileColors } from './src/theme/colors';

export default function App() {
  return (
    <View style={styles.safeArea}>
      <StatusBar style="light" />
      <MimsMobileApp />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: mobileColors.page,
  },
});
