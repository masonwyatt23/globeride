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
import type { MoodId } from '@/lib/cesiumUtils';

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
  /**
   * Preferred atmospheric mood for this route.
   * Applied at ride-start to tune sun angle, sky, fog, and ground tint.
   * Falls back to `moodForRoute()` heuristics when absent.
   */
  mood?: MoodId;
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

/**
 * Col du Tourmalet — 17.1 km from Luz-Saint-Sauveur, 1404 m ascent, avg 7.4 %.
 * The most-climbed mountain in Tour de France history.
 * Base: Luz-Saint-Sauveur (710 m) → summit: 2115 m.
 */
function makeColDuTourmalet(): Route {
  return buildIconicRoute({
    id: 'iconic-col-du-tourmalet',
    name: 'Col du Tourmalet',
    coords: [
      [42.8730, -0.0030],  // Luz-Saint-Sauveur
      [42.8820,  0.0120],  // Lower slopes through Barèges
      [42.8900,  0.0320],  // Barèges village
      [42.8970,  0.0560],  // Mid climb, gradient steepens
      [42.9030,  0.0780],  // Upper ramps
      [42.9105,  0.1000],  // Summit Col du Tourmalet
    ],
    elevationProfile: [
      { t: 0.00, ele:  710 },
      { t: 0.10, ele:  840 },
      { t: 0.22, ele: 1030 },
      { t: 0.38, ele: 1260 },
      { t: 0.52, ele: 1470 },
      { t: 0.65, ele: 1680 },
      { t: 0.78, ele: 1870 },
      { t: 0.90, ele: 2020 },
      { t: 1.00, ele: 2115 },
    ],
    numPts: 360,
  });
}

/**
 * Alto de l'Angliru (Spain) — 12.5 km from La Vega, 1266 m ascent, avg 10.1 %.
 * Vuelta a España's most feared summit — ramps exceed 23 %.
 * Base: La Vega (295 m) → summit: 1570 m.
 */
function makeAngliru(): Route {
  return buildIconicRoute({
    id: 'iconic-angliru',
    name: "Alto de l'Angliru",
    coords: [
      [43.2050, -5.9760],  // La Vega base
      [43.2000, -5.9580],  // Lower section
      [43.1940, -5.9400],  // Mid slopes — gradient already painful
      [43.1870, -5.9210],  // Cueña les Cabres (23% ramp begins)
      [43.1800, -5.9070],  // Upper nightmare ramps
      [43.1742, -5.8972],  // Summit
    ],
    elevationProfile: [
      { t: 0.00, ele:  295 },
      { t: 0.10, ele:  435 },
      { t: 0.22, ele:  620 },
      { t: 0.36, ele:  820 },
      { t: 0.50, ele: 1010 },
      { t: 0.62, ele: 1170 },
      { t: 0.74, ele: 1320 },
      { t: 0.86, ele: 1460 },
      { t: 0.94, ele: 1535 },
      { t: 1.00, ele: 1570 },
    ],
    numPts: 320,
  });
}

/**
 * Monte Zoncolan (Italy) — 10.1 km from Ovaro, 1210 m ascent, avg 11.9 %.
 * Italy's answer to the Angliru — one of the steepest roads in pro cycling.
 * Base: Ovaro (395 m) → summit: 1730 m.
 */
function makeMonteZoncolan(): Route {
  return buildIconicRoute({
    id: 'iconic-monte-zoncolan',
    name: 'Monte Zoncolan',
    coords: [
      [46.4700, 12.9380],  // Ovaro base
      [46.4580, 12.9430],  // Lower switchbacks
      [46.4470, 12.9510],  // Mid section (gradient 14–15%)
      [46.4360, 12.9580],  // Upper ramps (15–18%)
      [46.4260, 12.9650],  // Final approach
      [46.4186, 12.9723],  // Summit
    ],
    elevationProfile: [
      { t: 0.00, ele:  395 },
      { t: 0.10, ele:  570 },
      { t: 0.22, ele:  790 },
      { t: 0.35, ele: 1000 },
      { t: 0.50, ele: 1190 },
      { t: 0.64, ele: 1370 },
      { t: 0.78, ele: 1530 },
      { t: 0.90, ele: 1660 },
      { t: 1.00, ele: 1730 },
    ],
    numPts: 300,
  });
}

/**
 * Pico de Veleta (Spain) — 43 km from Granada, 2762 m ascent, avg 6.4 %.
 * The highest paved road in Europe, finishing at 3398 m in the Sierra Nevada.
 * Base: Granada (636 m) → summit: Veleta observatory (3398 m).
 */
function makePicoDeVeleta(): Route {
  return buildIconicRoute({
    id: 'iconic-pico-de-veleta',
    name: 'Pico de Veleta',
    coords: [
      [37.1773, -3.5986],  // Granada city
      [37.1500, -3.5700],  // Lower foothills
      [37.1200, -3.5200],  // Sierra Nevada park entrance
      [37.0900, -3.4700],  // Pradollano ski resort area
      [37.0700, -3.4300],  // High-altitude road
      [37.0540, -3.3700],  // Final ascent
      [37.0511, -3.3609],  // Summit Veleta
    ],
    elevationProfile: [
      { t: 0.00, ele:  636 },
      { t: 0.12, ele:  900 },
      { t: 0.25, ele: 1250 },
      { t: 0.38, ele: 1700 },
      { t: 0.50, ele: 2100 },
      { t: 0.62, ele: 2500 },
      { t: 0.73, ele: 2820 },
      { t: 0.83, ele: 3080 },
      { t: 0.92, ele: 3270 },
      { t: 1.00, ele: 3398 },
    ],
    numPts: 480,
  });
}

/**
 * Col d'Izoard — 14.1 km from Arvieux, 985 m ascent, avg 7.0 %.
 * A Tour de France legend — the barren Casse Déserte moonscape is unmistakable.
 * Base: Arvieux (1080 m) → summit: 2360 m.
 */
function makeColDIzoard(): Route {
  return buildIconicRoute({
    id: 'iconic-col-d-izoard',
    name: "Col d'Izoard",
    coords: [
      [44.7880,  6.7280],  // Arvieux base
      [44.7760,  6.7150],  // Lower slopes
      [44.7630,  6.7050],  // Casse Déserte approach
      [44.7520,  6.6980],  // Casse Déserte — eerie rock towers
      [44.7410,  6.6890],  // Upper ramps
      [44.7305,  6.6820],  // Summit Col d'Izoard
    ],
    elevationProfile: [
      { t: 0.00, ele: 1080 },
      { t: 0.12, ele: 1210 },
      { t: 0.25, ele: 1420 },
      { t: 0.40, ele: 1640 },
      { t: 0.55, ele: 1850 },
      { t: 0.68, ele: 2020 },
      { t: 0.80, ele: 2160 },
      { t: 0.92, ele: 2300 },
      { t: 1.00, ele: 2360 },
    ],
    numPts: 340,
  });
}

/**
 * Willunga Hill (Australia) — 3.7 km, 245 m ascent, avg 6.6 %.
 * The iconic Santos Tour Down Under finish — short, sharp, and decisive.
 * Base: Willunga town (90 m) → summit: 335 m.
 */
function makeWillungaHill(): Route {
  return buildIconicRoute({
    id: 'iconic-willunga-hill',
    name: 'Willunga Hill',
    coords: [
      [-35.2730, 138.5580],  // Willunga town base
      [-35.2690, 138.5480],  // Lower approach
      [-35.2640, 138.5380],  // Steepest section (10–11%)
      [-35.2590, 138.5290],  // Upper ramps
      [-35.2545, 138.5220],  // Summit
    ],
    elevationProfile: [
      { t: 0.00, ele:  90 },
      { t: 0.15, ele: 130 },
      { t: 0.32, ele: 175 },
      { t: 0.52, ele: 225 },
      { t: 0.70, ele: 272 },
      { t: 0.85, ele: 308 },
      { t: 1.00, ele: 335 },
    ],
    numPts: 200,
  });
}

/**
 * Box Hill (England) — 7.5 km round trip circuit, 200 m ascent, avg 5.0 %.
 * Made famous by the 2012 Olympic road race — London's most celebrated climb.
 * Base: Dorking (50 m) → summit: Box Hill NT car park (250 m).
 */
function makeBoxHill(): Route {
  return buildIconicRoute({
    id: 'iconic-box-hill',
    name: 'Box Hill',
    coords: [
      [51.2330, -0.3310],  // Dorking base
      [51.2400, -0.3210],  // Lower wooded section
      [51.2470, -0.3100],  // Zigzag Road begins
      [51.2530, -0.2990],  // Upper zigzags
      [51.2577, -0.2913],  // Summit car park
    ],
    elevationProfile: [
      { t: 0.00, ele:  50 },
      { t: 0.18, ele:  95 },
      { t: 0.35, ele: 140 },
      { t: 0.55, ele: 185 },
      { t: 0.75, ele: 222 },
      { t: 1.00, ele: 250 },
    ],
    numPts: 220,
  });
}

/**
 * Central Park Loop (New York) — 9.7 km rolling circuit, ~100 m of rolling gain.
 * The world's most iconic urban cycling loop — flat to gently rolling.
 * Start/finish: Columbus Circle (17 m). Mostly flat with Harlem Hill as the stinger.
 */
function makeCentralParkLoop(): Route {
  return buildIconicRoute({
    id: 'iconic-central-park-loop',
    name: 'Central Park Loop',
    coords: [
      [40.7685, -73.9820],  // Columbus Circle (start/finish)
      [40.7750, -73.9710],  // West Drive north
      [40.7900, -73.9580],  // Harlem Hill approach
      [40.7970, -73.9520],  // Harlem Hill summit (highest point)
      [40.7960, -73.9490],  // North end turnaround
      [40.7870, -73.9530],  // East Drive heading south
      [40.7720, -73.9660],  // Mid East Drive
      [40.7580, -73.9730],  // Hilly area south
      [40.7640, -73.9790],  // Cat Hill descent
      [40.7685, -73.9820],  // Columbus Circle (return)
    ],
    elevationProfile: [
      { t: 0.00, ele:  17 },
      { t: 0.10, ele:  25 },
      { t: 0.20, ele:  35 },
      { t: 0.30, ele:  65 },  // Harlem Hill climb
      { t: 0.36, ele:  90 },  // Harlem Hill summit
      { t: 0.45, ele:  55 },  // Descent
      { t: 0.55, ele:  40 },
      { t: 0.65, ele:  55 },  // Cat Hill
      { t: 0.75, ele:  35 },
      { t: 0.88, ele:  25 },
      { t: 1.00, ele:  17 },  // Back at Columbus Circle
    ],
    numPts: 280,
  });
}

/**
 * Promenade des Anglais coastal loop (Nice, France) — 11 km, ~50 m elevation.
 * The glamorous flat seafront road of the Côte d'Azur — a rolling coastal circuit.
 * Classic warm-weather flat ride used by WorldTour teams during winter training camps.
 */
function makeNicePromenade(): Route {
  return buildIconicRoute({
    id: 'iconic-nice-promenade',
    name: 'Promenade des Anglais',
    coords: [
      [43.6950,  7.2660],  // Nice Aéroport end
      [43.6960,  7.2450],  // Mid seafront heading east
      [43.6970,  7.2200],  // Central Nice / Negresco hotel
      [43.6980,  7.2000],  // Toward Old Town
      [43.6990,  7.2100],  // Turn-around loop
      [43.6980,  7.2300],  // Return leg
      [43.6965,  7.2520],  // Port area
      [43.6950,  7.2660],  // Return to start
    ],
    elevationProfile: [
      { t: 0.00, ele:  5 },
      { t: 0.12, ele:  8 },
      { t: 0.25, ele: 12 },
      { t: 0.40, ele: 18 },
      { t: 0.50, ele: 22 },
      { t: 0.62, ele: 15 },
      { t: 0.75, ele: 10 },
      { t: 0.88, ele:  7 },
      { t: 1.00, ele:  5 },
    ],
    numPts: 240,
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
    mood: 'golden-hour',  // legendary afternoon finish light on the 21 bends
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
    mood: 'mediterranean-mist',  // Provence warmth and haze on the Giant
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
    mood: 'clear-noon',  // crisp alpine high-altitude light on the 48 hairpins
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
    mood: 'overcast',  // brooding grey Lombard sky suits the suffering
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
    mood: 'mediterranean-mist',  // Mallorcan sea-salt warmth and haze
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
    mood: 'alpine-storm',  // Galibier is infamous for violent summer storms
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
    mood: 'overcast',  // Pyrenean cloud often clings to summit finishes
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
    mood: 'fjord-rain',  // Norwegian fjord weather: cool, wet, misty waterfalls
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
    mood: 'golden-hour',  // Hawaiian sunset over the lava fields is iconic
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
    mood: 'clear-noon',  // crisp NorCal morning light through the redwoods
  },
  {
    route: makeColDuTourmalet(),
    climbName: 'Col du Tourmalet',
    region: 'France — Hautes-Pyrénées',
    description:
      "The most-climbed mountain in Tour de France history. 17.1 km through the Pyrenean heartland rising steadily to 2115 m — a monument of professional cycling.",
    avgGradient: 7.4,
    maxGradient: 13.0,
    difficulty: 'hors catégorie',
    mood: 'alpine-storm',  // Tourmalet is notorious for sudden Pyrenean squalls
  },
  {
    route: makeAngliru(),
    climbName: "Alto de l'Angliru",
    region: 'Spain — Asturias',
    description:
      "The Vuelta a España's most feared summit. Ramps on the upper Cueña les Cabres section reach 23% — so steep that some riders have walked. Absolutely savage.",
    avgGradient: 10.1,
    maxGradient: 23.5,
    difficulty: 'hors catégorie',
    mood: 'overcast',  // Asturian green hills are always under grey skies
  },
  {
    route: makeMonteZoncolan(),
    climbName: 'Monte Zoncolan',
    region: 'Italy — Friuli',
    description:
      "Italy's most feared Giro d'Italia climb. 10.1 km from Ovaro averaging nearly 12% with sustained stretches above 15% — a relentless wall of suffering.",
    avgGradient: 11.9,
    maxGradient: 22.0,
    difficulty: 'hors catégorie',
    mood: 'overcast',  // Friuli climbs often shrouded in cloud
  },
  {
    route: makePicoDeVeleta(),
    climbName: 'Pico de Veleta',
    region: 'Spain — Sierra Nevada',
    description:
      "The highest paved road in Europe at 3398 m. A 43 km odyssey from Granada into the Sierra Nevada where the air thins and the views stretch to Africa on a clear day.",
    avgGradient: 6.4,
    maxGradient: 10.0,
    difficulty: 'hors catégorie',
    mood: 'clear-noon',  // Sierra Nevada clarity — views to Africa on a good day
  },
  {
    route: makeColDIzoard(),
    climbName: "Col d'Izoard",
    region: 'France — Hautes-Alpes',
    description:
      "One of the Tour de France's most atmospheric climbs. The barren Casse Déserte — a moonscape of rock towers and scree — makes the final kilometres unforgettable.",
    avgGradient: 7.0,
    maxGradient: 11.0,
    difficulty: 'hors catégorie',
    mood: 'golden-hour',  // Casse Déserte rock spires glow amber at golden hour
  },
  {
    route: makeWillungaHill(),
    climbName: 'Willunga Hill',
    region: 'Australia — South Australia',
    description:
      "Short, sharp, and decisive. The 3.7 km Santos Tour Down Under finale has launched many sprint-climber victories — and shattered as many GC ambitions.",
    avgGradient: 6.6,
    maxGradient: 11.0,
    difficulty: 'category 1',
    mood: 'clear-noon',  // South Australian summer sun at full blast
  },
  {
    route: makeBoxHill(),
    climbName: 'Box Hill',
    region: 'England — Surrey',
    description:
      "London's most celebrated climb, immortalised by the 2012 Olympic road race. The Zigzag Road winds 250 m above the Mole Valley through ancient beech woodland.",
    avgGradient: 5.0,
    maxGradient: 9.0,
    difficulty: 'category 2',
    mood: 'overcast',  // English weather: reliably grey and damp in Surrey
  },
  {
    route: makeCentralParkLoop(),
    climbName: 'Central Park Loop',
    region: 'USA — New York',
    description:
      "The world's most iconic urban cycling circuit. Nearly 10 km of rolling roads through Manhattan's green heart — Harlem Hill provides the only real sting.",
    avgGradient: 1.5,
    maxGradient: 8.0,
    difficulty: 'category 2',
    mood: 'golden-hour',  // evening loop around the park, Manhattan skyline glow
  },
  {
    route: makeNicePromenade(),
    climbName: 'Promenade des Anglais',
    region: 'France — Côte d\'Azur',
    description:
      "The glamorous seafront boulevard of Nice — flat, fast, and sun-drenched. WorldTour teams train here all winter. Roll along the Mediterranean and enjoy the view.",
    avgGradient: 0.5,
    maxGradient: 3.0,
    difficulty: 'category 2',
    mood: 'mediterranean-mist',  // Côte d'Azur warmth, haze, and sea glitter
  },
];
