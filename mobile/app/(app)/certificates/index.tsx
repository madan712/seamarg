import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

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
import { EmptyState } from '@/components/EmptyState';
import { GradientSurface } from '@/components/GradientSurface';
import { ListRow } from '@/components/ListRow';
import { Pill } from '@/components/Pill';
import { Screen } from '@/components/Screen';
import { SectionHeader } from '@/components/SectionHeader';
import { Body, Eyebrow, ErrorText, Muted, Title } from '@/components/Typography';
import { normalizeError } from '@/lib/errors';
import { colors, fonts, gradients, radius, sizes, spacing, tracking, withAlpha } from '@/theme';

export default function CertificatesIndex() {
  const { session, signOut } = useAuth();
  const [mainDocs, setMainDocs] = useState<MainDocuments>({});
  const [entries, setEntries] = useState<CertificateEntries>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(
    (mode: 'initial' | 'refresh' = 'initial') => {
      if (!session) return;
      if (mode === 'refresh') setRefreshing(true);
      else setLoading(true);
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
        .finally(() => {
          setLoading(false);
          setRefreshing(false);
        });
    },
    [session, signOut],
  );

  useFocusEffect(useCallback(() => load('initial'), [load]));

  const heldKeys = Object.keys(mainDocs).filter((key) => mainDocs[key]);
  const categories = Object.entries(entries);
  const totalCerts = categories.reduce((sum, [, types]) => sum + Object.keys(types).length, 0);
  const filedCerts = categories.reduce(
    (sum, [, types]) => sum + Object.values(types).filter((f) => Boolean((f as Record<string, unknown>).file)).length,
    0,
  );

  return (
    <Screen gutter={false} footerSpace={sizes.tabContentBottom} refreshing={refreshing} onRefresh={() => load('refresh')}>
      {/* Wallet summary */}
      <GradientSurface colors={gradients.sea} style={styles.hero}>
        <Eyebrow dot style={styles.heroEyebrow}>
          Sea Wallet
        </Eyebrow>
        <Title>My documents</Title>
        <View style={styles.heroStats}>
          <HeroStat value={String(heldKeys.length)} label="Held" />
          <View style={styles.heroDivider} />
          <HeroStat value={String(totalCerts)} label="Certificates" />
          <View style={styles.heroDivider} />
          <HeroStat value={String(filedCerts)} label="Files" />
        </View>
      </GradientSurface>

      <View style={styles.body}>
        <View style={styles.actions}>
          <Button title="Scan certificate" icon="scan-outline" onPress={() => router.push('/certificates/scan')} />
          <Button
            title="Share documents"
            variant="secondary"
            icon="qr-code-outline"
            onPress={() => router.push('/certificates/share')}
          />
        </View>

        {error ? <ErrorText>{error}</ErrorText> : null}

        {/* Main documents */}
        <SectionHeader title="Main documents" />
        {heldKeys.length > 0 ? (
          <Card>
            <Muted>{heldKeys.length} document(s) marked as held.</Muted>
            <View style={styles.pillWrap}>
              {heldKeys.map((key) => (
                <Pill key={key} label={humanize(key)} tone="valid" dot />
              ))}
            </View>
          </Card>
        ) : (
          <Card>
            <Muted>No documents marked as held yet. Manage your held documents on the web portal.</Muted>
          </Card>
        )}

        {/* Detailed certificates */}
        <SectionHeader title="Detailed certificates" />
        {totalCerts === 0 && !loading ? (
          <EmptyState
            icon="ribbon-outline"
            title="No certificates yet"
            message="Scan your first certificate and we'll read the details for you automatically."
            actionLabel="Scan a certificate"
            onAction={() => router.push('/certificates/scan')}
          />
        ) : (
          categories.map(([category, types]) => (
            <View key={category} style={styles.category}>
              <Body style={styles.categoryLabel}>{humanize(category)}</Body>
              <View style={styles.list}>
                {Object.entries(types).map(([typeSlug, fields]) => {
                  const hasFile = Boolean((fields as Record<string, unknown>).file);
                  return (
                    <ListRow
                      key={`${category}:${typeSlug}`}
                      icon="ribbon-outline"
                      iconTone={hasFile ? 'brass' : 'mist'}
                      title={humanize(typeSlug)}
                      subtitle={hasFile ? 'File attached' : 'No file yet'}
                      trailing={hasFile ? <Pill label="File" tone="valid" /> : undefined}
                      onPress={() =>
                        router.push({
                          pathname: '/certificates/[category]/[type]',
                          params: { category, type: typeSlug },
                        })
                      }
                    />
                  );
                })}
              </View>
            </View>
          ))
        )}
      </View>
    </Screen>
  );
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.heroStat}>
      <Body style={styles.heroStatValue}>{value}</Body>
      <Muted style={styles.heroStatLabel}>{label}</Muted>
    </View>
  );
}

function humanize(slug: string): string {
  return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surfaceHigh,
    gap: spacing.xs,
  },
  heroEyebrow: { marginBottom: spacing.xs },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    backgroundColor: withAlpha(colors.background, 0.35),
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
  },
  heroStat: { flex: 1, alignItems: 'center', gap: 2 },
  heroStatValue: { fontFamily: fonts.headingBold, fontSize: 22, color: colors.text },
  heroStatLabel: {
    fontFamily: fonts.headingMedium,
    fontSize: 10,
    letterSpacing: tracking.label,
    textTransform: 'uppercase',
  },
  heroDivider: { width: 1, height: 28, backgroundColor: colors.border },
  body: { paddingHorizontal: spacing.md, gap: spacing.md, marginTop: spacing.md },
  actions: { gap: spacing.sm },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  category: { gap: spacing.sm },
  categoryLabel: {
    fontFamily: fonts.headingMedium,
    fontSize: 12,
    letterSpacing: tracking.label,
    textTransform: 'uppercase',
    color: colors.textFaint,
  },
  list: { gap: spacing.sm },
});
