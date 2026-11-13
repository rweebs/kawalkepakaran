// The game's screens, rendered from props only (TouchControls alone keeps pointer state), so they can be checked with renderToString.
// Every named person and every block of dossier dates sits in an element marked data-entry together with the allegation
// line and the reply link, and every event card carries both too. The driving HUD (GameHud) shows counts, timers and
// speeds, and its toasts (toastText) counts, dates and channels only, never a name or an event title.
// The only casting of a real person, Abil Sudarman as Sengkuni, is the page's own labelled poster on the gate.
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { routePath, type Locale } from '../../i18n';
import { FRAMING, PARVAS, POSTERS } from '../../lib/bowobharata';
import { BOWO_UI, FRAMING_EN, PARVAS_EN, POSTERS_EN } from '../../lib/bowobharata-en';
import { GAME_COPY } from '../../lib/bowobharata-game/copy';
import type { ChapterView, EntryView, EventCard, PrologueRecord } from '../../lib/bowobharata-game/data';
import { SKIP_AFTER_FAILS, type Settings } from '../../lib/bowobharata-game/flow';
import type { HudSnapshot } from '../../lib/bowobharata-game/hud';
import { NO_TOUCH, type TouchState } from '../../lib/bowobharata-game/input';
import type { FailReason, GameEvent } from '../../lib/bowobharata-game/mission-run';
import type { MissionType } from '../../lib/bowobharata-game/missions';
import type { Totals } from '../../lib/bowobharata-game/record';
import { kategoriLabel } from '../../lib/perkara';

/** One event card in one language, as a screen shows it: `date` is the label, `dateTime` the ISO day. */
export interface CardView { key: string; date: string; dateTime: string; channel: string; title: string; href: string }

export function cardView(e: EventCard, locale: Locale): CardView {
  return { key: e.slug, date: e.dateLabel[locale], dateTime: e.date, channel: e.channel[locale], title: e.title[locale], href: e.path[locale] };
}

interface ChapterInfo { kicker: string | null; title: string; episode: string | null; id: string }
export function chapterInfo(i: number, locale: Locale): ChapterInfo {
  const c = GAME_COPY[locale];
  if (i === 0) return { kicker: null, title: c.prologueTitle, episode: c.prologueIntro, id: 'prologue' };
  const p = PARVAS[i - 1];
  if (!p) return { kicker: null, title: c.title, episode: null, id: 'finale' };
  const en = PARVAS_EN[p.id];
  return {
    kicker: `${BOWO_UI[locale].parva} ${p.number}`,
    title: locale === 'en' && en ? en.title : p.title,
    episode: locale === 'en' && en ? en.episode : p.episode,
    id: p.id,
  };
}

/** The kicker over a chapter's screens: "Parva 1 · Dadu di Hastinapura", or the chapter's own title. */
const chapterLine = (info: ChapterInfo) => (info.kicker ? `${info.kicker} · ${info.title}` : info.title);

const imgSrc = (x: unknown): string => (typeof x === 'string' ? x : (x as { src: string }).src);

/** The island reads this query and starts in the version without animation. */
const STILL_HREF = '?fallback=1';

/** A plain click switches in place; a click meant for a new tab or window follows the link. */
const inPlace = (go: () => void) => (e: MouseEvent<HTMLAnchorElement>) => {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  go();
};

function Allegation({ locale }: { locale: Locale }) {
  const c = GAME_COPY[locale];
  return (
    <p className="bg-allegation">
      {c.allegation} <a href={routePath('reply', locale)}>{c.reply}</a>
    </p>
  );
}

/** What the Kurawa ranks and the copies stand for, and who the Pelapor is. */
function Notes({ locale }: { locale: Locale }) {
  const c = GAME_COPY[locale];
  return (
    <>
      <p>{c.armyNote}</p>
      <p>{c.pelaporNote}</p>
    </>
  );
}

/** The right-of-reply link that follows FRAMING and the notes on the gate and the pause panel. */
function ReplyLink({ locale }: { locale: Locale }) {
  return <p><a href={routePath('reply', locale)}>{GAME_COPY[locale].reply}</a></p>;
}

/** The controls as two titled lists: the keyboard, then the touch screen. */
function Controls({ locale }: { locale: Locale }) {
  const c = GAME_COPY[locale];
  return (
    <>
      <h3>{c.controlsTitle.keys}</h3>
      <ul className="bg-controls">{c.controlsKeys.map((l) => <li key={l}>{l}</li>)}</ul>
      <h3>{c.controlsTitle.touch}</h3>
      <ul className="bg-controls">{c.controlsTouch.map((l) => <li key={l}>{l}</li>)}</ul>
    </>
  );
}

export interface PosterImg { src: string; srcset: string; sizes: string }
export interface GatePosters { krishna: PosterImg; sengkuni: PosterImg }

export function Gate({ locale, fallback, onStart, posters }: { locale: Locale; fallback: boolean; onStart: () => void; posters?: GatePosters }) {
  const c = GAME_COPY[locale];
  const framing = locale === 'en' ? FRAMING_EN : FRAMING;
  const alt = locale === 'en' ? POSTERS_EN : POSTERS;
  return (
    <section className="bg-screen bg-gate" aria-labelledby="bg-gate-title">
      <p className="bg-kicker">{c.kicker}</p>
      <h2 id="bg-gate-title" className="bg-title">{c.title}</h2>
      <h3>{c.gateTitle}</h3>
      {framing.map((p) => <p key={p}>{p}</p>)}
      <Notes locale={locale} />
      <ReplyLink locale={locale} />
      <div className="bg-posters">
        <figure data-poster="krishna">
          <img src={posters?.krishna.src ?? imgSrc(POSTERS.krishna.src)} srcSet={posters?.krishna.srcset} sizes={posters?.krishna.sizes} alt={alt.krishna.alt} loading="lazy" decoding="async" width={1206} height={1291} />
        </figure>
        <figure data-poster="sengkuni">
          <img src={posters?.sengkuni.src ?? imgSrc(POSTERS.sengkuni.src)} srcSet={posters?.sengkuni.srcset} sizes={posters?.sengkuni.sizes} alt={alt.sengkuni.alt} loading="lazy" decoding="async" width={1206} height={1302} />
        </figure>
      </div>
      <Controls locale={locale} />
      {fallback && <p className="bg-note">{c.fallbackNote}</p>}
      <div className="bg-actions"><button type="button" className="btn" onClick={onStart}>{c.gateStart}</button></div>
    </section>
  );
}

/** A chapter's opening card. In 3D it takes the corner layout, so the field stays in view behind it. */
export function Intro({ locale, chapterIndex, onNext, layout }: { locale: Locale; chapterIndex: number; onNext: () => void; layout?: 'corner' }) {
  const c = GAME_COPY[locale];
  const info = chapterInfo(chapterIndex, locale);
  const isFinale = info.id === 'finale';
  return (
    <section className={layout === 'corner' ? 'bg-screen bg-intro bg-mission' : 'bg-screen bg-intro'} data-layout={layout} aria-labelledby="bg-intro-title">
      {info.kicker && <p className="bg-kicker">{info.kicker}</p>}
      <h2 id="bg-intro-title">{info.title}</h2>
      {info.episode && <p className="bg-episode">{info.episode}</p>}
      <blockquote className="bg-krishna"><p>{c.krishnaLine[info.id]}</p></blockquote>
      <div className="bg-actions">
        <button type="button" className="btn" onClick={onNext}>{isFinale ? c.actions.next : c.actions.play}</button>
      </div>
    </section>
  );
}

/** The card shown at a lakon's intro: the chapter, its type and the guide line. It never shows the episode, whose epic
 * text is the Intro's alone; the prologue is labelled by its own title. */
export function MissionCard({ locale, chapterIndex, type }: { locale: Locale; chapterIndex: number; type: MissionType }) {
  const c = GAME_COPY[locale];
  const info = chapterInfo(chapterIndex, locale);
  return (
    <section className="bg-screen bg-mission">
      <p className="bg-kicker">{c.lakonKicker({ label: info.kicker ?? info.title })}</p>
      {info.kicker && <h2>{info.title}</h2>}
      <p className="bg-note" data-type={type}>{c.types[type]}</p>
      <blockquote className="bg-krishna"><p>{c.krishnaLine[info.id]}</p></blockquote>
    </section>
  );
}

/** One linimasa event: date and channel, title, the allegation line with the reply link, and the source link. It is a
 * still-screen card: only Recorded and FallbackPlay render it, never anything shown during play. */
export function CatchCard({ locale, card }: { locale: Locale; card: CardView }) {
  const c = GAME_COPY[locale];
  return (
    <article className="bg-catch" data-catch>
      <p className="bg-catch__meta"><time dateTime={card.dateTime}>{card.date}</time> · {card.channel}</p>
      <h3>{card.title}</h3>
      <Allegation locale={locale} />
      <a href={card.href}>{c.catchSource}</a>
    </article>
  );
}

/** The prologue's record: the count, then its dates in one framed block. The dates name nobody, but they come from the
 * dossier, so they sit under the allegation line with the reply link. */
function PrologueRecords({ locale, prologue }: { locale: Locale; prologue: PrologueRecord[] }) {
  const r = GAME_COPY[locale].recordedScreen;
  return (
    <>
      <p>{r.prologue({ n: prologue.length })}</p>
      <section className="bg-entry" data-entry="prologue-dates">
        <h3>{r.dates}</h3>
        <Allegation locale={locale} />
        <ol className="bg-rows">
          {prologue.map((d, i) => <li key={i}><time dateTime={d.iso}>{d.label}</time></li>)}
        </ol>
      </section>
    </>
  );
}

/** Tercatat: what went on record in the chapter. `whole` is false when the skip after two fails filled the rest in. */
export function Recorded({ locale, chapterIndex, cards, prologue, whole, onNext }: {
  locale: Locale; chapterIndex: number; cards: EventCard[]; prologue: PrologueRecord[]; whole: boolean; onNext: () => void;
}) {
  const c = GAME_COPY[locale];
  return (
    <section className="bg-screen bg-recorded" aria-labelledby="bg-recorded-title">
      <p className="bg-kicker">{chapterLine(chapterInfo(chapterIndex, locale))}</p>
      <h2 id="bg-recorded-title">{c.recordedScreen.title}</h2>
      {!whole && <p className="bg-note">{c.recordedScreen.skipped}</p>}
      {chapterIndex === 0
        ? <PrologueRecords locale={locale} prologue={prologue} />
        : cards.map((e) => cardView(e, locale)).map((card) => <CatchCard key={card.key} locale={locale} card={card} />)}
      <div className="bg-actions"><button type="button" className="btn" onClick={onNext}>{c.actions.next}</button></div>
    </section>
  );
}

function FullEntry({ locale, e }: { locale: Locale; e: EntryView }) {
  const f = GAME_COPY[locale].fields;
  return (
    <article className="bg-entry" data-entry={e.id}>
      <h3>{e.nama}</h3>
      <Allegation locale={locale} />
      <p className="bg-entry__cat">{kategoriLabel(e.kategori)}{e.klaster ? ` · ${e.klaster}` : ''}</p>
      <dl>
        <dt>{f.dugaan}</dt>
        <dd>{e.dugaan}</dd>
        {e.pasal.length > 0 && <><dt>{f.pasal}</dt><dd>{e.pasal.join(', ')}</dd></>}
        {e.laporan.length > 0 && <><dt>{f.laporan}</dt><dd>{e.laporan.join(', ')}</dd></>}
        <dt>{f.rows} ({e.rows.length})</dt>
        <dd>
          <ol className="bg-rows">
            {e.rows.map((r, i) => <li key={i}><time dateTime={r.iso ?? undefined}>{r.tanggal}</time> · {r.peristiwa}</li>)}
          </ol>
        </dd>
      </dl>
    </article>
  );
}

export function SanjayaReport({ locale, chapterIndex, chapter, onNext }: { locale: Locale; chapterIndex: number; chapter: ChapterView; onNext: () => void }) {
  const c = GAME_COPY[locale];
  const full = chapter.entries.filter((e) => e.full);
  const again = chapter.entries.filter((e) => !e.full);
  return (
    <section className="bg-screen bg-sanjaya" aria-labelledby="bg-sanjaya-title">
      <p className="bg-kicker">{chapterLine(chapterInfo(chapterIndex, locale))}</p>
      <h2 id="bg-sanjaya-title">{c.sanjayaTitle}</h2>
      <p>{c.sanjayaIntro}</p>
      {chapter.entries.length === 0 && <p className="bg-note">{c.sanjayaNone}</p>}
      {full.map((e) => <FullEntry key={e.id} locale={locale} e={e} />)}
      {again.length > 0 && (
        <>
          <h3>{c.nameOnly}</h3>
          <ul className="bg-again">
            {again.map((e) => (
              <li key={e.id} data-entry={e.id}>
                <strong>{e.nama}</strong>
                <span className="bg-allegation">{c.allegation} <a href={routePath('reply', locale)}>{c.reply}</a></span>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="bg-actions"><button type="button" className="btn" onClick={onNext}>{c.actions.next}</button></div>
    </section>
  );
}

/** The version without animation: the chapter's events taken into the record one by one. The prologue is one step,
 * which shows its framed dates. */
export function FallbackPlay({ locale, chapterIndex, cards, prologue, taken, onTake, onDone }: {
  locale: Locale; chapterIndex: number; cards: EventCard[]; prologue: PrologueRecord[]; taken: number; onTake: () => void; onDone: () => void;
}) {
  const c = GAME_COPY[locale];
  const isPrologue = chapterIndex === 0;
  const steps = isPrologue ? 1 : cards.length;
  const done = taken >= steps;
  return (
    <section className="bg-screen bg-fallback">
      <p className="bg-note">{c.fallbackNote}</p>
      {isPrologue ? (
        <div className="bg-taken" aria-live="polite">{taken > 0 && <PrologueRecords locale={locale} prologue={prologue} />}</div>
      ) : (
        <ol className="bg-taken" aria-live="polite">
          {cards.slice(0, taken).map((e) => cardView(e, locale)).map((card) => <li key={card.key}><CatchCard locale={locale} card={card} /></li>)}
        </ol>
      )}
      <div className="bg-actions">
        {done
          ? <button type="button" className="btn" onClick={onDone}>{c.actions.next}</button>
          : <button type="button" className="btn" onClick={onTake}>{c.actions.take} ({taken + 1}/{steps})</button>}
      </div>
    </section>
  );
}

/** A toast on the HUD: its line, from toastText, and a key that stays with it while it shows. */
export interface HudToast { id: number; text: string }

/** The objective line of a snapshot, counts only; null where there is none (the gate, course and lap lines come with
 * Task 31). */
function objectiveLine(hud: HudSnapshot, locale: Locale): string | null {
  const o = GAME_COPY[locale].objectives;
  switch (hud.objective) {
    case 'roam':
      return o.roam;
    case 'prologue':
      return o.prologue({ done: hud.done, total: hud.total });
    case 'collect':
      return o.collect({ done: hud.done, total: hud.total });
    case 'tower':
      return o.tower;
    case 'stop':
      return o.stop;
    default:
      return null;
  }
}

/** Whole seconds as m:ss. */
const clockOf = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** The ring's drawing, in px: the SVG's size, the radius and the stroke width. */
const RING = { size: 36, r: 15, stroke: 4 } as const;

/**
 * A ring gauge: a faint track and an arc swept clockwise from the top, 360° times the fill (data-sweep, in whole
 * degrees). It lights in the accent while `lit`. Laju's ring fills as the surge recharges, Mata's with the sight's charge;
 * on touch the buttons carry the same markup (Task 35).
 */
export function Ring({ kind, label, fill, lit }: { kind: 'surge' | 'sight'; label: string; fill: number; lit: boolean }) {
  const f = Number.isFinite(fill) ? Math.min(1, Math.max(0, fill)) : 0;
  const sweep = Math.round(360 * f);
  const mid = RING.size / 2;
  const around = 2 * Math.PI * RING.r;
  return (
    <div
      className="bg-ring" data-ring={kind} data-sweep={sweep} data-lit={lit ? '' : undefined}
      role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(f * 100)}
    >
      <svg width={RING.size} height={RING.size} viewBox={`0 0 ${RING.size} ${RING.size}`} aria-hidden="true">
        <circle cx={mid} cy={mid} r={RING.r} fill="none" stroke="currentColor" strokeOpacity={0.3} strokeWidth={RING.stroke} />
        {sweep > 0 && (
          <circle
            cx={mid} cy={mid} r={RING.r} fill="none" stroke="currentColor" strokeWidth={RING.stroke}
            strokeDasharray={`${(around * sweep) / 360} ${around}`} transform={`rotate(-90 ${mid} ${mid})`}
          />
        )}
      </svg>
      <span className="bg-ring__label">{label}</span>
    </div>
  );
}

/**
 * The driving HUD at the stage's corners, from one snapshot: counts, timers and speeds only, never a name, a title or a
 * date. Top left, the objective panel: the objective, the muted hint line, the timer, the frame line, pause and full
 * screen. Bottom right, the speed with the Laju and Mata rings (on touch the buttons carry the rings). The toasts sit in
 * a polite live region, bottom left (under the objective panel on touch).
 */
export function GameHud({ locale, hud, touch, paused, toasts, onPause, onFullscreen, canFullscreen, fullscreen = false }: {
  locale: Locale; hud: HudSnapshot; touch: boolean; paused: boolean; toasts: readonly HudToast[];
  onPause: () => void; onFullscreen: () => void; canFullscreen: boolean; fullscreen?: boolean;
}) {
  const c = GAME_COPY[locale];
  const line = objectiveLine(hud, locale);
  return (
    <div className="bg-hud" data-touch={touch ? '' : undefined}>
      <div className="bg-objective">
        {line && <p className="bg-objective__line">{line}</p>}
        {hud.hint && <p className="bg-hint">{c.hints[hud.hint][touch ? 'touch' : 'keys']}</p>}
        {hud.timer !== null && <p className="bg-timer"><time dateTime={`PT${Math.max(0, Math.floor(hud.timer))}S`}>{clockOf(hud.timer)}</time></p>}
        <p className="bg-frame">{c.hudFrame}</p>
        <div className="bg-actions">
          <button type="button" className="btn" aria-pressed={paused} onClick={onPause}>{c.hud.pause}</button>
          {canFullscreen && <button type="button" className="btn" aria-pressed={fullscreen} onClick={onFullscreen}>{c.fullscreen}</button>}
        </div>
      </div>
      <div className="bg-gauges">
        <p className="bg-speed" data-gauge="speed"><b>{hud.speedKmh}</b> {c.ride.speedUnit}</p>
        {!touch && (
          <div className="bg-rings">
            <Ring kind="surge" label={c.ride.surge} fill={hud.surge.frac} lit={hud.surge.ready} />
            <Ring kind="sight" label={c.ride.sight} fill={hud.sight.charge} lit={hud.sight.on} />
          </div>
        )}
      </div>
      <div className="bg-toasts" role="status" aria-live="polite">
        {toasts.map((t) => <p key={t.id} className="bg-toast">{t.text}</p>)}
      </div>
    </div>
  );
}

/** The capsule that floats under the steer finger: 140 x 56 px, with a knob at the finger's travel. */
const CAPSULE = { w: 140, h: 56 } as const;

type Hold = 'brake' | 'boost' | 'sight' | 'ride';

/**
 * The touch controls (phones): the steer zone (left 46% x bottom 55%) with a floating capsule under the finger, and the
 * Rem, Laju and Mata buttons (Maju too in manual mode). Laju and Mata carry the same rings as GameHud's. Each control
 * captures its own pointer and lets go on lift, cancel, leave or lost capture, so nothing stays on. `onChange` gets the
 * whole state on every change; it is left idle when the controls unmount.
 */
export function TouchControls({ locale, manual, onChange, surge, sight }: {
  locale: Locale; manual: boolean; onChange: (t: TouchState) => void; surge: HudSnapshot['surge']; sight: HudSnapshot['sight'];
}) {
  const c = GAME_COPY[locale].touch;
  const state = useRef<TouchState>({ ...NO_TOUCH });
  const change = useRef(onChange);
  change.current = onChange;
  // The pointer each control holds, by control; a different pointer of the same control is ignored.
  const holds = useRef<Partial<Record<Hold | 'steer', number>>>({});
  const origin = useRef({ x: 0, y: 0 });
  const [capsule, setCapsule] = useState<{ x: number; y: number; dx: number } | null>(null);
  const [lit, setLit] = useState<Partial<Record<Hold, true>>>({});

  const emit = (patch: Partial<TouchState>) => {
    state.current = { ...state.current, ...patch };
    change.current(state.current);
  };
  useEffect(() => () => {
    holds.current = {};
    change.current({ ...NO_TOUCH });
  }, []);

  const capture = (e: ReactPointerEvent<HTMLElement>) => {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* a pointer that is already gone */ }
  };

  const hold = (k: Hold) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (holds.current[k] !== undefined) return;
      e.preventDefault();
      capture(e);
      holds.current[k] = e.pointerId;
      setLit((l) => ({ ...l, [k]: true }));
      emit({ [k]: true });
    },
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => letGo(k, e.pointerId),
    onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => letGo(k, e.pointerId),
    onPointerLeave: (e: ReactPointerEvent<HTMLElement>) => letGo(k, e.pointerId),
    onLostPointerCapture: (e: ReactPointerEvent<HTMLElement>) => letGo(k, e.pointerId),
    onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
  });
  const letGo = (k: Hold, id: number) => {
    if (holds.current[k] !== id) return;
    delete holds.current[k];
    setLit((l) => {
      const { [k]: _gone, ...rest } = l;
      return rest;
    });
    emit({ [k]: false });
  };

  const steerGo = (id: number) => {
    if (holds.current.steer !== id) return;
    delete holds.current.steer;
    setCapsule(null);
    emit({ steerDx: null });
  };
  const steer = {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (holds.current.steer !== undefined) return;
      e.preventDefault();
      capture(e);
      holds.current.steer = e.pointerId;
      const r = e.currentTarget.getBoundingClientRect();
      origin.current = { x: e.clientX, y: e.clientY };
      setCapsule({ x: e.clientX - r.left, y: e.clientY - r.top, dx: 0 });
      emit({ steerDx: 0 });
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      if (holds.current.steer !== e.pointerId) return;
      const dx = e.clientX - origin.current.x;
      setCapsule((cap) => (cap ? { ...cap, dx } : cap));
      emit({ steerDx: dx });
    },
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => steerGo(e.pointerId),
    onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => steerGo(e.pointerId),
    onPointerLeave: (e: ReactPointerEvent<HTMLElement>) => steerGo(e.pointerId),
    onLostPointerCapture: (e: ReactPointerEvent<HTMLElement>) => steerGo(e.pointerId),
    onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
  };
  const knob = capsule ? Math.max(-1, Math.min(1, capsule.dx / 56)) * (CAPSULE.w / 2 - CAPSULE.h / 2) : 0;

  return (
    <div className="bg-touch">
      <div className="bg-touch__steer" data-steer aria-label={c.steer} role="group" {...steer}>
        {capsule && (
          <span className="bg-touch__capsule" style={{ left: capsule.x, top: capsule.y }} aria-hidden="true">
            <span className="bg-touch__knob" style={{ transform: `translateX(${knob}px)` }} />
          </span>
        )}
      </div>
      <button type="button" className="bg-touch__btn bg-touch__btn--rem" aria-label={c.brake} data-held={lit.brake ? '' : undefined} {...hold('brake')}>
        <span className="bg-touch__label">{c.brake}</span>
      </button>
      <button type="button" className="bg-touch__btn bg-touch__btn--surge" aria-label={c.surge} data-held={lit.boost ? '' : undefined} {...hold('boost')}>
        <Ring kind="surge" label={c.surge} fill={surge.frac} lit={surge.ready} />
      </button>
      <button type="button" className="bg-touch__btn bg-touch__btn--mata" aria-label={c.sight} data-held={lit.sight ? '' : undefined} {...hold('sight')}>
        <Ring kind="sight" label={c.sight} fill={sight.charge} lit={sight.on} />
      </button>
      {manual && (
        <button type="button" className="bg-touch__btn bg-touch__btn--ride" aria-label={c.ride} data-held={lit.ride ? '' : undefined} {...hold('ride')}>
          <span className="bg-touch__label">{c.ride}</span>
        </button>
      )}
    </div>
  );
}

/** The soft fail: why the record is not whole yet, retry, and from the second fail the way to go on with the story. */
export function FailCard({ locale, reason, fails, assist, onRetry, onSkip }: {
  locale: Locale; reason: FailReason; fails: number; assist: boolean; onRetry: () => void; onSkip: () => void;
}) {
  const f = GAME_COPY[locale].fail;
  const canSkip = fails >= SKIP_AFTER_FAILS;
  return (
    <section className="bg-screen bg-fail" role="status" aria-labelledby="bg-fail-title">
      <h2 id="bg-fail-title">{f.title}</h2>
      <p>{f[reason]}</p>
      {!assist && <p className="bg-note">{f.assist}</p>}
      <div className="bg-actions">
        <button type="button" className="btn" onClick={onRetry}>{f.retry}</button>
        {canSkip && <button type="button" className="btn" onClick={onSkip}>{f.skip}</button>}
      </div>
      {canSkip && <p className="bg-note">{f.skipNote}</p>}
    </section>
  );
}

export function DataError({ locale, onRetry }: { locale: Locale; onRetry: () => void }) {
  const c = GAME_COPY[locale];
  return (
    <section className="bg-screen bg-error" role="alert">
      <p>{c.dataError.message}</p>
      <div className="bg-actions"><button type="button" className="btn" onClick={onRetry}>{c.dataError.retry}</button></div>
    </section>
  );
}

/** The pause panel, in the brief's order: resume (and, when given, retry and the way to the marker); FRAMING, the notes
 * and the reply link; the controls; the two settings toggles; then the link to the version without animation. */
export function Paused({ locale, onResume, settings, onSettings, onRetry, onToMarker, onUseStill }: {
  locale: Locale; onResume: () => void; settings: Settings; onSettings: (s: Settings) => void;
  onRetry?: () => void; onToMarker?: () => void; onUseStill: () => void;
}) {
  const c = GAME_COPY[locale];
  const framing = locale === 'en' ? FRAMING_EN : FRAMING;
  const toggle = (key: keyof Settings) => () => onSettings({ ...settings, [key]: !settings[key] });
  return (
    <section className="bg-screen bg-paused" aria-labelledby="bg-paused-title">
      <h2 id="bg-paused-title">{c.hud.pause}</h2>
      <div className="bg-actions">
        <button type="button" className="btn" onClick={onResume}>{c.actions.resume}</button>
        {onRetry && <button type="button" className="btn" onClick={onRetry}>{c.settings.retry}</button>}
        {onToMarker && <button type="button" className="btn" onClick={onToMarker}>{c.settings.toMarker}</button>}
      </div>
      {framing.map((p) => <p key={p}>{p}</p>)}
      <Notes locale={locale} />
      <ReplyLink locale={locale} />
      <Controls locale={locale} />
      <h3>{c.settings.title}</h3>
      <div className="bg-actions">
        <button type="button" className="btn" aria-pressed={settings.assist} onClick={toggle('assist')}>{c.settings.assist}</button>
        <button type="button" className="btn" aria-pressed={settings.easy} onClick={toggle('easy')}>{c.settings.easy}</button>
      </div>
      <p><a href={STILL_HREF} onClick={inPlace(onUseStill)}>{c.settings.still}</a></p>
    </section>
  );
}

/** Offered when the 3D scene stays slow: the version without animation, or keep playing. */
export function SlowPrompt({ locale, onUseStill, onKeepPlaying }: { locale: Locale; onUseStill: () => void; onKeepPlaying: () => void }) {
  const s = GAME_COPY[locale].slow;
  return (
    <section className="bg-screen bg-slow" role="status">
      <p>{s.message}</p>
      <div className="bg-actions">
        <button type="button" className="btn" onClick={onUseStill}>{s.useStill}</button>
        <button type="button" className="btn" onClick={onKeepPlaying}>{s.keepPlaying}</button>
      </div>
    </section>
  );
}

export function Finale({ locale, totals, onAgain }: { locale: Locale; totals: Totals; onAgain: () => void }) {
  const c = GAME_COPY[locale];
  const lines = c.finaleTotals(totals);
  const label = lines[lines.length - 1];
  return (
    <section className="bg-screen bg-finale" aria-labelledby="bg-finale-title">
      <h2 id="bg-finale-title" className="bg-title">{c.title}</h2>
      {lines.slice(0, -1).map((l) => <p key={l}>{l}</p>)}
      <p><a href={routePath('monitor', locale)}>{label}</a></p>
      <article className="bg-entry bg-close" data-entry="finale-close">
        <p>{c.finaleClose}</p>
        <Allegation locale={locale} />
      </article>
      <div className="bg-actions"><button type="button" className="btn" onClick={onAgain}>{c.actions.again}</button></div>
    </section>
  );
}

/**
 * The toast for a lakon event, or null when the event shows none. A toast carries counts, dates and channels only, never a
 * name or an event title. A record of a parva shows its card's date and channel; the prologue's records, and any record
 * whose card `cardOf` cannot give, show the count alone.
 */
export function toastText(
  e: GameEvent,
  locale: Locale,
  chapter: number,
  cardOf: (card: number) => { date: string; channel: string } | null,
): string | null {
  const t = GAME_COPY[locale].toasts;
  switch (e.type) {
    case 'recorded': {
      const meta = chapter === 0 ? null : cardOf(e.card);
      return meta
        ? t.recorded({ n: e.n, total: e.total, date: meta.date, channel: meta.channel })
        : t.recordedPrologue({ n: e.n, total: e.total });
    }
    case 'filed':
      return t.filed;
    case 'rewriteTaken':
      return t.rewrite;
    case 'held':
      return t.ranks;
    case 'checkpoint':
      return t.checkpoint;
    case 'wall':
      return t.wall;
    default:
      return null;
  }
}
