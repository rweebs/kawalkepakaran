import * as THREE from 'three';
import {
    ASC_LON,
    ASTERISMS,
    ECLIPTIC,
    MC_LON,
    PLANETS,
    PLANET_GLYPHS,
    SIGN_GLYPHS,
    STARS,
    STAR_LABELS,
    type PlanetName,
    type SkyState,
} from './sky-data';
import { eclipticAt, findAspects, horizontalToVec3, spreadLongitudes, wheelPoint } from './sky-math';

export interface SkySceneOptions {
    reducedMotion: boolean;
    lowPower: boolean;
}

export interface SkySceneHandle {
    setState(s: SkyState): void;
    resize(w: number, h: number): void;
    setPaused(p: boolean): void;
    dispose(): void;
}

const DOME_R = 40;
const WHEEL_CENTER = new THREE.Vector3(150, 0, 0);
const GOLD = 0xe8c67c;
const MARS = 0xff7b5e;
const TEAL = 0x7fd3c8;
const INK = 0xece8f6;
const LINE = 0x39437a;

type GroupName = 'dome' | 'starLabels' | 'markers' | 'wheel';
const VISIBILITY: Record<SkyState, Record<GroupName, number>> = {
    intro: { dome: 1, starLabels: 0, markers: 0, wheel: 0 },
    markers: { dome: 0.85, starLabels: 0, markers: 1, wheel: 0 },
    sky: { dome: 1, starLabels: 1, markers: 0, wheel: 0 },
    wheel: { dome: 0.12, starLabels: 0, markers: 0, wheel: 1 },
    calm: { dome: 0.6, starLabels: 0, markers: 0, wheel: 0 },
};

interface Pose {
    pos: THREE.Vector3;
    look: THREE.Vector3;
    fov: number;
}
const v = (p: { x: number; y: number; z: number }) => new THREE.Vector3(p.x, p.y, p.z);
const POSES: Record<SkyState, Pose> = {
    intro: { pos: new THREE.Vector3(0, 0, 0), look: v(horizontalToVec3(38, 205, 30)), fov: 72 },
    markers: { pos: new THREE.Vector3(0, 26, 98), look: new THREE.Vector3(0, 4, 0), fov: 44 },
    sky: { pos: new THREE.Vector3(0, 0, 0), look: v(horizontalToVec3(48, 200, 30)), fov: 80 },
    // Camera and target sit 30 units right of the wheel so it lands in the left half, clear of the text panel.
    wheel: { pos: new THREE.Vector3(180, 58, 78), look: new THREE.Vector3(180, 0, 0), fov: 40 },
    calm: { pos: new THREE.Vector3(0, 40, 112), look: new THREE.Vector3(0, 0, 0), fov: 44 },
};
// Portrait and near-square screens: the text panel covers the canvas, so centre the wheel and pull back
// far enough that its full diameter fits the narrow width.
const NARROW_WHEEL: Pose = { pos: new THREE.Vector3(150, 82, 110), look: WHEEL_CENTER.clone(), fov: 54 };

interface FadeGroup {
    mats: { m: THREE.Material & { opacity: number }; base: number }[];
    root: THREE.Object3D;
    cur: number;
    target: number;
}

function makeRng(seed: number) {
    let s = seed;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function radialTexture(stops: [number, string][]): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    for (const [o, col] of stops) grad.addColorStop(o, col);
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
}

function textTexture(text: string, color: string, fontPx: number, family: string) {
    const c = document.createElement('canvas');
    const g = c.getContext('2d')!;
    const font = `${fontPx}px ${family}`;
    g.font = font;
    const w = Math.ceil(g.measureText(text).width) + 16;
    const h = Math.ceil(fontPx * 1.5);
    c.width = w;
    c.height = h;
    g.font = font;
    g.fillStyle = color;
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    g.fillText(text, w / 2, h / 2);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return { tex, aspect: w / h };
}

const SANS = 'Figtree, system-ui, sans-serif';
const SYMBOLS = '"Noto Sans Symbols", "Segoe UI Symbol", sans-serif';

export function createSkyScene(canvas: HTMLCanvasElement, opts: SkySceneOptions): SkySceneHandle {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: !opts.lowPower, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.lowPower ? 1.5 : 2));
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 1000);
    const rng = makeRng(13102001);

    const glow = radialTexture([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]);
    const dot = radialTexture([[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.85)'], [1, 'rgba(255,255,255,0)']]);
    const dusk = radialTexture([[0, 'rgba(240,163,107,0.55)'], [0.35, 'rgba(106,74,134,0.3)'], [1, 'rgba(10,15,42,0)']]);

    const fades: Record<GroupName, FadeGroup> = {
        dome: { mats: [], root: new THREE.Group(), cur: 0, target: 0 },
        starLabels: { mats: [], root: new THREE.Group(), cur: 0, target: 0 },
        markers: { mats: [], root: new THREE.Group(), cur: 0, target: 0 },
        wheel: { mats: [], root: new THREE.Group(), cur: 0, target: 0 },
    };
    const domeGroup = fades.dome.root;
    const wheelGroup = fades.wheel.root;
    wheelGroup.position.copy(WHEEL_CENTER);
    // The tilt lives on a child so user drag and auto-spin do not fight the fade root.
    const wheelTilt = new THREE.Group();
    wheelGroup.add(wheelTilt);
    scene.add(domeGroup, wheelGroup);
    // Labels and markers ride on the dome, so they turn with it; their fade is also scaled by the dome's.
    domeGroup.add(fades.starLabels.root, fades.markers.root);

    function track<T extends THREE.Material & { opacity: number }>(group: GroupName, m: T): T {
        m.transparent = true;
        fades[group].mats.push({ m, base: m.opacity });
        return m;
    }

    function sprite(group: GroupName, map: THREE.Texture, color: number, scale: number, opacity = 1, additive = true) {
        const mat = track(
            group,
            new THREE.SpriteMaterial({
                map,
                color,
                opacity,
                depthWrite: false,
                depthTest: false,
                blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
            }),
        );
        const s = new THREE.Sprite(mat);
        s.scale.set(scale, scale, 1);
        return s;
    }

    function labelSprite(group: GroupName, text: string, color: string, height: number, family = SANS) {
        const { tex, aspect } = textTexture(text, color, 48, family);
        const mat = track(group, new THREE.SpriteMaterial({ map: tex, depthWrite: false, depthTest: false }));
        const s = new THREE.Sprite(mat);
        s.scale.set(height * aspect, height, 1);
        return s;
    }

    // ── Background stars (always in the scene, shared by every state) ──
    const bgCount = opts.lowPower ? 900 : 2200;
    const bgPos = new Float32Array(bgCount * 3);
    for (let i = 0; i < bgCount; i++) {
        const u = rng() * 2 - 1;
        const a = rng() * Math.PI * 2;
        const r = 300;
        const s = Math.sqrt(1 - u * u);
        bgPos.set([r * s * Math.cos(a), r * u, r * s * Math.sin(a)], i * 3);
    }
    const bgGeo = new THREE.BufferGeometry();
    bgGeo.setAttribute('position', new THREE.BufferAttribute(bgPos, 3));
    scene.add(
        new THREE.Points(
            bgGeo,
            new THREE.PointsMaterial({ map: dot, size: 1.6, color: INK, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }),
        ),
    );

    // ── Dome: fill stars, named stars, asterisms, horizon, ecliptic, planets ──
    const fillCount = opts.lowPower ? 350 : 800;
    const fillPos = new Float32Array(fillCount * 3);
    for (let i = 0; i < fillCount; i++) {
        const u = rng() * 2 - 1;
        const a = rng() * Math.PI * 2;
        const s = Math.sqrt(1 - u * u);
        fillPos.set([DOME_R * 1.04 * s * Math.cos(a), DOME_R * 1.04 * u, DOME_R * 1.04 * s * Math.sin(a)], i * 3);
    }
    const fillGeo = new THREE.BufferGeometry();
    fillGeo.setAttribute('position', new THREE.BufferAttribute(fillPos, 3));
    domeGroup.add(
        new THREE.Points(
            fillGeo,
            track('dome', new THREE.PointsMaterial({ map: dot, size: 0.22, color: INK, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })),
        ),
    );

    const starPos = new Map<string, THREE.Vector3>();
    for (const s of STARS) {
        const p = v(horizontalToVec3(s.alt, s.az, DOME_R));
        starPos.set(s.name, p);
        const sp = sprite('dome', glow, INK, Math.max(0.6, 0.6 + (3 - s.mag) * 0.38), s.mag < 1.5 ? 1 : 0.8);
        sp.position.copy(p);
        domeGroup.add(sp);
        const label = STAR_LABELS[s.name];
        if (label) {
            const t = labelSprite('starLabels', label, '#9aa2cc', 1.5);
            t.position.copy(p).add(new THREE.Vector3(0, 1.6, 0));
            fades.starLabels.root.add(t);
        }
    }

    const astPts: THREE.Vector3[] = [];
    for (const [a, b] of ASTERISMS) {
        const pa = starPos.get(a);
        const pb = starPos.get(b);
        if (pa && pb) astPts.push(pa, pb);
    }
    domeGroup.add(
        new THREE.LineSegments(
            new THREE.BufferGeometry().setFromPoints(astPts),
            track('dome', new THREE.LineBasicMaterial({ color: TEAL, opacity: 0.45 })),
        ),
    );

    const ring = (r: number, y: number, color: number, opacity: number) => {
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i < 96; i++) {
            const a = (i / 96) * Math.PI * 2;
            pts.push(new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a)));
        }
        return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), track('dome', new THREE.LineBasicMaterial({ color, opacity })));
    };
    domeGroup.add(ring(DOME_R, 0, LINE, 0.9));
    for (const alt of [30, 60]) {
        const r = DOME_R * Math.cos((alt * Math.PI) / 180);
        domeGroup.add(ring(r, DOME_R * Math.sin((alt * Math.PI) / 180), LINE, 0.35));
    }

    const cardinals: [string, number][] = [['N', 0], ['E', 90], ['S', 180], ['W', 270]];
    for (const [t, az] of cardinals) {
        const s = labelSprite('dome', t, '#e8c67c', 2.4);
        s.position.copy(v(horizontalToVec3(3, az, DOME_R)));
        domeGroup.add(s);
    }

    const twilight = sprite('dome', dusk, 0xffffff, 95, 0.9);
    twilight.position.copy(v(horizontalToVec3(-2, 262, DOME_R * 1.1)));
    domeGroup.add(twilight);

    const eclPts = ECLIPTIC.map(([, alt, az]) => v(horizontalToVec3(alt, az, DOME_R * 0.98)));
    domeGroup.add(
        new THREE.LineLoop(
            new THREE.BufferGeometry().setFromPoints(eclPts),
            track('dome', new THREE.LineBasicMaterial({ color: GOLD, opacity: 0.55 })),
        ),
    );

    const planetColor: Record<PlanetName, number> = {
        Sun: GOLD, Moon: 0xdfe4ff, Mercury: INK, Venus: 0xfff1d6, Mars: MARS,
        Jupiter: 0xf3d9b1, Saturn: 0xe6d6a8, Uranus: TEAL, Neptune: 0x8fa8ff, Pluto: 0xb9b2c9,
    };
    for (const p of PLANETS) {
        const pos = v(horizontalToVec3(p.alt, p.az, DOME_R * 0.97));
        const isMars = p.name === 'Mars';
        const dim = p.alt > 0 ? 1 : 0.35;
        const g = sprite('dome', glow, planetColor[p.name], isMars ? 7 : p.name === 'Sun' ? 6 : 1.6, (isMars ? 0.9 : 0.8) * dim);
        g.position.copy(pos);
        domeGroup.add(g);
        const core = new THREE.Mesh(
            new THREE.SphereGeometry(isMars ? 0.75 : 0.22, 16, 16),
            track('dome', new THREE.MeshBasicMaterial({ color: planetColor[p.name], opacity: dim })),
        );
        core.position.copy(pos);
        domeGroup.add(core);
    }

    // ── Marker halos + labels for Sun, Moon, Ascendant ──
    const sun = PLANETS.find((p) => p.name === 'Sun')!;
    const moon = PLANETS.find((p) => p.name === 'Moon')!;
    const asc = eclipticAt(ASC_LON);
    const markerSpots: { text: string; pos: THREE.Vector3; color: number }[] = [
        { text: 'Sun · Libra 20°', pos: v(horizontalToVec3(sun.alt, sun.az, DOME_R * 0.97)), color: GOLD },
        { text: 'Moon · Virgo 4°', pos: v(horizontalToVec3(moon.alt, moon.az, DOME_R * 0.97)), color: 0xdfe4ff },
        { text: 'Ascendant · Aries 28°', pos: v(horizontalToVec3(asc.alt, asc.az, DOME_R * 0.98)), color: MARS },
    ];
    for (const m of markerSpots) {
        const halo = sprite('markers', glow, m.color, 9, 0.9);
        halo.position.copy(m.pos);
        fades.markers.root.add(halo);
        const t = labelSprite('markers', m.text, '#ece8f6', 2.6);
        t.position.copy(m.pos).multiplyScalar(1.12).add(new THREE.Vector3(0, 2.8, 0));
        fades.markers.root.add(t);
    }

    // ── Zodiac wheel ──
    const R0 = 30, R1 = 25.5, RA = 15, RP = 20.5;
    const wpt = (lon: number, r: number) => {
        const p = wheelPoint(lon, ASC_LON, r);
        return new THREE.Vector3(p.x, 0, p.z);
    };
    const wheelRing = (r: number, color: number, opacity: number) => {
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i < 120; i++) {
            const a = (i / 120) * Math.PI * 2;
            pts.push(new THREE.Vector3(r * Math.cos(a), 0, r * Math.sin(a)));
        }
        return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), track('wheel', new THREE.LineBasicMaterial({ color, opacity })));
    };
    wheelTilt.add(wheelRing(R0, LINE, 1), wheelRing(R1, LINE, 1), wheelRing(RA, 0x27305c, 0.9));

    const seg = (a: THREE.Vector3, b: THREE.Vector3, color: number, opacity: number) =>
        new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), track('wheel', new THREE.LineBasicMaterial({ color, opacity })));

    for (let i = 0; i < 12; i++) {
        wheelTilt.add(seg(wpt(i * 30, R1), wpt(i * 30, R0), LINE, 1));
        const g = labelSprite('wheel', SIGN_GLYPHS[i] + '︎', i === 6 ? '#e8c67c' : i === 0 ? '#ff7b5e' : '#9aa2cc', 3.2, SYMBOLS);
        g.position.copy(wpt(i * 30 + 15, (R0 + R1) / 2));
        wheelTilt.add(g);
    }
    for (const [lon, isKey] of [[ASC_LON, true], [ASC_LON + 180, false], [MC_LON, true], [MC_LON + 180, false]] as const) {
        wheelTilt.add(seg(wpt(lon, RA), wpt(lon, R0 + 1.5), isKey ? GOLD : LINE, isKey ? 1 : 0.8));
    }
    for (const [lon, t] of [[ASC_LON - 5, 'ASC'], [MC_LON + 7, 'MC']] as const) {
        const l = labelSprite('wheel', t, '#e8c67c', 1.9);
        l.position.copy(wpt(lon, R1 - 3));
        wheelTilt.add(l);
    }

    const main = PLANETS.filter((p) => ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'].includes(p.name));
    for (const a of findAspects(main)) {
        const pa = main.find((p) => p.name === a.a)!;
        const pb = main.find((p) => p.name === a.b)!;
        const hot = a.kind === 'square' || a.kind === 'opposition';
        wheelTilt.add(seg(wpt(pa.lon, RA), wpt(pb.lon, RA), hot ? MARS : TEAL, a.tight ? 0.95 : 0.45));
    }

    const shown = spreadLongitudes(PLANETS.map((p) => p.lon));
    PLANETS.forEach((p, i) => {
        const col = p.name === 'Mars' ? '#ff7b5e' : p.name === 'Sun' ? '#e8c67c' : '#ece8f6';
        if (p.name === 'Mars') {
            const halo = sprite('wheel', glow, MARS, 6, 0.6);
            halo.position.copy(wpt(shown[i], RP));
            wheelTilt.add(halo);
        }
        const g = labelSprite('wheel', PLANET_GLYPHS[p.name] + '︎', col, 3.6, SYMBOLS);
        g.position.copy(wpt(shown[i], RP));
        wheelTilt.add(g);
        wheelTilt.add(seg(wpt(p.lon, R1), wpt(p.lon, R1 - 1.8), p.name === 'Mars' ? MARS : INK, 1));
        const d = new THREE.Mesh(
            new THREE.SphereGeometry(0.4, 10, 10),
            track('wheel', new THREE.MeshBasicMaterial({ color: p.name === 'Mars' ? MARS : p.name === 'Sun' ? GOLD : INK })),
        );
        d.position.copy(wpt(p.lon, RA));
        wheelTilt.add(d);
    });

    wheelTilt.rotation.x = 0.55;

    // ── Camera + state machine ──
    let state: SkyState = 'intro';
    const camPos = POSES.intro.pos.clone();
    const camLook = POSES.intro.look.clone();
    let camFov = POSES.intro.fov;
    let spin = 0;
    let time = 0;
    let running = false;
    let paused = false;
    let raf = 0;
    let last = 0;
    let disposed = false;
    let dragging = false;

    function frame(dtRaw: number) {
        const dt = Math.min(dtRaw, 0.05);
        time += dt;
        const snap = opts.reducedMotion;
        const kCam = snap ? 1 : 1 - Math.exp(-dt * 2.4);
        const kFade = snap ? 1 : 1 - Math.exp(-dt * 3.2);
        const pose = state === 'wheel' && camera.aspect < 1.2 ? NARROW_WHEEL : POSES[state];

        const swayAmt = !snap && (state === 'intro' || state === 'sky') ? Math.sin(time * 0.12) * 0.28 : 0;
        const look = pose.look.clone();
        if (swayAmt !== 0) look.sub(pose.pos).applyAxisAngle(new THREE.Vector3(0, 1, 0), swayAmt).add(pose.pos);

        camPos.lerp(pose.pos, kCam);
        camLook.lerp(look, kCam);
        const fovDelta = pose.fov - camFov;
        camFov += fovDelta * kCam;
        if (Math.abs(fovDelta) > 0.01) {
            camera.fov = camFov;
            camera.updateProjectionMatrix();
        }
        camera.position.copy(camPos);
        camera.lookAt(camLook);

        const wantSpin = state === 'markers' || state === 'calm' ? 1 : 0;
        spin += (wantSpin - spin) * kFade;
        domeGroup.rotation.y = snap ? 0 : Math.sin(time * 0.1) * 0.35 * spin;

        if (!snap && state === 'wheel' && !dragging) wheelTilt.rotation.y += dt * 0.12;

        (Object.keys(fades) as GroupName[]).forEach((g) => {
            const f = fades[g];
            f.cur += (f.target - f.cur) * kFade;
            if (Math.abs(f.target - f.cur) < 0.004) f.cur = f.target;
            f.root.visible = g !== 'wheel' || f.cur > 0.01;
            const scale = g === 'markers' || g === 'starLabels' ? fades.dome.cur : 1;
            for (const { m, base } of f.mats) m.opacity = base * f.cur * scale;
        });

        renderer.render(scene, camera);
    }

    function loop(now: number) {
        if (!running || disposed) return;
        const dt = last ? (now - last) / 1000 : 0.016;
        last = now;
        frame(dt);
        raf = requestAnimationFrame(loop);
    }
    function start() {
        if (running || paused || disposed || opts.reducedMotion) return;
        running = true;
        last = 0;
        raf = requestAnimationFrame(loop);
    }
    function stop() {
        running = false;
        cancelAnimationFrame(raf);
    }
    function renderOnce() {
        if (!disposed) frame(1);
    }

    function applyState(s: SkyState) {
        state = s;
        (Object.keys(fades) as GroupName[]).forEach((g) => (fades[g].target = VISIBILITY[s][g]));
        // Always allow vertical page scroll; a horizontal drag still turns the wheel.
        canvas.style.touchAction = 'pan-y';
        canvas.style.cursor = s === 'wheel' ? 'grab' : 'default';
        if (opts.reducedMotion) renderOnce();
        else start();
    }

    // ── Drag to turn the wheel ──
    let lastX = 0;
    let lastY = 0;
    const onDown = (e: PointerEvent) => {
        if (state !== 'wheel') return;
        dragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
        canvas.setPointerCapture(e.pointerId);
        canvas.style.cursor = 'grabbing';
    };
    const onMove = (e: PointerEvent) => {
        if (!dragging) return;
        wheelTilt.rotation.y += (e.clientX - lastX) * 0.008;
        wheelTilt.rotation.x = Math.max(0.1, Math.min(1.35, wheelTilt.rotation.x + (e.clientY - lastY) * 0.006));
        lastX = e.clientX;
        lastY = e.clientY;
        if (opts.reducedMotion) renderOnce();
    };
    const onUp = (e: PointerEvent) => {
        if (!dragging) return;
        dragging = false;
        if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
        canvas.style.cursor = state === 'wheel' ? 'grab' : 'default';
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    applyState('intro');

    return {
        setState: applyState,
        resize(w, h) {
            if (w < 1 || h < 1) return;
            renderer.setSize(w, h, false);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            if (opts.reducedMotion) renderOnce();
        },
        setPaused(p) {
            paused = p;
            if (p) stop();
            else start();
        },
        dispose() {
            disposed = true;
            stop();
            canvas.removeEventListener('pointerdown', onDown);
            canvas.removeEventListener('pointermove', onMove);
            canvas.removeEventListener('pointerup', onUp);
            canvas.removeEventListener('pointercancel', onUp);
            scene.traverse((o) => {
                const obj = o as THREE.Mesh;
                obj.geometry?.dispose();
                const mat = obj.material as THREE.Material | THREE.Material[] | undefined;
                for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) {
                    (m as THREE.SpriteMaterial).map?.dispose();
                    m.dispose();
                }
            });
            glow.dispose();
            dot.dispose();
            dusk.dispose();
            renderer.dispose();
            renderer.forceContextLoss();
        },
    };
}
