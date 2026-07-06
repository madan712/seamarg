// HTTP client for the seamarg backend. Direct port of apiRequest() from the web
// frontend (main.ts): attaches the Cognito bearer token, centralizes error and
// JSON handling, and flags an expired session on 401.
import { config } from '@/config';

import type { AuthSession } from '@/auth/types';

// Thrown on a 401 so callers (screens) can react by signing the user out.
export class SessionExpiredError extends Error {
  constructor() {
    super('Your session expired. Sign in again.');
    this.name = 'SessionExpiredError';
  }
}

export async function apiRequest<T>(
  path: string,
  session: AuthSession,
  init: RequestInit = {},
): Promise<T> {
  if (!config.apiBaseUrl) {
    throw new Error(
      'Backend API URL is not configured. Set EXPO_PUBLIC_API_BASE_URL in mobile/.env.local.',
    );
  }

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${session.accessToken}`);

  const response = await fetch(`${config.apiBaseUrl}${path}`, { ...init, headers });

  if (response.status === 401) {
    throw new SessionExpiredError();
  }

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error(`Backend API returned ${contentType || 'an unknown content type'} instead of JSON.`);
  }

  return (await response.json()) as T;
}

async function readApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === 'string' && body.message.trim()) {
      return body.message;
    }
  } catch {
    // Fall through to the generic status message.
  }
  return `Request failed with status ${response.status}.`;
}
