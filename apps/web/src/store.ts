import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { NormalizedSpan, StreamMessage } from '@traceverse/core';
import { validateSession } from '@traceverse/core';

export type Mode = 'demo' | 'live' | 'synthetic' | 'replay';
export const STATIC_DEMO = import.meta.env.VITE_TRACEVERSE_STATIC_DEMO === 'true';
export const SESSION_STORAGE_KEY = STATIC_DEMO
  ? 'traceverse-public-synthetic-sessions-v2'
  : 'traceverse-sessions-v1';
export interface Settings {
  theme: 'dark' | 'light';
  quality: 'auto' | 'low' | 'balanced' | 'high';
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
  quality: 'balanced',
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
    {
      name: STATIC_DEMO ? 'traceverse-public-preferences-v2' : 'traceverse-preferences-v1',
      merge: (persisted, current) => {
        const saved = (persisted as { settings?: Partial<Settings> } | undefined)?.settings || {};
        return {
          ...current,
          settings: {
            ...defaultSettings,
            ...saved,
            quality: saved.quality === 'auto' ? 'balanced' : saved.quality || 'balanced',
          },
        };
      },
    },
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
          onMessage(validateStreamMessage(JSON.parse(String(event.data))));
        } catch {
          /* Ignore malformed frames so a bad local response cannot break the dashboard. */
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
export function validateStreamMessage(input: unknown): StreamMessage {
  if (!input || typeof input !== 'object') throw new Error('Invalid collector frame');
  const message = input as Partial<StreamMessage>;
  if (!['snapshot', 'batch', 'reset'].includes(String(message.type)))
    throw new Error('Invalid collector frame type');
  const session = validateSession({
    version: 1,
    exportedAt: new Date().toISOString(),
    spans: message.spans,
  });
  return { type: message.type as StreamMessage['type'], spans: session.spans };
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
