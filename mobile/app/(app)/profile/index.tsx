import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { fetchProfile, type ProfileSections } from '@/api/profile';
import { SessionExpiredError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { Card } from '@/components/Card';
import { Pill } from '@/components/Pill';
import { Screen } from '@/components/Screen';
import { Body, Eyebrow, ErrorText, Muted, Serif } from '@/components/Typography';
import { PROFILE_SECTIONS } from '@/features/profile/sections';
import { normalizeError } from '@/lib/errors';
import { colors, spacing } from '@/theme';

export default function ProfileIndex() {
  const { session, signOut } = useAuth();
  const [sections, setSections] = useState<ProfileSections>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (!session) {
      return;
    }
    setLoading(true);
    setError('');
    fetchProfile(session)
      .then((data) => setSections(data ?? {}))
      .catch((err) => {
        if (err instanceof SessionExpiredError) {
          signOut();
          return;
        }
        setError(normalizeError(err).message);
      })
      .finally(() => setLoading(false));
  }, [session, signOut]);

  // Reload whenever the screen regains focus (e.g. after saving a section).
  useFocusEffect(load);

  return (
    <Screen>
      <View style={styles.header}>
        <Eyebrow dot>Your profile</Eyebrow>
        <Serif>Tap a section to view and edit it.</Serif>
      </View>

      {error ? <ErrorText>{error}</ErrorText> : null}
      {loading ? <ActivityIndicator color={colors.primary} /> : null}

      <View style={styles.list}>
        {PROFILE_SECTIONS.map((section) => {
          const filled = Object.keys(sections[section.slug] ?? {}).length;
          return (
            <Card key={section.slug} onPress={() => router.push(`/profile/${section.slug}`)} style={styles.row}>
              <View style={styles.rowText}>
                <Body>{section.title}</Body>
                <Muted>{filled > 0 ? `${filled} field(s) saved` : 'Not started'}</Muted>
              </View>
              <View style={styles.rowRight}>
                <Pill label={filled > 0 ? 'Saved' : 'To do'} tone={filled > 0 ? 'ok' : 'warn'} />
                <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
              </View>
            </Card>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, marginBottom: spacing.xs },
  list: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowText: { gap: 2, flexShrink: 1 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
