export type Source = 'live' | 'demo' | 'synthetic';
export type Category = 'service' | 'frontend' | 'database' | 'external';
export type Attributes = Record<string, string | number | boolean>;
export interface SpanEvent { name: string; time: number; attributes: Attributes }
export interface NormalizedSpan {
  traceId: string; spanId: string; parentSpanId?: string;
  serviceName: string; operation: string; startTime: number; durationMs: number;
  status: 'ok' | 'error' | 'unset'; kind: number;
  attributes: Attributes; events: SpanEvent[]; source: Source;
}
export interface ServiceNode {
  id: string; name: string; category: Category; spanCount: number; errorCount: number;
  p50: number; p95: number; lastSeen: number; position: [number, number, number];
}
export interface ServiceEdge {
  id: string; source: string; target: string; spanCount: number; errorCount: number;
  p95: number; lastSeen: number;
}
export interface ServiceGraph { nodes: ServiceNode[]; edges: ServiceEdge[] }
export interface Session { version: 1; exportedAt: string; spans: NormalizedSpan[] }
export interface StreamMessage { type: 'snapshot' | 'batch' | 'reset'; spans: NormalizedSpan[] }
