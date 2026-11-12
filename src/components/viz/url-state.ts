// Filter state that survives a reload and can be shared: kept in the URL hash as "#<key>?<query>", for example
// "#fomo?perusahaan=Tokopedia". Only values that differ from the initial state are written. SSR-safe: the first render
// uses the initial state (so hydration matches), then the hash is read. history.replaceState never scrolls the page.
import { useEffect, useRef, useState } from 'react';

type Plain = string | number | boolean | null | readonly string[] | readonly number[];

/** "a=1&b=x" for the entries of `state` that differ from `initial`. Strings raw, string arrays comma-joined, rest JSON. */
export function encodeState<T extends object>(stateIn: T, initialIn: T): string {
  const state = stateIn as Record<string, unknown>;
  const initial = initialIn as Record<string, unknown>;
  const q = new URLSearchParams();
  for (const k of Object.keys(initial)) {
    const v = state[k] as Plain;
    if (JSON.stringify(v) === JSON.stringify(initial[k])) continue;
    if (typeof initial[k] === 'string') q.set(k, String(v ?? ''));
    else if (Array.isArray(initial[k]) && (initial[k] as unknown[]).every((x) => typeof x === 'string') && Array.isArray(v)) q.set(k, (v as string[]).join(','));
    else q.set(k, JSON.stringify(v));
  }
  return q.toString();
}

/** The state encoded in `query`, falling back to `initial` for anything missing or malformed. */
export function decodeState<T extends object>(query: string, initialIn: T): T {
  const initial = initialIn as Record<string, unknown>;
  const q = new URLSearchParams(query);
  const out: Record<string, unknown> = { ...initial };
  for (const k of Object.keys(initial)) {
    const raw = q.get(k);
    if (raw === null) continue;
    const init = initial[k];
    if (typeof init === 'string') out[k] = raw;
    else if (Array.isArray(init) && init.every((x) => typeof x === 'string')) out[k] = raw === '' ? [] : raw.split(',');
    else {
      try {
        const v = JSON.parse(raw);
        if (v === null || typeof v === typeof init || init === null) out[k] = v;
      } catch { /* keep the initial value */ }
    }
  }
  return out as T;
}

/** The query part of the hash when it belongs to `key` ("#key?…"), else null. */
export function hashQuery(hash: string, key: string): string | null {
  const h = hash.replace(/^#/, '');
  return h === key ? '' : h.startsWith(`${key}?`) ? h.slice(key.length + 1) : null;
}

export function useHashState<T extends object>(key: string, initial: T) {
  const [state, setState] = useState<T>(initial);
  const ready = useRef(false);
  const init = useRef(initial);
  useEffect(() => {
    const read = () => {
      const q = hashQuery(location.hash, key);
      if (q !== null) setState(decodeState(q, init.current));
    };
    read();
    ready.current = true;
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, [key]);
  useEffect(() => {
    if (!ready.current) return;
    const q = encodeState(state, init.current);
    const mine = hashQuery(location.hash, key) !== null;
    // Leave someone else's hash alone until this state differs from its initial value.
    if (!q && !mine) return;
    const next = q ? `#${key}?${q}` : `#${key}`;
    if (location.hash !== next) history.replaceState(history.state, '', `${location.pathname}${location.search}${next}`);
  }, [state, key]);
  return [state, setState] as const;
}

/** `value`, updated only after it has stopped changing for `ms` milliseconds. */
export function useDebounced<T>(value: T, ms = 150): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}
