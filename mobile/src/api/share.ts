// Typed calls to the document-sharing API (owner side). RN twin of the web
// frontend's share helpers in main.ts. The recipient viewer is intentionally
// web-only (design D1/§8): mobile only lets a seafarer flag shareable files and
// mint / list / revoke secure links. Request/response shapes match the web app
// and the backend ShareController exactly.
import { apiRequest } from './client';
import { config } from '@/config';

import type { AuthSession } from '@/auth/types';

// Mirrors ShareableFilesService.ShareableFile (backend).
export type ShareableFile = {
  fileId: string;
  category: string | null;
  typeSlug: string | null;
  documentName: string | null;
  originalFilename: string | null;
  contentType: string | null;
  sizeBytes: number;
  expiryDate: string | null;
  shareable: boolean;
};

// Mirrors ShareService.ShareView (backend). status is ACTIVE | REVOKED | EXPIRED.
export type ShareView = {
  shareId: string;
  status: string;
  allowDownload: boolean;
  recipientLabel: string | null;
  createdAt: string;
  expiresAt: string;
  viewCount: number;
  downloadCount: number;
  lastAccessedAt: string | null;
};

// Mirrors ShareService.CreatedShare — token is present only here, once.
export type CreatedShare = {
  shareId: string;
  token: string;
  expiresAt: string;
  allowDownload: boolean;
  recipientLabel: string | null;
};

export function fetchShareableFiles(session: AuthSession): Promise<ShareableFile[]> {
  return apiRequest<ShareableFile[]>('/api/customer/files/shareable', session);
}

export function setShareVisibility(
  session: AuthSession,
  fileId: string,
  shareable: boolean,
): Promise<{ fileId: string; shareable: boolean }> {
  return apiRequest('/api/customer/files/visibility', session, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId, shareable }),
  });
}

export function fetchShares(session: AuthSession): Promise<ShareView[]> {
  return apiRequest<ShareView[]>('/api/customer/shares', session);
}

export function createShare(session: AuthSession, allowDownload = true): Promise<CreatedShare> {
  return apiRequest<CreatedShare>('/api/customer/shares', session, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ allowDownload }),
  });
}

export function revokeShare(session: AuthSession, shareId: string): Promise<ShareView> {
  return apiRequest<ShareView>(
    `/api/customer/shares/${encodeURIComponent(shareId)}/revoke`,
    session,
    { method: 'POST' },
  );
}

// The recipient URL encoded into the QR. The web frontend is served from the
// same origin as the API (CloudFront proxies /api/*), so we derive the web
// origin from the API base URL. The token lives in the fragment.
export function buildShareUrl(token: string): string {
  const origin = (config.apiBaseUrl.match(/^https?:\/\/[^/]+/)?.[0] ?? config.apiBaseUrl).replace(
    /\/+$/,
    '',
  );
  return `${origin}/#/s/${token}`;
}
