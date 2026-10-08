// Generated once from tmp/Rahmat, Anak Langit.html (PyEphem, Jakarta 2001-10-13 18:15 WIB).
// Do not hand-edit numbers; regenerate from the source instead.

export type SkyState = 'intro' | 'markers' | 'sky' | 'wheel' | 'calm';

export type PlanetName =
    | 'Sun' | 'Moon' | 'Mercury' | 'Venus' | 'Mars'
    | 'Jupiter' | 'Saturn' | 'Uranus' | 'Neptune' | 'Pluto';

export interface SkyPlanet { name: PlanetName; lon: number; alt: number; az: number; mag: number }
export interface SkyStar { name: string; alt: number; az: number; mag: number }

export const ASC_LON = 28.45;
export const MC_LON = 295.65;

export const PLANETS: SkyPlanet[] = [
    { name: 'Sun', lon: 200.17, alt: -8.0, az: 261.1, mag: -26.8 },
    { name: 'Moon', lon: 153.83, alt: -50.7, az: 284.9, mag: -8.2 },
    { name: 'Mercury', lon: 201.5, alt: -7.2, az: 259.0, mag: 6.0 },
    { name: 'Venus', lon: 177.48, alt: -29.4, az: 269.2, mag: -3.8 },
    { name: 'Mars', lon: 290.45, alt: 71.1, az: 194.4, mag: -0.2 },
    { name: 'Jupiter', lon: 105.01, alt: -70.4, az: 32.8, mag: -2.2 },
    { name: 'Saturn', lon: 74.7, alt: -45.0, az: 66.7, mag: -0.1 },
    { name: 'Uranus', lon: 321.01, alt: 62.9, az: 111.5, mag: 5.8 },
    { name: 'Neptune', lon: 305.98, alt: 73.8, az: 141.0, mag: 7.9 },
    { name: 'Pluto', lon: 253.21, alt: 45.6, az: 258.5, mag: 13.9 },
];

export const STARS: SkyStar[] = [
    { name: 'Rigil Kentaurus', alt: 11.4, az: 209.1, mag: 0 },
    { name: 'Arcturus', alt: 3.9, az: 289.8, mag: -0.1 },
    { name: 'Vega', alt: 41.9, az: 340.7, mag: 0 },
    { name: 'Achernar', alt: 6.9, az: 147.0, mag: 0.5 },
    { name: 'Hadar', alt: 7.0, az: 209.8, mag: 0.6 },
    { name: 'Altair', alt: 74.9, az: 0.3, mag: 0.8 },
    { name: 'Antares', alt: 38.1, az: 241.1, mag: 1.1 },
    { name: 'Fomalhaut', alt: 40.2, az: 124.0, mag: 1.2 },
    { name: 'Deneb', alt: 37.3, az: 11.2, mag: 1.2 },
    { name: 'Shaula', alt: 46.1, az: 220.3, mag: 1.6 },
    { name: 'Peacock', alt: 39.0, az: 173.8, mag: 1.9 },
    { name: 'Nunki', alt: 66.0, az: 211.7, mag: 2.0 },
    { name: 'Kaus Australis', alt: 55.5, az: 212.4, mag: 1.8 },
    { name: 'Alnair', alt: 39.7, az: 149.9, mag: 1.7 },
    { name: 'Enif', alt: 57.4, az: 60.6, mag: 2.4 },
    { name: 'Markab', alt: 37.3, az: 65.5, mag: 2.5 },
    { name: 'Alpheratz', alt: 18.8, az: 56.4, mag: 2.1 },
    { name: 'Mirach', alt: 4.6, az: 53.4, mag: 2.1 },
    { name: 'Diphda', alt: 17.8, az: 106.9, mag: 2.0 },
    { name: 'Sadr', alt: 43.0, az: 8.3, mag: 2.2 },
    { name: 'Scheat', alt: 32.2, az: 51.1, mag: 2.4 },
    { name: 'Algenib', alt: 21.5, az: 71.0, mag: 2.8 },
    { name: 'Ankaa', alt: 19.7, az: 132.8, mag: 2.4 },
    { name: 'Rasalhague', alt: 51.4, az: 299.2, mag: 2.1 },
    { name: 'Atria', alt: 20.5, az: 195.8, mag: 1.9 },
    { name: 'Sabik', alt: 49.7, az: 252.9, mag: 2.4 },
    { name: 'Albireo', alt: 55.5, az: 352.3, mag: 3.0 },
    { name: 'Alphecca', alt: 20.0, az: 301.4, mag: 2.2 },
    { name: 'Sadalmelik', alt: 55.7, az: 81.4, mag: 3.0 },
];

/** [ecliptic longitude, altitude, azimuth] every 5 degrees of longitude. */
export const ECLIPTIC: ReadonlyArray<readonly [number, number, number]> = [
    [0, 27.5, 86.8],
    [5.0, 22.7, 85.2],
    [10.0, 17.8, 83.8],
    [15.0, 13.0, 82.5],
    [20.0, 8.2, 81.1],
    [25.0, 3.3, 79.9],
    [30.0, -1.5, 78.6],
    [35.0, -6.3, 77.4],
    [40.0, -11.2, 76.1],
    [45.0, -16.0, 74.7],
    [50.0, -20.8, 73.3],
    [55.0, -25.6, 71.9],
    [60.0, -30.4, 70.2],
    [65.0, -35.2, 68.5],
    [70.0, -39.9, 66.5],
    [75.0, -44.6, 64.2],
    [80.0, -49.3, 61.5],
    [85.0, -53.9, 58.2],
    [90.0, -58.3, 54.1],
    [95.0, -62.6, 48.9],
    [100.0, -66.7, 42.0],
    [105.0, -70.3, 32.6],
    [110.0, -73.2, 19.6],
    [115.0, -75.1, 2.5],
    [120.0, -75.4, 342.9],
    [125.0, -74.1, 324.5],
    [130.0, -71.5, 309.9],
    [135.0, -68.1, 299.2],
    [140.0, -64.2, 291.5],
    [145.0, -60.0, 285.7],
    [150.0, -55.6, 281.3],
    [155.0, -51.0, 277.7],
    [160.0, -46.4, 274.8],
    [165.0, -41.7, 272.4],
    [170.0, -37.0, 270.3],
    [175.0, -32.3, 268.4],
    [180.0, -27.5, 266.8],
    [185.0, -22.7, 265.2],
    [190.0, -17.8, 263.8],
    [195.0, -13.0, 262.5],
    [200.0, -8.2, 261.2],
    [205.0, -3.3, 259.9],
    [210.0, 1.5, 258.6],
    [215.0, 6.3, 257.4],
    [220.0, 11.2, 256.1],
    [225.0, 16.0, 254.7],
    [230.0, 20.8, 253.3],
    [235.0, 25.6, 251.9],
    [240.0, 30.4, 250.2],
    [245.0, 35.2, 248.5],
    [250.0, 39.9, 246.5],
    [255.0, 44.6, 244.2],
    [260.0, 49.3, 241.5],
    [265.0, 53.9, 238.2],
    [270.0, 58.3, 234.1],
    [275.0, 62.6, 228.9],
    [280.0, 66.7, 222.0],
    [285.0, 70.3, 212.6],
    [290.0, 73.2, 199.6],
    [295.0, 75.1, 182.5],
    [300.0, 75.4, 162.9],
    [305.0, 74.1, 144.5],
    [310.0, 71.5, 129.9],
    [315.0, 68.1, 119.2],
    [320.0, 64.2, 111.5],
    [325.0, 60.0, 105.7],
    [330.0, 55.6, 101.3],
    [335.0, 51.0, 97.7],
    [340.0, 46.4, 94.8],
    [345.0, 41.7, 92.4],
    [350.0, 37.0, 90.3],
    [355.0, 32.2, 88.4],
];

export const ASTERISMS: ReadonlyArray<readonly [string, string]> = [
    ['Vega', 'Deneb'],
    ['Deneb', 'Altair'],
    ['Altair', 'Vega'],
    ['Markab', 'Scheat'],
    ['Scheat', 'Alpheratz'],
    ['Alpheratz', 'Algenib'],
    ['Algenib', 'Markab'],
    ['Antares', 'Shaula'],
    ['Kaus Australis', 'Nunki'],
    ['Rigil Kentaurus', 'Hadar'],
];

export const STAR_LABELS: Record<string, string> = {
    'Altair': 'Altair',
    'Vega': 'Vega',
    'Deneb': 'Deneb',
    'Antares': 'Antares',
    'Fomalhaut': 'Fomalhaut',
    'Rigil Kentaurus': 'Alpha Centauri',
    'Achernar': 'Achernar',
    'Markab': 'Pegasus',
    'Arcturus': 'Arcturus',
    'Nunki': 'Sagittarius',
};

export const SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
export const SIGN_GLYPHS = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];
export const PLANET_GLYPHS: Record<PlanetName, string> = {
    Sun: '☉', Moon: '☽', Mercury: '☿', Venus: '♀', Mars: '♂',
    Jupiter: '♃', Saturn: '♄', Uranus: '♅', Neptune: '♆', Pluto: '♇',
};
