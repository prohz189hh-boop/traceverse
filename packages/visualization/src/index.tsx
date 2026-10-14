import { Component, Suspense, useEffect, useMemo, useRef, useState, type ElementRef, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { CatmullRomCurve3, Vector3, type Mesh, BufferGeometry, LineBasicMaterial, Line as ThreeLine } from 'three';
import type { Category, NormalizedSpan, ServiceEdge, ServiceGraph, ServiceNode } from '@traceverse/core';

export const categoryColors: Record<Category, string> = { frontend: '#9a83ff', service: '#53e0df', database: '#f6b868', external: '#8296ff' };
/** Match inferred dependencies to their exact semantic-convention identity. */
export function observedSpansForNode(spans: readonly NormalizedSpan[], node: ServiceNode): NormalizedSpan[] {
  if(node.id.startsWith('database:'))return spans.filter(s=>{
    const system=s.attributes['db.system.name']??s.attributes['db.system'];
    const namespace=s.attributes['db.namespace']??s.attributes['db.name']??system;
    return typeof system==='string' && `database:${system}:${String(namespace)}`===node.id;
  });
  if(node.id.startsWith('external:')){
    const parents=new Set(spans.filter(s=>s.parentSpanId).map(s=>`${s.traceId}:${s.parentSpanId}`));
    return spans.filter(s=>s.kind===3&&!s.attributes['db.system.name']&&!s.attributes['db.system']&&!parents.has(`${s.traceId}:${s.spanId}`)&&`external:${String(s.attributes['peer.service']??s.attributes['server.address']??s.attributes['net.peer.name'])}`===node.id);
  }
  return spans.filter(s=>s.serviceName===node.id);
}
function observedSpansForEdge(spans:readonly NormalizedSpan[],edge:ServiceEdge,target:ServiceNode){
  const children=observedSpansForNode(spans,target);
  if(target.id.startsWith('database:')||target.id.startsWith('external:'))return children.filter(s=>s.serviceName===edge.source);
  const parents=new Map(spans.map(s=>[`${s.traceId}:${s.spanId}`,s]));
  return children.filter(s=>s.parentSpanId&&parents.get(`${s.traceId}:${s.parentSpanId}`)?.serviceName===edge.source);
}
export interface UniverseProps {
  graph: ServiceGraph; spans: NormalizedSpan[]; selected: string | null;
  onSelect: (id: string | null) => void; onEdgeSelect: (id: string) => void;
  paused: boolean; reducedMotion: boolean; quality: 'auto' | 'low' | 'high';
  particleDensity: number; intensity: number; cameraSpeed: number; latencyThreshold: number;
  resetVersion: number; focusVersion: number; direction: 'all' | 'incoming' | 'outgoing';
  replay: boolean;
}
function edgeCurve(a: ServiceNode, b: ServiceNode) {
  const from = new Vector3(...a.position), to = new Vector3(...b.position);
  const mid = from.clone().lerp(to, .5); mid.y += from.distanceTo(to) * .12 + .6;
  if(a.id === b.id) { mid.x += 2; mid.y += 2; }
  return new CatmullRomCurve3([from, mid, to]);
}
function Node({node, selected, onSelect, reducedMotion, paused}: {node: ServiceNode;selected: boolean;onSelect: (id: string) => void;reducedMotion:boolean;paused:boolean}) {
  const glow = useRef<Mesh>(null);
  const color = node.errorCount ? '#fa7c88' : categoryColors[node.category];
  useFrame(({clock}) => { if(glow.current) glow.current.scale.setScalar(!reducedMotion&&!paused&&node.lastSeen>Date.now()-5000 ? 1+Math.sin(clock.elapsedTime*2+node.position[0])*.06 : 1); });
  return <group position={node.position}>
    <mesh ref={glow} onClick={(e)=>{e.stopPropagation();onSelect(node.id);}} onPointerOver={()=>{document.body.style.cursor='pointer';}} onPointerOut={()=>{document.body.style.cursor='auto';}}>
      {node.category === 'database' ? <cylinderGeometry args={[.62,.62,.95,32]}/> : node.category === 'frontend' ? <octahedronGeometry args={[.82,0]}/> : node.category === 'external' ? <icosahedronGeometry args={[.64,0]}/> : <sphereGeometry args={[.61,24,24]}/>}
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={selected ? 1.2 : .5} metalness={.65} roughness={.26}/>
    </mesh>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.83,0]}><ringGeometry args={[selected ? .96 : .84,selected ? 1.025 : .855,48]}/><meshBasicMaterial color={color} transparent opacity={selected ? .9 : .28} side={2}/></mesh>
    {selected && <mesh><sphereGeometry args={[.94,20,20]}/><meshBasicMaterial color={color} wireframe transparent opacity={.1}/></mesh>}
  </group>;
}
function Connection({edge, a,b, props}: {edge:ServiceEdge;a:ServiceNode;b:ServiceNode;props:UniverseProps}) {
  const curve = useMemo(()=>edgeCurve(a,b),[a,b]);
  const relevant = !props.selected || (props.direction !== 'incoming' && edge.source === props.selected) || (props.direction !== 'outgoing' && edge.target === props.selected);
  const color = edge.errorCount ? '#f67f90' : edge.p95 > props.latencyThreshold ? '#f9b960' : '#54d8dc';
  const latest = useMemo(()=>props.particleDensity===0 ? [] : observedSpansForEdge(props.spans,edge,b).slice(-Math.max(1,Math.round(props.particleDensity*(props.quality==='low'?1:4)))),[props.spans,edge,b,props.particleDensity,props.quality]);
  const activity = props.replay || (edge.lastSeen > Date.now() - 10000);
  const line = useMemo(()=>{const geometry = new BufferGeometry().setFromPoints(curve.getPoints(48)); return new ThreeLine(geometry,new LineBasicMaterial({color,transparent:true,opacity:relevant ? .35 : .05}));},[curve,color,relevant]);
  useEffect(()=>()=>{line.geometry.dispose();(line.material as LineBasicMaterial).dispose();},[line]);
  return <group>
    <primitive object={line}/>
    <mesh onClick={e=>{e.stopPropagation();props.onEdgeSelect(edge.id);}}><tubeGeometry args={[curve,40,.12,4,false]}/><meshBasicMaterial color={color} transparent opacity={.018}/></mesh>
    {activity && relevant && !props.reducedMotion && !props.paused && latest.map((s,i)=><Particle key={`${s.traceId}:${s.spanId}:${i}`} curve={curve} offset={i*.29} duration={s.durationMs} lastSeen={s.startTime+s.durationMs} replay={props.replay} color={s.status==='error' ? '#ff7587' : s.durationMs>props.latencyThreshold ? '#ffc674' : '#90f7f0'} intensity={props.intensity}/>)}
  </group>;
}
function Particle({curve,offset,duration,color,intensity,lastSeen,replay}:{curve:CatmullRomCurve3;offset:number;duration:number;color:string;intensity:number;lastSeen:number;replay:boolean}) {
  const ref = useRef<Mesh>(null);
  useFrame(({clock})=>{if(ref.current){ref.current.visible=replay||lastSeen>Date.now()-10000;ref.current.position.copy(curve.getPoint((clock.elapsedTime / Math.max(1.2,Math.min(6,duration/150)) * intensity + offset) % 1));}});
  return <mesh ref={ref}><sphereGeometry args={[.085,7,7]}/><meshBasicMaterial color={color}/></mesh>;
}
function Camera({props}:{props:UniverseProps}) {
  const controls = useRef<ElementRef<typeof OrbitControls>>(null);
  const {camera,invalidate} = useThree();
  useEffect(()=>{camera.position.set(15,12,20);controls.current?.target.set(0,0,0);controls.current?.update();invalidate();},[props.resetVersion,camera,invalidate]);
  useEffect(()=>{const node=props.graph.nodes.find(n=>n.id===props.selected);if(node&&props.focusVersion){controls.current?.target.set(...node.position);camera.position.set(node.position[0]+6,node.position[1]+5,node.position[2]+8);controls.current?.update();invalidate();}},[props.focusVersion,props.selected,props.graph.nodes,camera,invalidate]);
  return <OrbitControls ref={controls} makeDefault enableDamping={!props.reducedMotion} dampingFactor={.08} rotateSpeed={props.cameraSpeed} zoomSpeed={.8} minDistance={3} maxDistance={80}/>;
}
function ProjectedLabels({nodes,labels}:{nodes:ServiceNode[];labels:Map<string,HTMLDivElement>}){
  const {camera,size}=useThree();
  const vector=useMemo(()=>new Vector3(),[]);
  useFrame(()=>{for(const node of nodes){const label=labels.get(node.id);if(!label)continue;vector.set(node.position[0],node.position[1]-1.4,node.position[2]);const distance=vector.distanceTo(camera.position);vector.project(camera);const visible=vector.z>=-1&&vector.z<=1&&Math.abs(vector.x)<1.2&&Math.abs(vector.y)<1.2;label.style.visibility=visible?'visible':'hidden';label.style.transform=`translate(${(vector.x*.5+.5)*size.width}px,${(-vector.y*.5+.5)*size.height}px) translate(-50%,-50%) scale(${Math.min(1.25,Math.max(.72,20/distance))})`;}});
  return null;
}
function Scene({props,labels}:{props:UniverseProps;labels:Map<string,HTMLDivElement>}) {
  const lookup=useMemo(()=>new Map(props.graph.nodes.map(n=>[n.id,n])),[props.graph]);
  const points=useMemo(()=>{const p=new Float32Array(180*3);for(let i=0;i<p.length;i++)p[i]=Math.sin(i*127.1+37.3)*38;return p;},[]);
  return <>
    <ambientLight intensity={.8}/><pointLight position={[10,15,8]} intensity={80} color="#b6d7ff"/><pointLight position={[-10,3,-10]} intensity={45} color="#9183ff"/>
    <gridHelper args={[60,30,'#1c3244','#142332']} position={[0,-3.5,0]}/>
    <points><bufferGeometry><bufferAttribute attach="attributes-position" args={[points,3]}/></bufferGeometry><pointsMaterial color="#94c5df" size={.03} transparent opacity={.45}/></points>
    {props.graph.edges.map(e=>{const a=lookup.get(e.source),b=lookup.get(e.target);return a&&b ? <Connection key={e.id} edge={e} a={a} b={b} props={props}/> : null;})}
    {props.graph.nodes.map(n=><Node key={n.id} node={n} selected={n.id===props.selected} onSelect={props.onSelect} paused={props.paused} reducedMotion={props.reducedMotion}/>)}
    <Camera props={props}/>
    <ProjectedLabels nodes={props.graph.nodes} labels={labels}/>
  </>;
}
class CanvasBoundary extends Component<{children:ReactNode;onFail:()=>void},{failed:boolean}> {
  state={failed:false}; static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(){this.props.onFail();}
  render(){return this.state.failed ? null : this.props.children;}
}
export function Universe(props:UniverseProps) {
  const [failed,setFailed]=useState(false);
  const labels=useRef(new Map<string,HTMLDivElement>());
  if(failed) return <div className="gpu-fallback"><p>3D is unavailable on this device. Your telemetry is still here.</p><Universe2D {...props}/></div>;
  return <div className="universe-scene"><CanvasBoundary onFail={()=>setFailed(true)}><Canvas camera={{position:[15,12,20],fov:43}} dpr={props.quality==='low' ? 1 : [1,1.5]} frameloop={props.paused||props.reducedMotion ? 'demand':'always'} gl={{antialias:props.quality!=='low',powerPreference:'low-power',alpha:true}} onPointerMissed={()=>props.onSelect(null)}><Suspense fallback={null}><Scene props={props} labels={labels.current}/></Suspense></Canvas></CanvasBoundary><div className="universe-labels" aria-hidden="true">{props.graph.nodes.map(node=><div key={node.id} ref={element=>{if(element)labels.current.set(node.id,element);else labels.current.delete(node.id);}} className={`node-label ${node.id===props.selected?'selected':''}`}><b>{node.name}</b><span><i style={{background:node.errorCount?'#fa7c88':categoryColors[node.category]}}/>{node.spanCount} spans · {node.p95.toFixed(0)} ms</span></div>)}</div></div>;
}
export function Universe2D(props:UniverseProps) {
  const nodes=props.graph.nodes;
  const positions=new Map(nodes.map((n,i)=>{const angle=i/nodes.length*Math.PI*2-Math.PI/2;return [n.id,[450+Math.cos(angle)*235,280+Math.sin(angle)*180]] as const;}));
  return <svg className="universe-2d" viewBox="0 0 900 560" role="img" aria-label="Service dependency graph. Services are selectable with the keyboard.">
    <defs><marker id="arrow" markerWidth="7" markerHeight="7" refX="22" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#507584"/></marker><radialGradient id="nodeglow"><stop stopColor="#53e0df" stopOpacity=".14"/><stop offset="1" stopColor="#53e0df" stopOpacity="0"/></radialGradient></defs>
    {props.graph.edges.map(e=>{const a=positions.get(e.source),b=positions.get(e.target);if(!a||!b)return null;const relevant=!props.selected||(props.direction!=='incoming'&&e.source===props.selected)||(props.direction!=='outgoing'&&e.target===props.selected);return <g key={e.id} role="button" tabIndex={0} aria-label={`Inspect dependency ${e.source} to ${e.target}`} onClick={()=>props.onEdgeSelect(e.id)} onKeyDown={v=>{if(v.key==='Enter'||v.key===' ')props.onEdgeSelect(e.id);}}><line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={e.errorCount ? '#f67f90':e.p95>props.latencyThreshold ? '#f9b960':'#477581'} strokeWidth={relevant ? 2 : 1} opacity={relevant ? .8:.2} markerEnd="url(#arrow)"/><line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="transparent" strokeWidth="18"/></g>;})}
    {nodes.map(n=>{const p=positions.get(n.id)!;const c=n.errorCount?'#f67f90':categoryColors[n.category];return <g key={n.id} role="button" tabIndex={0} aria-label={`Select ${n.name}`} onClick={()=>props.onSelect(n.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')props.onSelect(n.id);}}><circle cx={p[0]} cy={p[1]} r="56" fill="url(#nodeglow)"/><circle cx={p[0]} cy={p[1]} r={props.selected===n.id?25:21} fill="#10202e" stroke={c} strokeWidth={props.selected===n.id?3:2}/><circle cx={p[0]} cy={p[1]} r="6" fill={c}/><text x={p[0]} y={p[1]+46} textAnchor="middle" fill="#e4edf7" fontSize="14" fontWeight="600">{n.name}</text><text x={p[0]} y={p[1]+65} textAnchor="middle" fill="#7c94ae" fontSize="11">{n.spanCount} spans · {n.p95.toFixed(0)} ms</text></g>;})}
  </svg>;
}
