// A reusable tappable row: optional leading icon badge, a title + subtitle
// stack, and a trailing slot (defaults to a chevron when the row is pressable).
// Backbone of the profile / certificate / institute / enrollment lists.
import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';

import { Card } from '@/components/Card';
import { IconBadge } from '@/components/IconBadge';
import { Body, Muted } from '@/components/Typography';
import { StyleSheet, View } from 'react-native';
import { colors, spacing } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

export function ListRow({
  title,
  subtitle,
  icon,
  iconTone = 'brass',
  trailing,
  onPress,
  accessibilityLabel,
  accessibilityHint,
}: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  iconTone?: 'brass' | 'sea' | 'mist' | 'signal';
  trailing?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}) {
  return (
    <Card
      onPress={onPress}
      style={styles.row}
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
    >
      {icon ? <IconBadge icon={icon} tone={iconTone} /> : null}
      <View style={styles.text}>
        <Body numberOfLines={1}>{title}</Body>
        {subtitle ? <Muted numberOfLines={1}>{subtitle}</Muted> : null}
      </View>
      <View style={styles.trailing}>
        {trailing}
        {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textFaint} /> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  text: { flex: 1, gap: 2 },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
