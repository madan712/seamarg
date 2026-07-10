// The Seamarg wordmark: a brass signal dot + uppercase Oswald name. Used at the
// top of auth screens and anywhere the brand needs a compact presence.
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, tracking } from '@/theme';

export function BrandMark() {
  return (
    <View style={styles.row} accessibilityRole="header" accessibilityLabel="Seamarg">
      <View style={styles.dot} />
      <Text style={styles.name}>SEAMARG</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary },
  name: {
    fontFamily: fonts.heading,
    fontSize: 15,
    letterSpacing: tracking.label,
    color: colors.text,
  },
});
