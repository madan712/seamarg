// Typed calls to /api/customer/certificates/**.
//
// The backend keeps certificate data in two shapes (see docs/certificates-design.md):
//  - CERT#MAINDOCS: a held/not-held checklist (key -> boolean).
//  - CERT#<CATEGORY>#<TYPE_SLUG>: a detailed entry whose payload may nest an
//    uploaded `file`. Entries are keyed category slug -> type slug -> fields.
import { apiRequest } from './client';

import type { AuthSession } from '@/auth/types';

export type MainDocuments = Record<string, boolean>;

// category slug -> type slug -> field values. Mirrors CertificateEntries (web).
export type CertificateEntries = Record<string, Record<string, Record<string, unknown>>>;

export type CertificateFileMeta = {
  bucketName?: string;
  objectKey?: string;
  originalFilename?: string;
  contentType?: string;
  sizeBytes?: number;
};

export async function fetchMainDocuments(session: AuthSession): Promise<MainDocuments> {
  const raw = await apiRequest<Record<string, unknown>>(
    '/api/customer/certificates/main-documents',
    session,
  );
  const documents: MainDocuments = {};
  for (const key of Object.keys(raw ?? {})) {
    documents[key] = raw[key] === true;
  }
  return documents;
}

export function fetchCertificateEntries(session: AuthSession): Promise<CertificateEntries> {
  return apiRequest<CertificateEntries>('/api/customer/certificates/entries', session);
}

export type CertificateUploadResult = {
  extraction?: Record<string, string | null>;
  file?: CertificateFileMeta;
};

// Uploads a captured/selected image to the entry's file endpoint. The backend
// stores it under the CERT#<CATEGORY>#<TYPE> payload and runs AI extraction,
// returning suggested field values. Mirrors handleCertificateFileUpload (web),
// which POSTs multipart form-data with a single `file` part.
//
// NOTE: do not set Content-Type — fetch adds the multipart boundary itself.
export function uploadCertificateFile(
  session: AuthSession,
  category: string,
  typeSlug: string,
  asset: { uri: string; name: string; type: string },
): Promise<CertificateUploadResult> {
  const formData = new FormData();
  // React Native's FormData accepts this {uri,name,type} shape for file parts.
  formData.append('file', { uri: asset.uri, name: asset.name, type: asset.type } as unknown as Blob);

  return apiRequest<CertificateUploadResult>(
    `/api/customer/certificates/${category}/${typeSlug}/file`,
    session,
    { method: 'POST', body: formData },
  );
}
