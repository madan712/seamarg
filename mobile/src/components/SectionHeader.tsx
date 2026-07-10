// Section divider: an uppercase Oswald heading with an optional right-aligned
// text action (e.g. "View all"). Gives every list a consistent, scannable head.
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Heading } from '@/components/Typography';
import { colors, fonts, sizes, spacing, tracking, typography } from '@/theme';

export function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.row}>
      <Heading>{title}</Heading>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          style={styles.action}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  action: {
    minHeight: sizes.minTouch,
    justifyContent: 'center',
  },
  actionText: {
    fontFamily: fonts.headingMedium,
    fontSize: typography.label,
    letterSpacing: tracking.label,
    textTransform: 'uppercase',
    color: colors.primaryLight,
  },
});
