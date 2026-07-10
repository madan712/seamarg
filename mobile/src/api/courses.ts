// Typed calls to the Courses endpoints (docs/courses-design.md). Public
// discovery (/api/public/**) + the seafarer enrollment flow
// (/api/customer/enrollments). Paths and shapes match the web frontend exactly
// so the two clients never drift on the backend contract.
import { apiRequest } from './client';

import type { AuthSession } from '@/auth/types';

export type CourseType = {
  slug: string;
  name: string;
  category?: string;
  description?: string;
};

export type InstituteSummary = {
  id: string;
  name: string;
  dgsCode?: string;
  approvalStatus?: string;
  city?: string;
  state?: string;
  website?: string;
  active?: boolean;
};

export type Offering = {
  instituteId: string;
  instituteName?: string;
  typeSlug: string;
  courseName?: string;
  category?: string;
};

export type Batch = {
  batchId: string;
  instituteId: string;
  instituteName?: string;
  state?: string;
  typeSlug: string;
  courseName?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  mode?: string;
  totalSeats?: number;
  confirmedSeats?: number;
  availableSeats?: number;
};

export type InstituteDetail = InstituteSummary & {
  offerings: Offering[];
  batches: Batch[];
};

export type CourseDetail = CourseType & {
  offerings: Offering[];
  batches: Batch[];
};

export type Enrollment = {
  batchId: string;
  instituteId?: string;
  instituteName?: string;
  typeSlug?: string;
  courseName?: string;
  startDate?: string;
  status?: string;
  createdAt?: string;
};

export function fetchCourseTypes(session: AuthSession): Promise<CourseType[]> {
  return apiRequest<CourseType[]>('/api/public/courses', session);
}

export function fetchInstitutes(session: AuthSession): Promise<InstituteSummary[]> {
  return apiRequest<InstituteSummary[]>('/api/public/institutes', session);
}

export function fetchInstituteDetail(session: AuthSession, instituteId: string): Promise<InstituteDetail> {
  return apiRequest<InstituteDetail>(`/api/public/institutes/${encodeURIComponent(instituteId)}`, session);
}

export function fetchCourseDetail(session: AuthSession, typeSlug: string): Promise<CourseDetail> {
  return apiRequest<CourseDetail>(`/api/public/courses/${encodeURIComponent(typeSlug)}`, session);
}

export function searchBatches(
  session: AuthSession,
  params: { course: string; from?: string; to?: string; state?: string; openOnly?: boolean },
): Promise<Batch[]> {
  const query = new URLSearchParams({ course: params.course });
  query.set('openOnly', String(params.openOnly ?? true));
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  if (params.state) query.set('state', params.state);
  return apiRequest<Batch[]>(`/api/public/batches/search?${query.toString()}`, session);
}

export function fetchEnrollments(session: AuthSession): Promise<Enrollment[]> {
  return apiRequest<Enrollment[]>('/api/customer/enrollments', session);
}

export function requestEnrollment(
  session: AuthSession,
  body: { instituteId: string; typeSlug: string; batchId: string },
): Promise<Enrollment> {
  return apiRequest<Enrollment>('/api/customer/enrollments', session, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function cancelEnrollment(session: AuthSession, batchId: string): Promise<void> {
  await apiRequest<unknown>(`/api/customer/enrollments/${encodeURIComponent(batchId)}`, session, {
    method: 'DELETE',
  });
}

// Maps an enrollment status to a Pill tone (mirrors the web status badges).
export function enrollmentTone(status?: string): 'ok' | 'warn' | 'due' | 'neutral' {
  switch ((status ?? '').toUpperCase()) {
    case 'CONFIRMED':
      return 'ok';
    case 'PENDING':
      return 'warn';
    case 'REJECTED':
    case 'CANCELLED':
      return 'due';
    default:
      return 'neutral';
  }
}
