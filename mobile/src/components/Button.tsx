import { Ionicons } from '@expo/vector-icons';
import { useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, elevation, fonts, radius, sizes, spacing, tracking, withAlpha } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'sm';

type Props = {
  title: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  // Stretch to the container width (default true keeps prior full-width layout).
  fullWidth?: boolean;
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  fullWidth = true,
}: Props) {
  const isDisabled = disabled || loading;
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (value: number) =>
    Animated.spring(scale, { toValue: value, useNativeDriver: true, speed: 50, bounciness: 0 }).start();

  const labelColor =
    variant === 'primary'
      ? colors.primaryText
      : variant === 'danger'
        ? colors.dangerLight
        : colors.primaryLight;

  return (
    <Animated.View style={[fullWidth && styles.fullWidth, { transform: [{ scale }] }]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => !isDisabled && animateTo(0.97)}
        onPressOut={() => animateTo(1)}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled, busy: loading }}
        accessibilityLabel={title}
        style={[
          styles.base,
          size === 'sm' && styles.sizeSm,
          variant === 'primary' && styles.primary,
          variant === 'secondary' && styles.secondary,
          variant === 'ghost' && styles.ghost,
          variant === 'danger' && styles.danger,
          isDisabled && styles.dimmed,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={labelColor} />
        ) : (
          <View style={styles.content}>
            {icon ? <Ionicons name={icon} size={size === 'sm' ? 15 : 17} color={labelColor} /> : null}
            <Text style={[styles.label, size === 'sm' && styles.labelSm, { color: labelColor }]}>
              {title}
            </Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fullWidth: { alignSelf: 'stretch' },
  base: {
    borderRadius: radius.md,
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: sizes.minTouch + 8,
  },
  sizeSm: {
    minHeight: sizes.minTouch,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  primary: {
    backgroundColor: colors.primary,
    ...elevation.sm,
  },
  secondary: {
    backgroundColor: withAlpha(colors.primary, 0.1),
    borderWidth: 1,
    borderColor: withAlpha(colors.primary, 0.42),
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  danger: {
    backgroundColor: withAlpha(colors.danger, 0.14),
    borderWidth: 1,
    borderColor: withAlpha(colors.danger, 0.4),
  },
  dimmed: {
    opacity: 0.5,
  },
  label: {
    fontFamily: fonts.heading,
    fontSize: 14,
    letterSpacing: tracking.label,
    textTransform: 'uppercase',
  },
  labelSm: {
    fontSize: 12,
  },
});
