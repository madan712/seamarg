// Courses tab — the mobile counterpart of the web portal's Courses workspace
// (docs/courses-design.md). Three views: Find a course (course + date batch
// search), Browse institutes (drill into an institute's batches), and My
// enrollments (request/cancel). Enrollment is request→confirm: requesting a
// seat creates a PENDING enrollment the institute later confirms. Admin
// management stays web-only.
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

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
import { Pill } from '@/components/Pill';
import { Screen } from '@/components/Screen';
import { Body, ErrorText, Eyebrow, Heading, Muted, NoticeText, Serif, Title } from '@/components/Typography';
import { normalizeError } from '@/lib/errors';
import { colors, fonts, palette, radius, spacing, tracking, typography } from '@/theme';

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
    if (!session) {
      return;
    }
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
          <Body>{showInstitute ? (batch.instituteName ?? batch.courseName ?? '') : `Starts ${batch.startDate}`}</Body>
          <Muted>
            {showInstitute ? `Starts ${batch.startDate}` : (batch.mode ?? 'ONSITE')} · {available}/{total} seats
          </Muted>
        </View>
        {active ? (
          <Pill label={status ?? ''} tone={enrollmentTone(status)} />
        ) : available <= 0 ? (
          <Pill label="Full" tone="due" />
        ) : (
          <Pressable
            style={[styles.enrollBtn, busy && styles.dimmed]}
            disabled={busy}
            onPress={() => enroll(batch)}
          >
            <Body style={styles.enrollLabel}>{busy ? '…' : 'Enroll'}</Body>
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Eyebrow dot>Courses</Eyebrow>
        <Title>Find & book training</Title>
        <Serif>Search DG-approved courses, pick a batch that fits your dates, and request your seat.</Serif>
      </View>

      <View style={styles.tabs}>
        {(
          [
            ['find', 'Find'],
            ['institutes', 'Institutes'],
            ['mine', 'My enrollments'],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <Pressable key={key} onPress={() => setTab(key)} style={[styles.tab, tab === key && styles.tabActive]}>
            <Body style={[styles.tabLabel, tab === key && styles.tabLabelActive]}>{label}</Body>
          </Pressable>
        ))}
      </View>

      {error ? <ErrorText>{error}</ErrorText> : null}
      {notice ? <NoticeText>{notice}</NoticeText> : null}
      {loading ? <ActivityIndicator color={colors.primary} /> : null}

      {tab === 'find' ? (
        <View style={styles.section}>
          {selectedCourse ? (
            <View style={styles.detailHead}>
              <Pressable
                onPress={() => {
                  setSelectedCourse(null);
                  setResults(null);
                }}
              >
                <Body style={styles.back}>← All courses</Body>
              </Pressable>
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
              <Button title="Search batches" onPress={() => runSearch(selectedCourse)} loading={searching} />
              <Card style={styles.list}>
                {results && results.length > 0 ? (
                  results.map((b) => renderBatch(b, true))
                ) : (
                  <Muted>{searching ? 'Searching…' : 'No open batches match. Try widening the dates.'}</Muted>
                )}
              </Card>
            </View>
          ) : (
            <>
              <Heading>Browse the catalogue</Heading>
              <View style={styles.chips}>
                {courseTypes.map((type) => (
                  <Pressable key={type.slug} style={styles.chip} onPress={() => runSearch(type)}>
                    <Body style={styles.chipText}>{type.name}</Body>
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </View>
      ) : null}

      {tab === 'institutes' ? (
        <View style={styles.section}>
          {detail ? (
            <View style={styles.detailHead}>
              <Pressable onPress={() => setDetail(null)}>
                <Body style={styles.back}>← All institutes</Body>
              </Pressable>
              <Heading>{detail.name}</Heading>
              <Muted>{[detail.city, detail.state].filter(Boolean).join(', ')}</Muted>
              <Card style={styles.list}>
                {(detail.batches ?? []).length > 0 ? (
                  detail.batches.map((b) => renderBatch(b, false))
                ) : (
                  <Muted>No open batches at this institute right now.</Muted>
                )}
              </Card>
            </View>
          ) : detailLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <>
              <TextInput
                style={styles.search}
                placeholder="Search institutes…"
                placeholderTextColor={colors.textFaint}
                value={instituteQuery}
                onChangeText={setInstituteQuery}
                autoCapitalize="none"
              />
              <View style={styles.list}>
                {filteredInstitutes.map((inst) => (
                  <Card key={inst.id} onPress={() => openInstitute(inst.id)} style={styles.row}>
                    <View style={styles.rowText}>
                      <Body>{inst.name}</Body>
                      <Muted>{[inst.city, inst.state].filter(Boolean).join(', ')}</Muted>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
                  </Card>
                ))}
              </View>
            </>
          )}
        </View>
      ) : null}

      {tab === 'mine' ? (
        <View style={styles.section}>
          {enrollments.length === 0 ? (
            <Muted>No enrollments yet. Use Find to request a seat.</Muted>
          ) : (
            enrollments.map((e) => {
              const status = (e.status ?? '').toUpperCase();
              const canCancel = status === 'PENDING' || status === 'CONFIRMED';
              const busy = busyBatchId === e.batchId;
              return (
                <Card key={e.batchId} style={styles.row}>
                  <View style={styles.rowText}>
                    <Body>{e.courseName ?? e.typeSlug}</Body>
                    <Muted>
                      {e.instituteName}
                      {e.startDate ? ` · starts ${e.startDate}` : ''}
                    </Muted>
                  </View>
                  <View style={styles.rowRight}>
                    <Pill label={e.status ?? ''} tone={enrollmentTone(e.status)} />
                    {canCancel ? (
                      <Pressable disabled={busy} onPress={() => cancel(e.batchId)}>
                        <Body style={styles.cancel}>{busy ? '…' : 'Cancel'}</Body>
                      </Pressable>
                    ) : null}
                  </View>
                </Card>
              );
            })
          )}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, marginBottom: spacing.xs },
  tabs: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  tab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: { borderColor: colors.primary, backgroundColor: 'rgba(200, 149, 46, 0.16)' },
  tabLabel: { color: colors.textMuted, fontSize: 12 },
  tabLabelActive: { color: colors.primaryLight },
  section: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surfaceMuted,
  },
  chipText: { fontSize: 13 },
  list: { gap: spacing.sm, padding: spacing.md },
  detailHead: { gap: spacing.sm },
  back: { color: colors.primaryLight },
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
  search: {
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
  batch: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  batchText: { gap: 2, flexShrink: 1 },
  enrollBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  enrollLabel: {
    color: palette.deep,
    fontFamily: fonts.heading,
    fontSize: 12,
    letterSpacing: tracking.label,
    textTransform: 'uppercase',
  },
  dimmed: { opacity: 0.55 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  rowText: { gap: 2, flexShrink: 1 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cancel: { color: colors.danger, fontSize: 13 },
});
