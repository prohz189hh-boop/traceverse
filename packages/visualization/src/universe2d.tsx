import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { boundedGraph, layoutGraph } from './layout.js';
import {
  buildObservationIndex,
  categoryColors,
  edgeRelevant,
  statusColors,
  visualStatus,
} from './observations.js';
import type { UniverseProps } from './types.js';

export function Universe2D(props: UniverseProps) {
  const graph = useMemo(
    () => boundedGraph(layoutGraph(props.graph), props.selected),
    [props.graph, props.selected],
  );
  const index = useMemo(() => buildObservationIndex(props.spans), [props.spans]);
  const unique = useId().replaceAll(':', '');
  const positions = useMemo(
    () =>
      new Map(
        graph.nodes.map((node) => [
          node.id,
          [node.position[0] * 38, node.position[2] * 34 - node.position[1] * 8] as [number, number],
        ]),
      ),
    [graph.nodes],
  );
  const fit = useMemo(() => {
    const values = [...positions.values()],
      xs = values.map((p) => p[0]),
      ys = values.map((p) => p[1]);
    const left = Math.min(-130, ...xs) - 95,
      top = Math.min(-130, ...ys) - 80;
    return [
      left,
      top,
      Math.max(440, Math.max(130, ...xs) + 95 - left),
      Math.max(300, Math.max(130, ...ys) + 100 - top),
    ];
  }, [positions]);
  const [viewport, setViewport] = useState(fit);
  const [rotation, setRotation] = useState(0);
  const appliedFocus = useRef(props.focusVersion),
    appliedReset = useRef(props.resetVersion);
  const appliedCommand = useRef(props.cameraCommand?.version ?? 0),
    initialized = useRef(false);
  useEffect(() => {
    if (!initialized.current && graph.nodes.length) {
      initialized.current = true;
      setViewport(fit);
    }
    if (appliedReset.current !== props.resetVersion) {
      appliedReset.current = props.resetVersion;
      setViewport(fit);
      setRotation(0);
    }
  }, [props.resetVersion, graph.nodes.length, fit]);
  useEffect(() => {
    if (appliedFocus.current === props.focusVersion) return;
    appliedFocus.current = props.focusVersion;
    const p = props.selected ? positions.get(props.selected) : undefined;
    if (p) setViewport([p[0] - 220, p[1] - 150, 440, 300]);
  }, [props.focusVersion, props.selected, positions]);
  useEffect(() => {
    const command = props.cameraCommand;
    if (!command || appliedCommand.current === command.version) return;
    appliedCommand.current = command.version;
    if (command.action.startsWith('rotate'))
      setRotation((value) => value + (command.action === 'rotate-left' ? -15 : 15));
    else
      setViewport((value) => {
        const factor = command.action === 'zoom-in' ? 0.8 : 1.25;
        const width = Math.max(220, Math.min(4000, value[2]! * factor)),
          height = (width * value[3]!) / value[2]!;
        return [
          value[0]! + (value[2]! - width) / 2,
          value[1]! + (value[3]! - height) / 2,
          width,
          height,
        ];
      });
  }, [props.cameraCommand]);
  return (
    <svg
      className="universe-2d"
      viewBox={viewport.join(' ')}
      role="img"
      aria-label="Service dependency graph. Services are selectable with the keyboard."
    >
      <defs>
        <marker
          id={`${unique}-arrow`}
          markerWidth="8"
          markerHeight="8"
          refX="26"
          refY="4"
          orient="auto"
        >
          <path d="M0,0 L0,8 L8,4 z" fill="#72a9b9" />
        </marker>
        <radialGradient id={`${unique}-glow`}>
          <stop stopColor="#68dfdd" stopOpacity=".18" />
          <stop offset="1" stopColor="#68dfdd" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g
        transform={`rotate(${rotation} ${viewport[0]! + viewport[2]! / 2} ${viewport[1]! + viewport[3]! / 2})`}
      >
        {graph.edges.map((edge) => {
          const a = positions.get(edge.source),
            b = positions.get(edge.target);
          if (!a || !b) return null;
          const status = visualStatus(index.latestEdge.get(edge.id), props.latencyThreshold),
            relevant = edgeRelevant(edge, props);
          const path = `M${a[0]},${a[1]} Q${(a[0] + b[0]) / 2},${(a[1] + b[1]) / 2 - 30} ${b[0]},${b[1]}`;
          return (
            <g
              key={edge.id}
              role="button"
              tabIndex={0}
              aria-label={`Inspect dependency ${edge.source} to ${edge.target}`}
              onClick={() => props.onEdgeSelect(edge.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  props.onEdgeSelect(edge.id);
                }
              }}
            >
              <path
                d={path}
                fill="none"
                stroke={statusColors[status]}
                strokeWidth={relevant ? 2 : 1}
                opacity={relevant ? 0.55 : 0.12}
                markerEnd={`url(#${unique}-arrow)`}
              />
              <path d={path} fill="none" stroke="transparent" strokeWidth="18" />
            </g>
          );
        })}
        {graph.nodes.map((node) => {
          const p = positions.get(node.id)!,
            status = visualStatus(index.latestNode.get(node.id), props.latencyThreshold);
          const color = status === 'healthy' ? categoryColors[node.category] : statusColors[status];
          return (
            <g
              key={node.id}
              role="button"
              tabIndex={0}
              aria-label={`Select ${node.name}`}
              onClick={() => props.onSelect(node.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  props.onSelect(node.id);
                }
              }}
            >
              <circle cx={p[0]} cy={p[1]} r="58" fill={`url(#${unique}-glow)`} />
              {node.category === 'database' ? (
                <rect
                  x={p[0] - 20}
                  y={p[1] - 23}
                  width="40"
                  height="46"
                  rx="12"
                  fill="#112536"
                  stroke={color}
                  strokeWidth={props.selected === node.id ? 3 : 2}
                />
              ) : node.category === 'frontend' ? (
                <path
                  d={`M${p[0]},${p[1] - 27} L${p[0] + 25},${p[1]} L${p[0]},${p[1] + 27} L${p[0] - 25},${p[1]} Z`}
                  fill="#112536"
                  stroke={color}
                  strokeWidth={props.selected === node.id ? 3 : 2}
                />
              ) : (
                <circle
                  cx={p[0]}
                  cy={p[1]}
                  r="23"
                  fill="#112536"
                  stroke={color}
                  strokeDasharray={node.category === 'external' ? '4 3' : undefined}
                  strokeWidth={props.selected === node.id ? 3 : 2}
                />
              )}
              <circle cx={p[0]} cy={p[1]} r="6" fill={color} />
              <text
                x={p[0]}
                y={p[1] + 47}
                textAnchor="middle"
                fill="#e4edf7"
                fontSize="14"
                fontWeight="600"
              >
                {node.name}
              </text>
              <text x={p[0]} y={p[1] + 65} textAnchor="middle" fill="#93abc2" fontSize="11">
                {node.spanCount} spans · {node.p95.toFixed(0)} ms
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
