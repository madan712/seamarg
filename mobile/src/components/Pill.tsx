// Small status badge mirroring the website's .pill styles (Oswald, tinted
// background per tone). Used for certificate/document status chips.
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, tracking } from '@/theme';

type Tone = 'ok' | 'warn' | 'due' | 'neutral';

export function Pill({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  return (
    <View style={[styles.pill, styles[`${tone}Bg`]]}>
      <Text style={[styles.text, styles[`${tone}Text`]]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  text: {
    fontFamily: fonts.headingMedium,
    fontSize: 11,
    letterSpacing: tracking.tight,
    textTransform: 'uppercase',
  },
  okBg: { backgroundColor: 'rgba(110, 147, 162, 0.18)' },
  okText: { color: colors.textMuted },
  warnBg: { backgroundColor: 'rgba(200, 149, 46, 0.18)' },
  warnText: { color: colors.primaryLight },
  dueBg: { backgroundColor: 'rgba(189, 70, 48, 0.22)' },
  dueText: { color: '#e08572' },
  neutralBg: { backgroundColor: 'rgba(243, 238, 225, 0.08)' },
  neutralText: { color: colors.textDim },
});
