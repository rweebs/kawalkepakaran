import { useEffect, useRef, useState } from 'react';
import type { PointerEvent, ReactNode } from 'react';
import '../../styles/anak-langit.css';
import {
  CHARACTER, INTRO, ISRA, LABELS, MARKERS, METHOD, PLANET_NAMES_ID, SIGN_NAMES_ID, SKY_MAP, TRADITIONS, WHEEL,
} from '../../lib/anak-langit/content-id';
import { ASC_LON, MC_LON, PLANETS, PLANET_GLYPHS, type SkyState } from '../../lib/anak-langit/sky-data';
import { formatSignPosition, toSignPosition } from '../../lib/anak-langit/sky-math';
import AnakLangitSky from './AnakLangitSky';

// Ported from infraloka/src/app/story/anak-langit/AnakLangitChapter.tsx and translated to Indonesian.

const MOON_FILL = { gold: ['#e8c67c', 11], silver: ['#9aa2cc', 13], dark: [null, 0] } as const;
const VS = '︎';

function Tilt({ children, className = '' }: { children: ReactNode; className?: string }) {
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--ry', `${(px * 10).toFixed(2)}deg`);
    el.style.setProperty('--rx', `${(-py * 10).toFixed(2)}deg`);
  };
  const reset = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.style.setProperty('--rx', '0deg');
    e.currentTarget.style.setProperty('--ry', '0deg');
  };
  return (
    <div className={`al-tilt ${className}`} onPointerMove={onMove} onPointerLeave={reset}>
      {children}
    </div>
  );
}

function Moon({ kind }: { kind: 'gold' | 'silver' | 'dark' }) {
  const [fill, rx] = MOON_FILL[kind];
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="15" fill="#1c2553" />
      {fill && <path d={`M20 5a15 15 0 1 0 0 30a${rx} 15 0 1 1 0-30z`} fill={fill} />}
    </svg>
  );
}

function Dots({ n }: { n: number }) {
  return (
    <span className="al-dots" role="img" aria-label={LABELS.agree(n)}>
      {[0, 1, 2, 3, 4].map((i) => <i key={i} className={i < n ? 'on' : ''} />)}
    </span>
  );
}

export default function AnakLangitChapter() {
  const [state, setState] = useState<SkyState>('intro');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setState((e.target as HTMLElement).dataset.skyState as SkyState);
        }
      },
      { rootMargin: '-50% 0px -50% 0px' },
    );
    root.querySelectorAll<HTMLElement>('[data-sky-state]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="al-root" ref={rootRef} role="region" aria-labelledby="anak-langit-heading">
      <div className="al-stage" aria-hidden="true">
        <AnakLangitSky state={state} />
      </div>

      <div className="al-content">
        {/* 1. Intro */}
        <section className="al-section" data-sky-state="intro">
          <div className="al-panel">
            <div className="al-portrait">
              <svg viewBox="0 0 240 240" aria-hidden="true" focusable="false">
                <circle cx="120" cy="120" r="118" fill="none" stroke="#27305c" />
                <circle cx="120" cy="120" r="104" fill="none" stroke="#39437a" strokeDasharray="1 5" />
                <g className="al-orbit"><circle cx="120" cy="2" r="4.5" fill="#ff7b5e" /></g>
                <g className="al-orbit al-orbit--slow">
                  <circle cx="16" cy="120" r="3" fill="#e8c67c" />
                  <circle cx="224" cy="120" r="2" fill="#b6a3ff" />
                </g>
              </svg>
              <img src="/img/rahmat-anak-langit.jpg" alt={INTRO.portraitAlt} width={360} height={360} loading="lazy" decoding="async" />
            </div>
            <p className="al-eyebrow">{LABELS.eyebrow}</p>
            <h2 id="anak-langit-heading">{LABELS.title}</h2>
            <p className="al-kicker">{INTRO.subtitle} · {INTRO.kicker}</p>
            {INTRO.paragraphs.map((p) => <p key={p}>{p}</p>)}
            <div className="al-badges">
              {INTRO.badges.map((b) => <span key={b} className="al-badge">{b}</span>)}
            </div>
            <p className="al-note">{INTRO.bridge}</p>
          </div>
        </section>

        {/* 2. Three main markers */}
        <section className="al-section" data-sky-state="markers" aria-labelledby="al-markers-h">
          <div className="al-panel">
            <h3 id="al-markers-h">{LABELS.markersHeading}</h3>
            <div className="al-markers">
              {MARKERS.map((m) => (
                <Tilt key={m.label} className="al-card">
                  <p className="al-label">{m.label}</p>
                  <h4><span className="al-glyph">{m.glyph}</span>{m.value}</h4>
                  <p>{m.note}</p>
                </Tilt>
              ))}
            </div>
            <p className="al-mono" style={{ marginTop: '1rem' }}>{SKY_MAP.location}</p>
          </div>
        </section>

        {/* 3. Sky at birth */}
        <section className="al-section" data-sky-state="sky" aria-labelledby="al-sky-h">
          <div className="al-panel">
            <h3 id="al-sky-h">{SKY_MAP.title}</h3>
            <p className="al-mono">{SKY_MAP.location}</p>
            <p>{SKY_MAP.howToRead}</p>
            <div className="al-notes">
              {SKY_MAP.notes.map((n) => (
                <div key={n.title} className="al-card">
                  <h4>{n.title}</h4>
                  <p>{n.text}</p>
                </div>
              ))}
            </div>
            <p className="al-mono al-legend">{SKY_MAP.legend.map((l) => <span key={l}>{l}</span>)}</p>
          </div>
        </section>

        {/* 4. Zodiac wheel */}
        <section className="al-section" data-sky-state="wheel" aria-labelledby="al-wheel-h">
          <div className="al-panel">
            <p className="al-mono">{WHEEL.caption}</p>
            <h3 id="al-wheel-h">{WHEEL.title}</h3>
            <p>{WHEEL.intro}</p>
            <p className="al-mono al-legend">{WHEEL.legend.map((l) => <span key={l}>{l}</span>)}</p>
            <div className="al-callouts">
              {WHEEL.callouts.map((c) => (
                <Tilt key={c.title} className="al-card">
                  <p className="al-label">{c.label}</p>
                  <h4>{c.title}</h4>
                  <p>{c.text}</p>
                </Tilt>
              ))}
            </div>
            <table className="al-table">
              <caption>{WHEEL.tableCaption}</caption>
              <tbody>
                {PLANETS.map((p) => (
                  <tr key={p.name} className={p.name === 'Mars' ? 'al-hl' : undefined}>
                    <td className="al-g" aria-hidden="true">{PLANET_GLYPHS[p.name] + VS}</td>
                    <th scope="row">{PLANET_NAMES_ID[p.name]}{p.name === 'Saturn' ? ` ${LABELS.retrograde}` : ''}</th>
                    <td>{SIGN_NAMES_ID[toSignPosition(p.lon).sign]}</td>
                    <td>{formatSignPosition(p.lon)}</td>
                  </tr>
                ))}
                {([['ASC', LABELS.ascendant, ASC_LON], ['MC', LABELS.midheaven, MC_LON]] as const).map(([k, n, lon]) => (
                  <tr key={k}>
                    <td className="al-g al-mono" aria-hidden="true">{k}</td>
                    <th scope="row">{n}</th>
                    <td>{SIGN_NAMES_ID[toSignPosition(lon).sign]}</td>
                    <td>{formatSignPosition(lon)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 5. Isra Mi'raj */}
        <section className="al-section" data-sky-state="calm" aria-labelledby="al-isra-h">
          <div className="al-panel">
            <p className="al-eyebrow">{ISRA.eyebrow}</p>
            <h3 id="al-isra-h">{ISRA.title}</h3>
            <p>{ISRA.lead}</p>
            <div className="al-days">
              {ISRA.days.map((d) => (
                <div key={d.when} className="al-day">
                  <Moon kind={d.moon} />
                  <div>
                    <p className="al-mono" style={{ margin: 0 }}>{d.when}</p>
                    <h4 style={{ marginBottom: '0.2rem' }}>{d.title}</h4>
                    {d.calendars.map((c) => (
                      <p key={c.name} style={{ margin: 0, fontSize: '0.9rem' }}>
                        {c.name}: {c.value} {'star' in c && c.star && <span className="al-star" aria-label={LABELS.birthNight}>★</span>}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="al-mono">{ISRA.newMoon}</p>
            {ISRA.closing.map((p) => <p key={p}>{p}</p>)}
          </div>
        </section>

        {/* 6. Character */}
        <section className="al-section al-section--center" data-sky-state="calm" aria-labelledby="al-char-h">
          <div className="al-panel al-panel--wide">
            <p className="al-eyebrow">{CHARACTER.eyebrow}</p>
            <h3 id="al-char-h">{CHARACTER.title}</h3>
            <p>{CHARACTER.intro}</p>
            <p className="al-note">{CHARACTER.summary}</p>
            <div className="al-traits">
              {CHARACTER.traits.map((t) => (
                <Tilt key={t.title} className="al-card">
                  <Dots n={t.systems} />
                  <h4><span className="al-glyph">{t.glyph}</span>{t.title}</h4>
                  <p className="al-mono">
                    {t.systems} {LABELS.systems}{'markers' in t && t.markers ? ` · ${t.markers} ${LABELS.markers}` : ''}
                  </p>
                  <p>{t.text}</p>
                  <ul className="al-evidence">
                    {t.evidence.map((e) => <li key={e.system + e.detail}><b>{e.system}</b> {e.detail}</li>)}
                  </ul>
                </Tilt>
              ))}
            </div>
            <div className="al-lists">
              {([[LABELS.strengths, CHARACTER.strengths], [LABELS.watch, CHARACTER.watchouts], [LABELS.advice, CHARACTER.advice]] as const).map(([h, items]) => (
                <div key={h} className="al-card">
                  <h4>{h}</h4>
                  <ul className="al-list">
                    {items.map((i) => <li key={i.title}><b>{i.title}.</b> {i.text}</li>)}
                  </ul>
                </div>
              ))}
            </div>
            <p className="al-note">{CHARACTER.disclaimer}</p>
          </div>
        </section>

        {/* 7. Traditions */}
        <section className="al-section al-section--center" data-sky-state="calm" aria-labelledby="al-trad-h">
          <div className="al-panel al-panel--wide">
            <p className="al-eyebrow">{TRADITIONS.eyebrow}</p>
            <h3 id="al-trad-h">{TRADITIONS.title}</h3>
            <div className="al-traditions">
              {TRADITIONS.items.map((t) => (
                <Tilt key={t.id} className="al-card">
                  <p className="al-label">{t.name}</p>
                  <p className="al-mono">{t.subtitle}</p>
                  <h4>{t.headline}</h4>
                  {'strip' in t && t.strip && (
                    <div className="al-strip">
                      {t.strip.map((s) => (
                        <div key={s.weton} className={'highlight' in s && s.highlight ? 'on' : undefined}>
                          <span className="al-mono">{s.when}</span>
                          <br />
                          {s.weton}
                        </div>
                      ))}
                    </div>
                  )}
                  {'pillars' in t && t.pillars && (
                    <div className="al-pillars">
                      {t.pillars.map((p) => (
                        <div key={p.label}>
                          {p.label}
                          <b lang="zh">{p.han}</b>
                          {p.meaning}
                        </div>
                      ))}
                    </div>
                  )}
                  {t.paragraphs.map((p) => <p key={p} style={{ fontSize: '0.92rem' }}>{p}</p>)}
                </Tilt>
              ))}
            </div>
          </div>
        </section>

        {/* 8. Method + sources */}
        <section className="al-section" data-sky-state="calm" aria-labelledby="al-method-h">
          <div className="al-panel">
            <h3 id="al-method-h">{LABELS.methodHeading}</h3>
            {METHOD.paragraphs.map((p) => <p key={p}>{p}</p>)}
            <ul className="al-list al-sources">
              {METHOD.sources.map((s) => (
                <li key={s.href}><a href={s.href} target="_blank" rel="noopener noreferrer">{s.label}</a></li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
