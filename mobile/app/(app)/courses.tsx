// Courses tab — the mobile counterpart of the web private portal's "Courses"
// step. Course booking itself is built in a later phase (the web renders a
// "coming soon" placeholder), so this screen presents the course-booking value
// proposition — nearest-institute matching + book-for-me — and flags that
// booking opens soon. Copy is kept parallel to the web landing's Feature 02.
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { Pill } from '@/components/Pill';
import { Screen } from '@/components/Screen';
import { Body, Eyebrow, Heading, Muted, Serif, Title } from '@/components/Typography';
import { colors, fonts, radius, spacing } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

const SAMPLE_COURSES = [
  { name: 'Advanced Fire Fighting', institute: 'Maritime Training Centre', distance: '4.2 km', status: '3 seats left', tone: 'due' as const },
  { name: 'STCW Refresher (5-yr)', institute: 'Coastal Skills Academy', distance: '7.8 km', status: 'Batch 14 Jul', tone: 'warn' as const },
  { name: 'GMDSS GOC', institute: 'Anchorage Institute', distance: '11 km', status: 'Book for me', tone: 'ok' as const },
];

const VALUE_PROPS: { icon: IconName; title: string; body: string; chips: string[] }[] = [
  {
    icon: 'navigate-outline',
    title: 'We map the course to your coastline.',
    body: 'Search any DG-approved course and Seamarg ranks institutes by distance from your home port, current batch openings and seat availability — so you are not calling five places to find one slot.',
    chips: ['Fire Fighting', 'STCW Refresher', 'GMDSS', 'PSCRB'],
  },
  {
    icon: 'checkmark-done-outline',
    title: 'Hand it to us. We will confirm your seat.',
    body: 'If you would rather be home with family than on hold with an institute, say the word. Our team confirms the batch, completes the booking and sends your joining letter straight to your Sea Wallet.',
    chips: [],
  },
];

export default function Courses() {
  return (
    <Screen>
      <View style={styles.header}>
        <Eyebrow dot>Course Booking</Eyebrow>
        <Title>Find your course</Title>
        <Serif>
          Tell us the certificate you need. We'll surface the nearest approved institute, show live batch
          availability, and — if you'd rather not deal with the paperwork — book your seat for you.
        </Serif>
      </View>

      <Card style={styles.notice}>
        <View style={styles.noticeTop}>
          <Ionicons name="time-outline" size={18} color={colors.primaryLight} />
          <Pill label="Coming soon" tone="warn" />
        </View>
        <Body style={styles.noticeBody}>
          Course booking opens in an upcoming release. Here's a preview of how it will work.
        </Body>
      </Card>

      <Heading style={styles.sectionTitle}>Nearest institute match</Heading>
      <Card style={styles.courseList}>
        {SAMPLE_COURSES.map((course, index) => (
          <View
            key={course.name}
            style={[styles.courseRow, index < SAMPLE_COURSES.length - 1 && styles.courseRowBorder]}
          >
            <View style={styles.courseText}>
              <Body>{course.name}</Body>
              <Muted>
                {course.institute} · {course.distance}
              </Muted>
            </View>
            <Pill label={course.status} tone={course.tone} />
          </View>
        ))}
      </Card>

      {VALUE_PROPS.map((prop) => (
        <Card key={prop.title} style={styles.propCard}>
          <View style={styles.propIcon}>
            <Ionicons name={prop.icon} size={20} color={colors.primaryLight} />
          </View>
          <Heading>{prop.title}</Heading>
          <Body style={styles.propBody}>{prop.body}</Body>
          {prop.chips.length > 0 ? (
            <View style={styles.chips}>
              {prop.chips.map((chip) => (
                <View key={chip} style={styles.chip}>
                  <Text style={styles.chipText}>{chip}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, marginBottom: spacing.xs },
  notice: { gap: spacing.sm },
  noticeTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  noticeBody: { color: colors.textMuted },
  sectionTitle: { marginTop: spacing.sm },
  courseList: { padding: 0, gap: 0 },
  courseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    gap: spacing.sm,
  },
  courseRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  courseText: { gap: 2, flexShrink: 1 },
  propCard: { gap: spacing.sm },
  propIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(200, 149, 46, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  propBody: { color: colors.textMuted },
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
});
