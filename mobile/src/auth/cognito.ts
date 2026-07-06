// Cognito wrapper. Ports the sign-in / sign-up / verify / reset helpers from the
// web frontend (main.ts) to React Native. Uses amazon-cognito-identity-js with
// USER_SRP_AUTH — identical flow to the web app, so the same user pool works.
import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserAttribute,
  CognitoUserPool,
  type CognitoUserSession,
  type ISignUpResult,
} from 'amazon-cognito-identity-js';

import { config, isCognitoConfigured } from '@/config';
import { normalizeError } from '@/lib/errors';

import type { AuthSession, SignUpProfile, UserClaims } from './types';

function getUserPool(): CognitoUserPool {
  if (!isCognitoConfigured()) {
    throw new Error('Cognito User Pool ID and app client ID are required.');
  }
  return new CognitoUserPool({
    UserPoolId: config.cognitoUserPoolId,
    ClientId: config.cognitoClientId,
  });
}

function getCognitoUser(email: string): CognitoUser {
  return new CognitoUser({ Username: email, Pool: getUserPool() });
}

export function signInWithCognito(email: string, password: string): Promise<AuthSession> {
  if (!isCognitoConfigured()) {
    return Promise.reject(new Error('Cognito User Pool ID and app client ID are required.'));
  }

  const user = getCognitoUser(email);
  const authDetails = new AuthenticationDetails({ Username: email, Password: password });
  user.setAuthenticationFlowType('USER_SRP_AUTH');

  return new Promise((resolve, reject) => {
    user.authenticateUser(authDetails, {
      onSuccess: (session) => resolve(createSessionFromCognito(session)),
      onFailure: (error: unknown) => reject(normalizeError(error)),
      newPasswordRequired: () =>
        reject(new Error('A new password is required before this account can continue.')),
      mfaRequired: () => reject(new Error('Multi-factor authentication is not supported yet.')),
      totpRequired: () => reject(new Error('Authenticator app verification is not supported yet.')),
    });
  });
}

export function signUpWithCognito(
  email: string,
  password: string,
  profile: SignUpProfile,
): Promise<ISignUpResult> {
  const fullName = `${profile.firstName} ${profile.lastName}`.trim();
  const attributes = [
    new CognitoUserAttribute({ Name: 'email', Value: email }),
    ...(profile.firstName ? [new CognitoUserAttribute({ Name: 'given_name', Value: profile.firstName })] : []),
    ...(profile.lastName ? [new CognitoUserAttribute({ Name: 'family_name', Value: profile.lastName })] : []),
    ...(fullName ? [new CognitoUserAttribute({ Name: 'name', Value: fullName })] : []),
    ...(profile.phone ? [new CognitoUserAttribute({ Name: 'phone_number', Value: profile.phone })] : []),
    ...(profile.birthdate ? [new CognitoUserAttribute({ Name: 'birthdate', Value: profile.birthdate })] : []),
  ];

  return new Promise((resolve, reject) => {
    getUserPool().signUp(email, password, attributes, [], (error, result) => {
      if (error || !result) {
        reject(normalizeError(error));
        return;
      }
      resolve(result);
    });
  });
}

export function confirmEmailWithCognito(email: string, code: string): Promise<void> {
  return new Promise((resolve, reject) => {
    getCognitoUser(email).confirmRegistration(code, true, (error) => {
      if (error) {
        reject(normalizeError(error));
        return;
      }
      resolve();
    });
  });
}

export function resendVerificationCode(email: string): Promise<void> {
  return new Promise((resolve, reject) => {
    getCognitoUser(email).resendConfirmationCode((error) => {
      if (error) {
        reject(normalizeError(error));
        return;
      }
      resolve();
    });
  });
}

export function requestPasswordReset(email: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    getCognitoUser(email).forgotPassword({
      inputVerificationCode: () => {
        settled = true;
        resolve();
      },
      onSuccess: () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      },
      onFailure: (error) => reject(normalizeError(error)),
    });
  });
}

export function confirmPasswordReset(email: string, code: string, newPassword: string): Promise<void> {
  return new Promise((resolve, reject) => {
    getCognitoUser(email).confirmPassword(code, newPassword, {
      onSuccess: () => resolve(),
      onFailure: (error) => reject(normalizeError(error)),
    });
  });
}

export function cognitoSignOut(): void {
  try {
    getUserPool().getCurrentUser()?.signOut();
  } catch {
    // Local session clearing still completes sign out when Cognito is unset.
  }
}

function createSessionFromCognito(cognitoSession: CognitoUserSession): AuthSession {
  const accessToken = cognitoSession.getAccessToken().getJwtToken();
  const idToken = cognitoSession.getIdToken().getJwtToken();
  return {
    accessToken,
    expiresAt: cognitoSession.getAccessToken().getExpiration() * 1000,
    claims: decodeJwtClaims(idToken),
  };
}

function decodeJwtClaims(token: string): UserClaims {
  const payload = token.split('.')[1];
  if (!payload) {
    return {};
  }
  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    // atob is available in Hermes (RN 0.74+).
    const json = decodeURIComponent(
      atob(padded)
        .split('')
        .map((character) => `%${character.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join(''),
    );
    return JSON.parse(json) as UserClaims;
  } catch {
    return {};
  }
}
