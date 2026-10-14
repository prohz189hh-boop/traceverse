import type { NextConfig } from 'next';
const config: NextConfig = {
  agentRules: false,
  transpilePackages: ['@traceverse/sdk'],
  serverExternalPackages: [
    '@opentelemetry/sdk-node',
    '@opentelemetry/instrumentation-http',
    '@opentelemetry/instrumentation-express',
  ],
};
export default config;
