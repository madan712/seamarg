import { Stack } from 'expo-router';

import { colors } from '@/theme';

export default function CertificatesStack() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'My certificates' }} />
      <Stack.Screen name="[category]/[type]" options={{ title: 'Certificate' }} />
      <Stack.Screen name="scan" options={{ title: 'Scan certificate', presentation: 'modal' }} />
    </Stack>
  );
}
