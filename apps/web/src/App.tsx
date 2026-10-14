import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Box,
  Check,
  ChevronRight,
  Clock,
  Code2,
  Database,
  Download,
  Focus,
  GitBranch,
  Globe,
  HelpCircle,
  Layers,
  Maximize2,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Upload,
  Waypoints,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  buildGraph,
  percentile,
  sanitizeAttributes,
  validateSession,
  type Category,
  type NormalizedSpan,
  type Session,
} from '@traceverse/core';
import {
  Universe2D,
  categoryColors,
  observedSpansForNode,
  type UniverseProps,
} from '@traceverse/visualization';
import {
  connectCollector,
  download,
  mergeSpans,
  SESSION_STORAGE_KEY,
  STATIC_DEMO,
  usePreferences,
  type Mode,
} from './store';
import { assertSynthetic, createScenario, scenarios, type ScenarioId } from './scenarios';

const Universe = lazy(() =>
  import('@traceverse/visualization/3d').then((m) => ({ default: m.Universe })),
);
type Page = 'overview' | 'services' | 'traces' | 'errors' | 'performance' | 'sessions' | 'docs';
const navigation = [
  ['overview', 'Universe', Waypoints],
  ['services', 'Services', Box],
  ['traces', 'Traces', GitBranch],
  ['errors', 'Errors', AlertTriangle],
  ['performance', 'Performance', Activity],
  ['sessions', 'Sessions', Layers],
  ['docs', 'Documentation', Code2],
] as const;

function pageFromHash(): Page {
  const value = window.location.hash.replace(/^#\/?/, '');
  return value === 'universe'
    ? 'overview'
    : navigation.some(([id]) => id === value)
      ? (value as Page)
      : 'overview';
}
function initialScenario(): ScenarioId {
  const value = new URLSearchParams(window.location.search).get('scenario');
  return scenarios.find((scenario) => scenario.id === value)?.id || 'success';
}
type SavedSession = { name: string; session: Session };
const time = (n: number) =>
  new Date(n).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const milliseconds = (n: number) => `${n < 10 ? n.toFixed(1) : Math.round(n)} ms`;
function sessionOf(spans: NormalizedSpan[]): Session {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    spans: [...spans].sort((a, b) => a.startTime - b.startTime),
  };
}
function readHistory(): SavedSession[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, 6).flatMap((item) => {
      try {
        const session = validateSession(item.session);
        if (STATIC_DEMO) assertSynthetic(session.spans);
        return [{ name: String(item.name).slice(0, 128), session }];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}
function IconFor({ category }: { category: Category }) {
  return category === 'database' ? (
    <Database size={15} />
  ) : category === 'frontend' ? (
    <Globe size={15} />
  ) : category === 'external' ? (
    <ArrowUpRight size={15} />
  ) : (
    <Box size={15} />
  );
}

export default function App() {
  const { settings, setSettings } = usePreferences();
  const [page, setPageState] = useState<Page>(pageFromHash),
    [mode, setMode] = useState<Mode>(STATIC_DEMO ? 'synthetic' : 'demo'),
    [received, setReceived] = useState<NormalizedSpan[]>([]),
    [status, setStatus] = useState<'connecting' | 'connected' | 'offline'>('connecting');
  const [paused, setPaused] = useState(false),
    [pinned, setPinned] = useState<NormalizedSpan[]>([]),
    [search, setSearch] = useState(''),
    [category, setCategory] = useState('all');
  const [selected, setSelected] = useState<string | null>(null),
    [selectedEdge, setSelectedEdge] = useState<string | null>(null),
    [traceId, setTraceId] = useState<string | null>(null),
    [view, setView] = useState<'3d' | '2d'>('3d');
  const [traceSearch, setTraceSearch] = useState('');
  const [direction, setDirection] = useState<'all' | 'incoming' | 'outgoing'>('all'),
    [isolated, setIsolated] = useState(false),
    [resetVersion, setResetVersion] = useState(0),
    [focusVersion, setFocusVersion] = useState(0);
  const [cameraCommand, setCameraCommand] = useState<UniverseProps['cameraCommand']>();
  const [settingsOpen, setSettingsOpen] = useState(false),
    [toast, setToast] = useState(''),
    [history, setHistory] = useState<SavedSession[]>(readHistory),
    [replaySession, setReplaySession] = useState<Session | null>(null),
    [replayPosition, setReplayPosition] = useState(0),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1);
  const fileRef = useRef<HTMLInputElement>(null),
    [connectionDraft, setConnectionDraft] = useState(settings.collectorUrl),
    [clearing, setClearing] = useState(false);
  const [scenario, setScenario] = useState<ScenarioId>(initialScenario),
    [trafficIntensity, setTrafficIntensity] = useState(1),
    [playbackSpeed, setPlaybackSpeed] = useState(1),
    [synthetic, setSynthetic] = useState<NormalizedSpan[]>(() => createScenario(initialScenario())),
    [tutorialOpen, setTutorialOpen] = useState(STATIC_DEMO);
  const scenarioSequence = useRef(0);
  const activeScenario = scenarios.find((value) => value.id === scenario)!;
  function setPage(value: Page) {
    window.location.hash = `/${value === 'overview' ? 'universe' : value}`;
    setPageState(value);
  }
  useEffect(() => {
    const navigate = () => setPageState(pageFromHash());
    window.addEventListener('hashchange', navigate);
    if (!window.location.hash)
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${window.location.search}#/universe`,
      );
    return () => window.removeEventListener('hashchange', navigate);
  }, []);
  useEffect(() => {
    if (STATIC_DEMO) return;
    return connectCollector(
      settings.collectorUrl,
      (m) =>
        setReceived((old) =>
          m.type === 'batch'
            ? mergeSpans(old, m.spans, settings.maxSpans)
            : mergeSpans([], m.spans, settings.maxSpans),
        ),
      setStatus,
    );
  }, [settings.collectorUrl, settings.maxSpans]);
  useEffect(() => {
    if (mode !== 'synthetic' || paused) return;
    const timer = setInterval(() => {
      if (document.hidden) return;
      const batch = Array.from({ length: trafficIntensity }, () =>
        createScenario(scenario, { sequence: ++scenarioSequence.current }),
      ).flat();
      setSynthetic((old) => mergeSpans(old, batch, 2400));
    }, 1600 / playbackSpeed);
    return () => clearInterval(timer);
  }, [mode, paused, scenario, trafficIntensity, playbackSpeed]);
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === 'Escape') setSettingsOpen(false);
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
        e.preventDefault();
        document
          .querySelector<HTMLInputElement>(
            window.matchMedia('(max-width: 720px)').matches
              ? 'input[aria-label="Filter mobile services"]'
              : 'input[aria-label="Search universe"]',
          )
          ?.focus();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 4800);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    try {
      if (STATIC_DEMO) history.forEach((item) => assertSynthetic(item.session.spans));
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(history));
    } catch {
      setToast('Local session storage is full. Export your session to keep it.');
    }
  }, [history]);
  const base = useMemo(
    () =>
      mode === 'synthetic'
        ? synthetic
        : mode === 'replay'
          ? replaySession?.spans || []
          : received.filter((s) => s.source === mode),
    [mode, synthetic, replaySession, received],
  );
  const first = base.reduce((n, s) => Math.min(n, s.startTime), base[0]?.startTime || 0),
    last = base.reduce((n, s) => Math.max(n, s.startTime + s.durationMs), first),
    range = Math.max(1, last - first);
  useEffect(() => {
    if (mode !== 'replay' || !playing) return;
    let previous = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      setReplayPosition((p) => {
        const next = Math.min(1, p + ((now - previous) * speed) / range);
        if (next >= 1) setPlaying(false);
        return next;
      });
      previous = now;
    }, 80);
    return () => clearInterval(timer);
  }, [mode, playing, speed, range]);
  const spans = useMemo(
    () =>
      mode === 'replay'
        ? base.filter((s) => s.startTime <= first + replayPosition * range)
        : paused
          ? pinned
          : base,
    [base, mode, first, replayPosition, range, paused, pinned],
  );
  const graph = useMemo(() => buildGraph(spans), [spans]);
  const selectedNode = graph.nodes.find((n) => n.id === selected),
    edge = graph.edges.find((e) => e.id === selectedEdge);
  const serviceSpans = selectedNode ? observedSpansForNode(spans, selectedNode) : spans;
  const latestServiceSpan = serviceSpans.reduce<NormalizedSpan | undefined>(
    (latest, span) => (!latest || span.startTime > latest.startTime ? span : latest),
    undefined,
  );
  const selectedHasCurrentError = latestServiceSpan?.status === 'error';
  const errors = serviceSpans.filter(
      (s) =>
        s.status === 'error' &&
        `${s.traceId} ${s.operation} ${s.serviceName}`
          .toLowerCase()
          .includes(traceSearch.toLowerCase()),
    ),
    allErrors = spans.filter((s) => s.status === 'error');
  const traceCount = new Set(spans.map((s) => s.traceId)).size;
  const filteredNodes = graph.nodes.filter(
    (n) =>
      (category === 'all' || category === n.category) &&
      n.name.toLowerCase().includes(search.toLowerCase()),
  );
  const nodeIds = new Set(
    filteredNodes
      .slice(0, settings.maxNodes)
      .filter(
        (n) =>
          !isolated ||
          !selected ||
          n.id === selected ||
          graph.edges.some(
            (e) =>
              (e.source === selected && e.target === n.id) ||
              (e.target === selected && e.source === n.id),
          ),
      )
      .map((n) => n.id),
  );
  const visibleGraph = {
    nodes: graph.nodes.filter((n) => nodeIds.has(n.id)),
    edges: graph.edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target)),
  };
  const traceGroups = useMemo(() => {
    const map = new Map<string, NormalizedSpan[]>();
    const relevantTraces = new Set(serviceSpans.map((span) => span.traceId));
    for (const s of spans) {
      if (!relevantTraces.has(s.traceId)) continue;
      const value = map.get(s.traceId) || [];
      value.push(s);
      map.set(s.traceId, value);
    }
    return [...map]
      .filter(([id, list]) =>
        `${id} ${list.map((s) => `${s.operation} ${s.serviceName}`).join(' ')}`
          .toLowerCase()
          .includes(traceSearch.toLowerCase()),
      )
      .sort((a, b) => (b[1][0]?.startTime || 0) - (a[1][0]?.startTime || 0));
  }, [serviceSpans, spans, traceSearch]);
  const inspectedTrace = spans
    .filter((s) => s.traceId === traceId)
    .sort((a, b) => a.startTime - b.startTime);
  const props: UniverseProps = {
    graph: visibleGraph,
    spans,
    selected,
    onSelect: (id) => {
      setSelected(id);
      setSelectedEdge(null);
      setTraceId(null);
    },
    onEdgeSelect: (id) => {
      setSelectedEdge(id);
      setSelected(null);
      setTraceId(null);
    },
    paused: mode === 'replay' ? !playing : paused,
    reducedMotion: settings.reducedMotion,
    quality: settings.quality,
    particleDensity: settings.particleDensity,
    intensity: settings.intensity,
    cameraSpeed: settings.cameraSpeed,
    latencyThreshold: settings.latencyThreshold,
    resetVersion,
    focusVersion,
    cameraCommand,
    direction,
    replay: mode === 'replay' || mode === 'synthetic',
  };
  function changeMode(value: Mode) {
    if (STATIC_DEMO && value !== 'synthetic' && value !== 'replay') return;
    if (value === 'replay' && !replaySession) {
      setReplaySession(sessionOf(base));
      setReplayPosition(0);
    }
    setMode(value);
    setPaused(false);
    setPlaying(false);
    setSelected(null);
    setTraceId(null);
    setSelectedEdge(null);
  }
  function runScenario(value: ScenarioId = scenario) {
    const batch = createScenario(value, { sequence: ++scenarioSequence.current });
    setScenario(value);
    setSynthetic(batch);
    setMode('synthetic');
    setPaused(false);
    setPlaying(false);
    setSelected(scenarios.find((item) => item.id === value)!.focus);
    setSelectedEdge(null);
    setTraceId(null);
    setSearch('');
    setCategory('all');
    setIsolated(false);
    setTraceSearch('');
    setPage('overview');
    setFocusVersion((old) => old + 1);
  }
  function replayScenario() {
    replay(sessionOf(createScenario(scenario, { sequence: ++scenarioSequence.current })));
    setPlaying(true);
  }
  function togglePause() {
    if (mode === 'replay') {
      if (replayPosition >= 1) setReplayPosition(0);
      setPlaying(!playing);
    } else {
      if (!paused) setPinned(base);
      setPaused(!paused);
    }
  }
  function exportSession() {
    if (STATIC_DEMO) assertSynthetic(base);
    download(
      `traceverse-${mode}-${new Date().toISOString().slice(0, 10)}.json`,
      sessionOf(mode === 'replay' ? replaySession?.spans || [] : base),
    );
    setToast('Session exported. Safe attributes only; no request bodies.');
  }
  function saveSession() {
    if (STATIC_DEMO) assertSynthetic(base);
    if (!base.length) {
      setToast('Capture some telemetry before saving a session.');
      return;
    }
    const name = `${mode[0]!.toUpperCase() + mode.slice(1)} · ${new Date().toLocaleString()}`;
    setHistory((old) => [{ name, session: sessionOf(base) }, ...old].slice(0, 6));
    setToast('Session saved in this browser.');
  }
  function replay(session: Session) {
    if (STATIC_DEMO) assertSynthetic(session.spans);
    setReplaySession(session);
    setMode('replay');
    setReplayPosition(0);
    setPlaying(false);
    setPaused(false);
    setSelected(null);
    setSelectedEdge(null);
    setTraceId(null);
    setPage('overview');
  }
  async function importSession(file: File) {
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('Session exceeds the 10 MB import limit.');
      const session = validateSession(JSON.parse(await file.text()));
      if (STATIC_DEMO) assertSynthetic(session.spans);
      session.spans.sort((a, b) => a.startTime - b.startTime);
      setHistory((old) => [{ name: `Imported · ${file.name}`, session }, ...old].slice(0, 6));
      replay(session);
      setToast(`Imported ${session.spans.length} spans. Replay is ready.`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not import this session.');
    }
  }
  async function clearData() {
    if (STATIC_DEMO) return;
    try {
      setClearing(true);
      const result = await fetch(`${settings.collectorUrl}/api/session`, { method: 'DELETE' });
      if (!result.ok) throw new Error('Collector rejected deletion.');
      setReceived([]);
      setPinned([]);
      setToast('Collector telemetry cleared. Demo services may generate new activity.');
    } catch {
      setToast('Could not reach the collector to delete its telemetry.');
    } finally {
      setClearing(false);
    }
  }
  function exportReport() {
    if (STATIC_DEMO) assertSynthetic(base);
    const reportSpans = (traceId ? inspectedTrace : errors).map((s) => ({
      traceId: s.traceId,
      spanId: s.spanId,
      parentSpanId: s.parentSpanId,
      serviceName: s.serviceName,
      operation: s.operation,
      startTime: s.startTime,
      durationMs: s.durationMs,
      status: s.status,
      attributes: sanitizeAttributes(s.attributes),
      exceptions: s.events.map((e) => ({
        name: e.name,
        time: e.time,
        attributes: sanitizeAttributes(e.attributes),
      })),
    }));
    download('traceverse-bug-report.json', {
      version: 1,
      generatedAt: new Date().toISOString(),
      source: mode,
      service: selectedNode?.name || 'all services',
      latencyThresholdMs: settings.latencyThreshold,
      spans: reportSpans,
    });
    setToast('Sanitized investigation report exported.');
  }
  async function saveConnection() {
    if (STATIC_DEMO) return;
    try {
      const endpoint = new URL(connectionDraft);
      if (
        endpoint.protocol !== 'http:' ||
        !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname) ||
        endpoint.username ||
        endpoint.password
      )
        throw new Error('Use a local HTTP collector URL.');
      setSettings({ collectorUrl: endpoint.origin });
      const result = await fetch(`${endpoint.origin}/api/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          retentionMinutes: settings.retentionMinutes,
          maxSpans: settings.maxSpans,
        }),
      });
      setToast(
        result.ok
          ? 'Collector settings applied.'
          : 'Preferences saved; collector rejected retention settings.',
      );
    } catch {
      setToast(
        'Preferences saved. Use a local HTTP URL and start the collector to apply retention.',
      );
    }
  }
  function showTrace(id: string) {
    setTraceId(id);
    setSelectedEdge(null);
  }
  const connectionLabel = STATIC_DEMO
    ? 'Synthetic · Offline capable'
    : status === 'connected'
      ? 'Collector connected'
      : status === 'connecting'
        ? 'Connecting…'
        : 'Collector offline';
  const selectedBadge = STATIC_DEMO
    ? 'SYNTHETIC DEMO'
    : mode === 'demo'
      ? 'INSTRUMENTED DEMO'
      : mode === 'synthetic'
        ? 'SYNTHETIC SAMPLE'
        : mode === 'replay'
          ? 'SESSION REPLAY'
          : 'LIVE TELEMETRY';
  return (
    <div className={`app-shell ${STATIC_DEMO ? 'public-demo' : 'local-app'}`}>
      <header className="topbar">
        <a
          className="brand"
          href="#/universe"
          onClick={(e) => {
            e.preventDefault();
            setPage('overview');
          }}
        >
          <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" />
          <span>
            Trace<span>Verse</span>
          </span>
          <small>{STATIC_DEMO ? 'DEMO' : 'LOCAL'}</small>
        </a>
        <div className="workspace-crumb">
          <span>Workspace</span>
          <ChevronRight size={13} />
          <b>{STATIC_DEMO ? 'Demo · Synthetic' : 'Local universe'}</b>
        </div>
        <label className="topbar-search">
          <Search size={14} />
          <input
            aria-label="Search universe"
            value={search}
            placeholder="Search the universe…"
            onChange={(e) => setSearch(e.target.value)}
          />
          <kbd>/</kbd>
        </label>
        <div className="topbar-right">
          <span className={`connection ${STATIC_DEMO ? 'connected' : status}`}>
            <i />
            {connectionLabel}
          </span>
          <label className="source-select">
            <Radio size={13} />
            <select
              aria-label="Data source"
              value={mode}
              onChange={(e) => changeMode(e.target.value as Mode)}
            >
              {!STATIC_DEMO && <option value="demo">Demo · Instrumented</option>}
              {!STATIC_DEMO && <option value="live">Live</option>}
              <option value="synthetic">{STATIC_DEMO ? 'Demo · Synthetic' : 'Synthetic'}</option>
              <option value="replay">Replay</option>
            </select>
          </label>
          <button
            className="icon-button"
            aria-label="Settings"
            onClick={() => {
              setConnectionDraft(settings.collectorUrl);
              setSettingsOpen(true);
            }}
          >
            <SettingsIcon size={18} />
          </button>
          <a
            className="icon-button"
            aria-label="TraceVerse source and contribution guide"
            href="https://github.com/prohz189hh-boop/traceverse"
            target="_blank"
            rel="noreferrer"
          >
            <Code2 size={18} />
          </a>
        </div>
      </header>
      <aside className="sidebar">
        <div className="sidebar-caption">EXPLORE YOUR SYSTEM</div>
        <nav aria-label="Main navigation">
          {navigation.map(([id, label, Icon]) => (
            <button
              key={id}
              className={page === id ? 'nav-item active' : 'nav-item'}
              aria-current={page === id ? 'page' : undefined}
              onClick={() => setPage(id)}
            >
              <Icon size={17} />
              <span>{label}</span>
              {id === 'errors' && allErrors.length > 0 ? (
                <b className="error-count">{allErrors.length}</b>
              ) : id === 'services' ? (
                <em>{graph.nodes.length}</em>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="mobile-filters">
          <label>
            <Search size={14} />
            <input
              aria-label="Filter mobile services"
              placeholder="Find a service…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <select
            aria-label="Select a service"
            value={selected || ''}
            onChange={(e) => {
              setSelected(e.target.value || null);
              setSelectedEdge(null);
              setTraceId(null);
            }}
          >
            <option value="">Inspect service…</option>
            {filteredNodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.name}
              </option>
            ))}
          </select>
        </div>
        <div className="sidebar-divider" />
        <div className="services-heading">
          <span>DISCOVERED SERVICES</span>
          <b>{graph.nodes.length}</b>
        </div>
        <div className="service-search">
          <Search size={14} />
          <input
            aria-label="Search services"
            placeholder="Find a service…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <kbd>/</kbd>
        </div>
        <select
          className="category-select"
          aria-label="Filter service type"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="all">All service types</option>
          <option value="frontend">Frontend</option>
          <option value="service">Services</option>
          <option value="database">Databases</option>
          <option value="external">External</option>
        </select>
        <div className="service-list">
          {filteredNodes.map((n) => (
            <button
              key={n.id}
              aria-label={n.name}
              className={`service-item ${selected === n.id ? 'selected' : ''}`}
              onClick={() => {
                setSelected(n.id);
                setSelectedEdge(null);
                setTraceId(null);
              }}
            >
              <span className="service-icon" style={{ color: categoryColors[n.category] }}>
                <IconFor category={n.category} />
              </span>
              <span className="service-name">
                {n.name}
                <small>{n.category}</small>
              </span>
              <i
                className={
                  observedSpansForNode(spans, n).at(-1)?.status === 'error'
                    ? 'dot error'
                    : 'dot healthy'
                }
              />
            </button>
          ))}
          {!filteredNodes.length && (
            <p className="sidebar-empty">
              {graph.nodes.length ? 'No matching services.' : 'Waiting for telemetry…'}
            </p>
          )}
        </div>
        <div className="local-card">
          <ShieldCheck size={19} />
          <div>
            <b>{STATIC_DEMO ? 'Explore without installing.' : 'Your universe. Your machine.'}</b>
            <p>
              {STATIC_DEMO
                ? 'Synthetic data. Free & open source.'
                : 'Local by default. Free & open source.'}
            </p>
          </div>
        </div>
        <div className="version-line">
          <span>
            TraceVerse <b>v0.2.0</b>
          </span>
          <button onClick={() => setPage('docs')} aria-label="Help">
            <HelpCircle size={15} />
          </button>
        </div>
      </aside>
      <main className="main-content">
        <div className="page-heading">
          <div>
            <div className="eyebrow">
              <i />
              {selectedBadge}
            </div>
            <h1>
              {page === 'overview'
                ? 'Explore your app in 3D.'
                : page === 'services'
                  ? 'Every service, in context.'
                  : page === 'traces'
                    ? 'Follow the request.'
                    : page === 'errors'
                      ? 'Find the failure.'
                      : page === 'performance'
                        ? 'Where time is spent.'
                        : page === 'sessions'
                          ? 'A window into the past.'
                          : STATIC_DEMO
                            ? 'From preview to your own app.'
                            : 'Connect your universe.'}
            </h1>
            <p>
              {page === 'overview'
                ? 'Explore dependencies and follow activity through your application.'
                : page === 'services'
                  ? 'Discovered from received spans and instrumented dependencies.'
                  : page === 'traces'
                    ? 'Inspect parent–child relationships and operation timings.'
                    : page === 'errors'
                      ? 'Investigate failures using evidence from your telemetry.'
                      : page === 'performance'
                        ? 'Latency measurements from the spans in the current view.'
                        : page === 'sessions'
                          ? 'Keep, export, and replay telemetry on your machine.'
                          : STATIC_DEMO
                            ? 'Learn the controls, then run TraceVerse locally with your own telemetry.'
                            : 'OpenTelemetry in. Insight out. Everything stays on your machine.'}
            </p>
          </div>
          <div className="heading-actions">
            <button className="subtle-button" onClick={exportSession}>
              <Download size={15} />
              Export session
            </button>
            {page === 'overview' || page === 'services' ? (
              <button className="primary-button" onClick={() => setPage('traces')}>
                <GitBranch size={15} />
                Explore traces
                <ArrowRight size={14} />
              </button>
            ) : (
              <button className="primary-button" onClick={() => setPage('overview')}>
                <Waypoints size={15} />
                Open universe
              </button>
            )}
          </div>
        </div>
        {mode === 'synthetic' && (
          <div className="source-notice">
            <Radio size={14} />
            <b>Demo · Synthetic</b>
            <span>
              {activeScenario.title}. Browser-generated trace evidence; these measurements describe
              simulated requests.
            </span>
          </div>
        )}
        {mode === 'replay' && (
          <div className="source-notice replay">
            <Clock size={14} />
            <b>Historical replay</b>
            <span>
              {STATIC_DEMO
                ? 'Replaying synthetic scenario data'
                : 'Playing a recorded local session'}{' '}
              · {base.length} spans · source:{' '}
              {[...new Set(base.map((s) => s.source))].join(', ') || 'empty'}.
            </span>
          </div>
        )}
        {tutorialOpen && (page === 'overview' || page === 'services') && (
          <div className="demo-tutorial">
            <Focus size={18} />
            <p>
              <b>Welcome to your service universe.</b> Select a service to inspect its spans. Drag
              to rotate, scroll or pinch to zoom, and choose a scenario below.
            </p>
            <button
              className="icon-button"
              aria-label="Dismiss tutorial"
              onClick={() => setTutorialOpen(false)}
            >
              <X size={15} />
            </button>
          </div>
        )}
        <div className="metrics">
          <Metric
            title="Discovered entities"
            value={graph.nodes.length.toString()}
            icon={<Box size={17} />}
            detail={`${graph.nodes.filter((n) => n.category === 'service').length} services · ${graph.nodes.filter((n) => n.category === 'database').length} databases`}
          />
          <Metric
            title="Observed traces"
            value={traceCount.toLocaleString()}
            icon={<GitBranch size={17} />}
            detail={`${spans.length.toLocaleString()} spans in this view`}
          />
          <Metric
            title="Latency · p95"
            value={milliseconds(
              percentile(
                spans.map((s) => s.durationMs),
                0.95,
              ),
            )}
            icon={<Activity size={17} />}
            detail={
              spans.length
                ? `p50 ${milliseconds(
                    percentile(
                      spans.map((s) => s.durationMs),
                      0.5,
                    ),
                  )} · span duration`
                : 'Waiting for duration measurements'
            }
          />
          <Metric
            title="Failed spans"
            value={allErrors.length.toLocaleString()}
            icon={<AlertTriangle size={17} />}
            detail={
              spans.length
                ? `${((allErrors.length / spans.length) * 100).toFixed(1)}% of observed spans`
                : 'No telemetry received'
            }
            warning={allErrors.length > 0}
          />
        </div>
        <div className="workspace-grid">
          <section className="main-panel">
            {page === 'overview' || page === 'services' ? (
              <>
                <div className="panel-toolbar">
                  <div className="panel-title">
                    <Waypoints size={16} />
                    <b>Service universe</b>
                    <span>
                      {visibleGraph.nodes.length} entities · {visibleGraph.edges.length} connections
                    </span>
                  </div>
                  <div className="toolbar-actions">
                    <button
                      className={view === '3d' ? 'view-toggle chosen' : 'view-toggle'}
                      onClick={() => setView('3d')}
                      aria-label="3D view"
                    >
                      3D
                    </button>
                    <button
                      className={view === '2d' ? 'view-toggle chosen' : 'view-toggle'}
                      onClick={() => setView('2d')}
                      aria-label="2D view"
                    >
                      2D
                    </button>
                    <span className="toolbar-rule" />
                    <button
                      className="icon-button"
                      aria-label="Zoom in"
                      onClick={() =>
                        setCameraCommand((old) => ({
                          version: (old?.version || 0) + 1,
                          action: 'zoom-in',
                        }))
                      }
                    >
                      <ZoomIn size={16} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Zoom out"
                      onClick={() =>
                        setCameraCommand((old) => ({
                          version: (old?.version || 0) + 1,
                          action: 'zoom-out',
                        }))
                      }
                    >
                      <ZoomOut size={16} />
                    </button>
                    <button
                      className="icon-button camera-rotate"
                      aria-label="Rotate left"
                      onClick={() =>
                        setCameraCommand((old) => ({
                          version: (old?.version || 0) + 1,
                          action: 'rotate-left',
                        }))
                      }
                    >
                      <RotateCcw size={15} />
                    </button>
                    <button
                      className="icon-button camera-rotate"
                      aria-label="Rotate right"
                      onClick={() =>
                        setCameraCommand((old) => ({
                          version: (old?.version || 0) + 1,
                          action: 'rotate-right',
                        }))
                      }
                    >
                      <RotateCcw size={15} style={{ transform: 'scaleX(-1)' }} />
                    </button>
                    <button
                      className="icon-button"
                      onClick={() => setResetVersion((n) => n + 1)}
                      aria-label="Reset camera"
                    >
                      <RotateCcw size={15} />
                    </button>
                    <button
                      className="icon-button"
                      onClick={() => {
                        setConnectionDraft(settings.collectorUrl);
                        setSettingsOpen(true);
                      }}
                      aria-label="Visualization settings"
                    >
                      <SlidersHorizontal size={16} />
                    </button>
                  </div>
                </div>
                <div className="universe-viewport" data-testid="universe">
                  <div className="viewport-badge">
                    <i className={paused ? 'dot paused' : 'dot healthy'} />
                    {mode === 'replay'
                      ? playing
                        ? 'REPLAYING'
                        : 'REPLAY READY'
                      : paused
                        ? 'PAUSED'
                        : mode === 'synthetic'
                          ? 'DEMO · SYNTHETIC'
                          : status === 'connected'
                            ? 'STREAMING TELEMETRY'
                            : 'WAITING FOR COLLECTOR'}
                  </div>
                  {visibleGraph.nodes.length ? (
                    <Suspense
                      fallback={
                        <div className="empty-graph">
                          <Waypoints size={36} />
                          <h2>Opening your universe…</h2>
                        </div>
                      }
                    >
                      {view === '3d' ? <Universe {...props} /> : <Universe2D {...props} />}
                    </Suspense>
                  ) : (
                    <div className="empty-graph">
                      <div className="empty-orbit">
                        <Waypoints size={36} />
                      </div>
                      <h2>
                        {search || category !== 'all'
                          ? 'No matching entities'
                          : 'Your universe starts with one trace.'}
                      </h2>
                      <p>
                        {mode === 'live'
                          ? 'Point your OpenTelemetry exporter at the local collector to discover your services.'
                          : mode === 'demo'
                            ? 'Run npm run demo to start the collector and the instrumented example application.'
                            : 'Import a recorded session or try the synthetic sample.'}
                      </p>
                      <button className="primary-button" onClick={() => changeMode('synthetic')}>
                        <Play size={14} />
                        Try synthetic sample
                      </button>
                      <button className="text-button" onClick={() => setPage('docs')}>
                        Connection instructions
                        <ArrowRight size={13} />
                      </button>
                    </div>
                  )}
                  <div className="graph-legend">
                    <span>
                      <i style={{ background: '#53e0df' }} />
                      Successful
                    </span>
                    <span>
                      <i style={{ background: '#f9b960' }} />
                      Slow &gt; {settings.latencyThreshold} ms
                    </span>
                    <span>
                      <i style={{ background: '#f67f90' }} />
                      Failed
                    </span>
                  </div>
                  <div className="graph-help">
                    {view === '3d'
                      ? 'Drag to rotate · Scroll to zoom · Right drag to pan'
                      : 'Select an entity or connection · Tab to navigate'}
                  </div>
                  {filteredNodes.length > settings.maxNodes && (
                    <div className="node-limit">
                      Showing {settings.maxNodes} of {filteredNodes.length} entities. Adjust the
                      limit in Settings.
                    </div>
                  )}
                </div>
                <div className="universe-footer">
                  <span>
                    <ShieldCheck size={13} />
                    {STATIC_DEMO ? 'Synthetic data only' : 'Processed locally'}
                  </span>
                  <span>
                    {mode === 'synthetic'
                      ? 'Bundled scenario · browser-generated spans'
                      : mode === 'demo'
                        ? 'Real spans from local demo services'
                        : mode === 'replay'
                          ? 'Recorded session · historical data'
                          : 'Received OpenTelemetry spans'}
                    <span className="footer-dot">·</span>Positions remain stable
                  </span>
                </div>
              </>
            ) : page === 'traces' ? (
              <>
                <PanelHeading
                  icon={<GitBranch size={17} />}
                  title="Recent traces"
                  detail={`${traceGroups.length} captured`}
                  action={
                    <input
                      className="panel-search"
                      aria-label="Search traces"
                      placeholder="Trace ID, operation, service…"
                      value={traceSearch}
                      onChange={(e) => setTraceSearch(e.target.value)}
                    />
                  }
                />
                <div className="data-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Trace / operation</th>
                        <th>Services</th>
                        <th>Spans</th>
                        <th>Duration</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {traceGroups.slice(0, 120).map(([id, list]) => {
                        const duration =
                          Math.max(...list.map((s) => s.startTime + s.durationMs)) -
                          Math.min(...list.map((s) => s.startTime));
                        const fail = list.some((s) => s.status === 'error');
                        return (
                          <tr
                            key={id}
                            onClick={() => showTrace(id)}
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') showTrace(id);
                            }}
                            aria-label={`Inspect trace ${id}`}
                          >
                            <td>
                              <b>
                                {list.find((s) => !s.parentSpanId)?.operation || list[0]?.operation}
                              </b>
                              <code>
                                {id.slice(0, 8)}…{id.slice(-6)}
                              </code>
                            </td>
                            <td>{new Set(list.map((s) => s.serviceName)).size}</td>
                            <td>{list.length}</td>
                            <td className={duration > settings.latencyThreshold ? 'amber' : ''}>
                              {milliseconds(duration)}
                            </td>
                            <td>
                              <span className={`status-pill ${fail ? 'failed' : 'ok'}`}>
                                {fail ? 'Error' : 'OK'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {!traceGroups.length && (
                    <EmptyPanel text="No traces in this view. Start the demo or connect your application." />
                  )}
                </div>
              </>
            ) : page === 'errors' ? (
              <>
                <PanelHeading
                  icon={<AlertTriangle size={17} />}
                  title="Error investigation"
                  detail={selectedNode ? selectedNode.name : 'All services'}
                  action={
                    <button className="subtle-button" onClick={exportReport}>
                      <Download size={14} />
                      Export bug report
                    </button>
                  }
                />
                <div className="trace-filter-row">
                  <Search size={14} />
                  <input
                    aria-label="Filter errors by trace or service"
                    placeholder="Filter by trace ID, service, or operation…"
                    value={traceSearch}
                    onChange={(e) => setTraceSearch(e.target.value)}
                  />
                  {traceSearch && (
                    <button
                      className="icon-button"
                      aria-label="Clear error filter"
                      onClick={() => setTraceSearch('')}
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
                <div className="error-list">
                  {errors
                    .slice()
                    .reverse()
                    .slice(0, 100)
                    .map((s) => (
                      <button
                        className="error-row"
                        key={`${s.traceId}:${s.spanId}`}
                        onClick={() => showTrace(s.traceId)}
                      >
                        <div className="error-symbol">
                          <AlertTriangle size={18} />
                        </div>
                        <div>
                          <b>{s.operation}</b>
                          <p>
                            {s.serviceName} <span>·</span>{' '}
                            {s.events.find((e) => e.name === 'exception')?.attributes[
                              'exception.type'
                            ] || 'Span marked as error'}
                          </p>
                          <code>{s.traceId.slice(0, 16)}…</code>
                        </div>
                        <div className="error-time">
                          <b>{milliseconds(s.durationMs)}</b>
                          <span>{time(s.startTime)}</span>
                        </div>
                        <ChevronRight size={16} />
                      </button>
                    ))}
                  {!errors.length && (
                    <EmptyPanel
                      text={
                        spans.length
                          ? 'No failed spans in the selected view.'
                          : 'No telemetry received yet.'
                      }
                      positive={spans.length > 0}
                    />
                  )}
                </div>
              </>
            ) : page === 'performance' ? (
              <>
                <PanelHeading
                  icon={<Activity size={17} />}
                  title="Service latency"
                  detail="Observed span durations"
                />
                <div className="performance-list">
                  {graph.nodes
                    .slice()
                    .sort((a, b) => b.p95 - a.p95)
                    .map((n) => (
                      <button
                        key={n.id}
                        className="performance-row"
                        onClick={() => {
                          setSelected(n.id);
                          setTraceId(null);
                        }}
                      >
                        <div>
                          <span
                            className="service-icon"
                            style={{ color: categoryColors[n.category] }}
                          >
                            <IconFor category={n.category} />
                          </span>
                          <b>{n.name}</b>
                        </div>
                        <div className="latency-track">
                          <i
                            style={{
                              width: `${Math.max(2, (n.p95 / Math.max(1, ...graph.nodes.map((x) => x.p95))) * 100)}%`,
                              background:
                                n.p95 > settings.latencyThreshold
                                  ? '#f9b960'
                                  : categoryColors[n.category],
                            }}
                          />
                        </div>
                        <span className={n.p95 > settings.latencyThreshold ? 'amber' : ''}>
                          {milliseconds(n.p95)}
                          <small>p95 · {n.spanCount} spans</small>
                        </span>
                      </button>
                    ))}
                  {!spans.length && (
                    <EmptyPanel text="Latency rankings appear after spans arrive." />
                  )}
                </div>
                <div className="slow-operations">
                  <h3>
                    Slow operations <span>Above {settings.latencyThreshold} ms</span>
                  </h3>
                  {serviceSpans
                    .filter((s) => s.durationMs > settings.latencyThreshold)
                    .sort((a, b) => b.durationMs - a.durationMs)
                    .slice(0, 8)
                    .map((s) => (
                      <button key={s.spanId} onClick={() => showTrace(s.traceId)}>
                        <span>
                          <b>{s.operation}</b>
                          <small>{s.serviceName}</small>
                        </span>
                        <b className="amber">{milliseconds(s.durationMs)}</b>
                        <ChevronRight size={14} />
                      </button>
                    ))}
                </div>
              </>
            ) : page === 'sessions' ? (
              <>
                <PanelHeading
                  icon={<Layers size={17} />}
                  title="Local sessions"
                  detail="Stored in this browser"
                  action={
                    <button className="subtle-button" onClick={() => fileRef.current?.click()}>
                      <Upload size={14} />
                      Import session
                    </button>
                  }
                />
                <div className="sessions-content">
                  <div className="session-capture">
                    <div className="session-icon">
                      <Layers size={26} />
                    </div>
                    <div>
                      <h3>Keep a moment from your system.</h3>
                      <p>
                        Save the current {base.length.toLocaleString()} spans to replay them later.
                        Sessions never leave your machine.
                      </p>
                    </div>
                    <button className="primary-button" onClick={saveSession}>
                      Save session
                    </button>
                  </div>
                  {history.map((item, i) => (
                    <div className="saved-session" key={`${item.name}:${i}`}>
                      <Clock size={20} />
                      <div>
                        <b>{item.name}</b>
                        <p>
                          {item.session.spans.length} spans ·{' '}
                          {[...new Set(item.session.spans.map((s) => s.source))].join(', ')} ·{' '}
                          {new Date(item.session.exportedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <button className="subtle-button" onClick={() => replay(item.session)}>
                        <Play size={13} />
                        Replay
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Export ${item.name}`}
                        onClick={() => {
                          if (STATIC_DEMO) assertSynthetic(item.session.spans);
                          download('traceverse-session.json', item.session);
                        }}
                      >
                        <Download size={16} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Delete ${item.name}`}
                        onClick={() => setHistory((old) => old.filter((_, j) => j !== i))}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                  {!history.length && (
                    <EmptyPanel text="No saved sessions yet. Capture the current view or import a session." />
                  )}
                  <div className="privacy-note">
                    <ShieldCheck size={17} />
                    <p>
                      Up to six sessions are kept locally in your browser. Export a JSON file for a
                      durable copy. Delete a session to remove its browser copy.
                    </p>
                  </div>
                  {!STATIC_DEMO && (
                    <button className="danger-button" disabled={clearing} onClick={clearData}>
                      <Trash2 size={14} />
                      {clearing ? 'Clearing…' : 'Clear collector telemetry'}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <Documentation
                collector={settings.collectorUrl}
                staticDemo={STATIC_DEMO}
                onCopy={(text) => {
                  void navigator.clipboard.writeText(text).then(
                    () => setToast('Copied to clipboard.'),
                    () => setToast('Clipboard unavailable. Select and copy the code.'),
                  );
                }}
              />
            )}
            <div className="activity-panel">
              {(mode === 'synthetic' || STATIC_DEMO) && (
                <div className="scenario-console" data-testid="scenario-controls">
                  <div className="scenario-heading">
                    <Radio size={15} />
                    <b>SCENARIO CONTROL</b>
                    <span>SYNTHETIC</span>
                  </div>
                  <div className="scenario-controls">
                    <label>
                      <span>Scenario</span>
                      <select
                        aria-label="Scenario"
                        value={scenario}
                        onChange={(e) => runScenario(e.target.value as ScenarioId)}
                      >
                        {scenarios.map((value) => (
                          <option key={value.id} value={value.id}>
                            {value.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="traffic-control">
                      <span>
                        Traffic intensity <b>{trafficIntensity}×</b>
                      </span>
                      <input
                        aria-label="Traffic intensity"
                        type="range"
                        min="1"
                        max="6"
                        step="1"
                        value={trafficIntensity}
                        onChange={(e) => setTrafficIntensity(Number(e.target.value))}
                      />
                    </label>
                    <label>
                      <span>Playback speed</span>
                      <select
                        aria-label="Playback speed"
                        value={playbackSpeed}
                        onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                      >
                        <option value=".5">0.5×</option>
                        <option value="1">1×</option>
                        <option value="2">2×</option>
                        <option value="4">4×</option>
                      </select>
                    </label>
                    <button className="primary-button" onClick={() => runScenario()}>
                      <Play size={13} />
                      Run scenario
                    </button>
                    <button className="subtle-button" onClick={replayScenario}>
                      <RotateCcw size={13} />
                      Replay scenario
                    </button>
                  </div>
                  <p>{activeScenario.description}</p>
                </div>
              )}
              <div className="activity-header">
                <div>
                  <Activity size={14} />
                  <b>Activity timeline</b>
                  <span>{mode === 'replay' ? 'Recorded events' : 'Observed spans'}</span>
                </div>
                <span>{base.length ? `${time(first)} — ${time(last)}` : 'Waiting for events'}</span>
              </div>
              <Timeline
                spans={base}
                threshold={settings.latencyThreshold}
                cursor={mode === 'replay' ? replayPosition : undefined}
              />
              <div className="playback-row">
                <button
                  className="playback-button"
                  onClick={togglePause}
                  aria-label={
                    mode === 'replay'
                      ? playing
                        ? 'Pause'
                        : 'Play replay'
                      : paused
                        ? 'Resume'
                        : 'Pause'
                  }
                >
                  {mode === 'replay' ? (
                    playing ? (
                      <Pause size={15} />
                    ) : (
                      <Play size={15} />
                    )
                  ) : paused ? (
                    <Play size={15} />
                  ) : (
                    <Pause size={15} />
                  )}
                </button>
                <span>
                  {mode === 'replay'
                    ? playing
                      ? 'Replaying'
                      : 'Replay paused'
                    : paused
                      ? 'Paused · resume to continue'
                      : mode === 'synthetic'
                        ? 'Generating synthetic traces'
                        : 'Following activity'}
                </span>
                {mode === 'replay' ? (
                  <>
                    <input
                      aria-label="Replay position"
                      type="range"
                      min="0"
                      max="1000"
                      value={Math.round(replayPosition * 1000)}
                      onChange={(e) => setReplayPosition(Number(e.target.value) / 1000)}
                    />
                    <span className="mono">{Math.round(replayPosition * 100)}%</span>
                    <select
                      aria-label="Replay speed"
                      value={speed}
                      onChange={(e) => setSpeed(Number(e.target.value))}
                    >
                      <option value=".5">0.5×</option>
                      <option value="1">1×</option>
                      <option value="2">2×</option>
                      <option value="4">4×</option>
                      <option value="8">8×</option>
                    </select>
                  </>
                ) : (
                  <>
                    <span className="timeline-divider" />
                    <span>{spans.length.toLocaleString()} spans</span>
                    <span>{traceCount} traces</span>
                    <span className="live-timing">
                      <i className={status === 'connected' ? 'dot healthy' : 'dot paused'} />
                      {mode === 'synthetic' ? 'Synthetic sample' : connectionLabel}
                    </span>
                  </>
                )}
              </div>
            </div>
          </section>
          <aside className="inspector" data-testid="inspector">
            <div className="inspector-heading">
              <span>
                {traceId ? 'TRACE DETAILS' : edge ? 'DEPENDENCY INSPECTOR' : 'SERVICE INSPECTOR'}
              </span>
              {(selected || selectedEdge || traceId) && (
                <button
                  className="icon-button"
                  aria-label="Close inspector selection"
                  onClick={() => {
                    setSelected(null);
                    setSelectedEdge(null);
                    setTraceId(null);
                    setIsolated(false);
                  }}
                >
                  <X size={15} />
                </button>
              )}
            </div>
            {traceId ? (
              <TraceDetails spans={inspectedTrace} onReport={exportReport} />
            ) : edge ? (
              <div className="inspector-content">
                <div className="inspector-service-symbol">
                  <GitBranch size={25} />
                </div>
                <h2>Dependency</h2>
                <p className="inspector-subtitle">Observed parent–child relationship</p>
                <div className="dependency-path">
                  <b>{graph.nodes.find((n) => n.id === edge.source)?.name}</b>
                  <ArrowDownLeft size={19} />
                  <b>{graph.nodes.find((n) => n.id === edge.target)?.name}</b>
                </div>
                <div className="inspector-stats">
                  <span>
                    Observed spans<b>{edge.spanCount}</b>
                  </span>
                  <span>
                    Failed spans<b className="red">{edge.errorCount}</b>
                  </span>
                  <span>
                    p95 duration<b>{milliseconds(edge.p95)}</b>
                  </span>
                  <span>
                    Last observed<b>{time(edge.lastSeen)}</b>
                  </span>
                </div>
                <p className="inspector-explanation">
                  Counts refer to the child spans that establish this dependency. They are not
                  network request totals.
                </p>
              </div>
            ) : selectedNode ? (
              <div className="inspector-content">
                <div
                  className="inspector-service-symbol"
                  style={{ color: categoryColors[selectedNode.category] }}
                >
                  <IconFor category={selectedNode.category} />
                </div>
                <div className="service-title-row">
                  <h2>{selectedNode.name}</h2>
                  <span className={`status-pill ${selectedHasCurrentError ? 'failed' : 'ok'}`}>
                    {selectedHasCurrentError ? 'Latest request failed' : 'Latest request OK'}
                  </span>
                </div>
                <p className="inspector-subtitle">
                  {selectedNode.category} <span>·</span> Last seen {time(selectedNode.lastSeen)}
                </p>
                <div className="inspector-actions">
                  <button className="subtle-button" onClick={() => setFocusVersion((v) => v + 1)}>
                    <Focus size={13} />
                    Focus
                  </button>
                  <button
                    className={`subtle-button ${isolated ? 'toggled' : ''}`}
                    onClick={() => setIsolated(!isolated)}
                  >
                    <Maximize2 size={13} />
                    {isolated ? 'Show all' : 'Isolate'}
                  </button>
                </div>
                <div className="inspector-stats">
                  <span>
                    Observed spans<b>{selectedNode.spanCount}</b>
                  </span>
                  <span>
                    Error rate
                    <b className={selectedNode.errorCount ? 'red' : ''}>
                      {(
                        (selectedNode.errorCount / Math.max(1, selectedNode.spanCount)) *
                        100
                      ).toFixed(1)}
                      %
                    </b>
                  </span>
                  <span>
                    Latency · p50<b>{milliseconds(selectedNode.p50)}</b>
                  </span>
                  <span>
                    Latency · p95
                    <b className={selectedNode.p95 > settings.latencyThreshold ? 'amber' : ''}>
                      {milliseconds(selectedNode.p95)}
                    </b>
                  </span>
                </div>
                {mode === 'synthetic' && (
                  <div className={`scenario-evidence ${scenario}`}>
                    <span>SYNTHETIC EVIDENCE</span>
                    <h3>{activeScenario.title}</h3>
                    <p>
                      {scenario === 'slow' && selectedNode.category === 'database'
                        ? `${serviceSpans.filter((span) => span.durationMs > settings.latencyThreshold).length} database spans exceed ${settings.latencyThreshold} ms. SELECT order takes 900 ms in this scenario.`
                        : scenario === 'recovery'
                          ? `Latest request: ${latestServiceSpan?.status === 'error' ? 'failed' : 'successful'}. ${selectedNode.errorCount} earlier failed spans remain in history.`
                          : scenario === 'error'
                            ? 'A simulated HTTP 503 and SimulatedApiError event identify the failed API span.'
                            : activeScenario.description}
                    </p>
                    {latestServiceSpan && (
                      <button
                        className="text-button"
                        onClick={() => showTrace(latestServiceSpan.traceId)}
                      >
                        Inspect scenario trace
                        <ArrowRight size={13} />
                      </button>
                    )}
                  </div>
                )}
                <div className="inspector-section">
                  <h3>
                    Dependencies{' '}
                    <span>
                      {
                        graph.edges.filter((e) => e.source === selected || e.target === selected)
                          .length
                      }
                    </span>
                  </h3>
                  <div className="direction-filter">
                    <button
                      className={direction === 'all' ? 'chosen' : ''}
                      onClick={() => setDirection('all')}
                    >
                      All
                    </button>
                    <button
                      className={direction === 'incoming' ? 'chosen' : ''}
                      onClick={() => setDirection('incoming')}
                    >
                      Incoming
                    </button>
                    <button
                      className={direction === 'outgoing' ? 'chosen' : ''}
                      onClick={() => setDirection('outgoing')}
                    >
                      Outgoing
                    </button>
                  </div>
                  {graph.edges
                    .filter(
                      (e) =>
                        (direction !== 'outgoing' && e.target === selected) ||
                        (direction !== 'incoming' && e.source === selected),
                    )
                    .map((e) => {
                      const outgoing = e.source === selected;
                      const other = graph.nodes.find(
                        (n) => n.id === (outgoing ? e.target : e.source),
                      );
                      return (
                        <button
                          className="dependency-row"
                          key={e.id}
                          onClick={() => {
                            setSelected(other?.id || null);
                            setTraceId(null);
                          }}
                        >
                          {outgoing ? <ArrowUpRight size={15} /> : <ArrowDownLeft size={15} />}
                          <span>{other?.name}</span>
                          <small>{e.spanCount}</small>
                          <ChevronRight size={13} />
                        </button>
                      );
                    })}
                </div>
                <div className="inspector-section">
                  <h3>
                    Recent traces{' '}
                    <button onClick={() => setPage('traces')}>
                      View all
                      <ArrowRight size={11} />
                    </button>
                  </h3>
                  {traceGroups.slice(0, 4).map(([id, list]) => (
                    <button className="recent-trace" key={id} onClick={() => showTrace(id)}>
                      <i
                        className={
                          list.some((s) => s.status === 'error') ? 'dot error' : 'dot healthy'
                        }
                      />
                      <span>
                        <b>{list[0]?.operation}</b>
                        <code>{id.slice(-12)}</code>
                      </span>
                      <small>{milliseconds(Math.max(...list.map((s) => s.durationMs)))}</small>
                    </button>
                  ))}
                </div>
                {selectedNode.errorCount > 0 && (
                  <button className="error-investigation" onClick={() => setPage('errors')}>
                    <AlertTriangle size={15} />
                    {selectedNode.errorCount} failed spans
                    <ArrowRight size={14} />
                  </button>
                )}
              </div>
            ) : (
              <div className="inspector-default">
                <div className="inspector-orbit">
                  <Focus size={28} />
                </div>
                <h2>Zoom into the details.</h2>
                <p>
                  Select a service or a connection to see its activity, latency, and dependencies.
                </p>
                <div className="inspector-section">
                  <h3>
                    Universe health <span>OBSERVED</span>
                  </h3>
                  <div className="health-line">
                    <span>
                      <i className="dot healthy" />
                      Entities without errors
                    </span>
                    <b>{graph.nodes.filter((n) => !n.errorCount).length}</b>
                  </div>
                  <div className="health-line">
                    <span>
                      <i className="dot error" />
                      Entities with errors
                    </span>
                    <b>{graph.nodes.filter((n) => n.errorCount).length}</b>
                  </div>
                  <div className="health-line">
                    <span>
                      <i className="dot slow" />
                      Above latency threshold
                    </span>
                    <b>{graph.nodes.filter((n) => n.p95 > settings.latencyThreshold).length}</b>
                  </div>
                </div>
                <div className="inspector-section">
                  <h3>
                    Recent activity <span>{mode === 'synthetic' ? 'SYNTHETIC' : 'CAPTURED'}</span>
                  </h3>
                  {spans
                    .slice(-5)
                    .reverse()
                    .map((s) => (
                      <button
                        className="recent-trace"
                        key={`${s.traceId}:${s.spanId}`}
                        onClick={() => showTrace(s.traceId)}
                      >
                        <i
                          className={
                            s.status === 'error'
                              ? 'dot error'
                              : s.durationMs > settings.latencyThreshold
                                ? 'dot slow'
                                : 'dot healthy'
                          }
                        />
                        <span>
                          <b>{s.serviceName}</b>
                          <small>{s.operation}</small>
                        </span>
                        <small>{milliseconds(s.durationMs)}</small>
                      </button>
                    ))}
                  {!spans.length && <p className="no-activity">Events appear as spans arrive.</p>}
                </div>
                <div className="inspector-tip">
                  <Waypoints size={17} />
                  <p>
                    Every connection comes from observed spans. Discover your architecture as your
                    application runs.
                  </p>
                </div>
              </div>
            )}
            <div className="inspector-bottom">
              <ShieldCheck size={13} />
              {STATIC_DEMO
                ? 'Synthetic demo. No real telemetry accepted.'
                : 'Local-first. No data leaves this device.'}
            </div>
          </aside>
        </div>
        <footer className="main-footer">
          <span>See your app come alive in 3D.</span>
          <span>
            OPEN SOURCE<span>·</span>MIT LICENSE<span>·</span>NO CLOUD REQUIRED
          </span>
        </footer>
      </main>
      <input
        className="visually-hidden"
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        aria-label="Import session file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void importSession(file);
          e.target.value = '';
        }}
      />
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast('')}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {settingsOpen && (
        <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}>
          <section
            className="settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <SettingsIcon size={20} />
                <h2 id="settings-title">Your universe, your way.</h2>
              </div>
              <button
                className="icon-button"
                aria-label="Close settings"
                onClick={() => setSettingsOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            <p className="modal-description">Preferences save automatically in this browser.</p>
            <div className="settings-body">
              <div className="settings-section-title">APPEARANCE & PERFORMANCE</div>
              <label className="setting-row">
                <span>
                  Theme<small>Choose your workspace appearance</small>
                </span>
                <select
                  aria-label="Theme"
                  value={settings.theme}
                  onChange={(e) => setSettings({ theme: e.target.value as 'dark' | 'light' })}
                >
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                </select>
              </label>
              <label className="setting-row">
                <span>
                  Graphics quality<small>Low saves GPU work; Balanced caps resolution</small>
                </span>
                <select
                  aria-label="Graphics quality"
                  value={settings.quality}
                  onChange={(e) =>
                    setSettings({ quality: e.target.value as 'low' | 'balanced' | 'high' })
                  }
                >
                  <option value="low">Low · integrated graphics</option>
                  <option value="balanced">Balanced · recommended</option>
                  <option value="high">High</option>
                </select>
              </label>
              <label className="setting-row">
                <span>
                  Reduced motion<small>Stop pulses and moving particles</small>
                </span>
                <input
                  aria-label="Reduced motion"
                  type="checkbox"
                  checked={settings.reducedMotion}
                  onChange={(e) => setSettings({ reducedMotion: e.target.checked })}
                />
              </label>
              <RangeSetting
                label="Particle density"
                value={settings.particleDensity}
                min={0}
                max={2}
                step={0.25}
                onChange={(v) => setSettings({ particleDensity: v })}
              />
              <RangeSetting
                label="Animation intensity"
                value={settings.intensity}
                min={0.25}
                max={2}
                step={0.25}
                onChange={(v) => setSettings({ intensity: v })}
              />
              <RangeSetting
                label="Camera speed"
                value={settings.cameraSpeed}
                min={0.2}
                max={1.5}
                step={0.1}
                onChange={(v) => setSettings({ cameraSpeed: v })}
              />
              <label className="setting-row">
                <span>Maximum visible entities</span>
                <input
                  aria-label="Maximum visible entities"
                  type="number"
                  min="2"
                  max="150"
                  value={settings.maxNodes}
                  onChange={(e) =>
                    setSettings({ maxNodes: Math.min(150, Math.max(2, Number(e.target.value))) })
                  }
                />
              </label>
              <div className="settings-section-title">
                {STATIC_DEMO ? 'SCENARIO ANALYSIS' : 'TELEMETRY & CONNECTION'}
              </div>
              <label className="setting-row">
                <span>
                  Latency warning threshold<small>Milliseconds; applies to nodes and traffic</small>
                </span>
                <input
                  aria-label="Latency warning threshold"
                  type="number"
                  min="1"
                  max="60000"
                  value={settings.latencyThreshold}
                  onChange={(e) =>
                    setSettings({
                      latencyThreshold: Math.max(1, Math.min(60000, Number(e.target.value))),
                    })
                  }
                />
              </label>
              {!STATIC_DEMO && (
                <>
                  <label className="setting-row">
                    <span>
                      Retention<small>Minutes since receipt in local collector storage</small>
                    </span>
                    <input
                      aria-label="Event retention minutes"
                      type="number"
                      min="1"
                      max="1440"
                      value={settings.retentionMinutes}
                      onChange={(e) =>
                        setSettings({
                          retentionMinutes: Math.max(1, Math.min(1440, Number(e.target.value))),
                        })
                      }
                    />
                  </label>
                  <label className="setting-row">
                    <span>
                      Maximum retained spans<small>Cap collector and browser buffers</small>
                    </span>
                    <input
                      aria-label="Maximum retained spans"
                      type="number"
                      min="100"
                      max="50000"
                      step="100"
                      value={settings.maxSpans}
                      onChange={(e) =>
                        setSettings({
                          maxSpans: Math.max(100, Math.min(50000, Number(e.target.value))),
                        })
                      }
                    />
                  </label>
                  <label className="connection-field">
                    <span>Collector URL</span>
                    <input
                      aria-label="Collector URL"
                      value={connectionDraft}
                      onChange={(e) => setConnectionDraft(e.target.value)}
                      placeholder="http://127.0.0.1:4318"
                    />
                  </label>
                  <div className="privacy-note">
                    <ShieldCheck size={17} />
                    <p>
                      Only local HTTP collectors are accepted. The default endpoint is
                      http://127.0.0.1:4318. Telemetry stays on this device.
                    </p>
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="subtle-button" onClick={() => setSettingsOpen(false)}>
                Done
              </button>
              {!STATIC_DEMO && (
                <button className="primary-button" onClick={() => void saveConnection()}>
                  <Check size={14} />
                  Apply collector settings
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function Metric({
  title,
  value,
  icon,
  detail,
  warning = false,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  detail: string;
  warning?: boolean;
}) {
  return (
    <div className={`metric-card ${warning ? 'warning' : ''}`}>
      <div className="metric-label">
        {title}
        <span>{icon}</span>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-detail">
        {warning ? <i className="dot error" /> : <span className="metric-tick">↗</span>}
        {detail}
      </div>
    </div>
  );
}
function PanelHeading({
  icon,
  title,
  detail,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="panel-toolbar">
      <div className="panel-title">
        {icon}
        <b>{title}</b>
        <span>{detail}</span>
      </div>
      {action}
    </div>
  );
}
function EmptyPanel({ text, positive = false }: { text: string; positive?: boolean }) {
  return (
    <div className="empty-panel">
      {positive ? <ShieldCheck size={30} /> : <Activity size={30} />}
      <p>{text}</p>
    </div>
  );
}
function RangeSetting({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="setting-row">
      <span>{label}</span>
      <div className="range-field">
        <input
          aria-label={label}
          type="range"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <b>{value}×</b>
      </div>
    </label>
  );
}
function Timeline({
  spans,
  threshold,
  cursor,
}: {
  spans: NormalizedSpan[];
  threshold: number;
  cursor?: number;
}) {
  const buckets = useMemo(() => {
    const first = spans[0]?.startTime || 0,
      last = spans.at(-1)?.startTime || first;
    const b = Array.from({ length: 70 }, () => ({ count: 0, errors: 0, slow: 0 }));
    for (const span of spans) {
      const item =
        b[Math.min(69, Math.floor(((span.startTime - first) / Math.max(1, last - first)) * 69))]!;
      item.count++;
      if (span.status === 'error') item.errors++;
      else if (span.durationMs > threshold) item.slow++;
    }
    return b;
  }, [spans, threshold]);
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <svg
      className="timeline-chart"
      viewBox="0 0 700 54"
      preserveAspectRatio="none"
      role="img"
      aria-label={`${spans.length} observed spans distributed through time`}
    >
      <line x1="0" y1="51" x2="700" y2="51" stroke="#213144" />
      {buckets.map((b, i) => (
        <g key={i}>
          <rect
            x={i * 10 + 2}
            y={51 - (b.count / max) * 40}
            width="5"
            height={Math.max(1, (b.count / max) * 40)}
            rx="1"
            fill={b.errors ? '#ee7688' : b.slow ? '#eab163' : '#48bcb8'}
            opacity={b.count ? 0.8 : 0.13}
          >
            <title>
              {b.count} spans · {b.errors} failed · {b.slow} slow
            </title>
          </rect>
        </g>
      ))}
      {cursor !== undefined && (
        <line x1={cursor * 700} x2={cursor * 700} y1="0" y2="54" stroke="#afa0ff" strokeWidth="2" />
      )}
    </svg>
  );
}
function TraceDetails({ spans, onReport }: { spans: NormalizedSpan[]; onReport: () => void }) {
  if (!spans.length) return <EmptyPanel text="This trace is no longer in the retained buffer." />;
  const start = Math.min(...spans.map((s) => s.startTime)),
    duration = Math.max(...spans.map((s) => s.startTime + s.durationMs)) - start;
  const byId = new Map(spans.map((s) => [s.spanId, s]));
  function depth(s: NormalizedSpan) {
    let result = 0,
      parent = s.parentSpanId;
    const seen = new Set<string>();
    while (parent && byId.has(parent) && !seen.has(parent)) {
      seen.add(parent);
      result++;
      parent = byId.get(parent)?.parentSpanId;
    }
    return Math.min(5, result);
  }
  return (
    <div className="trace-details">
      <div className="trace-title">
        <GitBranch size={24} />
        <h2>{spans.find((s) => !s.parentSpanId)?.operation || spans[0]?.operation}</h2>
        <code title={spans[0]?.traceId}>{spans[0]?.traceId}</code>
      </div>
      <div className="trace-meta">
        <span>
          <Clock size={13} />
          {milliseconds(duration)}
        </span>
        <span>{spans.length} spans</span>
        <span>{new Set(spans.map((s) => s.serviceName)).size} services</span>
      </div>
      <h3>
        Span waterfall <small>{time(start)}</small>
      </h3>
      <div className="waterfall">
        {spans.map((s) => (
          <div key={s.spanId} className="waterfall-item" style={{ paddingLeft: depth(s) * 9 }}>
            <div className="waterfall-name">
              <i className={s.status === 'error' ? 'dot error' : 'dot healthy'} />
              <b title={s.operation}>{s.operation}</b>
              <small>{milliseconds(s.durationMs)}</small>
            </div>
            <p>{s.serviceName}</p>
            <div className="waterfall-track">
              <i
                style={{
                  left: `${((s.startTime - start) / Math.max(1, duration)) * 100}%`,
                  width: `${Math.max(0.8, (s.durationMs / Math.max(1, duration)) * 100)}%`,
                  background: s.status === 'error' ? '#f17d8e' : '#51c6c7',
                }}
              />
            </div>
            {s.events.length > 0 && (
              <div className="span-events">
                {s.events.map((event, i) => (
                  <span key={i}>
                    {event.name}
                    {event.attributes['exception.type']
                      ? ` · ${event.attributes['exception.type']}`
                      : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <details className="trace-attributes">
        <summary>Safe span attributes</summary>
        {spans.map((s) => (
          <div key={s.spanId}>
            <b>
              {s.serviceName} · {s.operation}
            </b>
            <pre>{JSON.stringify(s.attributes, null, 2)}</pre>
          </div>
        ))}
      </details>
      <p className="inspector-explanation">
        Bar lengths reflect received start times and durations. Uninstrumented operations and
        missing parents cannot be reconstructed.
      </p>
      <button className="subtle-button" onClick={onReport}>
        <Download size={14} />
        Export sanitized report
      </button>
    </div>
  );
}
function Documentation({
  collector,
  staticDemo,
  onCopy,
}: {
  collector: string;
  staticDemo: boolean;
  onCopy: (text: string) => void;
}) {
  if (staticDemo) {
    const install =
      'git clone https://github.com/prohz189hh-boop/traceverse.git\ncd traceverse\nnpm install\nnpm run demo';
    return (
      <>
        <PanelHeading
          icon={<Code2 size={17} />}
          title="Explore the demo"
          detail="Synthetic · browser only"
        />
        <div className="docs-content">
          <div className="docs-callout">
            <ShieldCheck size={22} />
            <div>
              <h3>A universe you can explore instantly.</h3>
              <p>
                This public preview runs entirely in your browser. Every node, connection, and
                measurement comes from bundled synthetic trace scenarios. It needs no account,
                backend, or API key.
              </p>
            </div>
          </div>
          <h3>
            <span className="step-number">1</span>Try the controls
          </h3>
          <p>
            Select a service or connection to open the inspector. Drag the 3D universe to rotate,
            scroll or pinch to zoom, and use Focus to follow an entity. The 2D view supports
            keyboard navigation. Search and filters narrow both views.
          </p>
          <h3>
            <span className="step-number">2</span>Investigate a scenario
          </h3>
          <p>
            Choose Success, Slow database, API failure, Heavy traffic, or Recovery below. Run
            scenario resets the synthetic observations and focuses the relevant service. Pause stops
            trace generation and animation. Replay scenario follows span timestamps; its slider and
            speed control let you investigate the history.
          </p>
          <h3>
            <span className="step-number">3</span>Observe your own application locally
          </h3>
          <p>
            Install Node.js 24 LTS, then run these commands. The local dashboard connects to a
            collector and the instrumented demo emits real OpenTelemetry spans.
          </p>
          <pre>
            <code>{install}</code>
            <button onClick={() => onCopy(install)}>Copy</button>
          </pre>
          <p>
            Open http://127.0.0.1:5173 and choose Demo for instrumented example traffic or Live for
            your application. The collector and SQLite history run on your machine. Real telemetry
            can only be imported into the local app; this public preview accepts synthetic sessions.
          </p>
          <div className="docs-tips">
            <div>
              <Globe size={20} />
              <h4>Touch and keyboard</h4>
              <p>
                Drag and pinch the 3D view. Switch to 2D to select entities with Tab and Enter.
                Press / to search and Escape to close Settings.
              </p>
            </div>
            <div>
              <SlidersHorizontal size={20} />
              <h4>Graphics that fit your device</h4>
              <p>
                Balanced is the default. Choose Low for integrated graphics, set particles to zero,
                or enable Reduced motion for a quieter view.
              </p>
            </div>
            <div>
              <Layers size={20} />
              <h4>Replay synthetic evidence</h4>
              <p>
                Save or export a scenario from Sessions. Synthetic exports can be imported here.
                Real local sessions belong in the local dashboard.
              </p>
            </div>
          </div>
        </div>
      </>
    );
  }
  const code = `OTEL_SERVICE_NAME=my-service\nOTEL_EXPORTER_OTLP_TRACES_ENDPOINT=${collector}/v1/traces\nOTEL_EXPORTER_OTLP_TRACES_PROTOCOL=http/json`;
  return (
    <>
      <PanelHeading
        icon={<Code2 size={17} />}
        title="Start observing"
        detail="Local OpenTelemetry collector"
      />
      <div className="docs-content">
        <div className="docs-callout">
          <ShieldCheck size={22} />
          <div>
            <h3>Free. Local. Yours.</h3>
            <p>
              TraceVerse accepts OTLP/HTTP JSON traces. The collector binds to 127.0.0.1 by default
              and keeps bounded telemetry in local SQLite storage. No account or cloud service is
              required.
            </p>
          </div>
        </div>
        <h3>
          <span className="step-number">1</span>Run the instrumented demo
        </h3>
        <pre>
          <code>npm install{'\n'}npm run demo</code>
          <button onClick={() => onCopy('npm install\nnpm run demo')}>Copy</button>
        </pre>
        <p>
          The example services emit genuine OpenTelemetry spans. Choose <b>Demo</b> to view them.
          Synthetic mode runs only a browser-generated sample.
        </p>
        <h3>
          <span className="step-number">2</span>Connect your Node.js application
        </h3>
        <p>
          The SDK is included as a workspace package in this repository, not yet published to npm.
          Initialize it before importing your application; its HTTP and Express instrumentations
          export JSON to the local collector.
        </p>
        <pre>
          <code>
            import {'{'} startTracing {'}'} from '@traceverse/sdk';{'\n'}startTracing('my-service');
            {'\n'}await import('./app.js');
          </code>
          <button
            onClick={() =>
              onCopy(
                "import { startTracing } from '@traceverse/sdk';\nstartTracing('my-service');\nawait import('./app.js');",
              )
            }
          >
            Copy
          </button>
        </pre>
        <h3>
          <span className="step-number">3</span>Use a compatible OTLP exporter
        </h3>
        <pre>
          <code>{code}</code>
          <button onClick={() => onCopy(code)}>Copy</button>
        </pre>
        <p>
          For instrumentations outside the SDK, use OTLP/HTTP JSON. Protobuf and gRPC ingestion are
          not supported in this release. See the repository's instrumentation docs for tested
          versions and Next.js setup.
        </p>
        <div className="docs-tips">
          <div>
            <Globe size={20} />
            <h4>Service discovery</h4>
            <p>
              Nodes come from service names and database or external dependency attributes. Parent
              spans establish connections.
            </p>
          </div>
          <div>
            <ShieldCheck size={20} />
            <h4>Safe attributes</h4>
            <p>
              Headers, request bodies, tokens, raw SQL, and URL queries are filtered. Exported
              sessions contain normalized spans.
            </p>
          </div>
          <div>
            <Layers size={20} />
            <h4>Keep a session</h4>
            <p>
              Save in Sessions, export JSON, then import and replay using the timeline. Collector
              history persists in local SQLite and expires by retention.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
