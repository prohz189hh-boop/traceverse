export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startTracing } = await import('@traceverse/sdk');
    startTracing('nextjs-example', {
      endpoint: process.env.TRACEVERSE_ENDPOINT ?? 'http://127.0.0.1:4318/v1/traces',
    });
  }
}
