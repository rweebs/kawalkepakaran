// A small document for rendering an island with react-dom/client in node, where vitest has no DOM: enough for React to
// create, update and remove elements, to hand events through the root's listeners, and for the island's own calls
// (matchMedia, storage, focus, scrollIntoView). It is not a browser: no layout, no CSS, and selectors are only compound
// tag, class and attribute parts joined by spaces. Install it before importing react-dom/client.

type Listener = (e: FakeEvent) => void;
interface Entry { f: Listener; capture: boolean }

export interface FakeEvent {
  type: string; target: FakeNode; currentTarget: FakeNode | null; bubbles: boolean; cancelable: boolean; defaultPrevented: boolean;
  eventPhase: number; timeStamp: number; isTrusted: boolean; button: number; buttons: number; detail: number;
  preventDefault(): void; stopPropagation(): void; stopImmediatePropagation(): void;
  [k: string]: unknown;
}

const captureOf = (o: unknown) => (typeof o === 'boolean' ? o : !!(o as { capture?: boolean } | undefined)?.capture);

export class FakeNode {
  parentNode: FakeNode | null = null;
  childNodes: FakeNode[] = [];
  listeners = new Map<string, Entry[]>();
  constructor(public nodeType: number, public nodeName: string, public ownerDocument: FakeDocument | null) {}
  addEventListener(type: string, f: Listener, o?: unknown) {
    const list = this.listeners.get(type) ?? [];
    const capture = captureOf(o);
    if (!list.some((e) => e.f === f && e.capture === capture)) list.push({ f, capture });
    this.listeners.set(type, list);
  }
  removeEventListener(type: string, f: Listener, o?: unknown) {
    const capture = captureOf(o);
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((e) => !(e.f === f && e.capture === capture)));
  }
  get firstChild() { return this.childNodes[0] ?? null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] ?? null; }
  get parentElement(): FakeNode | null { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; }
  get nextSibling(): FakeNode | null { const p = this.parentNode; return p ? p.childNodes[p.childNodes.indexOf(this) + 1] ?? null : null; }
  get previousSibling(): FakeNode | null { const p = this.parentNode; return p ? p.childNodes[p.childNodes.indexOf(this) - 1] ?? null : null; }
  get isConnected(): boolean {
    let n: FakeNode | null = this;
    while (n) { if (n.nodeType === 9) return true; n = n.parentNode; }
    return false;
  }
  appendChild<T extends FakeNode>(c: T): T { return this.insertBefore(c, null); }
  insertBefore<T extends FakeNode>(c: T, ref: FakeNode | null): T {
    c.parentNode?.removeChild(c);
    const i = ref ? this.childNodes.indexOf(ref) : -1;
    if (i < 0) this.childNodes.push(c); else this.childNodes.splice(i, 0, c);
    c.parentNode = this;
    return c;
  }
  removeChild<T extends FakeNode>(c: T): T {
    const i = this.childNodes.indexOf(c);
    if (i >= 0) this.childNodes.splice(i, 1);
    c.parentNode = null;
    return c;
  }
  contains(n: FakeNode | null): boolean {
    for (let x = n; x; x = x.parentNode) if (x === this) return true;
    return false;
  }
  getRootNode(): FakeNode { let n: FakeNode = this; while (n.parentNode) n = n.parentNode; return n; }
  get textContent(): string { return this.childNodes.map((c) => c.textContent).join(''); }
  set textContent(v: string) {
    for (const c of this.childNodes) c.parentNode = null;
    this.childNodes = [];
    if (v) this.appendChild(this.ownerDocument!.createTextNode(v));
  }
  /** Every element below this node, in document order. */
  descendants(): FakeElement[] {
    return this.childNodes.flatMap((c) => (c instanceof FakeElement ? [c, ...c.descendants()] : []));
  }
  querySelectorAll<E = FakeElement>(sel: string): E[] {
    return this.descendants().filter((e) => sel.split(',').some((s) => e.matches(s.trim()))) as E[];
  }
  querySelector<E = FakeElement>(sel: string): E | null { return (this.querySelectorAll<E>(sel)[0] ?? null); }
}

export class FakeText extends FakeNode {
  constructor(public nodeValue: string, doc: FakeDocument) { super(3, '#text', doc); }
  get data() { return this.nodeValue; }
  set data(v: string) { this.nodeValue = v; }
  override get textContent() { return this.nodeValue; }
  override set textContent(v: string) { this.nodeValue = v; }
}

/** One compound selector: a tag, classes and [attr] or [attr="v"] parts. */
function matchesCompound(e: FakeElement, part: string): boolean {
  const m = part.match(/^([a-z][\w-]*)?((?:\.[\w-]+|\[[^\]]+\])*)$/i);
  if (!m) throw new Error(`fake DOM: selector part not supported: ${part}`);
  if (m[1] && m[1].toUpperCase() !== e.tagName) return false;
  for (const p of m[2].match(/\.[\w-]+|\[[^\]]+\]/g) ?? []) {
    if (p.startsWith('.')) { if (!e.classList.contains(p.slice(1))) return false; continue; }
    const a = p.slice(1, -1).match(/^([\w-]+)(?:=["']?([^"']*)["']?)?$/)!;
    if (!e.hasAttribute(a[1]) || (a[2] !== undefined && e.getAttribute(a[1]) !== a[2])) return false;
  }
  return true;
}

export class FakeElement extends FakeNode {
  attributes = new Map<string, string>();
  style: Record<string, unknown> & { setProperty(k: string, v: string): void; removeProperty(k: string): void; getPropertyValue(k: string): string };
  focusCalls: (FocusOptions | undefined)[] = [];
  scrolls: (ScrollIntoViewOptions | boolean | undefined)[] = [];
  scrollTop = 0;
  scrollLeft = 0;
  tagName: string;
  localName: string;
  rect = { top: 0, left: 0, width: 0, height: 0 };
  constructor(tag: string, doc: FakeDocument, public namespaceURI = 'http://www.w3.org/1999/xhtml') {
    super(1, tag.toUpperCase(), doc);
    this.tagName = tag.toUpperCase();
    this.localName = tag.toLowerCase();
    const props: Record<string, string> = {};
    this.style = Object.assign(Object.create(null), {
      setProperty: (k: string, v: string) => { props[k] = v; },
      removeProperty: (k: string) => { delete props[k]; },
      getPropertyValue: (k: string) => props[k] ?? '',
    });
  }
  setAttribute(k: string, v: unknown) { this.attributes.set(k.toLowerCase(), String(v)); }
  setAttributeNS(_ns: string | null, k: string, v: unknown) { this.setAttribute(k, v); }
  getAttribute(k: string) { return this.attributes.get(k.toLowerCase()) ?? null; }
  hasAttribute(k: string) { return this.attributes.has(k.toLowerCase()); }
  removeAttribute(k: string) { this.attributes.delete(k.toLowerCase()); }
  removeAttributeNS(_ns: string | null, k: string) { this.removeAttribute(k); }
  get id() { return this.getAttribute('id') ?? ''; }
  get className() { return this.getAttribute('class') ?? ''; }
  set className(v: string) { this.setAttribute('class', v); }
  get classList() { const list = this.className.split(/\s+/).filter(Boolean); return { contains: (c: string) => list.includes(c) }; }
  set innerHTML(v: string) { this.textContent = v; }
  matches(sel: string): boolean {
    const parts = sel.trim().split(/\s+/);
    if (!matchesCompound(this, parts[parts.length - 1])) return false;
    let i = parts.length - 2;
    for (let a = this.parentElement as FakeElement | null; a && i >= 0; a = a.parentElement as FakeElement | null) if (matchesCompound(a, parts[i])) i--;
    return i < 0;
  }
  closest(sel: string): FakeElement | null {
    for (let a: FakeElement | null = this; a; a = a.parentElement as FakeElement | null) if (a.matches(sel)) return a;
    return null;
  }
  focus(o?: FocusOptions) { this.focusCalls.push(o); if (this.isConnected) this.ownerDocument!.activeElement = this; }
  blur() { if (this.ownerDocument!.activeElement === this) this.ownerDocument!.activeElement = this.ownerDocument!.body; }
  scrollIntoView(o?: ScrollIntoViewOptions | boolean) { this.scrolls.push(o); }
  getBoundingClientRect() { const r = this.rect; return { ...r, x: r.left, y: r.top, right: r.left + r.width, bottom: r.top + r.height }; }
  /** A click, as the browser hands it to React: through the root's capture and bubble listeners. */
  click() { this.ownerDocument!.dispatch(this, 'click'); }
}

export class FakeDocument extends FakeNode {
  documentElement: FakeElement;
  body: FakeElement;
  activeElement: FakeElement;
  hidden = false;
  fullscreenEnabled = false;
  fullscreenElement = null;
  defaultView: unknown = null;
  constructor() {
    super(9, '#document', null);
    this.ownerDocument = null;
    this.documentElement = new FakeElement('html', this);
    this.body = new FakeElement('body', this);
    this.appendChild(this.documentElement);
    this.documentElement.appendChild(this.body);
    this.activeElement = this.body;
  }
  createElement(tag: string) { return new FakeElement(tag, this); }
  createElementNS(ns: string, tag: string) { return new FakeElement(tag, this, ns); }
  createTextNode(v: string) { return new FakeText(v, this); }
  createComment(v: string) { return new FakeText(v, this); }
  getElementById(id: string) { return this.descendants().find((e) => e.id === id) ?? null; }
  /** Sends a bubbling event from `target`: capture listeners from the document down, then bubble listeners back up. */
  dispatch(target: FakeNode, type: string, extra: Record<string, unknown> = {}): FakeEvent {
    let stopped = false;
    const e: FakeEvent = {
      type, target, currentTarget: null, bubbles: true, cancelable: true, defaultPrevented: false, eventPhase: 0, timeStamp: Date.now(),
      isTrusted: true, button: 0, buttons: 0, detail: 1,
      preventDefault() { e.defaultPrevented = true; },
      stopPropagation() { stopped = true; },
      stopImmediatePropagation() { stopped = true; },
      ...extra,
    };
    const path: FakeNode[] = [];
    for (let n: FakeNode | null = target; n; n = n.parentNode) path.push(n);
    const run = (n: FakeNode, capture: boolean, phase: number) => {
      e.currentTarget = n;
      e.eventPhase = phase;
      for (const l of [...(n.listeners.get(type) ?? [])]) if (l.capture === capture) l.f(e);
    };
    for (let i = path.length - 1; i >= 1 && !stopped; i--) run(path[i], true, 1);
    if (!stopped) { run(target, true, 2); run(target, false, 2); }
    for (let i = 1; i < path.length && !stopped; i++) run(path[i], false, 3);
    e.currentTarget = null;
    return e;
  }
}

export interface FakePage {
  doc: FakeDocument;
  win: Record<string, unknown>;
  storage: Map<string, string>;
  /** Puts the page's globals in place; `reduced` answers (prefers-reduced-motion: reduce). */
  install(): void;
}

/** A page: a document, a window with matchMedia, storage and listeners, set as globals by install(). */
export function fakePage(o: { reduced?: boolean; search?: string } = {}): FakePage {
  const doc = new FakeDocument();
  const storage = new Map<string, string>();
  const win = Object.assign(new FakeNode(0, '#window', null), {
    document: doc,
    location: { search: o.search ?? '', href: 'http://localhost/pantau/bowobharata', pathname: '/pantau/bowobharata' },
    matchMedia: (q: string) => ({
      matches: q.includes('prefers-reduced-motion') ? !!o.reduced : false, media: q,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
    }),
    localStorage: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => { storage.set(k, String(v)); },
      removeItem: (k: string) => { storage.delete(k); },
    },
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: (f: (t: number) => void) => setTimeout(() => f(performance.now()), 16) as unknown as number,
    cancelAnimationFrame: (i: number) => clearTimeout(i),
    HTMLIFrameElement: class {},
    HTMLElement: FakeElement,
    devicePixelRatio: 1,
    innerWidth: 360,
    innerHeight: 780,
    scrollX: 0,
    scrollY: 0,
    scrollTo() {},
  }) as unknown as FakeNode & Record<string, unknown>;
  win.window = win;
  doc.defaultView = win;
  return {
    doc, win, storage,
    install() {
      const g = globalThis as Record<string, unknown>;
      g.window = win;
      g.document = doc;
      g.HTMLIFrameElement = win.HTMLIFrameElement;
      g.HTMLElement = FakeElement;
      g.requestAnimationFrame = win.requestAnimationFrame;
      g.cancelAnimationFrame = win.cancelAnimationFrame;
      g.IS_REACT_ACT_ENVIRONMENT = true;
    },
  };
}
