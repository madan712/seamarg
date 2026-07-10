// Segmented control: a pill-shaped track holding equal-width options with a
// brass-tinted active segment. Replaces the ad-hoc tab row in Courses and works
// for any small in-screen view switch. Fully keyboard/screen-reader labelled.
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, sizes, spacing, tracking, withAlpha } from '@/theme';

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {options.map((option) => {
        const active = option.key === value;
        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={option.label}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    minHeight: sizes.minTouch - 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.pill,
  },
  segmentActive: {
    backgroundColor: withAlpha(colors.primary, 0.2),
    borderWidth: 1,
    borderColor: withAlpha(colors.primary, 0.4),
  },
  label: {
    fontFamily: fonts.headingMedium,
    fontSize: 12,
    letterSpacing: tracking.tight,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  labelActive: {
    color: colors.primaryLight,
  },
});
