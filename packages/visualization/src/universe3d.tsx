import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ElementRef,
  type ReactNode,
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei/core/OrbitControls.js';
import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  Line as ThreeLine,
  LineBasicMaterial,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  TOUCH,
  Vector3,
  type InstancedMesh,
  type Mesh,
  type PerspectiveCamera,
} from 'three';
import type { Category, ServiceEdge, ServiceGraph, ServiceNode } from '@traceverse/core';
import { boundedGraph, graphBounds, layoutGraph } from './layout.js';
import {
  buildObservationIndex,
  categoryColors,
  edgeRelevant,
  particleObservations,
  spanEnd,
  statusColors,
  visualStatus,
  type ObservationIndex,
  type VisualStatus,
} from './observations.js';
import type { UniverseProps } from './types.js';
import { Universe2D } from './universe2d.js';

function createResources(low: boolean) {
  const shapes: Record<Category, BufferGeometry> = {
    service: new SphereGeometry(0.76, low ? 16 : 24, low ? 10 : 16),
    frontend: new OctahedronGeometry(0.97, 0),
    database: new CylinderGeometry(0.72, 0.72, 1.15, low ? 16 : 24),
    external: new IcosahedronGeometry(0.84, 0),
  };
  const ring = new TorusGeometry(1.04, 0.018, 5, low ? 32 : 48);
  const core = new SphereGeometry(0.24, 10, 8);
  const particle = new SphereGeometry(0.075, 6, 5);
  const arrow = new ConeGeometry(0.075, 0.22, 5);
  const palette = { ...categoryColors, slow: statusColors.slow, error: statusColors.error };
  const body = Object.fromEntries(
    Object.entries(palette).map(([key, color]) => [
      key,
      new MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.52,
        metalness: 0.4,
        roughness: 0.32,
      }),
    ]),
  ) as Record<keyof typeof palette, MeshStandardMaterial>;
  const glow = Object.fromEntries(
    Object.entries(palette).map(([key, color]) => [
      key,
      new MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.065,
        blending: AdditiveBlending,
        depthWrite: false,
        side: BackSide,
      }),
    ]),
  ) as Record<keyof typeof palette, MeshBasicMaterial>;
  const bright = Object.fromEntries(
    Object.entries(palette).map(([key, color]) => [
      key,
      new MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }),
    ]),
  ) as Record<keyof typeof palette, MeshBasicMaterial>;
  const particleMaterial = new MeshBasicMaterial({
    color: '#ffffff',
    transparent: true,
    opacity: 0.95,
    toneMapped: false,
  });
  return {
    shapes,
    ring,
    core,
    particle,
    arrow,
    body,
    glow,
    bright,
    particleMaterial,
    dispose() {
      [...Object.values(shapes), ring, core, particle, arrow].forEach((geometry) =>
        geometry.dispose(),
      );
      [
        ...Object.values(body),
        ...Object.values(glow),
        ...Object.values(bright),
        particleMaterial,
      ].forEach((material) => material.dispose());
    },
  };
}
type Resources = ReturnType<typeof createResources>;
function curveFor(a: ServiceNode, b: ServiceNode): CatmullRomCurve3 {
  const from = new Vector3(...a.position),
    to = new Vector3(...b.position);
  const mid = from.clone().lerp(to, 0.5);
  mid.y += Math.min(2.5, from.distanceTo(to) * 0.13 + 0.4);
  return new CatmullRomCurve3([from, mid, to]);
}
interface ConnectionShape {
  curve: CatmullRomCurve3;
  geometry: BufferGeometry;
  arrowPosition: Vector3;
  arrowRotation: Quaternion;
}

function Service({
  node,
  props,
  index,
  resources,
}: {
  node: ServiceNode;
  props: UniverseProps;
  index: ObservationIndex;
  resources: Resources;
}) {
  const [hovered, setHovered] = useState(false);
  const shell = useRef<Mesh>(null),
    ring = useRef<Mesh>(null);
  const latest = index.latestNode.get(node.id),
    status = visualStatus(latest, props.latencyThreshold);
  const key = status === 'healthy' ? node.category : status;
  const selected = props.selected === node.id;
  useFrame(({ clock }) => {
    const active =
      latest &&
      (props.replay || spanEnd(latest) > Date.now() - 4000) &&
      !props.paused &&
      !props.reducedMotion;
    const pulse = active ? (1 + Math.sin(clock.elapsedTime * 3 + node.position[0])) * 0.045 : 0;
    shell.current?.scale.setScalar((selected ? 1.5 : hovered ? 1.4 : 1.27) + pulse);
    if (ring.current)
      ring.current.scale.setScalar((selected ? 1.13 : hovered ? 1.06 : 1) + pulse * 0.65);
  });
  return (
    <group position={node.position} dispose={null}>
      <mesh
        geometry={resources.shapes[node.category]}
        material={resources.body[key]}
        rotation={node.category === 'external' ? [0.2, 0.3, 0.2] : undefined}
        onClick={(event) => {
          event.stopPropagation();
          props.onSelect(node.id);
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = 'auto';
        }}
      />
      <mesh
        ref={shell}
        geometry={resources.shapes[node.category]}
        material={resources.glow[key]}
        scale={selected ? 1.5 : 1.27}
      />
      <mesh
        geometry={resources.core}
        material={resources.bright[key]}
        position={[0, 0.08, 0.51]}
        scale={selected ? 1.2 : 1}
      />
      <mesh
        ref={ring}
        geometry={resources.ring}
        material={resources.bright[key]}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.83, 0]}
      />
      {selected && (
        <mesh
          geometry={resources.ring}
          material={resources.bright[key]}
          rotation={[0.15, 0.25, 0.05]}
          scale={1.32}
        />
      )}
    </group>
  );
}
function Connection({
  edge,
  shape,
  props,
  index,
  resources,
}: {
  edge: ServiceEdge;
  shape: ConnectionShape;
  props: UniverseProps;
  index: ObservationIndex;
  resources: Resources;
}) {
  const status = visualStatus(index.latestEdge.get(edge.id), props.latencyThreshold),
    relevant = edgeRelevant(edge, props);
  const line = useMemo(
    () =>
      new ThreeLine(
        shape.geometry,
        new LineBasicMaterial({
          color: statusColors[status],
          transparent: true,
          opacity: relevant ? 0.52 : 0.085,
          depthWrite: false,
        }),
      ),
    [shape.geometry, status, relevant],
  );
  useEffect(
    () => () => {
      (line.material as LineBasicMaterial).dispose();
    },
    [line],
  );
  return (
    <group dispose={null}>
      <primitive
        object={line}
        onClick={(event: { stopPropagation(): void }) => {
          event.stopPropagation();
          props.onEdgeSelect(edge.id);
        }}
      />
      {relevant && (
        <mesh
          geometry={resources.arrow}
          material={resources.bright[status === 'healthy' ? 'service' : status]}
          position={shape.arrowPosition}
          quaternion={shape.arrowRotation}
        />
      )}
    </group>
  );
}
function Activity({
  graph,
  props,
  index,
  shapes,
  resources,
  now,
}: {
  graph: ServiceGraph;
  props: UniverseProps;
  index: ObservationIndex;
  shapes: Map<string, ConnectionShape>;
  resources: Resources;
  now: number;
}) {
  const observations = useMemo(
    () => particleObservations(graph, index, props, now),
    [
      graph,
      index,
      props.quality,
      props.particleDensity,
      props.selected,
      props.direction,
      props.replay,
      now,
    ],
  );
  const mesh = useRef<InstancedMesh>(null);
  const matrix = useMemo(() => new Matrix4(), []),
    point = useMemo(() => new Vector3(), []);
  useEffect(() => {
    if (!mesh.current) return;
    observations.forEach((item, i) =>
      mesh.current!.setColorAt(
        i,
        new Color(statusColors[visualStatus(item.span, props.latencyThreshold)]),
      ),
    );
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
  }, [observations, props.latencyThreshold]);
  useFrame(({ clock }) => {
    if (!mesh.current) return;
    for (let i = 0; i < observations.length; i++) {
      const item = observations[i]!,
        shape = shapes.get(item.edgeId);
      if (!shape) continue;
      const duration = Math.max(1.3, Math.min(5, item.span.durationMs / 160));
      const phase =
        ((clock.elapsedTime * Math.max(0.1, props.intensity)) / duration + item.offset) % 1;
      shape.curve.getPoint(phase, point);
      matrix.makeTranslation(point.x, point.y, point.z);
      mesh.current.setMatrixAt(i, matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  });
  if (!observations.length || props.paused || props.reducedMotion) return null;
  return (
    <instancedMesh
      ref={mesh}
      args={[resources.particle, resources.particleMaterial, observations.length]}
      frustumCulled={false}
      dispose={null}
    />
  );
}

function Camera({ props, graph }: { props: UniverseProps; graph: ServiceGraph }) {
  const controls = useRef<ElementRef<typeof OrbitControls>>(null);
  const { camera, size, invalidate } = useThree();
  const destination = useRef<{ position: Vector3; target: Vector3 } | null>(null);
  const initialized = useRef(false),
    userMoved = useRef(false);
  const appliedFocus = useRef(props.focusVersion),
    appliedReset = useRef(props.resetVersion),
    appliedCommand = useRef(props.cameraCommand?.version ?? 0);
  const topology = graph.nodes.map((node) => `${node.id}:${node.position.join(',')}`).join('|');
  const move = (position: Vector3, target: Vector3, immediate = false) => {
    if (props.reducedMotion || immediate) {
      camera.position.copy(position);
      controls.current?.target.copy(target);
      controls.current?.update();
      destination.current = null;
    } else destination.current = { position, target };
    invalidate();
  };
  const fit = () => {
    const { center } = graphBounds(graph.nodes),
      target = new Vector3(...center);
    const direction = new Vector3(0.25, 0.9, 1.7).normalize();
    const right = new Vector3(direction.z, 0, -direction.x).normalize(),
      up = new Vector3().crossVectors(direction, right).normalize();
    let horizontal = 3,
      vertical = 2.6,
      depth = 0;
    for (const node of graph.nodes) {
      const offset = new Vector3(...node.position).sub(target);
      horizontal = Math.max(horizontal, Math.abs(offset.dot(right)) + 1.7);
      vertical = Math.max(vertical, Math.abs(offset.dot(up)) + 1.9);
      depth = Math.max(depth, offset.dot(direction));
    }
    const tangent = Math.tan(((camera as PerspectiveCamera).fov * Math.PI) / 360);
    const distance =
      Math.max(
        10,
        horizontal / (tangent * Math.max(0.45, size.width / Math.max(1, size.height))),
        vertical / tangent,
      ) + depth;
    return { target, position: target.clone().addScaledVector(direction, distance) };
  };
  useEffect(() => {
    if (!graph.nodes.length) return;
    const resetting = appliedReset.current !== props.resetVersion;
    if (!initialized.current || resetting || !userMoved.current) {
      const goal = fit();
      move(goal.position, goal.target, !initialized.current);
      initialized.current = true;
      appliedReset.current = props.resetVersion;
      if (resetting) userMoved.current = false;
    }
  }, [topology, props.resetVersion, size.width, size.height]);
  useEffect(() => {
    if (appliedFocus.current === props.focusVersion) return;
    appliedFocus.current = props.focusVersion;
    const node = graph.nodes.find((item) => item.id === props.selected);
    if (!node) return;
    userMoved.current = true;
    const target = new Vector3(...node.position);
    move(target.clone().add(new Vector3(2.3, 4.3, 7.5)), target);
  }, [props.focusVersion, props.selected, topology]);
  useEffect(() => {
    const command = props.cameraCommand;
    if (!command || appliedCommand.current === command.version || !controls.current) return;
    appliedCommand.current = command.version;
    userMoved.current = true;
    const target = controls.current.target.clone(),
      offset = camera.position.clone().sub(target);
    if (command.action.startsWith('rotate'))
      offset.applyAxisAngle(new Vector3(0, 1, 0), command.action === 'rotate-left' ? -0.3 : 0.3);
    else
      offset.setLength(
        Math.max(3.5, Math.min(100, offset.length() * (command.action === 'zoom-in' ? 0.8 : 1.25))),
      );
    move(target.clone().add(offset), target);
  }, [props.cameraCommand]);
  useFrame((_, delta) => {
    const goal = destination.current;
    if (!goal || !controls.current) return;
    const blend = props.reducedMotion ? 1 : Math.min(1, delta * (5 + props.cameraSpeed * 2));
    camera.position.lerp(goal.position, blend);
    controls.current.target.lerp(goal.target, blend);
    controls.current.update();
    if (
      camera.position.distanceToSquared(goal.position) < 0.0001 &&
      controls.current.target.distanceToSquared(goal.target) < 0.0001
    ) {
      camera.position.copy(goal.position);
      controls.current.target.copy(goal.target);
      controls.current.update();
      destination.current = null;
    } else invalidate();
  });
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping={!props.reducedMotion}
      dampingFactor={0.09}
      rotateSpeed={props.cameraSpeed}
      zoomSpeed={0.85}
      minDistance={3.5}
      maxDistance={100}
      touches={{ ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }}
      onStart={() => {
        userMoved.current = true;
        destination.current = null;
      }}
    />
  );
}

function ProjectedLabels({
  graph,
  selected,
  labels,
}: {
  graph: ServiceGraph;
  selected: string | null;
  labels: Map<string, HTMLDivElement>;
}) {
  const { camera, size } = useThree();
  const vector = useMemo(() => new Vector3(), []);
  useFrame(() => {
    const occupied: { x: number; y: number; width: number; height: number }[] = [];
    const ordered = [...graph.nodes].sort(
      (a, b) => Number(b.id === selected) - Number(a.id === selected),
    );
    for (const node of ordered) {
      const label = labels.get(node.id);
      if (!label) continue;
      vector.set(node.position[0], node.position[1] - 1.25, node.position[2]).project(camera);
      if (vector.z < -1 || vector.z > 1 || Math.abs(vector.x) > 1.05 || Math.abs(vector.y) > 1.1) {
        label.style.visibility = 'hidden';
        continue;
      }
      const width = label.offsetWidth || 135,
        height = label.offsetHeight || 40;
      const x = Math.max(
        width / 2 + 7,
        Math.min(size.width - width / 2 - 7, (vector.x * 0.5 + 0.5) * size.width),
      );
      const baseY = (-vector.y * 0.5 + 0.5) * size.height;
      let placement: { x: number; y: number; width: number; height: number } | undefined;
      for (const shift of [0, 23, -23, 46, -46, 69, -69]) {
        const y = Math.max(height / 2 + 6, Math.min(size.height - height / 2 - 6, baseY + shift));
        const rect = { x: x - width / 2, y: y - height / 2, width, height };
        if (
          occupied.every(
            (other) =>
              rect.x + rect.width + 5 < other.x ||
              other.x + other.width + 5 < rect.x ||
              rect.y + rect.height + 4 < other.y ||
              other.y + other.height + 4 < rect.y,
          )
        ) {
          placement = rect;
          break;
        }
      }
      if (!placement) {
        label.style.visibility = 'hidden';
        continue;
      }
      occupied.push(placement);
      label.style.visibility = 'visible';
      label.style.transform = `translate(${x}px,${placement.y + height / 2}px) translate(-50%,-50%)`;
    }
  });
  return null;
}
function RendererStatus({
  root,
  onFail,
}: {
  root: React.RefObject<HTMLDivElement | null>;
  onFail: () => void;
}) {
  const { gl } = useThree();
  const frame = useRef(0),
    sampled = useRef(0);
  useEffect(() => {
    const lost = (event: Event) => {
      event.preventDefault();
      onFail();
    };
    gl.domElement.addEventListener('webglcontextlost', lost);
    return () => gl.domElement.removeEventListener('webglcontextlost', lost);
  }, [gl, onFail]);
  useFrame(({ clock }) => {
    frame.current++;
    if (!root.current) return;
    if (frame.current === 1) root.current.dataset.ready = 'true';
    root.current.dataset.frameCount = String(frame.current);
    if (frame.current === 1 || clock.elapsedTime - sampled.current >= 1) {
      sampled.current = clock.elapsedTime;
      root.current.dataset.drawCalls = String(gl.info.render.calls);
      root.current.dataset.triangles = String(gl.info.render.triangles);
    }
  });
  return null;
}
function Scene({
  props,
  graph,
  labels,
  root,
  now,
  onFail,
  index,
}: {
  props: UniverseProps;
  graph: ServiceGraph;
  labels: Map<string, HTMLDivElement>;
  root: React.RefObject<HTMLDivElement | null>;
  now: number;
  onFail: () => void;
  index: ObservationIndex;
}) {
  const low = props.quality === 'low';
  const resources = useMemo(() => createResources(low), [low]);
  useEffect(() => () => resources.dispose(), [resources]);
  const topology =
    graph.nodes.map((node) => `${node.id}:${node.position.join(',')}`).join('|') +
    graph.edges.map((edge) => edge.id).join('|');
  const shapes = useMemo(() => {
    const lookup = new Map(graph.nodes.map((node) => [node.id, node])),
      result = new Map<string, ConnectionShape>();
    for (const edge of graph.edges) {
      const a = lookup.get(edge.source),
        b = lookup.get(edge.target);
      if (!a || !b) continue;
      const curve = curveFor(a, b);
      result.set(edge.id, {
        curve,
        geometry: new BufferGeometry().setFromPoints(curve.getPoints(low ? 24 : 40)),
        arrowPosition: curve.getPoint(0.72),
        arrowRotation: new Quaternion().setFromUnitVectors(
          new Vector3(0, 1, 0),
          curve.getTangent(0.72).normalize(),
        ),
      });
    }
    return result;
  }, [topology, low]);
  useEffect(
    () => () => {
      for (const shape of shapes.values()) shape.geometry.dispose();
    },
    [shapes],
  );
  const stars = useMemo(() => {
    const points = new Float32Array(100 * 3);
    for (let i = 0; i < points.length; i++) points[i] = Math.sin(i * 127.1 + 37.3) * 33;
    return points;
  }, []);
  return (
    <>
      <ambientLight intensity={0.75} />
      <pointLight position={[2, 12, 7]} intensity={100} color="#b8d9ff" />
      <pointLight position={[-10, 2, -5]} intensity={45} color="#a68cff" />
      {!low && (
        <points>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[stars, 3]} />
          </bufferGeometry>
          <pointsMaterial
            color="#8ab1c8"
            size={0.022}
            transparent
            opacity={0.3}
            depthWrite={false}
          />
        </points>
      )}
      {graph.edges.map((edge) => {
        const shape = shapes.get(edge.id);
        return shape ? (
          <Connection
            key={edge.id}
            edge={edge}
            shape={shape}
            props={props}
            index={index}
            resources={resources}
          />
        ) : null;
      })}
      {graph.nodes.map((node) => (
        <Service key={node.id} node={node} props={props} index={index} resources={resources} />
      ))}
      <Activity
        graph={graph}
        props={props}
        index={index}
        shapes={shapes}
        resources={resources}
        now={now}
      />
      <Camera props={props} graph={graph} />
      <ProjectedLabels graph={graph} selected={props.selected} labels={labels} />
      <RendererStatus root={root} onFail={onFail} />
    </>
  );
}
class CanvasBoundary extends Component<
  { children: ReactNode; onFail: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFail();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
export function Universe(props: UniverseProps) {
  const [failed, setFailed] = useState(false),
    [now, setNow] = useState(Date.now);
  const root = useRef<HTMLDivElement>(null),
    labels = useRef(new Map<string, HTMLDivElement>());
  const graph = useMemo(
    () => boundedGraph(layoutGraph(props.graph), props.selected),
    [props.graph, props.selected],
  );
  const index = useMemo(() => buildObservationIndex(props.spans), [props.spans]);
  const motionActive =
    !props.paused &&
    !props.reducedMotion &&
    (props.replay || graph.nodes.some((node) => node.lastSeen > now - 10000));
  useEffect(() => {
    if (!motionActive) return;
    const timer = setInterval(() => setNow(Date.now()), 2000);
    return () => {
      clearInterval(timer);
      document.body.style.cursor = 'auto';
    };
  }, [motionActive]);
  const low = props.quality === 'low';
  const dpr: number | [number, number] = low ? 1 : props.quality === 'high' ? [1, 2] : [1, 1.5];
  if (failed)
    return (
      <div className="gpu-fallback universe-scene" data-ready="true" data-renderer="2d">
        <p>3D is unavailable on this device. Explore the same telemetry in 2D.</p>
        <Universe2D {...props} />
      </div>
    );
  return (
    <div
      className="universe-scene"
      ref={root}
      data-ready="false"
      data-frame-count="0"
      data-draw-calls="0"
      data-triangles="0"
      data-renderer="3d"
      data-visible-nodes={graph.nodes.length}
      data-particle-limit={low ? 32 : props.quality === 'high' ? 160 : 96}
    >
      <CanvasBoundary onFail={() => setFailed(true)}>
        <Canvas
          camera={{ position: [3, 12, 22], fov: 44 }}
          dpr={dpr}
          frameloop={motionActive ? 'always' : 'demand'}
          gl={{ antialias: !low, powerPreference: 'low-power', alpha: true }}
          onCreated={({ raycaster }) => {
            raycaster.params.Line.threshold = 0.24;
          }}
          onPointerMissed={() => props.onSelect(null)}
        >
          <Suspense fallback={null}>
            <Scene
              props={props}
              graph={graph}
              labels={labels.current}
              root={root}
              now={now}
              onFail={() => setFailed(true)}
              index={index}
            />
          </Suspense>
        </Canvas>
      </CanvasBoundary>
      <div className="universe-labels" aria-hidden="true">
        {graph.nodes.map((node) => {
          const status: VisualStatus = visualStatus(
            index.latestNode.get(node.id),
            props.latencyThreshold,
          );
          const color = status === 'healthy' ? categoryColors[node.category] : statusColors[status];
          return (
            <div
              key={node.id}
              ref={(element) => {
                if (element) labels.current.set(node.id, element);
                else labels.current.delete(node.id);
              }}
              className={`node-label ${node.id === props.selected ? 'selected' : ''}`}
              data-node-id={node.id}
              data-status={status}
              style={{
                minWidth: 112,
                maxWidth: 178,
                padding: '7px 10px',
                borderColor: node.id === props.selected ? color : undefined,
              }}
            >
              <b style={{ fontSize: 12, lineHeight: '17px', color: '#e2eef6' }}>{node.name}</b>
              <span style={{ fontSize: 11, lineHeight: '15px' }}>
                <i style={{ background: color }} />
                {node.spanCount} spans · {node.p95.toFixed(0)} ms
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
export default Universe;
