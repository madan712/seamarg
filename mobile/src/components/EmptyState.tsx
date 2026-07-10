// Friendly empty/placeholder block: a large tinted icon, a title and a line of
// copy, with an optional call to action. Replaces bare "No items yet." text so
// empty lists still feel designed.
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Body, Heading } from '@/components/Typography';
import { colors, radius, spacing, withAlpha } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
}: {
  icon: IconName;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.wrap} accessibilityRole="summary">
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={30} color={colors.primaryLight} />
      </View>
      <Heading style={styles.title}>{title}</Heading>
      {message ? <Body style={styles.message}>{message}</Body> : null}
      {actionLabel && onAction ? (
        <View style={styles.action}>
          <Button title={actionLabel} onPress={onAction} size="sm" fullWidth={false} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: radius.xxl,
    backgroundColor: withAlpha(colors.primary, 0.12),
    borderWidth: 1,
    borderColor: withAlpha(colors.primary, 0.24),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  title: {
    textAlign: 'center',
  },
  message: {
    textAlign: 'center',
    color: colors.textMuted,
  },
  action: {
    marginTop: spacing.sm,
  },
});
