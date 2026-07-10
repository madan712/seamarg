// A tinted rounded square holding a single Ionicon — the recurring "chip" that
// leads nav cards, list rows and feature blocks. Tone picks the tint + glyph
// colour from the maritime palette.
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { colors, radius, sizes, withAlpha } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;
type Tone = 'brass' | 'sea' | 'mist' | 'signal';

const TONES: Record<Tone, { tint: string; color: string }> = {
  brass: { tint: withAlpha(colors.primary, 0.16), color: colors.primaryLight },
  sea: { tint: withAlpha(colors.success, 0.16), color: colors.successLight },
  mist: { tint: withAlpha(colors.textFaint, 0.18), color: colors.textMuted },
  signal: { tint: withAlpha(colors.danger, 0.18), color: colors.dangerLight },
};

export function IconBadge({
  icon,
  tone = 'brass',
  size = sizes.icon,
}: {
  icon: IconName;
  tone?: Tone;
  size?: number;
}) {
  const spec = TONES[tone];
  return (
    <View
      style={[
        styles.badge,
        { width: size, height: size, borderRadius: radius.md, backgroundColor: spec.tint },
      ]}
    >
      <Ionicons name={icon} size={size * 0.5} color={spec.color} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
