/**
 * Curated iconic cycling climbs — world-famous ascents as ready-to-ride Route
 * objects. Every route is a densified polyline following a plausible line from
 * base to summit with a realistic elevation profile derived from each climb's
 * known distance, total ascent, and gradient character.
 *
 * Routes are built inline (no async fetch, no backend) so they are instantly
 * available the moment the user clicks "Ride this climb."
 */

import type { Route, RoutePoint } from '@/types';
import { haversine } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Extra metadata attached to each iconic route (not part of Route type).
// ---------------------------------------------------------------------------

export interface IconicRouteInfo {
  route: Route;
  /** Famous climb name (may differ from route.name for display). */
  climbName: string;
  /** Country / region string, e.g. "France — Isère". */
  region: string;
  /** Short prose description (1–2 sentences). */
  description: string;
  /**
   * Average gradient over the whole ascent, percent.
   * Computed from ascent / totalDistance * 100 but overridden
   * with the widely published figure for known climbs.
   */
  avgGradient: number;
  /** Maximum gradient encountered on the climb, percent. */
  maxGradient: number;
  /** Difficulty tag used to pick badge colour. */
  difficulty: 'hors catégorie' | 'category 1' | 'category 2';
}

// ---------------------------------------------------------------------------
// Internal builder — lerps a smooth elevation profile between control points
// and densifies the lat/lon polyline so the Cesium chase-cam runs smoothly.
// ---------------------------------------------------------------------------

interface ControlPoint {
  /** 0..1 fractional position along the climb. */
  t: number;
  /** Elevation in metres at this point. */
  ele: number;
}

/**
 * Build a Route from a sparse control polyline. Generates `numPts` evenly
 * spaced track points by linearly interpolating between consecutive controls
 * for both position and elevation.
 */
function buildIconicRoute(opts: {
  id: string;
  name: string;
  /** Control points: [lat, lon] pairs, ordered base → summit. */
  coords: [number, number][];
  /**
   * Elevation control points relative to the route's fractional length.
   * Must include t=0 (base) and t=1 (summit).
   */
  elevationProfile: ControlPoint[];
  /** Total number of generated track points (≥ coords.length). */
  numPts?: number;
}): Route {
  const { id, name, coords, elevationProfile, numPts = 300 } = opts;

  // Sort profile guards.
  const profile = [...elevationProfile].sort((a, b) => a.t - b.t);

  /** Interpolate elevation at fractional position t (0..1). */
  function elevationAt(t: number): number {
    for (let i = 1; i < profile.length; i++) {
      if (t <= profile[i].t) {
        const span = profile[i].t - profile[i - 1].t;
        const frac = span > 0 ? (t - profile[i - 1].t) / span : 0;
        return profile[i - 1].ele + (profile[i].ele - profile[i - 1].ele) * frac;
      }
    }
    return profile[profile.length - 1].ele;
  }

  /** Interpolate [lat, lon] at fractional position t (0..1) along coords. */
  function positionAt(t: number): [number, number] {
    if (coords.length === 1) return coords[0];
    const segCount = coords.length - 1;
    const raw = t * segCount;
    const seg = Math.min(Math.floor(raw), segCount - 1);
    const frac = raw - seg;
    const [lat0, lon0] = coords[seg];
    const [lat1, lon1] = coords[seg + 1];
    return [lat0 + (lat1 - lat0) * frac, lon0 + (lon1 - lon0) * frac];
  }

  // Generate evenly-spaced raw points.
  const raw: { lat: number; lon: number; ele: number }[] = [];
  for (let i = 0; i < numPts; i++) {
    const t = i / (numPts - 1);
    const [lat, lon] = positionAt(t);
    raw.push({ lat, lon, ele: elevationAt(t) });
  }

  // Compute cumulative distance + stats.
  const points: RoutePoint[] = [];
  let dist = 0;
  let ascent = 0;
  let descent = 0;
  let minEle = Infinity;
  let maxEle = -Infinity;

  for (let i = 0; i < raw.length; i++) {
    const p = raw[i];
    if (i > 0) {
      const prev = raw[i - 1];
      const d = haversine(prev.lat, prev.lon, p.lat, p.lon);
      if (d < 0.01) continue; // skip duplicates
      dist += d;
      const dEle = p.ele - prev.ele;
      if (dEle > 0) ascent += dEle;
      else descent -= dEle;
    }
    points.push({ lat: p.lat, lon: p.lon, ele: p.ele, distance: dist });
    if (p.ele < minEle) minEle = p.ele;
    if (p.ele > maxEle) maxEle = p.ele;
  }

  return {
    id,
    name,
    points,
    totalDistance: dist,
    ascent,
    descent,
    minElevation: minEle,
    maxElevation: maxEle,
    loadedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// The climbs
// ---------------------------------------------------------------------------

/**
 * Alpe d'Huez — 13.8 km, 1071 m ascent, avg 7.9 %. 21 hairpin bends.
 * Base: Bourg-d'Oisans (720 m) → summit: 1791 m.
 */
function makeAlpeDHuez(): Route {
  return buildIconicRoute({
    id: 'iconic-alpe-dhuez',
    name: "Alpe d'Huez",
    coords: [
      [45.0539, 6.0338],  // Bourg-d'Oisans base
      [45.0680, 6.0520],  // Hairpin 21–18
      [45.0800, 6.0680],  // Hairpin 14–10
      [45.0950, 6.0790],  // Hairpin 7–4
      [45.1090, 6.0687],  // Final ramp
      [45.1131, 6.0743],  // Summit
    ],
    elevationProfile: [
      { t: 0.00, ele: 720 },
      { t: 0.10, ele: 835 },
      { t: 0.25, ele: 1010 },
      { t: 0.40, ele: 1180 },
      { t: 0.55, ele: 1340 },
      { t: 0.70, ele: 1510 },
      { t: 0.82, ele: 1640 },
      { t: 0.92, ele: 1740 },
      { t: 1.00, ele: 1791 },
    ],
    numPts: 350,
  });
}

/**
 * Mont Ventoux — 21.5 km from Bédoin, 1617 m ascent, avg 7.5 %.
 * Base: Bédoin (295 m) → summit: 1912 m.
 */
function makeMontVentoux(): Route {
  return buildIconicRoute({
    id: 'iconic-mont-ventoux',
    name: 'Mont Ventoux',
    coords: [
      [44.1238, 5.1790],  // Bédoin
      [44.1470, 5.2060],  // Saint-Estève (gradient kicks in)
      [44.1680, 5.2340],  // Chalet Reynard (Col de la Forêt)
      [44.1840, 5.2590],  // Above treeline, lunar landscape begins
      [44.1990, 5.2720],  // Final 3 km
      [44.2100, 5.2785],  // Summit observatory
    ],
    elevationProfile: [
      { t: 0.00, ele: 295 },
      { t: 0.12, ele: 480 },
      { t: 0.25, ele: 750 },   // gradient eases past Saint-Estève
      { t: 0.40, ele: 950 },
      { t: 0.55, ele: 1265 },  // Chalet Reynard (paved resumes)
      { t: 0.68, ele: 1440 },
      { t: 0.80, ele: 1600 },
      { t: 0.90, ele: 1780 },
      { t: 0.96, ele: 1880 },
      { t: 1.00, ele: 1912 },
    ],
    numPts: 400,
  });
}

/**
 * Stelvio Pass (Passo dello Stelvio) — 24.3 km from Prato allo Stelvio,
 * 1808 m ascent, avg 7.4 %. 48 numbered hairpins.
 * Base: Prato (915 m) → summit: 2758 m (highest paved road in eastern Alps).
 */
function makeStelvioPass(): Route {
  return buildIconicRoute({
    id: 'iconic-stelvio-pass',
    name: 'Stelvio Pass',
    coords: [
      [46.6180, 10.5280],  // Prato allo Stelvio
      [46.5950, 10.5120],  // Lower hairpins
      [46.5750, 10.5020],  // Mid switchbacks
      [46.5560, 10.4860],  // High hairpins (30s)
      [46.5370, 10.4670],  // Final approach
      [46.5286, 10.4541],  // Summit
    ],
    elevationProfile: [
      { t: 0.00, ele:  915 },
      { t: 0.08, ele: 1080 },
      { t: 0.20, ele: 1340 },
      { t: 0.35, ele: 1620 },
      { t: 0.50, ele: 1900 },
      { t: 0.65, ele: 2120 },
      { t: 0.78, ele: 2380 },
      { t: 0.88, ele: 2580 },
      { t: 0.94, ele: 2700 },
      { t: 1.00, ele: 2758 },
    ],
    numPts: 420,
  });
}

/**
 * Passo del Mortirolo — 12.4 km from Mazzo di Valtellina, 1285 m ascent,
 * avg 10.5 %. Considered one of Europe's hardest climbs.
 * Base: Mazzo (530 m) → summit: 1852 m.
 */
function makeMortirolo(): Route {
  return buildIconicRoute({
    id: 'iconic-mortirolo',
    name: 'Passo del Mortirolo',
    coords: [
      [46.2540, 10.3020],  // Mazzo di Valtellina
      [46.2370, 10.3180],  // Lower ramps (12–14%)
      [46.2220, 10.3340],  // Middle section (15%+ walls)
      [46.2080, 10.3460],  // Upper ramps
      [46.1930, 10.3540],  // Summit approach
      [46.1827, 10.3600],  // Summit
    ],
    elevationProfile: [
      { t: 0.00, ele:  530 },
      { t: 0.10, ele:  690 },
      { t: 0.22, ele:  900 },
      { t: 0.35, ele: 1080 },
      { t: 0.48, ele: 1240 },
      { t: 0.60, ele: 1410 },
      { t: 0.72, ele: 1580 },
      { t: 0.84, ele: 1720 },
      { t: 0.93, ele: 1800 },
      { t: 1.00, ele: 1852 },
    ],
    numPts: 320,
  });
}

/**
 * Sa Calobra (Mallorca) — 9.4 km, 670 m ascent, avg 7.1 %.
 * The legendary Majorcan mountain road with 270° loops.
 * Base: Sa Calobra port (sea level) → summit: Coll dels Reis (670 m).
 */
function makeSaCalobra(): Route {
  return buildIconicRoute({
    id: 'iconic-sa-calobra',
    name: 'Sa Calobra',
    coords: [
      [39.8550, 2.7998],  // Port de sa Calobra (sea level)
      [39.8630, 2.8050],  // First switchbacks
      [39.8720, 2.8110],  // Nudo de sa Corbata (270° loop)
      [39.8820, 2.8200],  // Mid climb
      [39.8930, 2.8320],  // Upper section
      [39.9000, 2.8380],  // Coll dels Reis summit
    ],
    elevationProfile: [
      { t: 0.00, ele:   5 },
      { t: 0.12, ele:  80 },
      { t: 0.25, ele: 185 },
      { t: 0.40, ele: 310 },
      { t: 0.55, ele: 420 },
      { t: 0.68, ele: 530 },
      { t: 0.80, ele: 600 },
      { t: 0.90, ele: 645 },
      { t: 1.00, ele: 670 },
    ],
    numPts: 280,
  });
}

/**
 * Col du Galibier — 17.7 km from Plan Lachat, 1245 m ascent, avg 7.0 %.
 * The roof of the Tour de France.
 * Base: Plan Lachat (1500 m) → summit: 2645 m.
 */
function makeColDuGalibier(): Route {
  return buildIconicRoute({
    id: 'iconic-col-du-galibier',
    name: 'Col du Galibier',
    coords: [
      [45.1100, 6.5020],  // Plan Lachat
      [45.1000, 6.4870],  // Col du Télégraphe approach
      [45.0840, 6.4790],  // Valloire
      [45.0680, 6.4680],  // Upper climb begins
      [45.0580, 6.4580],  // Final ramps
      [45.0631, 6.4076],  // Summit Galibier
    ],
    elevationProfile: [
      { t: 0.00, ele: 1500 },
      { t: 0.12, ele: 1610 },
      { t: 0.25, ele: 1750 },
      { t: 0.38, ele: 1930 },
      { t: 0.52, ele: 2080 },
      { t: 0.65, ele: 2220 },
      { t: 0.78, ele: 2400 },
      { t: 0.90, ele: 2570 },
      { t: 1.00, ele: 2645 },
    ],
    numPts: 360,
  });
}

/**
 * Hautacam — 13.6 km, 1135 m ascent, avg 8.3 %.
 * Brutal Pyrenean finish, multi-stage Tour venue.
 * Base: Argelès-Gazost (460 m) → summit: 1595 m.
 */
function makeHautacam(): Route {
  return buildIconicRoute({
    id: 'iconic-hautacam',
    name: 'Hautacam',
    coords: [
      [43.0070, -0.0960],  // Argelès-Gazost
      [43.0150, -0.0830],  // Lower ramps
      [43.0230, -0.0660],  // Mid climb
      [43.0300, -0.0480],  // Steep upper section
      [43.0380, -0.0310],  // Final km
      [43.0440, -0.0200],  // Summit
    ],
    elevationProfile: [
      { t: 0.00, ele:  460 },
      { t: 0.10, ele:  580 },
      { t: 0.22, ele:  730 },
      { t: 0.36, ele:  900 },
      { t: 0.50, ele: 1060 },
      { t: 0.64, ele: 1200 },
      { t: 0.76, ele: 1340 },
      { t: 0.88, ele: 1480 },
      { t: 1.00, ele: 1595 },
    ],
    numPts: 320,
  });
}

/**
 * Trollstigen (Norway) — 11 km, 858 m ascent, avg 7.8 %.
 * 11 hairpin bends through dramatic Norwegian waterfalls.
 * Base: Åndalsnes valley (30 m) → summit: Trollstigen plateau (858 m).
 */
function makeTrollstigen(): Route {
  return buildIconicRoute({
    id: 'iconic-trollstigen',
    name: 'Trollstigen',
    coords: [
      [62.4570, 7.6640],  // Valley base
      [62.4520, 7.6720],  // First hairpins
      [62.4470, 7.6800],  // Waterfall view
      [62.4420, 7.6870],  // Upper hairpins
      [62.4360, 7.6920],  // Final approach
      [62.4303, 7.7003],  // Trollstigen plateau summit
    ],
    elevationProfile: [
      { t: 0.00, ele:  30 },
      { t: 0.10, ele: 110 },
      { t: 0.22, ele: 250 },
      { t: 0.36, ele: 400 },
      { t: 0.50, ele: 540 },
      { t: 0.64, ele: 660 },
      { t: 0.78, ele: 770 },
      { t: 0.90, ele: 830 },
      { t: 1.00, ele: 858 },
    ],
    numPts: 300,
  });
}

/**
 * Mauna Kea (Hawaii) — 56 km from Hilo visitor center route,
 * 3968 m ascent, avg 7.1 %. World's highest paved road climb by elevation gain.
 * Base: Hilo sea level (30 m) → summit: 4205 m.
 */
function makeMaunaKea(): Route {
  return buildIconicRoute({
    id: 'iconic-mauna-kea',
    name: 'Mauna Kea',
    coords: [
      [19.7297, -155.0900],  // Hilo
      [19.7500, -155.3500],  // Saddle Road junction
      [19.7800, -155.4500],  // Visitor Information Station (2835 m)
      [19.8000, -155.4600],  // Upper road begins
      [19.8200, -155.4700],  // Observatory zone
      [19.8219, -155.4681],  // Mauna Kea Summit
    ],
    elevationProfile: [
      { t: 0.00, ele:   30 },
      { t: 0.15, ele:  400 },
      { t: 0.30, ele:  900 },
      { t: 0.45, ele: 1600 },
      { t: 0.58, ele: 2200 },
      { t: 0.67, ele: 2835 },  // Visitor station (VIS)
      { t: 0.75, ele: 3200 },
      { t: 0.85, ele: 3700 },
      { t: 0.93, ele: 4000 },
      { t: 1.00, ele: 4205 },
    ],
    numPts: 500,
  });
}

/**
 * Old La Honda Road (California) — 8.7 km, 393 m ascent, avg 4.5 %.
 * Silicon Valley's beloved training climb; steady, punchy, iconic.
 * Base: Woodside (100 m) → summit: Skyline Blvd junction (493 m).
 */
function makeOldLaHonda(): Route {
  return buildIconicRoute({
    id: 'iconic-old-la-honda',
    name: 'Old La Honda Road',
    coords: [
      [37.4055, -122.2522],  // Woodside base
      [37.3960, -122.2480],  // Lower slopes
      [37.3850, -122.2390],  // Mid section
      [37.3740, -122.2350],  // Upper winding road
      [37.3640, -122.2340],  // Final straight
      [37.3560, -122.2310],  // Skyline Blvd summit
    ],
    elevationProfile: [
      { t: 0.00, ele: 100 },
      { t: 0.15, ele: 165 },
      { t: 0.30, ele: 240 },
      { t: 0.45, ele: 305 },
      { t: 0.60, ele: 370 },
      { t: 0.75, ele: 420 },
      { t: 0.88, ele: 465 },
      { t: 1.00, ele: 493 },
    ],
    numPts: 260,
  });
}

// ---------------------------------------------------------------------------
// Exported catalogue
// ---------------------------------------------------------------------------

/** The full catalogue of iconic climbs. Instantiated once, module-level. */
export const ICONIC_ROUTES: IconicRouteInfo[] = [
  {
    route: makeAlpeDHuez(),
    climbName: "Alpe d'Huez",
    region: 'France — Isère',
    description:
      "The most celebrated climb in Tour de France history. 21 numbered hairpin bends rise 1071 m over 13.8 km through a cheering corridor of fan camps.",
    avgGradient: 7.9,
    maxGradient: 13.0,
    difficulty: 'hors catégorie',
  },
  {
    route: makeMontVentoux(),
    climbName: 'Mont Ventoux',
    region: 'France — Vaucluse',
    description:
      "The Giant of Provence. A brutal 21.5 km slog through dense pine forest that suddenly opens onto an eerie, treeless lunar plateau swept by fierce mistral winds.",
    avgGradient: 7.5,
    maxGradient: 12.0,
    difficulty: 'hors catégorie',
  },
  {
    route: makeStelvioPass(),
    climbName: 'Stelvio Pass',
    region: 'Italy — Alto Adige',
    description:
      "Europe's highest paved pass at 2758 m. Forty-eight numbered hairpins ascend 24.3 km through the South Tyrol, with snow lingering into June.",
    avgGradient: 7.4,
    maxGradient: 12.5,
    difficulty: 'hors catégorie',
  },
  {
    route: makeMortirolo(),
    climbName: 'Passo del Mortirolo',
    region: 'Italy — Lombardy',
    description:
      "Widely regarded as the hardest road climb in Europe. A relentless 12.4 km wall averaging 10.5% that has broken Giro d'Italia contenders for decades.",
    avgGradient: 10.5,
    maxGradient: 18.0,
    difficulty: 'hors catégorie',
  },
  {
    route: makeSaCalobra(),
    climbName: 'Sa Calobra',
    region: 'Spain — Mallorca',
    description:
      "A Mallorcan masterpiece: 9.4 km of perfect tarmac spiralling up through limestone gorges, including the famed 270° Nudo de sa Corbata loop.",
    avgGradient: 7.1,
    maxGradient: 10.0,
    difficulty: 'category 1',
  },
  {
    route: makeColDuGalibier(),
    climbName: 'Col du Galibier',
    region: 'France — Savoie',
    description:
      "At 2645 m, Galibier is one of the Tour's highest and most mythical summits. The final kilometres above Plan Lachat offer a moonscape panorama of the Écrins.",
    avgGradient: 7.0,
    maxGradient: 11.0,
    difficulty: 'hors catégorie',
  },
  {
    route: makeHautacam(),
    climbName: 'Hautacam',
    region: 'France — Hautes-Pyrénées',
    description:
      "A gruelling 13.6 km Pyrenean summit finish averaging 8.3% — a consistent gradient that rewards power riders and punishes any weakness in pacing.",
    avgGradient: 8.3,
    maxGradient: 13.5,
    difficulty: 'hors catégorie',
  },
  {
    route: makeTrollstigen(),
    climbName: 'Trollstigen',
    region: 'Norway — Møre og Romsdal',
    description:
      "Eleven dramatic hairpin bends carved into a Norwegian mountain wall, flanked by roaring waterfalls. One of Scandinavia's most spectacular roads.",
    avgGradient: 7.8,
    maxGradient: 12.0,
    difficulty: 'category 1',
  },
  {
    route: makeMaunaKea(),
    climbName: 'Mauna Kea',
    region: 'USA — Hawaii',
    description:
      "From Hilo to the summit observatories: 56 km and nearly 4200 m of elevation gain, finishing at 4205 m where the atmosphere holds just 60% of sea-level oxygen.",
    avgGradient: 7.1,
    maxGradient: 14.0,
    difficulty: 'hors catégorie',
  },
  {
    route: makeOldLaHonda(),
    climbName: 'Old La Honda Road',
    region: 'USA — California',
    description:
      "Silicon Valley's legendary benchmark climb. 8.7 km of perfectly paced 4.5% average through coastal redwoods — every Bay Area cyclist has a PR to beat here.",
    avgGradient: 4.5,
    maxGradient: 8.5,
    difficulty: 'category 2',
  },
];
