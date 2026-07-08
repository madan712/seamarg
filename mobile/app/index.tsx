// Entry route. While the persisted session loads, show a spinner. Signed-in
// users go straight to the app; everyone else lands on the public marketing
// page (the native counterpart of the web frontend's landing page), which routes
// into sign-up / sign-in.
import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/AuthContext';
import { Landing } from '@/features/marketing/Landing';
import { colors } from '@/theme';

export default function Index() {
  const { session, initializing } = useAuth();

  if (initializing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (session) {
    return <Redirect href="/dashboard" />;
  }

  return <Landing />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
