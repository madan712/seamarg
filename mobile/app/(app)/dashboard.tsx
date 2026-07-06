import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { colors, radius, spacing, typography } from '@/theme';

export default function Dashboard() {
  const { session, signOut } = useAuth();
  const name =
    (typeof session?.claims.name === 'string' && session.claims.name) ||
    (typeof session?.claims.email === 'string' && session.claims.email) ||
    'Seafarer';

  return (
    <Screen>
      <Text style={styles.greeting}>Hello, {name}</Text>
      <Text style={styles.subtitle}>Keep your profile and certificates up to date.</Text>

      <View style={styles.cards}>
        <Card
          title="My profile"
          body="Personal details, passport, education, and contact info."
          onPress={() => router.push('/profile')}
        />
        <Card
          title="My certificates"
          body="Your held documents and detailed certificate records."
          onPress={() => router.push('/certificates')}
        />
        <Card
          title="Scan a certificate"
          body="Photograph a certificate and let AI pre-fill the details."
          onPress={() => router.push('/certificates/scan')}
        />
      </View>

      <Button title="Sign out" variant="secondary" onPress={signOut} />
    </Screen>
  );
}

function Card({ title, body, onPress }: { title: string; body: string; onPress: () => void }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardBody}>{body}</Text>
      <Button title="Open" onPress={onPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  greeting: { color: colors.text, fontSize: typography.title, fontWeight: '700' },
  subtitle: { color: colors.textMuted, fontSize: typography.body },
  cards: { gap: spacing.md, marginVertical: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTitle: { color: colors.text, fontSize: typography.heading, fontWeight: '600' },
  cardBody: { color: colors.textMuted, fontSize: typography.body },
});
