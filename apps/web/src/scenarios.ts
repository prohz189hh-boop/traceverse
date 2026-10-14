import { sanitizeAttributes, type NormalizedSpan } from '@traceverse/core';

export type ScenarioId = 'success' | 'slow' | 'error' | 'heavy' | 'recovery';
export const scenarios: {
  id: ScenarioId;
  title: string;
  description: string;
  focus: string;
}[] = [
  {
    id: 'success',
    title: 'Successful request',
    description:
      'A synthetic sign-in authenticates a user, loads their profile, and completes an order with payment and notification spans.',
    focus: 'auth-service',
  },
  {
    id: 'slow',
    title: 'Slow database',
    description:
      'The order database takes 900 ms. Its parent spans contain the delay, exposing the dependency that holds up the request.',
    focus: 'database:sqlite:Database',
  },
  {
    id: 'error',
    title: 'API failure',
    description:
      'The API gateway returns a synthetic 503 with a SimulatedApiError event. Inspect the failed request and its child spans.',
    focus: 'api-gateway',
  },
  {
    id: 'heavy',
    title: 'Heavy traffic',
    description:
      'Twelve overlapping synthetic requests traverse the same dependencies. Traffic intensity changes the number of trace batches.',
    focus: 'api-gateway',
  },
  {
    id: 'recovery',
    title: 'Recovery',
    description:
      'A failed API request is followed by a successful retry. Current status returns to green while the earlier error remains available.',
    focus: 'api-gateway',
  },
];

export function createScenario(
  id: ScenarioId,
  { startTime = Date.now() - 1600, sequence = 0 }: { startTime?: number; sequence?: number } = {},
): NormalizedSpan[] {
  const scenarioIndex = scenarios.findIndex((scenario) => scenario.id === id);
  if (scenarioIndex < 0) throw new Error('Unknown synthetic scenario');
  if (!Number.isFinite(startTime) || startTime <= 0) throw new Error('Invalid scenario time');
  if (!Number.isSafeInteger(sequence) || sequence < 0) throw new Error('Invalid scenario sequence');
  const prefix = (scenarioIndex + 1).toString(16).padStart(2, '0');
  const serial = sequence.toString(16).padStart(14, '0');
  const result: NormalizedSpan[] = [];
  const count = id === 'heavy' ? 12 : id === 'recovery' ? 2 : 1;
  for (let cycle = 0; cycle < count; cycle++) {
    const failed = id === 'error' || (id === 'recovery' && cycle === 0);
    const slow = id === 'slow';
    const traceId = `${prefix}${serial}${(cycle + 1).toString(16).padStart(16, '0')}`;
    const cycleTime = startTime + cycle * (id === 'heavy' ? 35 : 500);
    const spanId = (index: number) => (cycle * 16 + index + 1).toString(16).padStart(16, '0');
    const add = (
      index: number,
      parent: number | null,
      serviceName: string,
      operation: string,
      offset: number,
      durationMs: number,
      attributes: NormalizedSpan['attributes'] = {},
      error = false,
    ) => {
      const spanStart = cycleTime + offset;
      result.push({
        traceId,
        spanId: spanId(index),
        ...(parent !== null ? { parentSpanId: spanId(parent) } : {}),
        serviceName,
        operation,
        startTime: spanStart,
        durationMs,
        status: error ? 'error' : 'ok',
        kind: attributes['db.system'] ? 3 : serviceName === 'frontend' ? 1 : 2,
        attributes: sanitizeAttributes({
          'traceverse.source': 'synthetic',
          'traceverse.scenario': id,
          ...attributes,
        }),
        events:
          error && serviceName === 'api-gateway'
            ? [
                {
                  name: 'exception',
                  time: spanStart + durationMs - 1,
                  attributes: { 'exception.type': 'SimulatedApiError' },
                },
              ]
            : [],
        source: 'synthetic',
      });
    };
    add(
      0,
      null,
      'frontend',
      'Sign in and hydrate account',
      0,
      slow ? 1250 : 380,
      { 'service.role': 'frontend' },
      failed,
    );
    add(
      1,
      0,
      'api-gateway',
      'POST /session',
      8,
      slow ? 1220 : 350,
      {
        'http.route': '/session',
        'http.request.method': 'POST',
        'http.response.status_code': failed ? 503 : 200,
      },
      failed,
    );
    add(2, 1, 'auth-service', 'Authenticate session', 18, 80);
    add(3, 2, 'auth-service', 'GET cached session', 30, 12, {
      'db.system': 'redis',
      'db.namespace': 'Cache',
      'db.operation.name': 'GET',
    });
    add(4, 2, 'user-service', 'GET /profile', 50, 38, { 'http.route': '/profile' });
    add(5, 4, 'user-service', 'SELECT profile', 55, 25, {
      'db.system': 'sqlite',
      'db.namespace': 'Database',
      'db.operation.name': 'SELECT',
    });
    add(6, 1, 'order-service', 'Hydrate order', 120, slow ? 1070 : 210);
    add(7, 6, 'order-service', 'SELECT order', 140, slow ? 900 : 40, {
      'db.system': 'sqlite',
      'db.namespace': 'Database',
      'db.operation.name': 'SELECT',
    });
    add(8, 6, 'payment-simulator', 'Authorize simulated payment', slow ? 1050 : 185, 50, {
      'traceverse.category': 'external',
    });
    add(9, 6, 'notification-service', 'Send simulated confirmation', slow ? 1110 : 265, 35);
  }
  return result.sort((a, b) => a.startTime - b.startTime);
}

/** Public previews accept synthetic data only, even when an imported file is structurally valid. */
export function assertSynthetic(spans: readonly NormalizedSpan[]): void {
  if (spans.some((span) => span.source !== 'synthetic')) {
    throw new Error(
      'The public demo accepts synthetic sessions only. Open the local app to inspect real telemetry.',
    );
  }
}
