// Read-only detail view for one certificate entry (CERT#<CATEGORY>#<TYPE>).
// Editing/creating entries and file upload live in the scan flow; this screen
// shows the stored field values so the structure maps clearly to the backend.
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { SessionExpiredError } from '@/api/client';
import { fetchCertificateEntries } from '@/api/certificates';
import { useAuth } from '@/auth/AuthContext';
import { Screen } from '@/components/Screen';
import { normalizeError } from '@/lib/errors';
import { colors, radius, spacing, typography } from '@/theme';

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
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!loading && !fields ? <Text style={styles.meta}>This certificate entry was not found.</Text> : null}

      {fields
        ? Object.entries(fields)
            .filter(([key]) => key !== 'file')
            .map(([key, value]) => (
              <View key={key} style={styles.row}>
                <Text style={styles.key}>{key}</Text>
                <Text style={styles.value}>{formatValue(value)}</Text>
              </View>
            ))
        : null}

      {fields?.file ? (
        <View style={styles.fileBox}>
          <Text style={styles.value}>📎 A file is attached to this certificate.</Text>
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
  error: { color: colors.danger, fontSize: typography.body },
  meta: { color: colors.textMuted, fontSize: typography.body },
  row: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    gap: 2,
  },
  key: { color: colors.textMuted, fontSize: typography.caption, fontWeight: '600' },
  value: { color: colors.text, fontSize: typography.body },
  fileBox: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
});
