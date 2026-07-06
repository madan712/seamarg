// Persist the auth session in the OS secure store (Keychain / Keystore) instead
// of the web frontend's sessionStorage. We store only the access token, its
// expiry, and the decoded claims — not the refresh/id tokens — to stay well
// under SecureStore's per-item size guidance and to mirror the web app, which
// simply re-authenticates when the access token expires.
import * as SecureStore from 'expo-secure-store';

import type { AuthSession } from './types';

const SESSION_KEY = 'seamarg.auth.session';

export async function loadSession(): Promise<AuthSession | null> {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    const session = JSON.parse(raw) as AuthSession;
    if (!session.accessToken || Date.now() >= session.expiresAt) {
      await clearSession();
      return null;
    }
    return session;
  } catch {
    await clearSession();
    return null;
  }
}

export async function saveSession(session: AuthSession): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}
