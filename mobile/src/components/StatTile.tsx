// A single telemetry stat — big value over a small uppercase caption — used in
// the dashboard/landing "instrument" grids. Optional leading icon and tone tint
// for the value.
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fonts, radius, spacing, tracking } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

export function StatTile({
  value,
  label,
  icon,
  tone = 'brass',
  style,
}: {
  value: string;
  label: string;
  icon?: IconName;
  tone?: 'brass' | 'paper' | 'sea' | 'signal';
  style?: StyleProp<ViewStyle>;
}) {
  const valueColor =
    tone === 'paper'
      ? colors.text
      : tone === 'sea'
        ? colors.successLight
        : tone === 'signal'
          ? colors.dangerLight
          : colors.primaryLight;

  return (
    <View style={[styles.tile, style]}>
      {icon ? <Ionicons name={icon} size={16} color={valueColor} style={styles.icon} /> : null}
      <Text style={[styles.value, { color: valueColor }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minWidth: 130,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.xxs,
  },
  icon: {
    marginBottom: spacing.xxs,
  },
  value: {
    fontFamily: fonts.headingBold,
    fontSize: 22,
    letterSpacing: tracking.tight,
  },
  label: {
    fontFamily: fonts.headingMedium,
    fontSize: 10,
    letterSpacing: tracking.label,
    textTransform: 'uppercase',
    color: colors.textFaint,
  },
});
