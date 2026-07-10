// Home — the seafarer's "bridge". A read-only readiness overview assembled from
// the profile, documents, certificates and enrollments the user already has
// (no new backend). Gradient hero + completeness compass + telemetry stats +
// contextual nudges + quick actions. Pull-to-refresh reloads everything.
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SessionExpiredError } from '@/api/client';
import { fetchCertificateEntries, fetchMainDocuments } from '@/api/certificates';
import { fetchEnrollments } from '@/api/courses';
import { fetchProfile, type ProfileSections } from '@/api/profile';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { GradientSurface } from '@/components/GradientSurface';
import { ListRow } from '@/components/ListRow';
import { ProgressRing } from '@/components/ProgressRing';
import { Screen } from '@/components/Screen';
import { SectionHeader } from '@/components/SectionHeader';
import { StatTile } from '@/components/StatTile';
import { Body, Eyebrow, Muted, Serif, Title } from '@/components/Typography';
import { PROFILE_SECTIONS } from '@/features/profile/sections';
import { normalizeError } from '@/lib/errors';
import { colors, fonts, gradients, radius, sizes, spacing, tracking, withAlpha } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

type Snapshot = {
  profile: ProfileSections;
  heldCount: number;
  certCount: number;
  filedCount: number;
  activeCourses: number;
};

export default function Dashboard() {
  const { session, signOut } = useAuth();
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const rawName =
    (typeof session?.claims.name === 'string' && session.claims.name) ||
    (typeof session?.claims.email === 'string' && session.claims.email) ||
    'Seafarer';
  const firstName = rawName.split(/[\s@]/)[0] || 'Seafarer';
  const initial = firstName.charAt(0).toUpperCase();

  const load = useCallback(
    (mode: 'initial' | 'refresh' = 'initial') => {
      if (!session) return;
      if (mode === 'refresh') setRefreshing(true);
      else setLoading(true);
      Promise.all([
        fetchProfile(session).catch(() => ({}) as ProfileSections),
        fetchMainDocuments(session).catch(() => ({})),
        fetchCertificateEntries(session).catch(() => ({})),
        fetchEnrollments(session).catch(() => []),
      ])
        .then(([profile, docs, entries, enrollments]) => {
          const held = Object.values(docs).filter(Boolean).length;
          const allEntries = Object.values(entries ?? {}).flatMap((types) => Object.values(types));
          const filed = allEntries.filter((fields) => Boolean((fields as Record<string, unknown>).file)).length;
          const active = (enrollments ?? []).filter((e) => {
            const s = (e.status ?? '').toUpperCase();
            return s === 'PENDING' || s === 'CONFIRMED';
          }).length;
          setData({
            profile: profile ?? {},
            heldCount: held,
            certCount: allEntries.length,
            filedCount: filed,
            activeCourses: active,
          });
        })
        .catch((err) => {
          if (err instanceof SessionExpiredError) signOut();
          else normalizeError(err);
        })
        .finally(() => {
          setLoading(false);
          setRefreshing(false);
        });
    },
    [session, signOut],
  );

  useFocusEffect(useCallback(() => load('initial'), [load]));

  const completeness = computeCompleteness(data?.profile ?? {});
  const nextSection = findNextSection(data?.profile ?? {});

  return (
    <Screen
      gutter={false}
      footerSpace={sizes.tabContentBottom}
      refreshing={refreshing}
      onRefresh={() => load('refresh')}
    >
      {/* Hero */}
      <GradientSurface colors={gradients.hero} style={styles.hero}>
        <View style={styles.ring} />
        <View style={styles.ringInner} />
        <View style={styles.brandRow}>
          <View style={styles.brandLeft}>
            <View style={styles.dot} />
            <Body style={styles.brand}>SEAMARG</Body>
          </View>
          <View style={styles.avatar}>
            <Body style={styles.avatarText}>{initial}</Body>
          </View>
        </View>

        <Eyebrow style={styles.heroEyebrow}>Welcome back</Eyebrow>
        <Title numberOfLines={2}>{firstName}</Title>
        <Serif style={styles.heroLede}>{readinessLine(completeness.percent)}</Serif>
      </GradientSurface>

      <View style={styles.body}>
        {/* Readiness compass */}
        <Card variant="elevated" style={styles.readiness}>
          <ProgressRing progress={completeness.percent / 100} caption="Ready" />
          <View style={styles.readinessText}>
            <Eyebrow>Voyage readiness</Eyebrow>
            <Body style={styles.readinessBody}>
              {completeness.startedSections} of {completeness.totalSections} profile sections started.
            </Body>
            {nextSection ? (
              <Button
                title={`Continue: ${nextSection.title}`}
                size="sm"
                icon="arrow-forward"
                fullWidth={false}
                onPress={() => router.push(`/profile/${nextSection.slug}`)}
              />
            ) : (
              <View style={styles.doneRow}>
                <Ionicons name="checkmark-circle" size={16} color={colors.successLight} />
                <Muted style={{ color: colors.successLight }}>Profile complete</Muted>
              </View>
            )}
          </View>
        </Card>

        {/* Telemetry */}
        <View style={styles.stats}>
          <StatTile icon="shield-checkmark-outline" value={String(data?.heldCount ?? 0)} label="Docs held" />
          <StatTile icon="ribbon-outline" value={String(data?.certCount ?? 0)} label="Certificates" tone="paper" />
          <StatTile icon="cloud-upload-outline" value={String(data?.filedCount ?? 0)} label="Files stored" tone="sea" />
          <StatTile icon="school-outline" value={String(data?.activeCourses ?? 0)} label="Active courses" />
        </View>

        {/* Contextual nudge */}
        {!loading ? <AttentionCard completeness={completeness} heldCount={data?.heldCount ?? 0} /> : null}

        {/* Quick actions */}
        <SectionHeader title="Quick actions" />
        <View style={styles.actionList}>
          <ListRow
            icon="wallet-outline"
            title="Sea Wallet"
            subtitle="Documents & certificates"
            onPress={() => router.push('/certificates')}
          />
          <ListRow
            icon="person-circle-outline"
            title="My Profile"
            subtitle="Identity & career details"
            onPress={() => router.push('/profile')}
          />
          <ListRow
            icon="school-outline"
            title="Courses"
            subtitle="Find & book training"
            onPress={() => router.push('/courses')}
          />
          <ListRow
            icon="qr-code-outline"
            title="Secure sharing"
            subtitle="Create secure document links"
            onPress={() => router.push('/certificates/share')}
          />
        </View>

        <Button title="Sign out" variant="ghost" icon="log-out-outline" onPress={signOut} />
      </View>
    </Screen>
  );
}

function AttentionCard({
  completeness,
  heldCount,
}: {
  completeness: ReturnType<typeof computeCompleteness>;
  heldCount: number;
}) {
  const items: { icon: IconName; text: string }[] = [];
  if (completeness.percent < 100) {
    items.push({ icon: 'create-outline', text: `Finish your profile — ${completeness.percent}% complete.` });
  }
  if (heldCount === 0) {
    items.push({ icon: 'documents-outline', text: 'Mark the documents you hold in your Sea Wallet.' });
  }
  if (items.length === 0) {
    return (
      <Card variant="rail">
        <View style={styles.nudgeHead}>
          <Ionicons name="sparkles-outline" size={18} color={colors.primaryLight} />
          <Body style={styles.nudgeTitle}>You're all set</Body>
        </View>
        <Muted>Everything's up to date. We'll alert you before anything expires.</Muted>
      </Card>
    );
  }
  return (
    <Card variant="rail">
      <View style={styles.nudgeHead}>
        <Ionicons name="alert-circle-outline" size={18} color={colors.primaryLight} />
        <Body style={styles.nudgeTitle}>Needs attention</Body>
      </View>
      {items.map((item) => (
        <View key={item.text} style={styles.nudgeRow}>
          <Ionicons name={item.icon} size={15} color={colors.textFaint} />
          <Muted style={styles.nudgeText}>{item.text}</Muted>
        </View>
      ))}
    </Card>
  );
}

// Fraction of profile fields with a meaningful value, plus section progress.
function computeCompleteness(profile: ProfileSections) {
  let totalFields = 0;
  let filledFields = 0;
  let startedSections = 0;
  for (const section of PROFILE_SECTIONS) {
    const stored = profile[section.slug] ?? {};
    if (Object.keys(stored).length > 0) startedSections += 1;
    for (const field of section.fields) {
      totalFields += 1;
      const value = (stored as Record<string, unknown>)[field.name];
      if (isFilled(field.type, value)) filledFields += 1;
    }
  }
  const percent = totalFields === 0 ? 0 : Math.round((filledFields / totalFields) * 100);
  return { percent, startedSections, totalSections: PROFILE_SECTIONS.length };
}

function isFilled(type: string | undefined, value: unknown): boolean {
  if (value == null) return false;
  if (type === 'boolean') return value === true || value === 'true';
  return String(value).trim().length > 0;
}

function findNextSection(profile: ProfileSections) {
  return PROFILE_SECTIONS.find((section) => Object.keys(profile[section.slug] ?? {}).length === 0);
}

function readinessLine(percent: number): string {
  if (percent >= 100) return 'All ship-shape. Your Sea Wallet is fully manned and on watch.';
  if (percent >= 60) return `You're ${percent}% voyage-ready. A few details left to square away.`;
  return 'Let’s get your Sea Wallet ready — start with your profile below.';
}

const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
  },
  ring: {
    position: 'absolute',
    top: -70,
    right: -80,
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 1,
    borderColor: withAlpha(colors.primary, 0.22),
  },
  ringInner: {
    position: 'absolute',
    top: -30,
    right: -40,
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 1,
    borderColor: withAlpha(colors.textFaint, 0.2),
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  brandLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary },
  brand: {
    fontFamily: fonts.heading,
    fontSize: 15,
    letterSpacing: tracking.label,
    color: colors.text,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: withAlpha(colors.primary, 0.18),
    borderWidth: 1,
    borderColor: withAlpha(colors.primary, 0.4),
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: fonts.headingBold, fontSize: 18, color: colors.primaryLight },
  heroEyebrow: { marginBottom: spacing.xs },
  heroLede: { marginTop: spacing.sm, color: colors.textDim },
  body: { paddingHorizontal: spacing.md, gap: spacing.md, marginTop: spacing.md },
  readiness: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  readinessText: { flex: 1, gap: spacing.xs },
  readinessBody: { color: colors.textMuted },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  nudgeHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nudgeTitle: { fontFamily: fonts.bodySemiBold },
  nudgeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  nudgeText: { flex: 1 },
  actionList: { gap: spacing.sm },
});
