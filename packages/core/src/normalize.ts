import type { Attributes, NormalizedSpan, Session, Source } from './types.js';

const safeKeys = new Set([
  'service.name', 'service.namespace', 'service.version', 'service.role', 'traceverse.category',
  'traceverse.source', 'http.request.method', 'http.method', 'http.route', 'http.response.status_code',
  'http.status_code', 'url.full', 'http.url', 'url.path', 'server.address', 'server.port',
  'network.peer.address', 'net.peer.name', 'net.peer.port', 'peer.service', 'db.system',
  'db.system.name', 'db.name', 'db.namespace', 'db.operation', 'db.operation.name',
  'error.type', 'exception.type', 'rpc.system', 'rpc.service', 'rpc.method', 'messaging.system',
  'messaging.operation.type', 'traceverse.scenario',
]);
const idPatterns = { trace: /^[a-f\d]{32}$/i, span: /^[a-f\d]{16}$/i };
function record(input: unknown, label: string): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(`Invalid ${label}`);
  return input as Record<string, unknown>;
}
function array(input: unknown, label: string): unknown[] {
  if (!Array.isArray(input)) throw new Error(`Invalid ${label}`);
  return input;
}
function cleanText(value: string, max = 256): string {
  // eslint-disable-next-line no-control-regex -- Explicitly remove ASCII controls from untrusted telemetry labels.
  return value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
}
function safeString(key: string, value: string): string {
  if (key === 'url.full' || key === 'http.url') {
    try {
      const url = new URL(value);
      url.username = ''; url.password = ''; url.search = ''; url.hash = '';
      return cleanText(url.toString(), 512);
    } catch { return cleanText(value.split(/[?#]/)[0] ?? '', 512); }
  }
  return cleanText(value.split(/[?#]/)[0] ?? '');
}
/** Only retain a small semantic-convention allowlist. Bodies, queries, tokens,
 * SQL statements, arbitrary custom attributes and exception messages are omitted. */
export function sanitizeAttributes(input: unknown): Attributes {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const output: Attributes = {};
  for (const [key, value] of Object.entries(input)) {
    if (!safeKeys.has(key)) continue;
    if (typeof value === 'string') output[key] = safeString(key, value);
    else if (typeof value === 'boolean') output[key] = value;
    else if (typeof value === 'number' && Number.isFinite(value)) output[key] = value;
  }
  return output;
}
function otlpAttributes(input: unknown): Attributes {
  if (input === undefined) return {};
  const decoded: Record<string, unknown> = {};
  for (const entry of array(input, 'attributes').slice(0, 128)) {
    const item = record(entry, 'attribute');
    if (typeof item.key !== 'string' || !safeKeys.has(item.key)) continue;
    const value = record(item.value, 'attribute value');
    if (typeof value.stringValue === 'string') decoded[item.key] = value.stringValue;
    else if (typeof value.boolValue === 'boolean') decoded[item.key] = value.boolValue;
    else if (typeof value.doubleValue === 'number') decoded[item.key] = value.doubleValue;
    else if (typeof value.intValue === 'string' || typeof value.intValue === 'number') {
      const number = Number(value.intValue);
      if (Number.isSafeInteger(number)) decoded[item.key] = number;
    }
  }
  return sanitizeAttributes(decoded);
}
function id(input: unknown, kind: 'trace' | 'span'): string {
  if (typeof input !== 'string' || !idPatterns[kind].test(input) || /^0+$/.test(input)) {
    throw new Error(`Invalid ${kind} ID`);
  }
  return input.toLowerCase();
}
function nanos(input: unknown): number {
  if ((typeof input !== 'string' && typeof input !== 'number') || !/^\d{1,20}$/.test(String(input))) {
    throw new Error('Invalid span timestamp');
  }
  const time = Number(BigInt(String(input))) / 1e6;
  if (!Number.isFinite(time) || time <= 0 || time > 8640000000000000) throw new Error('Invalid span timestamp');
  return time;
}
function source(input: unknown): Source {
  return input === 'demo' || input === 'synthetic' ? input : 'live';
}
function statusCode(input: unknown): NormalizedSpan['status'] {
  if (input === 2 || input === 'STATUS_CODE_ERROR') return 'error';
  if (input === 1 || input === 'STATUS_CODE_OK') return 'ok';
  if (input === undefined || input === 0 || input === 'STATUS_CODE_UNSET') return 'unset';
  throw new Error('Invalid span status');
}
const kinds: Record<string, number> = {
  SPAN_KIND_UNSPECIFIED: 0, SPAN_KIND_INTERNAL: 1, SPAN_KIND_SERVER: 2,
  SPAN_KIND_CLIENT: 3, SPAN_KIND_PRODUCER: 4, SPAN_KIND_CONSUMER: 5,
};
/** OTLP/HTTP JSON only: IDs are hex, timestamps are Unix nanoseconds. */
export function normalizeOtlp(payload: unknown): NormalizedSpan[] {
  const root = record(payload, 'OTLP payload');
  const spans: NormalizedSpan[] = [];
  const seen = new Set<string>();
  for (const resourceInput of array(root.resourceSpans, 'resourceSpans')) {
    const resourceSpan = record(resourceInput, 'resource span');
    const resource = resourceSpan.resource === undefined ? {} : record(resourceSpan.resource, 'resource');
    const resourceAttributes = otlpAttributes(resource.attributes);
    const serviceName = typeof resourceAttributes['service.name'] === 'string'
      ? resourceAttributes['service.name'] : 'unknown_service';
    for (const scopeInput of array(resourceSpan.scopeSpans ?? resourceSpan.instrumentationLibrarySpans ?? [], 'scopeSpans')) {
      const scope = record(scopeInput, 'scope span');
      for (const spanInput of array(scope.spans ?? [], 'spans')) {
        if (spans.length >= 5000) throw new Error('Too many spans in one request');
        const raw = record(spanInput, 'span');
        const traceId = id(raw.traceId, 'trace');
        const spanId = id(raw.spanId, 'span');
        const identity = `${traceId}:${spanId}`;
        const startTime = nanos(raw.startTimeUnixNano);
        const endTime = nanos(raw.endTimeUnixNano);
        if (endTime < startTime || endTime - startTime > 86400000) throw new Error('Invalid span duration');
        if (typeof raw.name !== 'string' || !raw.name.trim()) throw new Error('Invalid span name');
        const attributes = sanitizeAttributes({ ...resourceAttributes, ...otlpAttributes(raw.attributes) });
        const rawKind = typeof raw.kind === 'string' ? kinds[raw.kind] : (raw.kind ?? 0);
        if (typeof rawKind !== 'number' || !Number.isInteger(rawKind) || rawKind < 0 || rawKind > 5) throw new Error('Invalid span kind');
        const rawStatus = raw.status === undefined ? {} : record(raw.status, 'span status');
        const events = array(raw.events ?? [], 'span events').slice(0, 32).map((eventInput) => {
          const event = record(eventInput, 'span event');
          if (typeof event.name !== 'string') throw new Error('Invalid event name');
          return {
            name: event.name === 'exception' ? 'exception' : 'event',
            time: event.timeUnixNano === undefined ? startTime : nanos(event.timeUnixNano),
            attributes: otlpAttributes(event.attributes),
          };
        });
        const parentSpanId = raw.parentSpanId === undefined || raw.parentSpanId === '' || raw.parentSpanId === '0000000000000000'
          ? undefined : id(raw.parentSpanId, 'span');
        if (parentSpanId === spanId) throw new Error('Span cannot be its own parent');
        const normalizedStatus = statusCode(rawStatus.code);
        const status = normalizedStatus === 'unset' && Number(attributes['http.response.status_code'] ?? attributes['http.status_code']) >= 500 ? 'error' : normalizedStatus;
        if (!seen.has(identity)) spans.push({
          traceId, spanId, ...(parentSpanId ? { parentSpanId } : {}),
          serviceName: cleanText(serviceName || 'unknown_service', 128),
          operation: cleanText(raw.name.split(/[?#]/)[0] ?? '', 256),
          startTime, durationMs: endTime - startTime, status,
          kind: rawKind, attributes, events, source: source(resourceAttributes['traceverse.source']),
        });
        seen.add(identity);
      }
    }
  }
  return spans;
}
/** Validate and re-sanitize imported sessions instead of trusting exported JSON. */
export function validateSession(input: unknown): Session {
  const session = record(input, 'session');
  if (session.version !== 1 || typeof session.exportedAt !== 'string' || !Number.isFinite(Date.parse(session.exportedAt))) {
    throw new Error('Unsupported or invalid session');
  }
  const items = array(session.spans, 'session spans');
  if (items.length > 100000) throw new Error('Session exceeds 100000 spans');
  const seen = new Set<string>();
  const spans: NormalizedSpan[] = [];
  for (const item of items) {
    const span = record(item, 'session span');
    const traceId = id(span.traceId, 'trace'); const spanId = id(span.spanId, 'span');
    if (typeof span.serviceName !== 'string' || !span.serviceName.trim() || typeof span.operation !== 'string' || !span.operation.trim()) throw new Error('Invalid session span name');
    if (typeof span.startTime !== 'number' || !Number.isFinite(span.startTime) || span.startTime <= 0 || span.startTime > 8640000000000000 || typeof span.durationMs !== 'number' || !Number.isFinite(span.durationMs) || span.durationMs < 0 || span.durationMs > 86400000) throw new Error('Invalid session span time');
    if (span.status !== 'ok' && span.status !== 'error' && span.status !== 'unset') throw new Error('Invalid session span status');
    if (typeof span.kind !== 'number' || !Number.isInteger(span.kind) || span.kind < 0 || span.kind > 5) throw new Error('Invalid session span kind');
    const parentSpanId = span.parentSpanId === undefined ? undefined : id(span.parentSpanId, 'span');
    if (parentSpanId === spanId) throw new Error('Span cannot be its own parent');
    const events = array(span.events ?? [], 'session events').slice(0, 32).map((eventInput) => {
      const event = record(eventInput, 'session event');
      if (typeof event.name !== 'string' || typeof event.time !== 'number' || !Number.isFinite(event.time)) throw new Error('Invalid session event');
      return { name: event.name === 'exception' ? 'exception' : 'event', time: event.time, attributes: sanitizeAttributes(event.attributes) };
    });
    const identity = `${traceId}:${spanId}`;
    if (!seen.has(identity)) spans.push({
      traceId, spanId, ...(parentSpanId ? { parentSpanId } : {}),
      serviceName: cleanText(span.serviceName, 128), operation: cleanText(span.operation.split(/[?#]/)[0] ?? ''),
      startTime: span.startTime, durationMs: span.durationMs, status: span.status,
      kind: span.kind, attributes: sanitizeAttributes(span.attributes), events, source: source(span.source),
    });
    seen.add(identity);
  }
  return { version: 1, exportedAt: new Date(session.exportedAt).toISOString(), spans };
}
