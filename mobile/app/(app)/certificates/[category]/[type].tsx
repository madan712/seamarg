// Read-only detail view for one certificate entry (CERT#<CATEGORY>#<TYPE>).
// Editing/creating entries and file upload live in the scan flow; this screen
// shows the stored field values so the structure maps clearly to the backend.
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { SessionExpiredError } from '@/api/client';
import { fetchCertificateEntries } from '@/api/certificates';
import { useAuth } from '@/auth/AuthContext';
import { Screen } from '@/components/Screen';
import { Body, ErrorText, Muted } from '@/components/Typography';
import { normalizeError } from '@/lib/errors';
import { colors, fonts, radius, spacing, tracking, typography } from '@/theme';

export default function CertificateDetail() {
  const { category, type } = useLocalSearchParams<{ category: string; type: string }>();
  const { session, signOut } = useAuth();
  const [fields, setFields] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!session) {
      return;
    }
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

  return (
    <Screen>
      {loading ? <ActivityIndicator color={colors.primary} /> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}

      {!loading && !fields ? <Muted>This certificate entry was not found.</Muted> : null}

      {fields
        ? Object.entries(fields)
            .filter(([key]) => key !== 'file')
            .map(([key, value]) => (
              <View key={key} style={styles.row}>
                <Muted style={styles.key}>{key}</Muted>
                <Body>{formatValue(value)}</Body>
              </View>
            ))
        : null}

      {fields?.file ? (
        <View style={styles.fileBox}>
          <Body>📎 A file is attached to this certificate.</Body>
        </View>
      ) : null}
    </Screen>
  );
}

function formatValue(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    gap: 2,
  },
  key: {
    fontFamily: fonts.headingMedium,
    fontSize: typography.label,
    letterSpacing: tracking.label,
    textTransform: 'uppercase',
  },
  fileBox: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
});
