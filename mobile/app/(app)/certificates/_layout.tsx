import { Stack } from 'expo-router';

import { colors, fonts } from '@/theme';

export default function CertificatesStack() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surfaceRaised },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: fonts.heading },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'My certificates' }} />
      <Stack.Screen name="[category]/[type]" options={{ title: 'Certificate' }} />
      <Stack.Screen name="scan" options={{ title: 'Scan certificate', presentation: 'modal' }} />
    </Stack>
  );
}
