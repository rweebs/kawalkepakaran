// The record map on the chapter-report screens (Laporan Sanjaya and the finale): the terlapor and police-report part of the
// /pantau graph, laid out at build time (GameData.report.map). It renders first as a still SVG of that layout, which is
// what the server sends, what the version without animation keeps, and what a browser without WebGL keeps. When the screen
// allows 3D it loads world/report-map by dynamic import, as its own chunk, and swaps the canvas in. The legend, the
// tooltip, the panel and the parva rail are DOM around the picture: the canvas draws no text, and no aria-label names
// anyone, because names belong only inside the framed block the screen puts this map in. Every word comes in `labels`.
import '../../styles/bowobharata-game-map.css';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import type { Locale } from '../../i18n';
import type { MapGraph, MapLinkKind, MapNode } from '../../lib/bowobharata-game/report-types';
import {
  BG_HEX, DIM_HEX, HALO_SCALE, LINK_HEX, MAP_LINK_KINDS, MAP_SOURCES, NODE_HEX, SVG_H, SVG_W, WALK_MS, brightFor, entryFor, neighbours, railChips,
  sceneInput, shownUpTo, stillPicture, walkNext, walkStart, type RailChip, type StillPicture,
} from '../../lib/bowobharata-game/report-map-view';
import type { ReportMapApi } from '../../lib/bowobharata-game/world/report-map';

/** The map's words, from copy.ts. None of them names a person. */
export interface MapLabels {
  /** The map's heading. */
  title: string;
  /** How to turn, zoom and pick; shown under the 3D map only. */
  hint: string;
  /** Shown when the 3D map could not open and the still picture stays. */
  still: string;
  /** The picture's accessible name, on the SVG and the canvas alike. It names nobody. */
  aria: string;
  /** Each node colour's meaning: the legend, the tooltip and the panel. */
  sources: Record<MapNode['source'], string>;
  /** Each link kind's meaning: the legend and the panel's links. */
  links: Record<MapLinkKind, string>;
  /** What a bright node is, and a dim one (the legend). */
  bright: string;
  dim: string;
  /** What a node's size means (the legend). */
  size: string;
  /** The panel's heading over the selected node. */
  selected: string;
  /** The heading over the selected node's links. */
  linksTitle: string;
  /** Clears the selection. */
  clear: string;
  /** Jumps to the selected terlapor's entry on this screen. */
  entry: string;
  /** Each node kind, after its source in the panel. */
  kinds: Record<MapNode['kind'], string>;
  /** The parva rail: its group's accessible name, its chips and the walk button. */
  rail: { label: string; all: string; prologue: string; finale: string; chapter: (o: { n: number }) => string; walk: string; pause: string };
  /** Display names by node id, in place of the graph's own label: the hubs and groups whose labels the graph keeps in Indonesian. */
  names?: Record<string, string>;
}

/** The graph with its labels as shown: `names` replaces the label of each node it lists; names and report numbers stay as they are. */
export function namedGraph(graph: MapGraph, names?: Record<string, string>): MapGraph {
  if (!names || !graph.nodes.some((n) => names[n.id] !== undefined)) return graph;
  return { ...graph, nodes: graph.nodes.map((n) => (names[n.id] === undefined ? n : { ...n, label: names[n.id] })) };
}

export interface ReportMapProps {
  /** The page's locale. The map's own words come in `labels`; node labels are the dossier's. */
  locale: Locale;
  graph: MapGraph;
  /** Each chapter's terlapor ids, without the 'tl:' prefix, indexed like GameData.chapters. */
  chapterIds: readonly (readonly string[])[];
  /** The last chapter on the map: later nodes are absent. */
  upTo: number;
  /** The chapter whose terlapor are bright, or null for all. The rail changes it from here. */
  focus: number | null;
  /** Shows the parva rail and the walk (the finale). */
  rail?: boolean;
  /** Whether the 3D scene may replace the still picture: false in the version without animation. */
  allow3d: boolean;
  labels: MapLabels;
  /** Jumps to a terlapor's entry on this screen. */
  onEntry?: (id: string) => void;
}

let webgl: boolean | null = null;
/** Whether this browser draws WebGL: asked once per page, for webgl2 or webgl as /pantau asks, and the probe's context is let go. */
function webglOk(): boolean {
  if (webgl !== null) return webgl;
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    webgl = !!gl;
  } catch {
    webgl = false;
  }
  return webgl;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** The node under the pointer, and where the pointer is in the stage (px). */
interface Hover { i: number; x: number; y: number; w: number; h: number }

/** The tooltip sits beside the pointer, on whichever side keeps it inside the stage. */
function tipStyle(h: Hover): CSSProperties {
  return {
    ...(h.x < h.w * 0.6 ? { left: Math.round(h.x + 12) } : { right: Math.round(h.w - h.x + 12) }),
    ...(h.y < h.h * 0.7 ? { top: Math.round(h.y + 12) } : { bottom: Math.round(h.h - h.y + 12) }),
  };
}

/** The still picture: links, the halos of this chapter's nodes, then the nodes far to near, each with its label as a title, then the selection on top. */
function Still({ picture, aria, onClick }: { picture: StillPicture; aria: string; onClick: (e: MouseEvent<SVGSVGElement>) => void }) {
  return (
    <svg className="bg-map__svg" viewBox={`0 0 ${SVG_W} ${SVG_H}`} role="img" aria-label={aria} onClick={onClick}>
      <g strokeWidth={1} strokeLinecap="round">
        {picture.lines.map((l) => (
          <line key={l.key} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={l.color} strokeOpacity={l.opacity} />
        ))}
      </g>
      <g className="bg-map__halo">
        {picture.dots.map((d) => (
          <circle key={d.key} cx={d.cx} cy={d.cy} r={round1(d.r * HALO_SCALE)} fill={d.fill} fillOpacity={d.halo} />
        ))}
      </g>
      <g stroke={BG_HEX} strokeWidth={0.6}>
        {picture.dots.map((d) => (
          <circle key={d.key} data-i={d.i} cx={d.cx} cy={d.cy} r={d.r} fill={d.fill}>
            <title>{d.label}</title>
          </circle>
        ))}
      </g>
      {picture.ring && (
        <g className="bg-map__sel" stroke="#ffffff" fill="none">
          {picture.hot.map((h) => (
            <line key={h.key} x1={h.x1} y1={h.y1} x2={h.x2} y2={h.y2} strokeOpacity={0.95} strokeWidth={1.2} />
          ))}
          <circle cx={picture.ring.cx} cy={picture.ring.cy} r={picture.ring.r} strokeWidth={1} />
        </g>
      )}
    </svg>
  );
}

export function ReportMap({ graph, chapterIds, upTo, focus: focusProp, rail, allow3d, labels, onEntry }: ReportMapProps) {
  const [focus, setFocus] = useState<number | null>(focusProp);
  const [walking, setWalking] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const [want3d, setWant3d] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [canvasKey, setCanvasKey] = useState(0);
  // A screen may hand this map the next chapter without remounting it: start again from the new props. A new graph also
  // gets a new canvas, since the old one's context was let go with its scene.
  const [seen, setSeen] = useState({ graph, upTo, focusProp });
  if (seen.graph !== graph || seen.upTo !== upTo || seen.focusProp !== focusProp) {
    setSeen({ graph, upTo, focusProp });
    setFocus(focusProp);
    setWalking(false);
    setSelected(null);
    setHover(null);
    if (seen.graph !== graph) setCanvasKey((k) => k + 1);
  }

  const last = Math.max(0, chapterIds.length - 1);
  const shown = useMemo(() => shownUpTo(graph, upTo), [graph, upTo]);
  const bright = useMemo(() => brightFor(graph, chapterIds, focus, shown), [graph, chapterIds, focus, shown]);
  const sel = selected !== null && shown[selected] ? selected : null;
  const input = useMemo(() => sceneInput(graph), [graph]);
  const view = useMemo(() => namedGraph(graph, labels.names), [graph, labels.names]);
  const picture = useMemo(() => (ready ? null : stillPicture(view, shown, bright, sel)), [ready, view, shown, bright, sel]);
  const links = useMemo(() => (sel === null ? [] : neighbours(view, sel, shown)), [view, sel, shown]);

  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const apiRef = useRef<ReportMapApi | null>(null);
  /** Where keyboard focus goes once the selection changes from a panel button (whose list is about to be redrawn). */
  const focusNext = useRef<'title' | 'head' | null>(null);
  /** The state the scene opens with, read when it has loaded. */
  const latest = useRef({ shown, bright, sel });
  latest.current = { shown, bright, sel };

  // Ask for 3D once the page is live, if the screen allows it. Without WebGL the still picture stays, with its note.
  useEffect(() => {
    if (!allow3d) {
      setWant3d(false);
      setFailed(false);
      return;
    }
    const ok = webglOk();
    setFailed(!ok);
    setWant3d(ok);
  }, [allow3d]);

  // The scene lives as long as its canvas: loaded on demand, then freed with its context. Any failure keeps the still picture.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!want3d || !canvas) return;
    let live = true;
    let api: ReportMapApi | null = null;
    let sizes: ResizeObserver | null = null;
    const fit = () => api?.resize();
    const fail = () => {
      if (!live) return;
      setFailed(true);
      setWant3d(false);
    };
    import('../../lib/bowobharata-game/world/report-map')
      .then(({ createReportMap }) => {
        if (!live) return;
        api = createReportMap({
          ...input,
          canvas,
          reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
          onHover: (i, x, y) => {
            const r = stageRef.current?.getBoundingClientRect();
            setHover(i === null || !r ? null : { i, x: x - r.left, y: y - r.top, w: r.width, h: r.height });
          },
          onPick: (i) => {
            setSelected(i);
            if (i !== null) setWalking(false);
          },
        });
        const s = latest.current;
        api.setState(s.shown, s.bright, s.sel);
        apiRef.current = api;
        canvas.addEventListener('webglcontextlost', fail);
        if (typeof ResizeObserver === 'function') {
          sizes = new ResizeObserver(fit);
          sizes.observe(canvas);
        } else window.addEventListener('resize', fit);
        setReady(true);
      })
      .catch(fail);
    return () => {
      live = false;
      canvas.removeEventListener('webglcontextlost', fail);
      sizes?.disconnect();
      window.removeEventListener('resize', fit);
      api?.dispose();
      apiRef.current = null;
      setReady(false);
      setHover(null);
    };
  }, [want3d, input]);

  useEffect(() => {
    apiRef.current?.setState(shown, bright, sel);
  }, [shown, bright, sel]);

  // The walk: one chapter every WALK_MS, brightness only, until it has shown the last.
  useEffect(() => {
    if (!walking) return;
    const t = setTimeout(() => {
      const next = walkNext(focus, last);
      if (next === null) setWalking(false);
      else setFocus(next);
    }, WALK_MS);
    return () => clearTimeout(t);
  }, [walking, focus, last]);

  useEffect(() => {
    if (sel === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (panelRef.current?.contains(document.activeElement)) focusNext.current = 'title';
      setSelected(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sel]);

  useEffect(() => {
    const to = focusNext.current;
    focusNext.current = null;
    if (to === 'head') headRef.current?.focus();
    else if (to === 'title') titleRef.current?.focus();
  }, [sel]);

  /** Selects a node, or clears with null; a pick pauses the walk, as on /pantau. */
  const pick = (i: number | null) => {
    setSelected(i);
    if (i !== null) setWalking(false);
  };
  const choose = (value: number | null) => {
    setWalking(false);
    setFocus(value);
  };
  const toggleWalk = () => {
    if (walking) {
      setWalking(false);
      return;
    }
    setFocus(walkStart(focus, last));
    setWalking(true);
  };
  const onSvgClick = (e: MouseEvent<SVGSVGElement>) => {
    const v = (e.target as Element).getAttribute?.('data-i');
    pick(v ? Number(v) : null);
  };
  const chipText = (c: RailChip) =>
    c.kind === 'all' ? labels.rail.all : c.kind === 'prologue' ? labels.rail.prologue : c.kind === 'finale' ? labels.rail.finale : labels.rail.chapter({ n: c.value ?? 0 });

  const selNode = sel === null ? null : view.nodes[sel];
  const entry = sel === null ? null : entryFor(graph, sel, chapterIds, focus, upTo);
  const hovered = ready && hover ? view.nodes[hover.i] : null;
  const canvasClass = `bg-map__canvas${ready ? '' : ' bg-map__canvas--wait'}${hovered ? ' bg-map__canvas--pointer' : ''}`;

  return (
    <div className="bg-map">
      <h4 className="bg-map__title" ref={titleRef} tabIndex={-1}>{labels.title}</h4>
      {rail && (
        <div className="bg-map__rail" role="group" aria-label={labels.rail.label}>
          {railChips(last).map((c) => (
            <button key={c.key} type="button" className="bg-map__chip" aria-pressed={focus === c.value} onClick={() => choose(c.value)}>{chipText(c)}</button>
          ))}
          <button type="button" className="bg-map__walk" onClick={toggleWalk}>{walking ? labels.rail.pause : labels.rail.walk}</button>
        </div>
      )}
      <div className="bg-map__body">
        <div className="bg-map__stage" ref={stageRef}>
          {picture && <Still picture={picture} aria={labels.aria} onClick={onSvgClick} />}
          {want3d && <canvas key={canvasKey} ref={canvasRef} className={canvasClass} role="img" aria-label={labels.aria} />}
          {hovered && hover && (
            <div className="bg-map__tip" role="tooltip" style={tipStyle(hover)}>
              {hovered.label} <span className="bg-map__muted">· {labels.sources[hovered.source]}</span>
            </div>
          )}
        </div>
        <div className="bg-map__side">
          <ul className="bg-map__legend">
            {MAP_SOURCES.map((s) => (
              <li key={s} data-source={s}>
                <span className="bg-map__swatch" style={{ background: NODE_HEX[s] }} aria-hidden="true" />
                {labels.sources[s]}
              </li>
            ))}
            {MAP_LINK_KINDS.map((k) => (
              <li key={k} data-link={k}>
                <span className="bg-map__swatch bg-map__swatch--line" style={{ background: LINK_HEX[k] }} aria-hidden="true" />
                {labels.links[k]}
              </li>
            ))}
            <li data-key="bright">
              <span className="bg-map__pair">
                <span className="bg-map__swatch" style={{ background: NODE_HEX.perkara }} aria-hidden="true" />
                {labels.bright}
              </span>
              <span className="bg-map__pair">
                <span className="bg-map__swatch bg-map__swatch--dim" style={{ background: DIM_HEX }} aria-hidden="true" />
                {labels.dim}
              </span>
            </li>
            <li data-key="size">{labels.size}</li>
          </ul>
          <aside className="bg-map__panel" aria-live="polite" ref={panelRef}>
            {selNode && (
              <>
                <p className="bg-map__h">{labels.selected}</p>
                <p className="bg-map__kind">{labels.sources[selNode.source]} · {labels.kinds[selNode.kind]}</p>
                <h5 ref={headRef} tabIndex={-1}>{selNode.label}</h5>
                <div className="bg-map__actions">
                  <button type="button" className="bg-map__btn" onClick={() => { focusNext.current = 'title'; pick(null); }}>{labels.clear}</button>
                  {entry !== null && onEntry && (
                    <button type="button" className="bg-map__btn bg-map__btn--entry" onClick={() => onEntry(entry)}>{labels.entry}</button>
                  )}
                </div>
                {links.length > 0 && (
                  <>
                    <p className="bg-map__h">{labels.linksTitle}</p>
                    <ul className="bg-map__links">
                      {links.map((l) => (
                        <li key={l.other}>
                          <span className="bg-map__swatch bg-map__swatch--line" style={{ background: LINK_HEX[l.kind] }} aria-hidden="true" />
                          <button type="button" className="bg-map__link" onClick={() => { focusNext.current = 'head'; pick(l.other); }}>
                            {l.kind !== 'member' && <span aria-hidden="true">{l.dir === 'out' ? '→ ' : '← '}</span>}
                            {view.nodes[l.other].label}
                          </button>
                          <span className="bg-map__muted">{labels.links[l.kind]}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </aside>
        </div>
      </div>
      {ready && <p className="bg-map__hint">{labels.hint}</p>}
      {failed && <p className="bg-map__still">{labels.still}</p>}
    </div>
  );
}
