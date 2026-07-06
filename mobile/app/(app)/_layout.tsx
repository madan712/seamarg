// Authenticated area. Guards on the session (redirect to sign-in when absent)
// and presents the three top-level tabs. Each tab that needs drill-down
// (profile, certificates) is a folder with its own Stack layout.
import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';

import { useAuth } from '@/auth/AuthContext';
import { colors } from '@/theme';

export default function AppLayout() {
  const { session, initializing } = useAuth();

  if (!initializing && !session) {
    return <Redirect href="/sign-in" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="certificates"
        options={{
          title: 'Certificates',
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Ionicons name="ribbon-outline" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
