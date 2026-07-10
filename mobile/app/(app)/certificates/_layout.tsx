import { Stack } from 'expo-router';

import { colors, fonts } from '@/theme';

export default function CertificatesStack() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surfaceRaised },
        headerTintColor: colors.primaryLight,
        headerShadowVisible: false,
        headerTitleStyle: { fontFamily: fonts.heading, color: colors.text },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'My certificates' }} />
      <Stack.Screen name="[category]/[type]" options={{ title: 'Certificate' }} />
      <Stack.Screen name="scan" options={{ title: 'Scan certificate', presentation: 'modal' }} />
      <Stack.Screen name="share" options={{ title: 'Share documents' }} />
    </Stack>
  );
}
