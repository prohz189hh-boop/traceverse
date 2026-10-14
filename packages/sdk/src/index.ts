import { trace, SpanStatusCode, type Attributes, type Span } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import type { Instrumentation } from '@opentelemetry/instrumentation';

export interface TracingOptions {
  source?: 'live' | 'demo';
  endpoint?: string;
  /** Disable automatic patching for framework-managed instrumentation, or provide your own list. */
  instrumentations?: Instrumentation[] | false;
}
export type TraceVerseSDK = NodeSDK & { flush(): Promise<void> };
/** Call once per process before importing your HTTP/Express application.
 * Uses the official OTLP/HTTP JSON exporter and no metrics or log exporters. */
export function startTracing(serviceName: string, options: TracingOptions = {}): TraceVerseSDK {
  if (!serviceName.trim() || serviceName.length > 128) throw new Error('Provide a service name from 1 to 128 characters');
  const endpoint = new URL(options.endpoint ?? 'http://127.0.0.1:4318/v1/traces');
  if (endpoint.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname) || endpoint.username || endpoint.password) {
    throw new Error('TraceVerse exports only to a local HTTP collector');
  }
  const exporter = new OTLPTraceExporter({ url: endpoint.toString(), timeoutMillis: 5000 });
  const processor = new BatchSpanProcessor(exporter, { scheduledDelayMillis: 250, maxQueueSize: 2048, maxExportBatchSize: 256 });
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({ 'service.name': serviceName, 'traceverse.source': options.source ?? 'live' }),
    autoDetectResources: false,
    spanProcessors: [processor],
    metricReaders: [],
    logRecordProcessors: [],
    instrumentations: options.instrumentations === false ? [] : options.instrumentations ?? [new HttpInstrumentation(), new ExpressInstrumentation()],
  });
  sdk.start();
  return Object.assign(sdk, { flush: () => processor.forceFlush() });
}
/** Explicit spans work for application code and libraries beyond auto-instrumented HTTP/Express. */
export async function withSpan<T>(name: string, work: (span: Span) => T | Promise<T>, attributes: Attributes = {}): Promise<T> {
  return trace.getTracer('traceverse-sdk', '0.1.0').startActiveSpan(name, { attributes }, async (span) => {
    try { const result = await work(span); span.setStatus({ code: SpanStatusCode.OK }); return result; }
    catch (error) {
      // Record the exception class; messages/stack traces can contain request secrets.
      span.addEvent('exception', { 'exception.type': error instanceof Error ? error.name : 'Error' });
      span.setStatus({ code: SpanStatusCode.ERROR }); throw error;
    } finally { span.end(); }
  });
}
export { trace, SpanStatusCode } from '@opentelemetry/api';
