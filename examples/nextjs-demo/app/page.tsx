export default function Page() {
  return (
    <main>
      <p style={{ color: '#54dce5' }}>TRACEVERSE / INTEGRATION EXAMPLE</p>
      <h1>Next.js, traced locally.</h1>
      <p>
        The Node.js runtime registers the official OpenTelemetry SDK through instrumentation.ts.
        Open the route below to record an actual server operation, then select Live in TraceVerse.
      </p>
      <a style={{ color: '#54dce5' }} href="/api/checkout">
        Run checkout →
      </a>
      <p>
        <a style={{ color: '#a6adff' }} href="http://127.0.0.1:5173">
          Open TraceVerse dashboard
        </a>
      </p>
    </main>
  );
}
