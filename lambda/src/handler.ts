export interface HealthEvent {
  requestId?: string;
}

export async function handler(event: HealthEvent = {}) {
  return {
    statusCode: 200,
    body: JSON.stringify({
      service: 'seamarg-lambda',
      status: 'ok',
      requestId: event.requestId ?? null,
    }),
  };
}
