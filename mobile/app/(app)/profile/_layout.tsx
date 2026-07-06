import { Stack } from 'expo-router';

import { colors } from '@/theme';

export default function ProfileStack() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'My profile' }} />
      <Stack.Screen name="[section]" options={{ title: 'Edit section' }} />
    </Stack>
  );
}
