// Unauthenticated stack. If a session already exists, bounce to the app.
import { Ionicons } from '@expo/vector-icons';
import { Redirect, Stack, router } from 'expo-router';
import { Pressable } from 'react-native';

import { useAuth } from '@/auth/AuthContext';
import { colors, fonts } from '@/theme';

// Sign-in is the stack's initial route, so it has no automatic back arrow.
// This returns the visitor to the public landing page.
function HomeButton() {
  return (
    <Pressable
      hitSlop={12}
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
    >
      <Ionicons name="chevron-back" size={24} color={colors.text} />
    </Pressable>
  );
}

export default function AuthLayout() {
  const { session, initializing } = useAuth();

  if (!initializing && session) {
    return <Redirect href="/dashboard" />;
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.primaryLight,
        headerTitleStyle: { fontFamily: fonts.heading, color: colors.text },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="sign-in"
        options={{ title: 'Sign in', headerLeft: () => <HomeButton /> }}
      />
      <Stack.Screen name="sign-up" options={{ title: 'Create account' }} />
      <Stack.Screen name="confirm" options={{ title: 'Verify email' }} />
      <Stack.Screen name="forgot-password" options={{ title: 'Reset password' }} />
    </Stack>
  );
}
