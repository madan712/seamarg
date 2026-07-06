// App configuration, read from EXPO_PUBLIC_* env vars (see .env.example).
// Mirrors the web frontend's AppConfig (main.ts) but sourced from Expo env
// instead of Vite's import.meta.env.

export type AppConfig = {
  cognitoUserPoolId: string;
  cognitoClientId: string;
  apiBaseUrl: string;
};

function firstValue(...values: Array<string | undefined>): string {
  return values.find((value) => typeof value === 'string' && value.trim())?.trim() ?? '';
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export const config: AppConfig = {
  cognitoUserPoolId: firstValue(process.env.EXPO_PUBLIC_COGNITO_USER_POOL_ID),
  cognitoClientId: firstValue(process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID),
  apiBaseUrl: stripTrailingSlash(firstValue(process.env.EXPO_PUBLIC_API_BASE_URL)),
};

export function isCognitoConfigured(): boolean {
  return Boolean(config.cognitoUserPoolId && config.cognitoClientId);
}
