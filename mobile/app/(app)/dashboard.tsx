import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { Body, Eyebrow, Heading, Serif, Title } from '@/components/Typography';
import { colors, radius, spacing } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

export default function Dashboard() {
  const { session, signOut } = useAuth();
  const name =
    (typeof session?.claims.name === 'string' && session.claims.name) ||
    (typeof session?.claims.email === 'string' && session.claims.email) ||
    'Seafarer';

  return (
    <Screen>
      <View style={styles.header}>
        <Eyebrow dot>Welcome back</Eyebrow>
        <Title numberOfLines={2}>{name}</Title>
        <Serif>Keep your profile and certificates current — all under one watch.</Serif>
      </View>

      <View style={styles.cards}>
        <NavCard
          icon="person-circle-outline"
          title="My profile"
          body="Personal details, passport, education, and contact info."
          onPress={() => router.push('/profile')}
        />
        <NavCard
          icon="ribbon-outline"
          title="My certificates"
          body="Your held documents and detailed certificate records."
          onPress={() => router.push('/certificates')}
        />
        <NavCard
          icon="scan-outline"
          title="Scan a certificate"
          body="Photograph a certificate and let AI pre-fill the details."
          onPress={() => router.push('/certificates/scan')}
        />
      </View>

      <Button title="Sign out" variant="secondary" onPress={signOut} />
    </Screen>
  );
}

function NavCard({
  icon,
  title,
  body,
  onPress,
}: {
  icon: IconName;
  title: string;
  body: string;
  onPress: () => void;
}) {
  return (
    <Card onPress={onPress}>
      <View style={styles.cardTop}>
        <View style={styles.iconCircle}>
          <Ionicons name={icon} size={20} color={colors.primaryLight} />
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
      </View>
      <Heading>{title}</Heading>
      <Body style={styles.cardBody}>{body}</Body>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, marginBottom: spacing.xs },
  cards: { gap: spacing.md, marginVertical: spacing.sm },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(200, 149, 46, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { color: colors.textMuted },
});
