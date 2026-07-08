import { Stack } from 'expo-router';

import { colors, fonts } from '@/theme';

export default function ProfileStack() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surfaceRaised },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: fonts.heading },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'My profile' }} />
      <Stack.Screen name="[section]" options={{ title: 'Edit section' }} />
    </Stack>
  );
}
