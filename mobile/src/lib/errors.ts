// Normalize the assorted shapes Cognito / fetch throw into a plain Error with a
// stable `name` and human-readable `message`. Mirrors normalizeError in the web
// frontend (main.ts).
export function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  if (error && typeof error === 'object') {
    const record = error as { name?: unknown; message?: unknown; code?: unknown };
    const message =
      typeof record.message === 'string' && record.message.trim()
        ? record.message
        : 'Something went wrong. Please try again.';
    const normalized = new Error(message);
    if (typeof record.name === 'string') {
      normalized.name = record.name;
    } else if (typeof record.code === 'string') {
      normalized.name = record.code;
    }
    return normalized;
  }

  return new Error('Something went wrong. Please try again.');
}
