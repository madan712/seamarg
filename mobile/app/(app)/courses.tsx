// Courses tab — the mobile counterpart of the web portal's Courses workspace
// (docs/courses-design.md). Three views: Find a course (course + date batch
// search), Browse institutes (drill into an institute's batches), and My
// enrollments (request/cancel). Enrollment is request→confirm: requesting a
// seat creates a PENDING enrollment the institute later confirms. Admin
// management stays web-only.
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { SessionExpiredError } from '@/api/client';
import {
  cancelEnrollment,
  enrollmentTone,
  fetchCourseTypes,
  fetchEnrollments,
  fetchInstituteDetail,
  fetchInstitutes,
  requestEnrollment,
  searchBatches,
  type Batch,
  type CourseType,
  type Enrollment,
  type InstituteDetail,
  type InstituteSummary,
} from '@/api/courses';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { GradientSurface } from '@/components/GradientSurface';
import { ListRow } from '@/components/ListRow';
import { Pill } from '@/components/Pill';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { Body, ErrorText, Eyebrow, Heading, Muted, NoticeText, Serif, Title } from '@/components/Typography';
import { normalizeError } from '@/lib/errors';
import { colors, fonts, gradients, radius, sizes, spacing, tracking, typography, withAlpha } from '@/theme';

type Tab = 'find' | 'institutes' | 'mine';

export default function Courses() {
  const { session, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>('find');

  const [courseTypes, setCourseTypes] = useState<CourseType[]>([]);
  const [institutes, setInstitutes] = useState<InstituteSummary[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyBatchId, setBusyBatchId] = useState<string | null>(null);

  // Find view
  const [selectedCourse, setSelectedCourse] = useState<CourseType | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [results, setResults] = useState<Batch[] | null>(null);
  const [searching, setSearching] = useState(false);

  // Institutes view
  const [instituteQuery, setInstituteQuery] = useState('');
  const [detail, setDetail] = useState<InstituteDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const handleError = useCallback(
    (err: unknown) => {
      if (err instanceof SessionExpiredError) {
        signOut();
        return;
      }
      setNotice('');
      setError(normalizeError(err).message);
    },
    [signOut],
  );

  const load = useCallback(() => {
    if (!session) return;
    setLoading(true);
    setError('');
    Promise.all([fetchCourseTypes(session), fetchInstitutes(session), fetchEnrollments(session)])
      .then(([types, insts, enrs]) => {
        setCourseTypes(types ?? []);
        setInstitutes(insts ?? []);
        setEnrollments(enrs ?? []);
      })
      .catch(handleError)
      .finally(() => setLoading(false));
  }, [session, handleError]);

  useFocusEffect(load);

  const statusByBatch = useMemo(() => {
    const map = new Map<string, string>();
    enrollments.forEach((e) => {
      if (e.batchId && e.status) map.set(e.batchId, e.status);
    });
    return map;
  }, [enrollments]);

  const reloadEnrollments = useCallback(async () => {
    if (!session) return;
    try {
      setEnrollments((await fetchEnrollments(session)) ?? []);
    } catch {
      // keep prior list
    }
  }, [session]);

  const runSearch = useCallback(
    async (course: CourseType) => {
      if (!session) return;
      setSelectedCourse(course);
      setSearching(true);
      setError('');
      setNotice('');
      try {
        setResults(await searchBatches(session, { course: course.slug, from, to, openOnly: true }));
      } catch (err) {
        setResults([]);
        handleError(err);
      } finally {
        setSearching(false);
      }
    },
    [session, from, to, handleError],
  );

  const openInstitute = useCallback(
    async (instituteId: string) => {
      if (!session) return;
      setDetailLoading(true);
      setError('');
      try {
        setDetail(await fetchInstituteDetail(session, instituteId));
      } catch (err) {
        handleError(err);
      } finally {
        setDetailLoading(false);
      }
    },
    [session, handleError],
  );

  const enroll = useCallback(
    async (batch: Batch) => {
      if (!session) return;
      setBusyBatchId(batch.batchId);
      setNotice('');
      setError('');
      try {
        await requestEnrollment(session, {
          instituteId: batch.instituteId,
          typeSlug: batch.typeSlug,
          batchId: batch.batchId,
        });
        await reloadEnrollments();
        if (detail) await openInstitute(detail.id);
        if (selectedCourse) await runSearch(selectedCourse);
        setNotice('Enrollment requested — awaiting institute confirmation.');
      } catch (err) {
        handleError(err);
      } finally {
        setBusyBatchId(null);
      }
    },
    [session, detail, selectedCourse, reloadEnrollments, openInstitute, runSearch, handleError],
  );

  const cancel = useCallback(
    async (batchId: string) => {
      if (!session) return;
      setBusyBatchId(batchId);
      try {
        await cancelEnrollment(session, batchId);
        await reloadEnrollments();
        setNotice('Enrollment cancelled.');
      } catch (err) {
        handleError(err);
      } finally {
        setBusyBatchId(null);
      }
    },
    [session, reloadEnrollments, handleError],
  );

  const filteredInstitutes = useMemo(() => {
    const q = instituteQuery.trim().toLowerCase();
    if (!q) return institutes;
    return institutes.filter((i) => `${i.name} ${i.city ?? ''} ${i.state ?? ''}`.toLowerCase().includes(q));
  }, [institutes, instituteQuery]);

  const renderBatch = (batch: Batch, showInstitute: boolean) => {
    const available = batch.availableSeats ?? 0;
    const total = batch.totalSeats ?? 0;
    const status = statusByBatch.get(batch.batchId);
    const active = status && status !== 'CANCELLED' && status !== 'REJECTED';
    const busy = busyBatchId === batch.batchId;
    return (
      <View key={batch.batchId} style={styles.batch}>
        <View style={styles.batchText}>
          <Body numberOfLines={1}>
            {showInstitute ? (batch.instituteName ?? batch.courseName ?? '') : `Starts ${batch.startDate}`}
          </Body>
          <View style={styles.batchMeta}>
            <Ionicons name="calendar-outline" size={13} color={colors.textFaint} />
            <Muted>
              {showInstitute ? `${batch.startDate}` : (batch.mode ?? 'ONSITE')} · {available}/{total} seats
            </Muted>
          </View>
        </View>
        {active ? (
          <Pill label={status ?? ''} tone={enrollmentTone(status)} dot />
        ) : available <= 0 ? (
          <Pill label="Full" tone="due" />
        ) : (
          <Button
            title={busy ? '…' : 'Enroll'}
            size="sm"
            fullWidth={false}
            loading={busy}
            onPress={() => enroll(batch)}
          />
        )}
      </View>
    );
  };

  return (
    <Screen gutter={false} footerSpace={sizes.tabContentBottom}>
      <GradientSurface colors={gradients.night} style={styles.hero}>
        <Eyebrow dot style={styles.heroEyebrow}>
          Courses
        </Eyebrow>
        <Title>Find & book training</Title>
        <Serif style={styles.heroLede}>
          Search DG-approved courses, pick a batch that fits your dates, and request your seat.
        </Serif>
      </GradientSurface>

      <View style={styles.body}>
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { key: 'find', label: 'Find' },
            { key: 'institutes', label: 'Institutes' },
            { key: 'mine', label: 'My seats' },
          ]}
        />

        {error ? <ErrorText>{error}</ErrorText> : null}
        {notice ? <NoticeText>{notice}</NoticeText> : null}

        {tab === 'find' ? (
          <View style={styles.section}>
            {selectedCourse ? (
              <View style={styles.section}>
                <BackLink
                  label="All courses"
                  onPress={() => {
                    setSelectedCourse(null);
                    setResults(null);
                  }}
                />
                <Heading>{selectedCourse.name}</Heading>
                <View style={styles.dateRow}>
                  <TextInput
                    style={styles.dateInput}
                    placeholder="From YYYY-MM-DD"
                    placeholderTextColor={colors.textFaint}
                    value={from}
                    onChangeText={setFrom}
                    autoCapitalize="none"
                  />
                  <TextInput
                    style={styles.dateInput}
                    placeholder="To YYYY-MM-DD"
                    placeholderTextColor={colors.textFaint}
                    value={to}
                    onChangeText={setTo}
                    autoCapitalize="none"
                  />
                </View>
                <Button title="Search batches" icon="search-outline" onPress={() => runSearch(selectedCourse)} loading={searching} />
                {results && results.length > 0 ? (
                  <Card style={styles.list}>{results.map((b) => renderBatch(b, true))}</Card>
                ) : (
                  <EmptyState
                    icon="calendar-outline"
                    title={searching ? 'Searching…' : 'No open batches'}
                    message={searching ? undefined : 'Try widening the date range to see more batches.'}
                  />
                )}
              </View>
            ) : (
              <>
                <Heading>Browse the catalogue</Heading>
                {courseTypes.length === 0 && !loading ? (
                  <Muted>No courses available right now.</Muted>
                ) : (
                  <View style={styles.chips}>
                    {courseTypes.map((type) => (
                      <Pressable
                        key={type.slug}
                        style={styles.courseChip}
                        onPress={() => runSearch(type)}
                        accessibilityRole="button"
                        accessibilityLabel={`Search batches for ${type.name}`}
                      >
                        <Body style={styles.courseChipText}>{type.name}</Body>
                        <Ionicons name="arrow-forward" size={14} color={colors.primaryLight} />
                      </Pressable>
                    ))}
                  </View>
                )}
              </>
            )}
          </View>
        ) : null}

        {tab === 'institutes' ? (
          <View style={styles.section}>
            {detail ? (
              <View style={styles.section}>
                <BackLink label="All institutes" onPress={() => setDetail(null)} />
                <Heading>{detail.name}</Heading>
                <Muted>{[detail.city, detail.state].filter(Boolean).join(', ')}</Muted>
                {(detail.batches ?? []).length > 0 ? (
                  <Card style={styles.list}>{detail.batches.map((b) => renderBatch(b, false))}</Card>
                ) : (
                  <EmptyState icon="calendar-outline" title="No open batches" message="This institute has no open batches right now." />
                )}
              </View>
            ) : (
              <>
                <View style={styles.searchWrap}>
                  <Ionicons name="search-outline" size={18} color={colors.textFaint} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search institutes…"
                    placeholderTextColor={colors.textFaint}
                    value={instituteQuery}
                    onChangeText={setInstituteQuery}
                    autoCapitalize="none"
                  />
                </View>
                {filteredInstitutes.length === 0 && !loading ? (
                  <Muted>No institutes match your search.</Muted>
                ) : (
                  <View style={styles.list}>
                    {filteredInstitutes.map((inst) => (
                      <ListRow
                        key={inst.id}
                        icon="business-outline"
                        title={inst.name}
                        subtitle={[inst.city, inst.state].filter(Boolean).join(', ') || 'Institute'}
                        onPress={() => openInstitute(inst.id)}
                      />
                    ))}
                  </View>
                )}
              </>
            )}
          </View>
        ) : null}

        {tab === 'mine' ? (
          <View style={styles.section}>
            {enrollments.length === 0 ? (
              <EmptyState
                icon="school-outline"
                title="No enrollments yet"
                message="Use Find to search for a course and request your first seat."
                actionLabel="Find a course"
                onAction={() => setTab('find')}
              />
            ) : (
              enrollments.map((e) => {
                const status = (e.status ?? '').toUpperCase();
                const canCancel = status === 'PENDING' || status === 'CONFIRMED';
                const busy = busyBatchId === e.batchId;
                return (
                  <Card key={e.batchId} style={styles.enrollment}>
                    <View style={styles.enrollTop}>
                      <View style={styles.enrollText}>
                        <Body numberOfLines={1}>{e.courseName ?? e.typeSlug}</Body>
                        <Muted numberOfLines={1}>
                          {e.instituteName}
                          {e.startDate ? ` · starts ${e.startDate}` : ''}
                        </Muted>
                      </View>
                      <Pill label={e.status ?? ''} tone={enrollmentTone(e.status)} dot />
                    </View>
                    {canCancel ? (
                      <Button
                        title="Cancel enrollment"
                        variant="danger"
                        size="sm"
                        loading={busy}
                        onPress={() => cancel(e.batchId)}
                      />
                    ) : null}
                  </Card>
                );
              })
            )}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

function BackLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.back} accessibilityRole="button" accessibilityLabel={`Back to ${label}`}>
      <Ionicons name="chevron-back" size={16} color={colors.primaryLight} />
      <Body style={styles.backText}>{label}</Body>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    gap: spacing.xs,
  },
  heroEyebrow: { marginBottom: spacing.xs },
  heroLede: { marginTop: spacing.xs, color: colors.textDim },
  body: { paddingHorizontal: spacing.md, gap: spacing.md, marginTop: spacing.md },
  section: { gap: spacing.md },
  chips: { gap: spacing.sm },
  courseChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 2,
    backgroundColor: colors.surface,
  },
  courseChipText: { fontSize: 14, flexShrink: 1 },
  list: { gap: spacing.sm, padding: spacing.md },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' },
  backText: { color: colors.primaryLight, fontFamily: fonts.bodyMedium },
  dateRow: { flexDirection: 'row', gap: spacing.sm },
  dateInput: {
    flex: 1,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: typography.body,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.sm + 3,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: typography.body,
  },
  batch: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  batchText: { gap: 3, flexShrink: 1 },
  batchMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  enrollment: { gap: spacing.sm },
  enrollTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  enrollText: { flex: 1, gap: 2 },
});
