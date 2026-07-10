// Authenticated area. Guards on the session (redirect to sign-in when absent)
// and presents the bottom navigation via a custom TabBar (four destinations
// plus a raised centre Scan action). Each tab that needs drill-down (profile,
// certificates) is a folder with its own Stack layout; those hide the tab
// header and render their own. Screen order here defines left→right tab order.
import { Redirect, Tabs } from 'expo-router';

import { useAuth } from '@/auth/AuthContext';
import { TabBar } from '@/components/TabBar';

export default function AppLayout() {
  const { session, initializing } = useAuth();

  if (!initializing && !session) {
    return <Redirect href="/sign-in" />;
  }

  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="dashboard" options={{ title: 'Home' }} />
      <Tabs.Screen name="certificates" options={{ title: 'Wallet' }} />
      <Tabs.Screen name="courses" options={{ title: 'Courses' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
