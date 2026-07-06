import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { SessionExpiredError } from '@/api/client';
import {
  fetchCertificateEntries,
  fetchMainDocuments,
  type CertificateEntries,
  type MainDocuments,
} from '@/api/certificates';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { normalizeError } from '@/lib/errors';
import { colors, radius, spacing, typography } from '@/theme';

export default function CertificatesIndex() {
  const { session, signOut } = useAuth();
  const [mainDocs, setMainDocs] = useState<MainDocuments>({});
  const [entries, setEntries] = useState<CertificateEntries>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (!session) {
      return;
    }
    setLoading(true);
    setError('');
    Promise.all([fetchMainDocuments(session), fetchCertificateEntries(session)])
      .then(([docs, entryData]) => {
        setMainDocs(docs);
        setEntries(entryData ?? {});
      })
      .catch((err) => {
        if (err instanceof SessionExpiredError) {
          signOut();
          return;
        }
        setError(normalizeError(err).message);
      })
      .finally(() => setLoading(false));
  }, [session, signOut]);

  useFocusEffect(load);

  const heldCount = Object.values(mainDocs).filter(Boolean).length;

  return (
    <Screen>
      <Button title="Scan a new certificate" onPress={() => router.push('/certificates/scan')} />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? <ActivityIndicator color={colors.primary} /> : null}

      <Text style={styles.section}>Main documents</Text>
      <Text style={styles.meta}>{heldCount} marked as held.</Text>

      <Text style={styles.section}>Detailed certificates</Text>
      {Object.keys(entries).length === 0 && !loading ? (
        <Text style={styles.meta}>No certificate entries yet.</Text>
      ) : (
        <View style={styles.list}>
          {Object.entries(entries).flatMap(([category, types]) =>
            Object.entries(types).map(([typeSlug, fields]) => (
              <Pressable
                key={`${category}:${typeSlug}`}
                style={styles.row}
                onPress={() =>
                  router.push({
                    pathname: '/certificates/[category]/[type]',
                    params: { category, type: typeSlug },
                  })
                }
              >
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{humanize(typeSlug)}</Text>
                  <Text style={styles.rowMeta}>
                    {humanize(category)}
                    {(fields as Record<string, unknown>).file ? ' • file attached' : ''}
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            )),
          )}
        </View>
      )}
    </Screen>
  );
}

function humanize(slug: string): string {
  return slug
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

const styles = StyleSheet.create({
  error: { color: colors.danger, fontSize: typography.body },
  section: { color: colors.text, fontSize: typography.heading, fontWeight: '600', marginTop: spacing.sm },
  meta: { color: colors.textMuted, fontSize: typography.body },
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
  rowText: { gap: 2, flexShrink: 1 },
  rowTitle: { color: colors.text, fontSize: typography.body, fontWeight: '600' },
  rowMeta: { color: colors.textMuted, fontSize: typography.caption },
  chevron: { color: colors.textMuted, fontSize: 28, lineHeight: 28 },
});
