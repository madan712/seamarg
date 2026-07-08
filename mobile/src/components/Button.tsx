import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { colors, fonts, radius, spacing, tracking } from '@/theme';

type Props = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  loading?: boolean;
  disabled?: boolean;
};

export function Button({ title, onPress, variant = 'primary', loading = false, disabled = false }: Props) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' ? styles.primary : styles.secondary,
        (pressed || isDisabled) && styles.dimmed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.primaryText : colors.primaryLight} />
      ) : (
        <Text style={[styles.label, variant === 'secondary' && styles.secondaryLabel]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  primary: {
    backgroundColor: colors.primary,
  },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(200, 149, 46, 0.4)',
  },
  dimmed: {
    opacity: 0.55,
  },
  label: {
    color: colors.primaryText,
    fontFamily: fonts.heading,
    fontSize: 14,
    letterSpacing: tracking.label,
    textTransform: 'uppercase',
  },
  secondaryLabel: {
    color: colors.primaryLight,
  },
});
