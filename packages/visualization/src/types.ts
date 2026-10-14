import type { NormalizedSpan, ServiceGraph } from '@traceverse/core';

export type CameraAction = 'zoom-in' | 'zoom-out' | 'rotate-left' | 'rotate-right';
export interface UniverseProps {
  graph: ServiceGraph;
  spans: NormalizedSpan[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  onEdgeSelect: (id: string) => void;
  paused: boolean;
  reducedMotion: boolean;
  quality: 'auto' | 'low' | 'balanced' | 'high';
  particleDensity: number;
  intensity: number;
  cameraSpeed: number;
  latencyThreshold: number;
  resetVersion: number;
  focusVersion: number;
  direction: 'all' | 'incoming' | 'outgoing';
  replay: boolean;
  cameraCommand?: { version: number; action: CameraAction };
}
