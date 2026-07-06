// Unauthenticated stack. If a session already exists, bounce to the app.
import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/auth/AuthContext';
import { colors } from '@/theme';

export default function AuthLayout() {
  const { session, initializing } = useAuth();

  if (!initializing && session) {
    return <Redirect href="/dashboard" />;
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="sign-in" options={{ title: 'Sign in' }} />
      <Stack.Screen name="sign-up" options={{ title: 'Create account' }} />
      <Stack.Screen name="confirm" options={{ title: 'Verify email' }} />
      <Stack.Screen name="forgot-password" options={{ title: 'Reset password' }} />
    </Stack>
  );
}
