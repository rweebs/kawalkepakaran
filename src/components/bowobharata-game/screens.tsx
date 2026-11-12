// The game's screens, rendered from props only (no effects), so they can be checked with renderToString.
// Every named person sits in an element marked data-entry together with the allegation line and the reply link.
// The only casting of a real person, Abil Sudarman as Sengkuni, is the page's own labelled poster on the gate.
import { routePath, type Locale } from '../../i18n';
import { FRAMING, PARVAS, POSTERS, parvaEvents } from '../../lib/bowobharata';
import { BOWO_UI, FRAMING_EN, PARVAS_EN, POSTERS_EN } from '../../lib/bowobharata-en';
import { GAME_COPY } from '../../lib/bowobharata-game/copy';
import type { Chapter, SanjayaEntry, Totals } from '../../lib/bowobharata-game/record';
import { eventPath, formatDateFor, localizeEvent, type LocalizedEvent } from '../../lib/linimasa-locale';
import { kategoriLabel, type TerlaporKronologi } from '../../lib/perkara';

export type CatchItem =
  | { kind: 'event'; event: LocalizedEvent }
  | { kind: 'entry'; entry: SanjayaEntry; row: TerlaporKronologi };

const earliest = (rows: TerlaporKronologi[]): TerlaporKronologi =>
  rows.reduce((a, b) => ((b.iso ?? '') < (a.iso ?? '') ? b : a));

/** What a chapter's real catches reveal, in order: the parva's events, or (prologue) each full entry's earliest dated row. */
export function catchItems(chapterIndex: number, chapters: Chapter[], locale: Locale): CatchItem[] {
  if (chapterIndex === 0) {
    return (chapters[0]?.entries ?? []).filter((e) => e.full && e.rows.length > 0).map((entry) => ({ kind: 'entry', entry, row: earliest(entry.rows) }));
  }
  const p = PARVAS[chapterIndex - 1];
  if (!p) return [];
  return parvaEvents(p).map((e) => ({ kind: 'event', event: localizeEvent(e, locale) }));
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

const imgSrc = (x: unknown): string => (typeof x === 'string' ? x : (x as { src: string }).src);

function Allegation({ locale }: { locale: Locale }) {
  const c = GAME_COPY[locale];
  return (
    <p className="bg-allegation">
      {c.allegation} <a href={routePath('reply', locale)}>{c.reply}</a>
    </p>
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
      <div className="bg-posters">
        <figure data-poster="krishna">
          <img src={posters?.krishna.src ?? imgSrc(POSTERS.krishna.src)} srcSet={posters?.krishna.srcset} sizes={posters?.krishna.sizes} alt={alt.krishna.alt} loading="lazy" decoding="async" width={1206} height={1291} />
        </figure>
        <figure data-poster="sengkuni">
          <img src={posters?.sengkuni.src ?? imgSrc(POSTERS.sengkuni.src)} srcSet={posters?.sengkuni.srcset} sizes={posters?.sengkuni.sizes} alt={alt.sengkuni.alt} loading="lazy" decoding="async" width={1206} height={1302} />
        </figure>
      </div>
      <ul className="bg-controls">{c.controls.map((l) => <li key={l}>{l}</li>)}</ul>
      {fallback && <p className="bg-note">{c.fallbackNote}</p>}
      <div className="bg-actions"><button type="button" className="btn" onClick={onStart}>{c.gateStart}</button></div>
    </section>
  );
}

export function Intro({ locale, chapterIndex, onNext }: { locale: Locale; chapterIndex: number; onNext: () => void }) {
  const c = GAME_COPY[locale];
  const info = chapterInfo(chapterIndex, locale);
  const isFinale = info.id === 'finale';
  return (
    <section className="bg-screen bg-intro" aria-labelledby="bg-intro-title">
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

export function CatchCard({ locale, item }: { locale: Locale; item: CatchItem }) {
  const c = GAME_COPY[locale];
  if (item.kind === 'event') {
    const e = item.event;
    return (
      <article className="bg-catch" data-catch>
        <p className="bg-catch__meta"><time dateTime={e.date}>{formatDateFor(e.date, locale)}</time> · {e.channel}</p>
        <h3>{e.title}</h3>
        <Allegation locale={locale} />
        <a href={eventPath(e, locale)}>{c.catchSource}</a>
      </article>
    );
  }
  const { entry, row } = item;
  return (
    <article className="bg-catch" data-catch data-entry={entry.id}>
      <p className="bg-catch__meta"><time dateTime={row.iso ?? undefined}>{row.tanggal}</time></p>
      <h3>{entry.nama}</h3>
      <Allegation locale={locale} />
      <p>{row.peristiwa}</p>
    </article>
  );
}

function FullEntry({ locale, e }: { locale: Locale; e: SanjayaEntry }) {
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

export function SanjayaReport({ locale, chapterIndex, chapter, onNext }: { locale: Locale; chapterIndex: number; chapter: Chapter; onNext: () => void }) {
  const c = GAME_COPY[locale];
  const info = chapterInfo(chapterIndex, locale);
  const full = chapter.entries.filter((e) => e.full);
  const again = chapter.entries.filter((e) => !e.full);
  return (
    <section className="bg-screen bg-sanjaya" aria-labelledby="bg-sanjaya-title">
      <p className="bg-kicker">{info.kicker ? `${info.kicker} · ${info.title}` : info.title}</p>
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

export function FallbackPlay({ locale, items, taken, onTake, onDone }: { locale: Locale; items: CatchItem[]; taken: number; onTake: () => void; onDone: () => void }) {
  const c = GAME_COPY[locale];
  const done = taken >= items.length;
  return (
    <section className="bg-screen bg-fallback">
      <p className="bg-note">{c.fallbackNote}</p>
      <ol className="bg-taken" aria-live="polite">
        {items.slice(0, taken).map((it, i) => <li key={i}><CatchCard locale={locale} item={it} /></li>)}
      </ol>
      <div className="bg-actions">
        {done
          ? <button type="button" className="btn" onClick={onDone}>{c.actions.next}</button>
          : <button type="button" className="btn" onClick={onTake}>{c.actions.take} ({taken + 1}/{items.length})</button>}
      </div>
    </section>
  );
}

export function Hud({ locale, caught, missed, decoys, sight, paused, onPause }: { locale: Locale; caught: number; missed: number; decoys: number; sight: boolean; paused: boolean; onPause: () => void }) {
  const h = GAME_COPY[locale].hud;
  return (
    <div className="bg-hud">
      <dl>
        <div><dt>{h.caught}</dt><dd>{caught}</dd></div>
        <div><dt>{h.missed}</dt><dd>{missed}</dd></div>
        <div><dt>{h.decoys}</dt><dd>{decoys}</dd></div>
      </dl>
      {sight && <span className="bg-hud__sight">{h.sight}</span>}
      <button type="button" className="btn bg-hud__pause" aria-pressed={paused} onClick={onPause}>{h.pause}</button>
    </div>
  );
}

export function Lost({ locale, onRetry }: { locale: Locale; onRetry: () => void }) {
  const c = GAME_COPY[locale];
  return (
    <section className="bg-screen bg-lost" role="status">
      <p>{c.lost}</p>
      <div className="bg-actions"><button type="button" className="btn" onClick={onRetry}>{c.retry}</button></div>
    </section>
  );
}

export function Paused({ locale, onResume }: { locale: Locale; onResume: () => void }) {
  const c = GAME_COPY[locale];
  const framing = locale === 'en' ? FRAMING_EN : FRAMING;
  return (
    <section className="bg-screen bg-paused" aria-labelledby="bg-paused-title">
      <h2 id="bg-paused-title">{c.hud.pause}</h2>
      {framing.map((p) => <p key={p}>{p}</p>)}
      <ul className="bg-controls">{c.controls.map((l) => <li key={l}>{l}</li>)}</ul>
      <div className="bg-actions"><button type="button" className="btn" onClick={onResume}>{c.actions.resume}</button></div>
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
      <p className="bg-close">{c.finaleClose}</p>
      <div className="bg-actions"><button type="button" className="btn" onClick={onAgain}>{c.actions.again}</button></div>
    </section>
  );
}
