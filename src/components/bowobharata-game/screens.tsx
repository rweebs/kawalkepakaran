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
import { createTouchPointers, type TouchState } from '../../lib/bowobharata-game/input';
import type { FailReason, GameEvent } from '../../lib/bowobharata-game/mission-run';
import type { MissionType } from '../../lib/bowobharata-game/missions';
import type { Totals } from '../../lib/bowobharata-game/record';
import type { ChapterReport, ReportData } from '../../lib/bowobharata-game/report-types';
import { kategoriLabel, type Tahap } from '../../lib/perkara';
import { BarList, Columns, StatTiles, TimeStrip, type Mark } from './charts';
import { ReportMap } from './ReportMap';

/** One event card in one language, as a screen shows it: `date` is the label, `dateTime` the ISO day. */
export interface CardView { key: string; date: string; dateTime: string; channel: string; title: string; summary: string; href: string }

export function cardView(e: EventCard, locale: Locale): CardView {
  return {
    key: e.slug, date: e.dateLabel[locale], dateTime: e.date, channel: e.channel[locale], title: e.title[locale], summary: e.summary[locale],
    href: e.path[locale],
  };
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
      <p className="bg-catch__summary">{card.summary}</p>
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

/** A whole day in the locale's long form, read in UTC: "26 April 2026", "April 26, 2026". */
const longDay = (locale: Locale, iso: string) =>
  new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${iso}T00:00:00Z`));

/** A dossier ISO date at its own precision, in the locale and UTC: '2023', 'September 2023' or a whole day as longDay. */
const isoLabel = (locale: Locale, iso: string) => {
  const parts = iso.split('-');
  if (parts.length >= 3) return longDay(locale, iso.slice(0, 10));
  if (parts.length === 1) return iso;
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${iso}-01T00:00:00Z`));
};

/** The parva windows as chart marks, labelled 1 to 8; `current` is the window's index, or -1 for none. */
const windowMarks = (report: ReportData, current: number): Mark[] =>
  report.windows.map((w, i) => ({ from: w.from, to: w.to, label: String(i + 1), current: i === current }));

/** Tercatat's framed strip: the stat line, the allegation line, and where the chapter's dates sit in the whole story. */
function RecordStrip({ locale, chapterIndex, cards, prologue, report }: {
  locale: Locale; chapterIndex: number; cards: EventCard[]; prologue: PrologueRecord[]; report: ReportData;
}) {
  const r = GAME_COPY[locale].report;
  const isPrologue = chapterIndex === 0;
  const w = report.windows[chapterIndex - 1];
  let stat: string;
  if (isPrologue) {
    // The earliest and latest ISO dates, not the dossier labels (a label may itself be a range).
    const isos = prologue.map((d) => d.iso).sort();
    stat = r.strip.statPrologue({ n: prologue.length, from: isos.length ? isoLabel(locale, isos[0]) : '', to: isos.length ? isoLabel(locale, isos[isos.length - 1]) : '' });
  } else {
    const channels = [...new Set(cards.map((e) => e.channel[locale]))].join(', ');
    stat = r.strip.stat({ n: cards.length, from: w ? longDay(locale, w.from) : '', to: w ? longDay(locale, w.to) : '', channels });
  }
  const lane = isPrologue
    ? { label: r.strip.dates, dates: prologue.map((d) => d.iso) }
    : { label: r.strip.events, dates: cards.map((e) => e.date) };
  return (
    <section className="bg-entry bg-report bg-report--strip" data-entry="report-strip">
      <p className="bg-report__stat">{stat}</p>
      <Allegation locale={locale} />
      <TimeStrip
        id={`bg-strip-${chapterIndex}`} locale={locale} title={r.strip.title} span={report.span}
        marks={windowMarks(report, chapterIndex - 1)} lanes={[lane]} table={r.table}
      />
    </section>
  );
}

/** Tercatat: what went on record in the chapter. `whole` is false when the skip after two fails filled the rest in. */
export function Recorded({ locale, chapterIndex, cards, prologue, whole, onNext, report }: {
  locale: Locale; chapterIndex: number; cards: EventCard[]; prologue: PrologueRecord[]; whole: boolean; onNext: () => void; report: ReportData;
}) {
  const c = GAME_COPY[locale];
  return (
    <section className="bg-screen bg-recorded" aria-labelledby="bg-recorded-title">
      <p className="bg-kicker">{chapterLine(chapterInfo(chapterIndex, locale))}</p>
      <h2 id="bg-recorded-title">{c.recordedScreen.title}</h2>
      {!whole && <p className="bg-note">{c.recordedScreen.skipped}</p>}
      <RecordStrip locale={locale} chapterIndex={chapterIndex} cards={cards} prologue={prologue} report={report} />
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
    <article className="bg-entry" data-entry={e.id} id={`bg-entry-${e.id}`}>
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

/** The steps of the handling as BarList rows, by their names in the copy. */
const stageRows = (locale: Locale, stages: readonly Tahap[]) => stages.map((t) => ({ label: GAME_COPY[locale].report.stages.steps[t.key], n: t.n }));

/** Scrolls a Sanjaya entry into view and gives it keyboard focus: the map's way to a selected terlapor. */
function goToEntry(id: string) {
  const el = document.getElementById(`bg-entry-${id}`);
  if (!el) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.tabIndex = -1;
  el.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
  el.focus({ preventScroll: true });
}

/** The chapter's framed report on Sanjaya's screen: the tiles, the record map up to this chapter, and three charts when names came in. */
function ChapterBlock({ locale, chapterIndex, id, cr, report, chapterIds, allow3d }: {
  locale: Locale; chapterIndex: number; id: string; cr: ChapterReport; report: ReportData; chapterIds: string[][]; allow3d: boolean;
}) {
  const r = GAME_COPY[locale].report;
  const t = r.tiles;
  return (
    <section className="bg-entry bg-report" data-entry={`report-${id}`}>
      <h3>{r.block}</h3>
      <p>{r.lead}</p>
      <Allegation locale={locale} />
      <StatTiles
        tiles={[
          { label: t.names, value: cr.names, note: `${cr.fresh} ${t.fresh} · ${cr.again} ${t.again}` },
          { label: t.acts, value: cr.acts },
          { label: t.replies, value: cr.replies },
          { label: t.pasal, value: cr.pasal.length },
          { label: t.reports, value: cr.reports },
        ]}
      />
      <ReportMap
        locale={locale} graph={report.map} chapterIds={chapterIds} upTo={chapterIndex} focus={chapterIndex} allow3d={allow3d}
        labels={r.map} onEntry={goToEntry}
      />
      {cr.names > 0 && (
        <div className="bg-report__charts">
          <Columns
            id={`bg-when-${id}`} locale={locale} title={r.when.title} note={cr.unit === 'day' ? r.when.day : r.when.month} unit={cr.unit}
            bins={cr.bins} undated={cr.undated} undatedNote={r.when.undated} table={r.table}
          />
          <BarList id={`bg-pasal-${id}`} title={r.pasal.title} note={r.pasal.note} rows={cr.pasal} limit={8} other={r.pasal.other} table={r.table} />
          <BarList id={`bg-stages-${id}`} title={r.stages.title} note={r.stages.note} rows={stageRows(locale, cr.stages)} table={r.table} />
        </div>
      )}
    </section>
  );
}

export function SanjayaReport({ locale, chapterIndex, chapter, onNext, report, chapterIds, allow3d }: {
  locale: Locale; chapterIndex: number; chapter: ChapterView; onNext: () => void; report: ReportData; chapterIds: string[][]; allow3d: boolean;
}) {
  const c = GAME_COPY[locale];
  const full = chapter.entries.filter((e) => e.full);
  const again = chapter.entries.filter((e) => !e.full);
  const cr = report.chapters[chapterIndex];
  return (
    <section className="bg-screen bg-sanjaya" aria-labelledby="bg-sanjaya-title">
      <p className="bg-kicker">{chapterLine(chapterInfo(chapterIndex, locale))}</p>
      <h2 id="bg-sanjaya-title">{c.sanjayaTitle}</h2>
      <p>{c.sanjayaIntro}</p>
      {cr && (
        <ChapterBlock locale={locale} chapterIndex={chapterIndex} id={chapter.id} cr={cr} report={report} chapterIds={chapterIds} allow3d={allow3d} />
      )}
      {chapter.entries.length === 0 && <p className="bg-note">{c.sanjayaNone}</p>}
      {full.map((e) => <FullEntry key={e.id} locale={locale} e={e} />)}
      {again.length > 0 && (
        <>
          <h3>{c.nameOnly}</h3>
          <ul className="bg-again">
            {again.map((e) => (
              <li key={e.id} data-entry={e.id} id={`bg-entry-${e.id}`}>
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
 * captures its own pointer and lets go on lift, cancel, leave, lost capture, window blur or a hidden tab, so nothing stays
 * on. `onChange` gets the whole state on every change; it is left idle when the controls unmount.
 */
export function TouchControls({ locale, manual, onChange, surge, sight }: {
  locale: Locale; manual: boolean; onChange: (t: TouchState) => void; surge: HudSnapshot['surge']; sight: HudSnapshot['sight'];
}) {
  const c = GAME_COPY[locale].touch;
  const change = useRef(onChange);
  change.current = onChange;
  const pointers = useRef<ReturnType<typeof createTouchPointers> | null>(null);
  if (pointers.current === null) pointers.current = createTouchPointers((t) => change.current(t));
  const origin = useRef({ x: 0, y: 0 });
  const [capsule, setCapsule] = useState<{ x: number; y: number; dx: number } | null>(null);
  const [lit, setLit] = useState<Partial<Record<Hold, true>>>({});

  useEffect(() => {
    const p = pointers.current!;
    const releaseAll = () => {
      p.clear();
      setCapsule(null);
      setLit({});
    };
    const onVisibility = () => { if (document.hidden) releaseAll(); };
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', releaseAll);
      document.removeEventListener('visibilitychange', onVisibility);
      p.clear();
    };
  }, []);

  const capture = (e: ReactPointerEvent<HTMLElement>) => {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* a pointer that is already gone */ }
  };

  const hold = (k: Hold) => {
    const letGo = (e: ReactPointerEvent<HTMLElement>) => {
      if (!pointers.current!.up(k, e.pointerId)) return;
      setLit((l) => {
        const { [k]: _gone, ...rest } = l;
        return rest;
      });
    };
    return {
      onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
        e.preventDefault();
        if (!pointers.current!.down(k, e.pointerId)) return;
        capture(e);
        setLit((l) => ({ ...l, [k]: true }));
      },
      onPointerUp: letGo,
      onPointerCancel: letGo,
      onPointerLeave: letGo,
      onLostPointerCapture: letGo,
      onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
    };
  };

  const steerGo = (e: ReactPointerEvent<HTMLElement>) => {
    if (pointers.current!.up('steer', e.pointerId)) setCapsule(null);
  };
  const steer = {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      e.preventDefault();
      if (!pointers.current!.down('steer', e.pointerId)) return;
      capture(e);
      const r = e.currentTarget.getBoundingClientRect();
      origin.current = { x: e.clientX, y: e.clientY };
      setCapsule({ x: e.clientX - r.left, y: e.clientY - r.top, dx: 0 });
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const dx = e.clientX - origin.current.x;
      if (pointers.current!.move(e.pointerId, dx)) setCapsule((cap) => (cap ? { ...cap, dx } : cap));
    },
    onPointerUp: steerGo,
    onPointerCancel: steerGo,
    onPointerLeave: steerGo,
    onLostPointerCapture: steerGo,
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
        <span aria-hidden="true"><Ring kind="surge" label={c.surge} fill={surge.frac} lit={surge.ready} /></span>
      </button>
      <button type="button" className="bg-touch__btn bg-touch__btn--mata" aria-label={c.sight} data-held={lit.sight ? '' : undefined} {...hold('sight')}>
        <span aria-hidden="true"><Ring kind="sight" label={c.sight} fill={sight.charge} lit={sight.on} /></span>
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

/** A chapter's short name: the prologue, Parva n, or the finale. */
const chapterName = (locale: Locale, i: number, last: number) => {
  const n = GAME_COPY[locale].report.chapterName;
  return i === 0 ? n.prologue : i === last ? n.finale : n.parva({ n: i });
};

/** The finale's framed report: the whole record on the map with its rail, then the months, the parts, the pasal, the
 * steps and the police reports over time. */
function FinaleBlock({ locale, report, chapterIds, allow3d }: { locale: Locale; report: ReportData; chapterIds: string[][]; allow3d: boolean }) {
  const r = GAME_COPY[locale].report;
  const last = report.chapters.length - 1;
  const marks = windowMarks(report, -1);
  const dated = (dir: 'by' | 'against') => report.reports.flatMap((d) => (d.dir === dir && d.date ? [d.date] : []));
  return (
    <section className="bg-entry bg-report" data-entry="report-finale">
      <h3>{r.block}</h3>
      <p>{r.lead}</p>
      <Allegation locale={locale} />
      <ReportMap locale={locale} graph={report.map} chapterIds={chapterIds} upTo={last} focus={null} rail allow3d={allow3d} labels={r.map} onEntry={goToEntry} />
      <div className="bg-report__charts">
        <Columns
          id="bg-fin-months" locale={locale} title={r.finale.months} note={r.finale.monthsNote} unit="month" bins={report.months} marks={marks}
          undated={report.undated} undatedNote={r.when.undated} table={r.table}
        />
        <BarList
          id="bg-fin-parts" title={r.finale.perChapter} note={r.finale.perChapterNote}
          rows={report.fresh.map((n, i) => ({ label: chapterName(locale, i, last), n }))} table={r.table}
        />
        <BarList id="bg-fin-pasal" title={r.finale.pasalTop} note={r.pasal.note} rows={report.pasal} limit={10} other={r.pasal.other} table={r.table} />
        <BarList id="bg-fin-stages" title={r.stages.title} note={r.stages.note} rows={stageRows(locale, report.stages)} table={r.table} />
      </div>
      <TimeStrip
        id="bg-fin-reports" locale={locale} title={r.finale.reports} span={report.span} marks={marks}
        lanes={[{ label: r.finale.lanes.by, dates: dated('by') }, { label: r.finale.lanes.against, dates: dated('against') }]} table={r.table}
      />
    </section>
  );
}

export function Finale({ locale, totals, onAgain, report, chapterIds, allow3d }: {
  locale: Locale; totals: Totals; onAgain: () => void; report: ReportData; chapterIds: string[][]; allow3d: boolean;
}) {
  const c = GAME_COPY[locale];
  const lines = c.finaleTotals(totals);
  const label = lines[lines.length - 1];
  return (
    <section className="bg-screen bg-finale" aria-labelledby="bg-finale-title">
      <h2 id="bg-finale-title" className="bg-title">{c.title}</h2>
      {lines.slice(0, -1).map((l) => <p key={l}>{l}</p>)}
      <p><a href={routePath('monitor', locale)}>{label}</a></p>
      <FinaleBlock locale={locale} report={report} chapterIds={chapterIds} allow3d={allow3d} />
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
