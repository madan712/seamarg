// Standard screen wrapper: safe-area padding, themed background, and an optional
// scroll container with pull-to-refresh. Use around every route's content for
// consistent layout.
//
// `gutter` toggles the horizontal padding (turn it off for screens that paint
// full-bleed headers and pad their own sections). `footerSpace` adds bottom
// clearance so content isn't hidden behind the floating tab bar / Scan FAB.
import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from '@/theme';

type Props = {
  children: ReactNode;
  scroll?: boolean;
  gutter?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  footerSpace?: number;
};

export function Screen({
  children,
  scroll = true,
  gutter = true,
  refreshing,
  onRefresh,
  footerSpace = 0,
}: Props) {
  const insets = useSafeAreaInsets();
  const padding = {
    paddingTop: insets.top + spacing.md,
    // When footerSpace is set the screen sits above the tab bar, which already
    // reserves the safe-area inset — so use footerSpace as the exact bottom
    // clearance instead of re-adding insets.bottom (avoids a large empty gap).
    paddingBottom: footerSpace > 0 ? footerSpace : insets.bottom + spacing.lg,
    paddingHorizontal: gutter ? spacing.md : 0,
  };

  if (scroll) {
    return (
      <ScrollView
        style={styles.root}
        contentContainerStyle={[styles.content, padding]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          onRefresh
            ? (
                <RefreshControl
                  refreshing={Boolean(refreshing)}
                  onRefresh={onRefresh}
                  tintColor={colors.primaryLight}
                  colors={[colors.primary]}
                  progressBackgroundColor={colors.surfaceRaised}
                />
              )
            : undefined
        }
      >
        {children}
      </ScrollView>
    );
  }

  return <View style={[styles.root, styles.content, padding]}>{children}</View>;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    gap: spacing.md,
  },
});
