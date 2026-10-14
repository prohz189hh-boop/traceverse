import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { NormalizedSpan, StreamMessage } from '@traceverse/core';

export type Mode = 'demo' | 'live' | 'synthetic' | 'replay';
export interface Settings {
  theme: 'dark' | 'light';
  quality: 'auto' | 'low' | 'high';
  reducedMotion: boolean;
  particleDensity: number;
  intensity: number;
  cameraSpeed: number;
  maxNodes: number;
  maxSpans: number;
  latencyThreshold: number;
  retentionMinutes: number;
  collectorUrl: string;
}
const defaultSettings: Settings = {
  theme: 'dark',
  quality: 'auto',
  reducedMotion:
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  particleDensity: 1,
  intensity: 1,
  cameraSpeed: 0.7,
  maxNodes: 40,
  maxSpans: 5000,
  latencyThreshold: 500,
  retentionMinutes: 30,
  collectorUrl: 'http://127.0.0.1:4318',
};
export const usePreferences = create<{
  settings: Settings;
  setSettings: (s: Partial<Settings>) => void;
}>()(
  persist(
    (set) => ({
      settings: defaultSettings,
      setSettings: (s) => set((state) => ({ settings: { ...state.settings, ...s } })),
    }),
    { name: 'traceverse-preferences-v1' },
  ),
);
export function mergeSpans(
  previous: NormalizedSpan[],
  incoming: NormalizedSpan[],
  max: number,
): NormalizedSpan[] {
  const map = new Map(previous.map((s) => [`${s.traceId}:${s.spanId}`, s]));
  for (const s of incoming) map.set(`${s.traceId}:${s.spanId}`, s);
  return [...map.values()].sort((a, b) => a.startTime - b.startTime).slice(-max);
}
export function connectCollector(
  url: string,
  onMessage: (message: StreamMessage) => void,
  onStatus: (status: 'connected' | 'connecting' | 'offline') => void,
) {
  let stopped = false,
    timer: ReturnType<typeof setTimeout> | undefined,
    socket: WebSocket | undefined,
    attempts = 0;
  function connect() {
    if (stopped) return;
    onStatus('connecting');
    try {
      const endpoint = new URL('/ws', url);
      if (
        endpoint.protocol !== 'http:' ||
        !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)
      )
        throw new Error('Only local collectors are supported');
      endpoint.protocol = 'ws:';
      socket = new WebSocket(endpoint);
      socket.onopen = () => {
        if (stopped) return;
        attempts = 0;
        onStatus('connected');
      };
      socket.onmessage = (event) => {
        if (stopped) return;
        try {
          const data = JSON.parse(String(event.data)) as StreamMessage;
          if (['snapshot', 'batch', 'reset'].includes(data.type) && Array.isArray(data.spans))
            onMessage(data);
        } catch {
          /* Ignore invalid frames; the collector validates normalized telemetry. */
        }
      };
      socket.onclose = () => {
        if (stopped) return;
        onStatus('offline');
        if (!stopped) timer = setTimeout(connect, Math.min(10000, 1000 * 2 ** attempts++));
      };
      socket.onerror = () => socket?.close();
    } catch {
      onStatus('offline');
      timer = setTimeout(connect, 5000);
    }
  }
  connect();
  return () => {
    stopped = true;
    clearTimeout(timer);
    if (socket) {
      socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
      if (socket.readyState < WebSocket.CLOSING) socket.close();
    }
  };
}
export function syntheticSpans(): NormalizedSpan[] {
  const result: NormalizedSpan[] = [];
  const start = Date.now() - 60000;
  const flow = [
    ['web-frontend', 'GET /checkout', -1, 'frontend'],
    ['api-gateway', 'POST /orders', 0, 'service'],
    ['user-service', 'GET /users/:id', 1, 'service'],
    ['order-service', 'create order', 1, 'service'],
    ['order-service', 'SELECT orders', 3, 'database'],
    ['payment-provider', 'POST /authorize', 3, 'external'],
  ] as const;
  for (let trace = 0; trace < 36; trace++) {
    const traceId = (trace + 1).toString(16).padStart(32, '0');
    for (let i = 0; i < flow.length; i++) {
      const f = flow[i]!;
      const error = trace % 11 === 5 && (i === 1 || i === 3 || i === 5);
      const slow = trace % 8 === 3 && i === 4;
      const duration = slow ? 820 + i * 13 : 45 + i * 18 + (trace % 7) * 9;
      result.push({
        traceId,
        spanId: (trace * 10 + i + 1).toString(16).padStart(16, '0'),
        parentSpanId:
          f[2] === -1 ? undefined : (trace * 10 + f[2] + 1).toString(16).padStart(16, '0'),
        serviceName: f[0],
        operation: f[1],
        startTime: start + trace * 1500 + i * 20,
        durationMs: duration,
        status: error ? 'error' : 'ok',
        kind: i === 4 ? 3 : 2,
        attributes: {
          'traceverse.synthetic': true,
          'traceverse.category': f[3],
          ...(i === 4 ? { 'db.system': 'sqlite', 'db.name': 'orders' } : {}),
          ...(i === 5 ? { 'server.address': 'payment.local' } : {}),
          'http.route': f[1],
        },
        events: error
          ? [
              {
                name: 'exception',
                time: start + trace * 1500 + duration,
                attributes: {
                  'exception.type': 'PaymentUnavailable',
                  'exception.message': 'Synthetic payment provider timeout',
                },
              },
            ]
          : [],
        source: 'synthetic',
      });
    }
  }
  return result;
}
export function download(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(href), 30000);
}
