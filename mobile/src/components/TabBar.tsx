// Custom bottom navigation for the authenticated area. Four destination tabs
// (Home, Wallet, Courses, Profile) plus a raised brass "Scan" action floating
// in the centre — scanning a certificate is the app's hero action, so it gets
// a dedicated, always-reachable button instead of being buried in a list.
//
// Rendered via <Tabs tabBar={...}>. The centre button is not a tab route; it
// pushes the scan modal directly.
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, elevation, fonts, radius, sizes, spacing, tracking } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

// Icon + label per route name. Keys must match the <Tabs.Screen name>s.
const TABS: Record<string, { icon: IconName; activeIcon: IconName; label: string }> = {
  dashboard: { icon: 'compass-outline', activeIcon: 'compass', label: 'Home' },
  certificates: { icon: 'wallet-outline', activeIcon: 'wallet', label: 'Wallet' },
  courses: { icon: 'school-outline', activeIcon: 'school', label: 'Courses' },
  profile: { icon: 'person-outline', activeIcon: 'person', label: 'Profile' },
};

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  // Split the routes so the Scan action can sit in the visual centre.
  const half = Math.ceil(state.routes.length / 2);
  const left = state.routes.slice(0, half);
  const right = state.routes.slice(half);

  const renderTab = (route: (typeof state.routes)[number]) => {
    const meta = TABS[route.name];
    if (!meta) return null;
    const index = state.routes.findIndex((r) => r.key === route.key);
    const focused = state.index === index;

    const onPress = () => {
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) {
        navigation.navigate(route.name);
      }
    };

    return (
      <Pressable
        key={route.key}
        onPress={onPress}
        style={styles.tab}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={meta.label}
      >
        <Ionicons
          name={focused ? meta.activeIcon : meta.icon}
          size={23}
          color={focused ? colors.primaryLight : colors.textFaint}
        />
        <Text style={[styles.label, focused && styles.labelActive]}>{meta.label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom || spacing.sm, height: sizes.tabBar + (insets.bottom || spacing.sm) }]}>
      <View style={styles.group}>{left.map(renderTab)}</View>

      <View style={styles.fabSlot}>
        <Pressable
          onPress={() => router.push('/certificates/scan')}
          style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
          accessibilityRole="button"
          accessibilityLabel="Scan a certificate"
          accessibilityHint="Opens the camera to scan and auto-fill a certificate"
        >
          <Ionicons name="scan" size={26} color={colors.primaryText} />
        </Pressable>
        <Text style={styles.fabLabel}>Scan</Text>
      </View>

      <View style={styles.group}>{right.map(renderTab)}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surfaceRaised,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  group: {
    flex: 1,
    flexDirection: 'row',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 3,
    minHeight: sizes.minTouch,
  },
  label: {
    fontFamily: fonts.headingMedium,
    fontSize: 9.5,
    letterSpacing: tracking.tight,
    textTransform: 'uppercase',
    color: colors.textFaint,
  },
  labelActive: {
    color: colors.primaryLight,
  },
  fabSlot: {
    width: 76,
    alignItems: 'center',
  },
  fab: {
    // Floats above the bar (absolute so it doesn't push the label down).
    position: 'absolute',
    top: -sizes.fab + 24,
    left: (76 - (sizes.fab - 2)) / 2,
    width: sizes.fab - 2,
    height: sizes.fab - 2,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.surfaceRaised,
    ...elevation.glow,
  },
  fabPressed: {
    backgroundColor: colors.primaryDeep,
  },
  fabLabel: {
    fontFamily: fonts.headingMedium,
    fontSize: 9.5,
    letterSpacing: tracking.tight,
    textTransform: 'uppercase',
    color: colors.primaryLight,
    // Sits in normal flow, aligned with the side tab labels (icon 23 + gap 3).
    marginTop: 26,
  },
});
