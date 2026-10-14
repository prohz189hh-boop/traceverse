import { trace, SpanStatusCode } from '@opentelemetry/api';
import { DatabaseSync } from 'node:sqlite';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  return trace.getTracer('traceverse-nextjs-example').startActiveSpan('checkout', async (span) => {
    try {
      const item = await trace
        .getTracer('traceverse-nextjs-example')
        .startActiveSpan('lookup inventory', async (databaseSpan) => {
          databaseSpan.setAttributes({
            'db.system.name': 'sqlite',
            'db.namespace': 'nextjs-inventory',
            'db.operation.name': 'SELECT',
          });
          const db = new DatabaseSync(':memory:');
          try {
            return db.prepare("SELECT 'available' AS status").get();
          } finally {
            db.close();
            databaseSpan.end();
          }
        });
      span.setStatus({ code: SpanStatusCode.OK });
      return Response.json({ ok: true, item, traceId: span.spanContext().traceId });
    } finally {
      span.end();
    }
  });
}
