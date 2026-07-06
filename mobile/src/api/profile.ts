// Typed calls to /api/customer/profile/**. The backend stores one item per
// section (PROFILE#<SECTION>); each section's fields live in a JSON payload, so
// the client treats a section as an open record of field values.
import { apiRequest } from './client';

import type { AuthSession } from '@/auth/types';

// section slug -> field values. Mirrors ProfileSections in the web frontend.
export type ProfileSections = Record<string, Record<string, unknown>>;

// Section slugs as exposed by the backend REST paths (/api/customer/profile/<slug>).
export type ProfileSectionSlug =
  | 'main'
  | 'contact'
  | 'passport'
  | 'address'
  | 'languages'
  | 'skills'
  | 'visas'
  | 'relatives'
  | 'misc';

export function fetchProfile(session: AuthSession): Promise<ProfileSections> {
  return apiRequest<ProfileSections>('/api/customer/profile', session);
}

export function saveProfileSection(
  session: AuthSession,
  slug: ProfileSectionSlug,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return apiRequest<Record<string, unknown>>(`/api/customer/profile/${slug}`, session, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}
