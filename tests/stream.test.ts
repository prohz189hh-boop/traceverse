import { describe, expect, it } from 'vitest';
import { validateStreamMessage } from '../apps/web/src/store';
import { createScenario } from '../apps/web/src/scenarios';

describe('collector frame boundary', () => {
  it('validates and sanitizes received spans before UI graph processing', () => {
    const span = createScenario('success')[0]!;
    const result = validateStreamMessage({
      type: 'batch',
      spans: [
        {
          ...span,
          attributes: { ...span.attributes, authorization: 'private', 'db.statement': 'private' },
        },
      ],
    });
    expect(result.spans[0]?.traceId).toBe(span.traceId);
    expect(result.spans[0]?.attributes).not.toHaveProperty('authorization');
    expect(result.spans[0]?.attributes).not.toHaveProperty('db.statement');
  });
  it('rejects malformed frames and invalid nested telemetry', () => {
    for (const input of [
      null,
      { type: 'other', spans: [] },
      { type: 'batch', spans: [null] },
      { type: 'snapshot', spans: 'invalid' },
    ])
      expect(() => validateStreamMessage(input)).toThrow();
  });
  it('accepts reset and snapshot frames from the existing collector', () => {
    expect(validateStreamMessage({ type: 'reset', spans: [] })).toEqual({
      type: 'reset',
      spans: [],
    });
    expect(
      validateStreamMessage({ type: 'snapshot', spans: createScenario('success') }).spans,
    ).toHaveLength(10);
  });
});
