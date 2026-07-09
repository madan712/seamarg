import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { SessionExpiredError } from '@/api/client';
import {
  fetchCertificateEntries,
  fetchMainDocuments,
  type CertificateEntries,
  type MainDocuments,
} from '@/api/certificates';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Pill } from '@/components/Pill';
import { Screen } from '@/components/Screen';
import { Body, ErrorText, Heading, Muted } from '@/components/Typography';
import { normalizeError } from '@/lib/errors';
import { colors, spacing } from '@/theme';

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
      <Button
        title="Share documents"
        variant="secondary"
        onPress={() => router.push('/certificates/share')}
      />

      {error ? <ErrorText>{error}</ErrorText> : null}
      {loading ? <ActivityIndicator color={colors.primary} /> : null}

      <View style={styles.sectionHead}>
        <Heading>Main documents</Heading>
        <Muted>{heldCount} marked as held.</Muted>
      </View>

      <Heading>Detailed certificates</Heading>
      {Object.keys(entries).length === 0 && !loading ? (
        <Muted>No certificate entries yet.</Muted>
      ) : (
        <View style={styles.list}>
          {Object.entries(entries).flatMap(([category, types]) =>
            Object.entries(types).map(([typeSlug, fields]) => {
              const hasFile = Boolean((fields as Record<string, unknown>).file);
              return (
                <Card
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
                    <Body>{humanize(typeSlug)}</Body>
                    <Muted>{humanize(category)}</Muted>
                  </View>
                  <View style={styles.rowRight}>
                    {hasFile ? <Pill label="File" tone="ok" /> : null}
                    <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
                  </View>
                </Card>
              );
            }),
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
  sectionHead: { gap: spacing.xs, marginTop: spacing.sm },
  list: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowText: { gap: 2, flexShrink: 1 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
