import { ECLIPTIC, type PlanetName } from './sky-data';

const RAD = Math.PI / 180;
const norm360 = (d: number) => ((d % 360) + 360) % 360;

export function horizontalToVec3(altDeg: number, azDeg: number, radius: number) {
    const alt = altDeg * RAD;
    const az = azDeg * RAD;
    return {
        x: radius * Math.cos(alt) * Math.sin(az),
        y: radius * Math.sin(alt),
        z: -radius * Math.cos(alt) * Math.cos(az),
    };
}

/** Linear interpolation of the ecliptic table, taking the short way round for azimuth. */
export function eclipticAt(lon: number): { alt: number; az: number } {
    const l = norm360(lon);
    const i = Math.floor(l / 5) % ECLIPTIC.length;
    const j = (i + 1) % ECLIPTIC.length;
    const t = (l - ECLIPTIC[i][0]) / 5;
    const alt = ECLIPTIC[i][1] + (ECLIPTIC[j][1] - ECLIPTIC[i][1]) * t;
    const delta = ((ECLIPTIC[j][2] - ECLIPTIC[i][2] + 540) % 360) - 180;
    return { alt, az: norm360(ECLIPTIC[i][2] + delta * t) };
}

/** Rounds to whole arc-minutes first so 29°59.9′ carries into the next sign. */
export function toSignPosition(lon: number): { sign: number; deg: number; min: number } {
    const total = Math.round(norm360(lon) * 60) % 21600;
    const sign = Math.floor(total / 1800);
    const rem = total % 1800;
    return { sign, deg: Math.floor(rem / 60), min: rem % 60 };
}

export function formatSignPosition(lon: number): string {
    const { deg, min } = toSignPosition(lon);
    return `${deg}°${String(min).padStart(2, '0')}′`;
}

/** Wheel layout used by the source: Ascendant on the left, longitude increasing counter-clockwise. */
export function wheelPoint(lon: number, asc: number, r: number): { x: number; z: number } {
    const a = (180 + (lon - asc)) * RAD;
    return { x: r * Math.cos(a), z: -r * Math.sin(a) };
}

/** Nudges crowded planet glyphs apart (same relaxation as the source page). Output keeps input order. */
export function spreadLongitudes(lons: number[], minGap = 9, iterations = 40): number[] {
    const n = lons.length;
    if (n < 2) return [...lons];
    const order = lons.map((lon, i) => ({ i, show: lon })).sort((a, b) => a.show - b.show);
    for (let it = 0; it < iterations; it++) {
        for (let k = 0; k < n; k++) {
            const a = order[k];
            const b = order[(k + 1) % n];
            const gap = (b.show - a.show + 360) % 360;
            if (gap < minGap) {
                const push = (minGap - gap) / 2;
                a.show -= push;
                b.show += push;
            }
        }
    }
    const out = new Array<number>(n);
    for (const o of order) out[o.i] = o.show;
    return out;
}

export type AspectKind = 'square' | 'opposition' | 'trine' | 'sextile';
export interface Aspect {
    a: PlanetName;
    b: PlanetName;
    kind: AspectKind;
    orb: number;
    tight: boolean;
}

const ASPECTS: ReadonlyArray<readonly [number, AspectKind, number]> = [
    [60, 'sextile', 5],
    [90, 'square', 7],
    [120, 'trine', 7],
    [180, 'opposition', 8],
];

/** Conjunctions are skipped on purpose, matching the source chart. */
export function findAspects(planets: ReadonlyArray<{ name: PlanetName; lon: number }>): Aspect[] {
    const out: Aspect[] = [];
    for (let i = 0; i < planets.length; i++) {
        for (let j = i + 1; j < planets.length; j++) {
            let d = Math.abs(planets[i].lon - planets[j].lon) % 360;
            if (d > 180) d = 360 - d;
            for (const [angle, kind, maxOrb] of ASPECTS) {
                const orb = Math.abs(d - angle);
                if (orb <= maxOrb) {
                    out.push({ a: planets[i].name, b: planets[j].name, kind, orb, tight: orb < 1.5 });
                }
            }
        }
    }
    return out;
}
