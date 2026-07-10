// Read-only detail view for one certificate entry (CERT#<CATEGORY>#<TYPE>).
// Editing/creating entries and file upload live in the scan flow; this screen
// shows the stored field values so the structure maps clearly to the backend.
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { SessionExpiredError } from '@/api/client';
import { fetchCertificateEntries } from '@/api/certificates';
import { useAuth } from '@/auth/AuthContext';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { IconBadge } from '@/components/IconBadge';
import { Body, Eyebrow, ErrorText, Muted } from '@/components/Typography';
import { Screen } from '@/components/Screen';
import { normalizeError } from '@/lib/errors';
import { colors, fonts, spacing, tracking, typography } from '@/theme';

export default function CertificateDetail() {
  const { category, type } = useLocalSearchParams<{ category: string; type: string }>();
  const { session, signOut } = useAuth();
  const [fields, setFields] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!session) return;
    let active = true;
    fetchCertificateEntries(session)
      .then((entries) => {
        if (!active) return;
        setFields(entries?.[category ?? '']?.[type ?? ''] ?? null);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof SessionExpiredError) {
          signOut();
          return;
        }
        setError(normalizeError(err).message);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [session, category, type, signOut]);

  const dataRows = fields ? Object.entries(fields).filter(([key]) => key !== 'file') : [];

  return (
    <Screen>
      <Stack.Screen options={{ title: humanize(type ?? 'Certificate') }} />

      <View style={styles.header}>
        <IconBadge icon="ribbon-outline" />
        <View style={styles.headerText}>
          <Eyebrow>{humanize(category ?? '')}</Eyebrow>
          <Body style={styles.title}>{humanize(type ?? '')}</Body>
        </View>
      </View>

      {loading ? <ActivityIndicator color={colors.primary} /> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}

      {!loading && !fields ? (
        <EmptyState icon="alert-circle-outline" title="Not found" message="This certificate entry could not be loaded." />
      ) : null}

      {dataRows.length > 0 ? (
        <Card style={styles.detailCard}>
          {dataRows.map(([key, value], index) => (
            <View key={key} style={[styles.row, index > 0 && styles.rowDivider]}>
              <Muted style={styles.key}>{humanize(key)}</Muted>
              <Body style={styles.value}>{formatValue(value)}</Body>
            </View>
          ))}
        </Card>
      ) : null}

      {fields?.file ? (
        <Card variant="rail">
          <View style={styles.fileRow}>
            <Ionicons name="document-attach-outline" size={20} color={colors.primaryLight} />
            <View style={styles.fileText}>
              <Body style={styles.fileTitle}>File attached</Body>
              <Muted>Manage or download this file from the web portal.</Muted>
            </View>
          </View>
        </Card>
      ) : null}
    </Screen>
  );
}

function formatValue(value: unknown): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function humanize(slug: string): string {
  return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerText: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.headingBold, fontSize: typography.heading, color: colors.text },
  detailCard: { gap: 0, paddingVertical: spacing.xs },
  row: { paddingVertical: spacing.sm, gap: 2 },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  key: {
    fontFamily: fonts.headingMedium,
    fontSize: typography.label,
    letterSpacing: tracking.label,
    textTransform: 'uppercase',
  },
  value: { fontSize: typography.body },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  fileText: { flex: 1, gap: 2 },
  fileTitle: { fontFamily: fonts.bodySemiBold },
});
