// Surface container matching the website's card treatment: navy fill, hairline
// paper border, rounded corners. Extended with variants:
//   - default : flat navy surface
//   - elevated: raised surface + soft shadow (for hero / primary cards)
//   - rail    : adds a brass accent rail down the left edge (spotlight cards)
// Renders as an animated Pressable (subtle press scale) when onPress is given.
import { useRef, type ReactNode } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, elevation, radius, spacing } from '@/theme';

type Variant = 'default' | 'elevated' | 'rail';

type Props = {
  children: ReactNode;
  onPress?: () => void;
  variant?: Variant;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

export function Card({
  children,
  onPress,
  variant = 'default',
  style,
  accessibilityLabel,
  accessibilityHint,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const surface = [
    styles.card,
    variant === 'elevated' && styles.elevated,
    variant === 'rail' && styles.rail,
  ];

  const body =
    variant === 'rail' ? (
      <>
        <View style={styles.railBar} />
        <View style={styles.railBody}>{children}</View>
      </>
    ) : (
      children
    );

  if (!onPress) {
    return <View style={[surface, style]}>{body}</View>;
  }

  const animateTo = (value: number) =>
    Animated.spring(scale, { toValue: value, useNativeDriver: true, speed: 40, bounciness: 0 }).start();

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={() => animateTo(0.97)}
        onPressOut={() => animateTo(1)}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        style={({ pressed }) => [surface, pressed && styles.pressed, style]}
      >
        {body}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  elevated: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.borderStrong,
    ...elevation.md,
  },
  rail: {
    flexDirection: 'row',
    padding: 0,
    gap: 0,
    overflow: 'hidden',
  },
  railBar: {
    width: 4,
    backgroundColor: colors.primary,
  },
  railBody: {
    flex: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  pressed: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.borderStrong,
  },
});
