// Auth types shared across the auth layer. Mirrors the web frontend (main.ts).

export type UserClaims = Record<string, unknown> & {
  email?: string;
  name?: string;
  sub?: string;
};

export type AuthSession = {
  accessToken: string;
  expiresAt: number; // epoch millis
  claims: UserClaims;
};

export type SignUpProfile = {
  firstName: string;
  lastName: string;
  phone: string;
  birthdate: string;
};
