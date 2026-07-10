import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SessionExpiredError } from '@/api/client';
import { fetchProfile, type ProfileSections } from '@/api/profile';
import { useAuth } from '@/auth/AuthContext';
import { Card } from '@/components/Card';
import { ListRow } from '@/components/ListRow';
import { Pill } from '@/components/Pill';
import { ProgressRing } from '@/components/ProgressRing';
import { Screen } from '@/components/Screen';
import { Body, Eyebrow, ErrorText, Muted } from '@/components/Typography';
import { PROFILE_SECTIONS, type FieldType } from '@/features/profile/sections';
import { normalizeError } from '@/lib/errors';
import { colors, sizes, spacing } from '@/theme';

// Icon per profile section for quick visual scanning.
const SECTION_ICONS: Record<string, keyof typeof import('@expo/vector-icons').Ionicons.glyphMap> = {
  main: 'person-outline',
  contact: 'call-outline',
  passport: 'card-outline',
  address: 'home-outline',
  languages: 'language-outline',
  skills: 'construct-outline',
  visas: 'airplane-outline',
  relatives: 'people-outline',
  misc: 'ellipsis-horizontal-circle-outline',
};

export default function ProfileIndex() {
  const { session, signOut } = useAuth();
  const [sections, setSections] = useState<ProfileSections>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(
    (mode: 'initial' | 'refresh' = 'initial') => {
      if (!session) return;
      if (mode === 'refresh') setRefreshing(true);
      else setLoading(true);
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
        .finally(() => {
          setLoading(false);
          setRefreshing(false);
        });
    },
    [session, signOut],
  );

  useFocusEffect(useCallback(() => load('initial'), [load]));

  const overall = overallPercent(sections);

  return (
    <Screen footerSpace={sizes.tabContentBottom} refreshing={refreshing} onRefresh={() => load('refresh')}>
      <Card variant="elevated" style={styles.summary}>
        <ProgressRing progress={overall / 100} caption="Complete" size={96} />
        <View style={styles.summaryText}>
          <Eyebrow>Your profile</Eyebrow>
          <Body style={styles.summaryBody}>
            A complete profile helps employers and Seamarg match you faster. Tap a section to edit.
          </Body>
        </View>
      </Card>

      {error ? <ErrorText>{error}</ErrorText> : null}

      <View style={styles.list}>
        {PROFILE_SECTIONS.map((section) => {
          const stored = sections[section.slug] ?? {};
          const started = Object.keys(stored).length > 0;
          const pct = sectionPercent(section.fields, stored);
          return (
            <ListRow
              key={section.slug}
              icon={SECTION_ICONS[section.slug] ?? 'document-outline'}
              iconTone={started ? 'brass' : 'mist'}
              title={section.title}
              subtitle={started ? `${pct}% complete` : 'Not started'}
              onPress={() => router.push(`/profile/${section.slug}`)}
              trailing={
                <Pill
                  label={started ? (pct === 100 ? 'Done' : 'Partial') : 'To do'}
                  tone={started ? (pct === 100 ? 'valid' : 'expiring') : 'missing'}
                />
              }
            />
          );
        })}
      </View>

      {loading && !refreshing ? <Muted style={styles.loading}>Loading your profile…</Muted> : null}
    </Screen>
  );
}

function sectionPercent(
  fields: { name: string; type?: FieldType }[],
  stored: Record<string, unknown>,
): number {
  if (fields.length === 0) return 0;
  const filled = fields.filter((f) => {
    const value = stored[f.name];
    if (value == null) return false;
    if (f.type === 'boolean') return value === true || value === 'true';
    return String(value).trim().length > 0;
  }).length;
  return Math.round((filled / fields.length) * 100);
}

function overallPercent(sections: ProfileSections): number {
  let total = 0;
  let filled = 0;
  for (const section of PROFILE_SECTIONS) {
    const stored = sections[section.slug] ?? {};
    for (const field of section.fields) {
      total += 1;
      const value = (stored as Record<string, unknown>)[field.name];
      if (value != null && (field.type === 'boolean' ? value === true || value === 'true' : String(value).trim().length > 0)) {
        filled += 1;
      }
    }
  }
  return total === 0 ? 0 : Math.round((filled / total) * 100);
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  summaryText: { flex: 1, gap: spacing.xs },
  summaryBody: { color: colors.textMuted, fontSize: 13 },
  list: { gap: spacing.sm },
  loading: { textAlign: 'center' },
});
