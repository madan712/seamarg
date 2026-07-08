// Public landing / marketing screen — the native counterpart of the web
// frontend's renderLanding() single-scroll page. Explains what Seamarg is
// (Sea Wallet, Course Booking, Crew ID, Renewals, DG Shipping alerts) and routes
// visitors into sign-up / sign-in. Kept deliberately parallel to the web copy.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Body, Eyebrow, Heading, Muted, Serif, Title } from '@/components/Typography';
import { colors, fonts, radius, spacing, tracking, typography } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

const HERO_STATS = [
  { value: '30·60·90', label: 'Day renewal alerts' },
  { value: 'WhatsApp', label: 'Direct to your phone' },
  { value: '1 Scan', label: 'Full document access' },
  { value: 'DG Shipping', label: 'Compliance, tracked' },
];

const FEATURES: {
  tag: string;
  icon: IconName;
  title: string;
  body: string;
  chips: string[];
}[] = [
  {
    tag: 'Feature 01 — The Sea Wallet',
    icon: 'wallet-outline',
    title: 'Every document. One folder. Zero surprises.',
    body: 'A digital wallet holds every certificate, endorsement and license you carry. Seamarg watches expiry dates around the clock and alerts you on WhatsApp at 90, 60 and 30 days out — no certificate ever sneaks up on you.',
    chips: ['STCW', "Seaman's Book", 'Medical', 'CDC'],
  },
  {
    tag: 'Feature 02 — Course Booking',
    icon: 'boat-outline',
    title: 'Find your course. Or let us book it for you.',
    body: "Tell us the certificate you need. We'll surface the nearest approved institute, show live batch availability, and — if you'd rather not deal with the paperwork — book your seat for you.",
    chips: ['Fire Fighting', 'STCW Refresher', 'GMDSS', 'PSCRB'],
  },
  {
    tag: 'Feature 03 — Crew ID',
    icon: 'qr-code-outline',
    title: 'One scan. Every document, instantly.',
    body: 'Your Seamarg profile carries a unique barcode. Walk into any institute or shipping company and one scan gives them secure, verified access to exactly the documents they asked for — no folders, no photocopies.',
    chips: ['Instant verification', 'No paper copies', 'You control access'],
  },
  {
    tag: 'Feature 04 — Document Renewals',
    icon: 'refresh-outline',
    title: 'We renew it. You stay at sea.',
    body: 'Beyond your passport, Seamarg handles renewal of every DG Shipping document on your record — applications, follow-ups, collection. You get a WhatsApp message when it is done, not a stack of forms to chase.',
    chips: ['COC / COE', "Seaman's Book", 'Medical Certificate', 'CDC'],
  },
  {
    tag: 'Feature 05 — DG Shipping Updates',
    icon: 'megaphone-outline',
    title: "New rules don't catch you off guard.",
    body: 'Circulars, compliance changes, certification updates — the moment DG Shipping issues something new it lands in plain language in your wallet and on WhatsApp, so you always sail compliant.',
    chips: [],
  },
];

const CREW_STATS = [
  { value: '30/60/90', label: 'Day alert rotation' },
  { value: '24/7', label: 'Wallet access' },
  { value: 'Door to Port', label: 'Nearest institute matching' },
  { value: 'Live', label: 'DG Shipping compliance feed' },
];

export function Landing() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero */}
      <View style={[styles.hero, { paddingTop: insets.top + spacing.lg }]}>
        <View style={styles.ringOuter} />
        <View style={styles.ringInner} />

        <View style={styles.brandRow}>
          <View style={styles.brandLeft}>
            <View style={styles.dot} />
            <Text style={styles.brand}>SEAMARG</Text>
          </View>
        </View>

        <Eyebrow style={styles.heroEyebrow}>A community built by seafarers, for seafarers</Eyebrow>
        <Title numberOfLines={2} style={styles.heroTitle}>
          One <Text style={styles.accentWord}>crew</Text>.{'\n'}Every shore.
        </Title>
        <Serif style={styles.lede}>
          Seamarg keeps watch over your documents, courses, compliance and career — so the only thing
          you focus on is the voyage. Family on board. Family on shore.
        </Serif>

        <View style={styles.heroActions}>
          <Button title="Create my Sea Wallet" onPress={() => router.push('/sign-up')} />
          <Button title="Sign in" variant="secondary" onPress={() => router.push('/sign-in')} />
        </View>

        <View style={styles.statGrid}>
          {HERO_STATS.map((stat) => (
            <View key={stat.label} style={styles.statCell}>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Muted style={styles.statLabel}>{stat.label}</Muted>
            </View>
          ))}
        </View>
      </View>

      {/* Feature keyword strip */}
      <View style={styles.strip}>
        <Text style={styles.stripText}>
          SEA WALLET ★ COURSE BOOKING ★ CREW ID ★ DOCUMENT RENEWAL ★ DG SHIPPING ALERTS
        </Text>
      </View>

      {/* Features */}
      <View style={styles.section}>
        {FEATURES.map((feature) => (
          <Card key={feature.tag} style={styles.featureCard}>
            <View style={styles.featureIcon}>
              <Ionicons name={feature.icon} size={22} color={colors.primaryLight} />
            </View>
            <Eyebrow style={styles.featureTag}>{feature.tag}</Eyebrow>
            <Heading>{feature.title}</Heading>
            <Body style={styles.featureBody}>{feature.body}</Body>
            {feature.chips.length > 0 ? (
              <View style={styles.chips}>
                {feature.chips.map((chip) => (
                  <View key={chip} style={styles.chip}>
                    <Text style={styles.chipText}>{chip}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </Card>
        ))}
      </View>

      {/* Community band */}
      <View style={styles.community}>
        <Eyebrow dot style={styles.communityEyebrow}>
          The Margo Family
        </Eyebrow>
        <Heading style={styles.communityTitle}>We leave no one on the dock.</Heading>
        <Serif style={styles.communityCopy}>
          Every seafarer carries the same life — months at sea, families on shore, the same documents,
          the same deadlines. Seamarg exists because that life deserves a crew that has your back on
          land, the way your shipmates have it on board.
        </Serif>

        <View style={styles.crewGrid}>
          {CREW_STATS.map((stat) => (
            <View key={stat.label} style={styles.crewCell}>
              <Text style={styles.crewValue}>{stat.value}</Text>
              <Muted style={styles.statLabel}>{stat.label}</Muted>
            </View>
          ))}
        </View>

        <Text style={styles.quote}>
          “On board, we're family because we have to be. Seamarg made sure we're family on shore too —
          someone watching the dates, the rules, the renewals, while we watch the sea.”
        </Text>
        <Muted style={styles.cite}>— A Seamarg seafarer, between contracts</Muted>
      </View>

      {/* CTA band */}
      <View style={styles.ctaBand}>
        <Heading style={styles.ctaTitle}>Your watch on shore starts today.</Heading>
        <Serif style={styles.ctaCopy}>
          Open your Sea Wallet, get your Crew ID, and let Seamarg stand the next watch on your documents.
        </Serif>
        <Button title="Create my Sea Wallet — Free" onPress={() => router.push('/sign-up')} />
        <Muted style={styles.footNote}>© 2026 Seamarg. One crew, every shore.</Muted>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Hero
  hero: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    backgroundColor: colors.surfaceRaised,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    overflow: 'hidden',
  },
  ringOuter: {
    position: 'absolute',
    top: -80,
    right: -90,
    width: 260,
    height: 260,
    borderRadius: 130,
    borderWidth: 1,
    borderColor: 'rgba(200, 149, 46, 0.22)',
  },
  ringInner: {
    position: 'absolute',
    top: -40,
    right: -50,
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 1,
    borderColor: 'rgba(110, 147, 162, 0.18)',
  },
  brandRow: {
    marginBottom: spacing.xl,
  },
  brandLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  brand: {
    fontFamily: fonts.heading,
    fontSize: 16,
    letterSpacing: tracking.label,
    color: colors.text,
  },
  heroEyebrow: {
    marginBottom: spacing.md,
  },
  heroTitle: {
    fontSize: 40,
    lineHeight: 42,
  },
  accentWord: {
    color: colors.primaryLight,
  },
  lede: {
    marginTop: spacing.md,
    fontSize: typography.subheading,
    lineHeight: 25,
    color: colors.textDim,
  },
  heroActions: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  statGrid: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  statCell: {
    width: '50%',
    paddingVertical: spacing.sm,
  },
  statValue: {
    fontFamily: fonts.heading,
    fontSize: 18,
    letterSpacing: tracking.tight,
    color: colors.primaryLight,
  },
  statLabel: {
    marginTop: 2,
  },

  // Keyword strip
  strip: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
  },
  stripText: {
    fontFamily: fonts.heading,
    fontSize: 11,
    letterSpacing: tracking.label,
    color: colors.primaryText,
    textAlign: 'center',
  },

  // Features
  section: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  featureCard: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(200, 149, 46, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  featureTag: {
    color: colors.primaryLight,
  },
  featureBody: {
    color: colors.textMuted,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.surfaceMuted,
  },
  chipText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textDim,
  },

  // Community
  community: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    backgroundColor: colors.surfaceRaised,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  communityEyebrow: {
    marginBottom: spacing.sm,
  },
  communityTitle: {
    fontSize: 24,
  },
  communityCopy: {
    marginTop: spacing.sm,
  },
  crewGrid: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  crewCell: {
    width: '50%',
    paddingVertical: spacing.md,
  },
  crewValue: {
    fontFamily: fonts.headingBold,
    fontSize: 20,
    letterSpacing: tracking.tight,
    color: colors.text,
  },
  quote: {
    marginTop: spacing.lg,
    fontFamily: fonts.serifItalic,
    fontSize: 18,
    lineHeight: 27,
    color: colors.text,
  },
  cite: {
    marginTop: spacing.sm,
  },

  // CTA
  ctaBand: {
    padding: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
  ctaTitle: {
    fontSize: 24,
  },
  ctaCopy: {
    marginBottom: spacing.xs,
  },
  footNote: {
    marginTop: spacing.md,
    alignSelf: 'center',
  },
});
