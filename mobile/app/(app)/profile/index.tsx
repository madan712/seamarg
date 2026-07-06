import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { fetchProfile, type ProfileSections } from '@/api/profile';
import { SessionExpiredError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { Screen } from '@/components/Screen';
import { PROFILE_SECTIONS } from '@/features/profile/sections';
import { normalizeError } from '@/lib/errors';
import { colors, radius, spacing, typography } from '@/theme';

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
      <Text style={styles.subtitle}>Tap a section to view and edit it.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? <ActivityIndicator color={colors.primary} /> : null}

      <View style={styles.list}>
        {PROFILE_SECTIONS.map((section) => {
          const filled = Object.keys(sections[section.slug] ?? {}).length;
          return (
            <Pressable
              key={section.slug}
              style={styles.row}
              onPress={() => router.push(`/profile/${section.slug}`)}
            >
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{section.title}</Text>
                <Text style={styles.rowMeta}>{filled > 0 ? `${filled} field(s) saved` : 'Not started'}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  subtitle: { color: colors.textMuted, fontSize: typography.body },
  error: { color: colors.danger, fontSize: typography.body },
  list: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  rowText: { gap: 2 },
  rowTitle: { color: colors.text, fontSize: typography.body, fontWeight: '600' },
  rowMeta: { color: colors.textMuted, fontSize: typography.caption },
  chevron: { color: colors.textMuted, fontSize: 28, lineHeight: 28 },
});
