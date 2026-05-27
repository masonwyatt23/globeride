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

  // ---------------------------------------------------------------------------
  // ASIA
  // ---------------------------------------------------------------------------
  {
    route: buildIconicRoute({
      id: 'iconic-mount-fuji',
      name: 'Mount Fuji — Subaru Line',
      coords: [
        [35.3606, 138.7308],  // Fujiyoshida base (850 m)
        [35.3700, 138.7250],  // 5th station approach
        [35.3800, 138.7190],  // Treeline end, volcanic slopes begin
        [35.3860, 138.7150],  // 2000 m band
        [35.3920, 138.7100],  // Upper switchbacks
        [35.3960, 138.7050],  // Subaru 5th station (2305 m)
      ],
      elevationProfile: [
        { t: 0.00, ele:  850 },
        { t: 0.20, ele: 1200 },
        { t: 0.40, ele: 1600 },
        { t: 0.60, ele: 1950 },
        { t: 0.80, ele: 2150 },
        { t: 1.00, ele: 2305 },
      ],
      numPts: 280,
    }),
    climbName: 'Mount Fuji — Subaru Line',
    region: 'Japan — Yamanashi',
    description:
      "Japan's sacred volcano and iconic cycling challenge. The Subaru Line winds 24 km through cedar forest to the 5th station at 2305 m, with panoramic views of Lake Kawaguchiko far below.",
    avgGradient: 6.1,
    maxGradient: 10.0,
    difficulty: 'hors catégorie',
    mood: 'clear-noon',
  },
  {
    route: buildIconicRoute({
      id: 'iconic-hakone-pass',
      name: 'Hakone Pass — Touge',
      coords: [
        [35.1960, 139.0750],  // Odawara base (15 m)
        [35.2200, 139.0820],  // Lower hairpins
        [35.2380, 139.0900],  // Mid-slope forest
        [35.2500, 139.0980],  // Upper bend
        [35.2320, 139.1050],  // Hakone summit (874 m)
      ],
      elevationProfile: [
        { t: 0.00, ele:  15 },
        { t: 0.25, ele: 280 },
        { t: 0.50, ele: 530 },
        { t: 0.75, ele: 720 },
        { t: 1.00, ele: 874 },
      ],
      numPts: 240,
    }),
    climbName: 'Hakone Touge',
    region: 'Japan — Kanagawa',
    description:
      "The most famous cycling climb in Japan, serving as the finishing climb of the Tour de Okinawa and countless gran fondos. 15 km of relentless switchbacks rising from sea level through bamboo forest to the Hakone plateau.",
    avgGradient: 5.8,
    maxGradient: 10.5,
    difficulty: 'category 1',
    mood: 'overcast',
  },
  {
    route: buildIconicRoute({
      id: 'iconic-taroko-hehuanshan',
      name: 'Hehuanshan — Taiwan',
      coords: [
        [24.1500, 121.6200],  // Dayuling (2565 m)
        [24.1350, 121.6350],  // Switchback zone
        [24.1250, 121.6500],  // Wuling Pass shoulder
        [24.1150, 121.6600],  // Upper plateau
        [24.1070, 121.6730],  // Hehuanshan East Peak (3421 m)
      ],
      elevationProfile: [
        { t: 0.00, ele: 2565 },
        { t: 0.25, ele: 2850 },
        { t: 0.50, ele: 3100 },
        { t: 0.75, ele: 3280 },
        { t: 1.00, ele: 3421 },
      ],
      numPts: 220,
    }),
    climbName: 'Hehuanshan East Peak',
    region: 'Taiwan — Nantou / Hualien',
    description:
      "The highest paved road in Taiwan at 3421 m. Starting from the already-high Dayuling junction, 14 km of high-altitude climbing through the Central Mountain Range with views across the island's spine.",
    avgGradient: 6.3,
    maxGradient: 11.0,
    difficulty: 'hors catégorie',
    mood: 'clear-noon',
  },
  {
    route: buildIconicRoute({
      id: 'iconic-cameron-highlands',
      name: 'Cameron Highlands',
      coords: [
        [4.2550, 101.2400],  // Tapah base (90 m)
        [4.3000, 101.3200],  // Lower jungle switchbacks
        [4.3500, 101.3800],  // Tea plantation zone
        [4.4000, 101.4100],  // Brinchang approach
        [4.4670, 101.3870],  // Gunung Brinchang summit (2032 m)
      ],
      elevationProfile: [
        { t: 0.00, ele:   90 },
        { t: 0.25, ele:  550 },
        { t: 0.50, ele: 1100 },
        { t: 0.75, ele: 1600 },
        { t: 1.00, ele: 2032 },
      ],
      numPts: 260,
    }),
    climbName: 'Gunung Brinchang',
    region: 'Malaysia — Pahang',
    description:
      "Malaysia's highest paved road winds 55 km from the jungle floor through terraced tea plantations to the cloud-shrouded summit at 2032 m. Tropical heat gives way to cool mist as you climb.",
    avgGradient: 3.6,
    maxGradient: 9.0,
    difficulty: 'category 1',
    mood: 'overcast',
  },
  {
    route: buildIconicRoute({
      id: 'iconic-kyoto-hiei',
      name: 'Mount Hiei — Kyoto',
      coords: [
        [35.0197, 135.7693],  // Kyoto city (50 m)
        [35.0400, 135.7900],  // Ohara approach
        [35.0600, 135.8100],  // Forest climb
        [35.0720, 135.8220],  // Enryakuji plateau
        [35.0750, 135.8300],  // Mount Hiei summit (848 m)
      ],
      elevationProfile: [
        { t: 0.00, ele:  50 },
        { t: 0.30, ele: 300 },
        { t: 0.60, ele: 580 },
        { t: 0.85, ele: 750 },
        { t: 1.00, ele: 848 },
      ],
      numPts: 220,
    }),
    climbName: 'Mount Hiei',
    region: 'Japan — Kyoto',
    description:
      "Rising above the ancient capital of Kyoto, Mount Hiei's temple roads offer 18 km of serene climbing through cedar and maple forest. The summit plateau hosts the 1200-year-old Enryakuji Temple complex.",
    avgGradient: 4.4,
    maxGradient: 9.5,
    difficulty: 'category 1',
    mood: 'overcast',
  },

  // ---------------------------------------------------------------------------
  // NORTH AMERICA
  // ---------------------------------------------------------------------------
  {
    route: buildIconicRoute({
      id: 'iconic-pikes-peak',
      name: 'Pikes Peak — America\'s Mountain',
      coords: [
        [38.8605, -104.9920],  // Crystal Creek Reservoir gate (2862 m)
        [38.8750, -105.0100],  // Glen Cove area
        [38.8900, -105.0300],  // Devil's Playground
        [38.8980, -105.0420],  // Summit approach
        [38.8405, -105.0423],  // Pikes Peak summit (4302 m)
      ],
      elevationProfile: [
        { t: 0.00, ele: 2862 },
        { t: 0.25, ele: 3280 },
        { t: 0.50, ele: 3700 },
        { t: 0.75, ele: 4050 },
        { t: 1.00, ele: 4302 },
      ],
      numPts: 260,
    }),
    climbName: 'Pikes Peak',
    region: 'USA — Colorado',
    description:
      "America's Mountain and one of the world's iconic cycling ascents. 19.9 km rising 1440 m through 156 turns above timberline, culminating at 4302 m where the air is thin and the views span four states.",
    avgGradient: 7.2,
    maxGradient: 10.0,
    difficulty: 'hors catégorie',
    mood: 'clear-noon',
  },
  {
    route: buildIconicRoute({
      id: 'iconic-mt-hamilton',
      name: 'Mount Hamilton — Silicon Valley',
      coords: [
        [37.3350, -121.7950],  // Alum Rock base (120 m)
        [37.3500, -121.7600],  // Lower switchbacks
        [37.3650, -121.7350],  // Grant Ranch area
        [37.3750, -121.7150],  // Antelope Valley
        [37.3410, -121.6430],  // Lick Observatory summit (1283 m)
      ],
      elevationProfile: [
        { t: 0.00, ele: 120 },
        { t: 0.25, ele: 450 },
        { t: 0.50, ele: 750 },
        { t: 0.75, ele: 1050 },
        { t: 1.00, ele: 1283 },
      ],
      numPts: 280,
    }),
    climbName: 'Mount Hamilton',
    region: 'USA — California',
    description:
      "The classic Silicon Valley climb: 31 km of unbroken switchbacks from the valley floor to the Lick Observatory at 1283 m. Dry chaparral, golden hills, and panoramic views of San Jose below.",
    avgGradient: 3.7,
    maxGradient: 9.0,
    difficulty: 'category 1',
    mood: 'golden-hour',
  },
  {
    route: buildIconicRoute({
      id: 'iconic-mt-lemmon',
      name: 'Mount Lemmon — Sky Island',
      coords: [
        [32.3200, -110.8190],  // Tucson base (760 m)
        [32.3500, -110.7800],  // Lower Sonoran desert
        [32.3900, -110.7400],  // Pinyon-juniper zone
        [32.4300, -110.7200],  // Ponderosa pine forest
        [32.4430, -110.7887],  // Summerhaven summit (2791 m)
      ],
      elevationProfile: [
        { t: 0.00, ele:  760 },
        { t: 0.25, ele: 1300 },
        { t: 0.50, ele: 1850 },
        { t: 0.75, ele: 2300 },
        { t: 1.00, ele: 2791 },
      ],
      numPts: 280,
    }),
    climbName: 'Mount Lemmon',
    region: 'USA — Arizona',
    description:
      "Tucson's sky island escape: 38 km from desert saguaro to Canadian-zone fir forest, rising 2000 m through five distinct ecological zones. USA Cycling's most popular winter training climb.",
    avgGradient: 5.4,
    maxGradient: 8.5,
    difficulty: 'hors catégorie',
    mood: 'clear-noon',
  },
  {
    route: buildIconicRoute({
      id: 'iconic-mont-tremblant',
      name: 'Mont-Tremblant',
      coords: [
        [46.1430, -74.5960],  // Saint-Jovite base (230 m)
        [46.1500, -74.6100],  // Village approach
        [46.1600, -74.6200],  // Lower slopes
        [46.1700, -74.6300],  // Mid-mountain
        [46.2067, -74.5933],  // Summit (875 m)
      ],
      elevationProfile: [
        { t: 0.00, ele: 230 },
        { t: 0.30, ele: 420 },
        { t: 0.55, ele: 600 },
        { t: 0.80, ele: 760 },
        { t: 1.00, ele: 875 },
      ],
      numPts: 220,
    }),
    climbName: 'Mont-Tremblant',
    region: 'Canada — Québec',
    description:
      "The crown jewel of the Laurentians and host of multiple IRONMAN and Tour de Beauce stages. 18 km through the Quebec wilderness, with blazing autumn foliage creating a natural tunnel of colour.",
    avgGradient: 3.6,
    maxGradient: 8.0,
    difficulty: 'category 1',
    mood: 'golden-hour',
  },
  // ---------------------------------------------------------------------------
  // AUSTRALIA / OCEANIA
  // ---------------------------------------------------------------------------
  {
    route: buildIconicRoute({
      id: 'iconic-mt-buller',
      name: 'Mount Buller',
      coords: [
        [-37.1430, 146.4020],  // Mansfield base (384 m)
        [-37.1200, 146.4200],  // Lower slopes
        [-37.1000, 146.4350],  // Mirimbah
        [-37.0800, 146.4450],  // Upper forest road
        [-37.1440, 146.4334],  // Mount Buller summit (1707 m)
      ],
      elevationProfile: [
        { t: 0.00, ele:  384 },
        { t: 0.25, ele:  750 },
        { t: 0.50, ele: 1100 },
        { t: 0.75, ele: 1420 },
        { t: 1.00, ele: 1707 },
      ],
      numPts: 260,
    }),
    climbName: 'Mount Buller',
    region: 'Australia — Victoria',
    description:
      "The centrepiece of the Jayco Herald Sun Tour and one of Australia's most beloved cycling climbs. 26 km from Mansfield through dense alpine ash forest to the snowfields village at 1707 m.",
    avgGradient: 5.1,
    maxGradient: 9.0,
    difficulty: 'category 1',
    mood: 'overcast',
  },
  {
    route: buildIconicRoute({
      id: 'iconic-mt-hotham',
      name: 'Mount Hotham — Great Alpine Road',
      coords: [
        [-36.9870, 147.0540],  // Harrietville base (380 m)
        [-37.0100, 147.0700],  // Ovens River valley
        [-37.0300, 147.0900],  // Feathertop Wilderness
        [-37.0500, 147.1100],  // Diamondvale saddle
        [-37.0488, 147.1304],  // Mount Hotham summit (1860 m)
      ],
      elevationProfile: [
        { t: 0.00, ele:  380 },
        { t: 0.25, ele:  800 },
        { t: 0.50, ele: 1200 },
        { t: 0.75, ele: 1580 },
        { t: 1.00, ele: 1860 },
      ],
      numPts: 260,
    }),
    climbName: 'Mount Hotham',
    region: 'Australia — Victoria',
    description:
      "Victoria's highest road at 1860 m is the queen stage destination of the Tour de Pologne–inspired Australian stage races. 28 km of relentless climbing through the Victorian Alps with ski village at the top.",
    avgGradient: 5.3,
    maxGradient: 10.0,
    difficulty: 'category 1',
    mood: 'overcast',
  },
  {
    route: buildIconicRoute({
      id: 'iconic-adelaide-hills',
      name: 'Norton Summit — Adelaide Hills',
      coords: [
        [-34.9290, 138.7060],  // Norton Summit base (200 m)
        [-34.9200, 138.7150],  // Lower switchbacks
        [-34.9130, 138.7230],  // Mid-climb
        [-34.9050, 138.7310],  // Upper ridge
        [-34.9038, 138.7392],  // Summit (481 m)
      ],
      elevationProfile: [
        { t: 0.00, ele: 200 },
        { t: 0.30, ele: 300 },
        { t: 0.60, ele: 390 },
        { t: 0.85, ele: 455 },
        { t: 1.00, ele: 481 },
      ],
      numPts: 180,
    }),
    climbName: 'Norton Summit',
    region: 'Australia — South Australia',
    description:
      "The defining climb of the Tour Down Under's queen stage and beloved by Adelaide's cycling community. Short, punchy, and steep — the 7 km ascent through eucalyptus woodland decides the GC.",
    avgGradient: 4.0,
    maxGradient: 11.5,
    difficulty: 'category 2',
    mood: 'clear-noon',
  },

  // ---------------------------------------------------------------------------
  // SOUTH AMERICA
  // ---------------------------------------------------------------------------
  {
    route: buildIconicRoute({
      id: 'iconic-alto-de-letras',
      name: 'Alto de Letras',
      coords: [
        [5.0540, -74.6870],   // Mariquita base (540 m)
        [5.0700, -74.7200],   // Lower coffee zone
        [5.1000, -74.7600],   // Mid-slope cloud forest
        [5.1400, -74.7900],   // Páramo entry
        [5.1700, -74.7700],   // Upper paramo
        [5.1990, -74.7530],   // Alto de Letras summit (3700 m)
      ],
      elevationProfile: [
        { t: 0.00, ele:  540 },
        { t: 0.20, ele: 1100 },
        { t: 0.40, ele: 1800 },
        { t: 0.60, ele: 2400 },
        { t: 0.80, ele: 3100 },
        { t: 1.00, ele: 3700 },
      ],
      numPts: 320,
    }),
    climbName: 'Alto de Letras',
    region: 'Colombia — Tolima / Caldas',
    description:
      "The world's longest paved cycling climb at 80 km from Mariquita to 3700 m. A rite of passage for Colombian climbers — from equatorial heat through coffee plantations, cloud forest, and open páramo.",
    avgGradient: 3.9,
    maxGradient: 9.0,
    difficulty: 'hors catégorie',
    mood: 'overcast',
  },
  {
    route: buildIconicRoute({
      id: 'iconic-alto-de-mifafi',
      name: 'Alto de Mifafí — Andes',
      coords: [
        [8.5900, -71.1400],   // Mérida city base (1600 m)
        [8.6200, -71.1600],   // Lower cable car road
        [8.6500, -71.1700],   // Las González
        [8.6800, -71.1800],   // Páramo de Mucubají
        [8.7100, -71.1900],   // Alto de Mifafí summit (4050 m)
      ],
      elevationProfile: [
        { t: 0.00, ele: 1600 },
        { t: 0.25, ele: 2400 },
        { t: 0.50, ele: 3000 },
        { t: 0.75, ele: 3600 },
        { t: 1.00, ele: 4050 },
      ],
      numPts: 240,
    }),
    climbName: 'Alto de Mifafí',
    region: 'Venezuela — Mérida',
    description:
      "Rising from the city of Mérida into the Venezuelan Andes, this 30 km climb reaches 4050 m through páramo high-altitude grasslands. Condors soar overhead as the road narrows to a single thread.",
    avgGradient: 8.2,
    maxGradient: 12.0,
    difficulty: 'hors catégorie',
    mood: 'overcast',
  },
  {
    route: buildIconicRoute({
      id: 'iconic-bariloche-cerro-otto',
      name: 'Cerro Otto — Bariloche',
      coords: [
        [-41.1330, -71.3100],  // Bariloche lakeside (770 m)
        [-41.1280, -71.3250],  // Lower pines
        [-41.1230, -71.3380],  // Gondola station
        [-41.1190, -71.3500],  // Upper slope
        [-41.1143, -71.3597],  // Cerro Otto summit (1405 m)
      ],
      elevationProfile: [
        { t: 0.00, ele:  770 },
        { t: 0.30, ele:  950 },
        { t: 0.55, ele: 1100 },
        { t: 0.80, ele: 1270 },
        { t: 1.00, ele: 1405 },
      ],
      numPts: 200,
    }),
    climbName: 'Cerro Otto',
    region: 'Argentina — Río Negro (Patagonia)',
    description:
      "Above the chocolate-box town of Bariloche on the shores of Lake Nahuel Huapi, Cerro Otto rises through Patagonian coihue forest with snowcapped Andean peaks in every direction.",
    avgGradient: 5.4,
    maxGradient: 10.0,
    difficulty: 'category 1',
    mood: 'clear-noon',
  },

  // ---------------------------------------------------------------------------
  // AFRICA
  // ---------------------------------------------------------------------------
  {
    route: buildIconicRoute({
      id: 'iconic-chapmans-peak',
      name: "Chapman's Peak — Cape Peninsula",
      coords: [
        [-34.1050, 18.3650],  // Hout Bay base (10 m)
        [-34.1150, 18.3580],  // Lower cliff road
        [-34.1250, 18.3520],  // Tunnel approach
        [-34.1350, 18.3480],  // Chapman's Peak Drive mid-point
        [-34.1450, 18.3450],  // Noordhoek descent start (596 m)
      ],
      elevationProfile: [
        { t: 0.00, ele:  10 },
        { t: 0.25, ele: 200 },
        { t: 0.50, ele: 400 },
        { t: 0.75, ele: 530 },
        { t: 1.00, ele: 596 },
      ],
      numPts: 200,
    }),
    climbName: "Chapman's Peak",
    region: 'South Africa — Western Cape',
    description:
      "One of the most dramatic coastal roads on earth — 114 curves blasted from the sheer cliff face of Chapman's Peak above the Atlantic surf. Featured in the Cape Town Cycle Tour, the world's largest individually timed cycle race.",
    avgGradient: 6.6,
    maxGradient: 12.0,
    difficulty: 'category 1',
    mood: 'mediterranean-mist',
  },
  {
    route: buildIconicRoute({
      id: 'iconic-kilimanjaro-approach',
      name: 'Kilimanjaro — Marangu Gate Approach',
      coords: [
        [-3.2700, 37.3500],   // Moshi town (820 m)
        [-3.2500, 37.4000],   // Marangu village
        [-3.2300, 37.4500],   // Lower forest zone
        [-3.2100, 37.5000],   // Marangu Gate (1879 m)
        [-3.1900, 37.5300],   // Mandara Huts approach (2720 m)
      ],
      elevationProfile: [
        { t: 0.00, ele:  820 },
        { t: 0.25, ele: 1100 },
        { t: 0.50, ele: 1500 },
        { t: 0.75, ele: 1879 },
        { t: 1.00, ele: 2720 },
      ],
      numPts: 240,
    }),
    climbName: 'Kilimanjaro Approach',
    region: 'Tanzania — Kilimanjaro Region',
    description:
      "The paved approach to Africa's highest mountain climbs through lush montane forest from Moshi town to the Mandara Huts zone. A legendary ride — every gain is a step toward the Roof of Africa.",
    avgGradient: 4.5,
    maxGradient: 9.0,
    difficulty: 'category 1',
    mood: 'overcast',
  },

  // ---------------------------------------------------------------------------
  // EASTERN EUROPE
  // ---------------------------------------------------------------------------
  {
    route: buildIconicRoute({
      id: 'iconic-transfagarasan',
      name: 'Transfăgărășan — Romania',
      coords: [
        [45.3590, 24.6270],   // Curtea de Argeș base (350 m)
        [45.4000, 24.6400],   // Lower switchbacks
        [45.4500, 24.6500],   // Vidraru Dam
        [45.5000, 24.6300],   // Canyon walls
        [45.5500, 24.6200],   // High plateau
        [45.5960, 24.6100],   // Bâlea Lake / Summit tunnel (2042 m)
      ],
      elevationProfile: [
        { t: 0.00, ele:  350 },
        { t: 0.15, ele:  600 },
        { t: 0.30, ele:  900 },
        { t: 0.50, ele: 1200 },
        { t: 0.70, ele: 1600 },
        { t: 0.85, ele: 1900 },
        { t: 1.00, ele: 2042 },
      ],
      numPts: 320,
    }),
    climbName: 'Transfăgărășan Highway',
    region: 'Romania — Argeș / Sibiu',
    description:
      "Declared the world's greatest driving road by Top Gear, the Transfăgărășan is an equally legendary cycling ascent. Built by Ceaușescu through the Southern Carpathians, 90 km of drama with a glacial lake at the top.",
    avgGradient: 5.3,
    maxGradient: 9.0,
    difficulty: 'hors catégorie',
    mood: 'overcast',
  },
  {
    route: buildIconicRoute({
      id: 'iconic-transalpina',
      name: 'Transalpina — Urdele Pass',
      coords: [
        [45.3000, 23.7500],   // Novaci base (655 m)
        [45.3300, 23.7200],   // Lower road
        [45.3600, 23.6900],   // Rânca
        [45.3900, 23.6600],   // Upper plateau
        [45.4100, 23.6400],   // Urdele Pass summit (2145 m)
      ],
      elevationProfile: [
        { t: 0.00, ele:  655 },
        { t: 0.25, ele: 1100 },
        { t: 0.50, ele: 1550 },
        { t: 0.75, ele: 1900 },
        { t: 1.00, ele: 2145 },
      ],
      numPts: 260,
    }),
    climbName: 'Transalpina — Urdele Pass',
    region: 'Romania — Gorj / Sibiu',
    description:
      "Romania's highest road at 2145 m is a secret gem of Eastern European cycling. The Transalpina climbs through bare Carpathian ridgelines where sheep graze and the sky dominates every vista.",
    avgGradient: 5.5,
    maxGradient: 10.0,
    difficulty: 'hors catégorie',
    mood: 'overcast',
  },
  {
    route: buildIconicRoute({
      id: 'iconic-high-tatras',
      name: 'Lomnický štít — High Tatras',
      coords: [
        [49.0667, 20.2333],   // Tatranská Lomnica village (850 m)
        [49.0800, 20.2000],   // Cable car base road
        [49.1000, 20.1700],   // Forest zone
        [49.1200, 20.1500],   // Upper Tatras
        [49.1971, 20.1344],   // Skalnaté pleso (1751 m — road end)
      ],
      elevationProfile: [
        { t: 0.00, ele:  850 },
        { t: 0.30, ele: 1100 },
        { t: 0.60, ele: 1380 },
        { t: 0.85, ele: 1600 },
        { t: 1.00, ele: 1751 },
      ],
      numPts: 220,
    }),
    climbName: 'High Tatras — Skalnaté pleso',
    region: 'Slovakia — Prešov',
    description:
      "The roof of Slovakia and one of Central Europe's finest cycling challenges. The paved road through the High Tatras National Park climbs 900 m through pine and spruce to the alpine lake plateau.",
    avgGradient: 4.9,
    maxGradient: 9.5,
    difficulty: 'category 1',
    mood: 'overcast',
  },

  // ---------------------------------------------------------------------------
  // UK / IRELAND
  // ---------------------------------------------------------------------------
  {
    route: buildIconicRoute({
      id: 'iconic-hardknott-pass',
      name: 'Hardknott Pass',
      coords: [
        [54.3910, -3.1800],   // Eskdale base (90 m)
        [54.3940, -3.1950],   // Lower gradient ramp
        [54.3960, -3.2050],   // The famous 30% ramp
        [54.3980, -3.2150],   // Upper switchback
        [54.4010, -3.2180],   // Hardknott summit (393 m)
      ],
      elevationProfile: [
        { t: 0.00, ele:  90 },
        { t: 0.25, ele: 160 },
        { t: 0.50, ele: 240 },
        { t: 0.75, ele: 330 },
        { t: 1.00, ele: 393 },
      ],
      numPts: 160,
    }),
    climbName: 'Hardknott Pass',
    region: 'England — Cumbria (Lake District)',
    description:
      "Britain's steepest road at 30% gradient. Just 5 km but utterly savage — a Roman road that demands full commitment on every pedal stroke. The Lake District's ultimate cycling test.",
    avgGradient: 12.4,
    maxGradient: 30.0,
    difficulty: 'hors catégorie',
    mood: 'overcast',
  },
  {
    route: buildIconicRoute({
      id: 'iconic-cheddar-gorge',
      name: 'Cheddar Gorge',
      coords: [
        [51.2870, -2.7750],   // Cheddar village base (20 m)
        [51.2850, -2.7850],   // Gorge entrance
        [51.2830, -2.7950],   // Canyon walls
        [51.2810, -2.8050],   // Narrow gorge section
        [51.2790, -2.8100],   // Top of gorge (130 m)
      ],
      elevationProfile: [
        { t: 0.00, ele:  20 },
        { t: 0.30, ele:  55 },
        { t: 0.60, ele:  90 },
        { t: 0.85, ele: 120 },
        { t: 1.00, ele: 130 },
      ],
      numPts: 160,
    }),
    climbName: 'Cheddar Gorge',
    region: 'England — Somerset',
    description:
      "The deepest gorge in Britain carved through Mendip limestone. A 4 km climb through cathedral-like walls rising 137 m above the road — short, sharp, and spectacular. Beloved by West Country cyclists.",
    avgGradient: 4.7,
    maxGradient: 16.0,
    difficulty: 'category 2',
    mood: 'overcast',
  },
  {
    route: buildIconicRoute({
      id: 'iconic-wicklow-gap',
      name: 'Wicklow Gap — Ireland',
      coords: [
        [53.0670, -6.3130],   // Hollywood base (130 m)
        [53.0600, -6.3400],   // Blessington lakes valley
        [53.0530, -6.3700],   // Wicklow Way approach
        [53.0470, -6.4000],   // Upper bogland
        [53.0410, -6.4150],   // Wicklow Gap summit (474 m)
      ],
      elevationProfile: [
        { t: 0.00, ele: 130 },
        { t: 0.25, ele: 220 },
        { t: 0.50, ele: 320 },
        { t: 0.75, ele: 420 },
        { t: 1.00, ele: 474 },
      ],
      numPts: 200,
    }),
    climbName: 'Wicklow Gap',
    region: 'Ireland — County Wicklow',
    description:
      "The heart of the Garden County's cycling culture. 14 km of gently rising bogs and glacially carved valleys to the exposed Wicklow Gap summit — a classic Rás Tailteann battleground since 1953.",
    avgGradient: 2.5,
    maxGradient: 9.0,
    difficulty: 'category 2',
    mood: 'overcast',
  },

  // ---------------------------------------------------------------------------
  // MEDITERRANEAN / ISLANDS
  // ---------------------------------------------------------------------------
  {
    route: buildIconicRoute({
      id: 'iconic-mount-teide',
      name: 'Mount Teide — Tenerife',
      coords: [
        [28.2640, -16.6320],  // El Médano base (5 m)
        [28.2800, -16.6400],  // South coast road
        [28.2950, -16.6600],  // Granadilla de Abona
        [28.2700, -16.6900],  // Vilaflor — gateway to Teide
        [28.2400, -16.6700],  // Las Cañadas del Teide crater
        [28.2720, -16.6410],  // Teide cable car base (3555 m)
      ],
      elevationProfile: [
        { t: 0.00, ele:    5 },
        { t: 0.15, ele:  200 },
        { t: 0.35, ele:  800 },
        { t: 0.55, ele: 1650 },
        { t: 0.75, ele: 2300 },
        { t: 0.90, ele: 3100 },
        { t: 1.00, ele: 3555 },
      ],
      numPts: 320,
    }),
    climbName: 'Mount Teide',
    region: 'Spain — Tenerife (Canary Islands)',
    description:
      "Europe's highest point at 3718 m and the winter training mecca for WorldTour teams. The climb from sea level to the Teide crater is 47 km of relentless volcanic landscape — Froome, Nibali, and Pogačar all train here.",
    avgGradient: 7.6,
    maxGradient: 12.0,
    difficulty: 'hors catégorie',
    mood: 'clear-noon',
  },

  // ---------------------------------------------------------------------------
  // DOLOMITES / ALPS EXTENSION
  // ---------------------------------------------------------------------------
  {
    route: buildIconicRoute({
      id: 'iconic-tre-cime-di-lavaredo',
      name: 'Tre Cime di Lavaredo',
      coords: [
        [46.5960, 12.2710],   // Misurina Lake (1756 m)
        [46.6050, 12.2800],   // Toll booth climb
        [46.6150, 12.2880],   // Upper switchbacks
        [46.6240, 12.3000],   // Tre Cime car park (2333 m)
        [46.6200, 12.3050],   // Rifugio Auronzo (2320 m)
      ],
      elevationProfile: [
        { t: 0.00, ele: 1756 },
        { t: 0.30, ele: 1950 },
        { t: 0.60, ele: 2150 },
        { t: 0.85, ele: 2290 },
        { t: 1.00, ele: 2333 },
      ],
      numPts: 180,
    }),
    climbName: 'Tre Cime di Lavaredo',
    region: 'Italy — South Tyrol / Veneto (Dolomites)',
    description:
      "The three stone towers of the Dolomites — an image that defines the Giro d'Italia. 7 km from Misurina through UNESCO World Heritage landscape to the Rifugio Auronzo beneath the iconic pinnacles.",
    avgGradient: 8.1,
    maxGradient: 15.0,
    difficulty: 'hors catégorie',
    mood: 'dusk-cool',
  },
  {
    route: buildIconicRoute({
      id: 'iconic-stelvio-south',
      name: 'Stelvio — South Side (Bormio)',
      coords: [
        [46.4700, 10.3700],   // Bormio (1225 m)
        [46.5000, 10.4000],   // Santa Caterina approach
        [46.5200, 10.4200],   // Lower switchbacks
        [46.5400, 10.4400],   // Mid-climb hairpins (30+)
        [46.5280, 10.4530],   // Stelvio summit (2758 m)
      ],
      elevationProfile: [
        { t: 0.00, ele: 1225 },
        { t: 0.25, ele: 1700 },
        { t: 0.50, ele: 2100 },
        { t: 0.75, ele: 2450 },
        { t: 1.00, ele: 2758 },
      ],
      numPts: 280,
    }),
    climbName: 'Stelvio South (Bormio)',
    region: 'Italy — Alto Adige / Lombardy',
    description:
      "The shorter, steeper south side of the Stelvio from Bormio — 16 km averaging 8.8% with 21 numbered hairpins. The side used for the Giro cima coppi finish, where the air is noticeably thin at 2758 m.",
    avgGradient: 8.8,
    maxGradient: 13.0,
    difficulty: 'hors catégorie',
    mood: 'clear-noon',
  },

  // ---------------------------------------------------------------------------
  // CLASSICS / NORTH EUROPEAN
  // ---------------------------------------------------------------------------
  {
    route: buildIconicRoute({
      id: 'iconic-paterberg',
      name: 'Paterberg — Tour of Flanders',
      coords: [
        [50.8860, 3.5890],    // Kluisbergen base (15 m)
        [50.8850, 3.5870],    // Steep lower section
        [50.8840, 3.5850],    // Mid-wall (20%+ here)
        [50.8830, 3.5840],    // Summit (80 m)
      ],
      elevationProfile: [
        { t: 0.00, ele: 15 },
        { t: 0.40, ele: 45 },
        { t: 0.75, ele: 68 },
        { t: 1.00, ele: 80 },
      ],
      numPts: 120,
    }),
    climbName: 'Paterberg',
    region: 'Belgium — East Flanders',
    description:
      "The Paterberg is the final and decisive cobbled climb of the Tour of Flanders — 360 m of pure savagery averaging 12.9% with a maximum of 20.3%. It separates winners from survivors every April.",
    avgGradient: 12.9,
    maxGradient: 20.3,
    difficulty: 'hors catégorie',
    mood: 'overcast',
  },
  {
    route: buildIconicRoute({
      id: 'iconic-koppenberg',
      name: 'Koppenberg — Flanders',
      coords: [
        [50.9360, 3.7630],    // Melden base (15 m)
        [50.9350, 3.7620],    // Cobbles begin
        [50.9340, 3.7610],    // Steepest section (22%)
        [50.9330, 3.7600],    // Summit (77 m)
      ],
      elevationProfile: [
        { t: 0.00, ele: 15 },
        { t: 0.35, ele: 40 },
        { t: 0.70, ele: 62 },
        { t: 1.00, ele: 77 },
      ],
      numPts: 120,
    }),
    climbName: 'Koppenberg',
    region: 'Belgium — East Flanders',
    description:
      "A cobbled wall so steep (22%) that it caused a Tour of Flanders pile-up so severe the race was neutralised. The narrowness means no passing — it's single-file suffering on 1200-year-old stones.",
    avgGradient: 11.6,
    maxGradient: 22.0,
    difficulty: 'hors catégorie',
    mood: 'overcast',
  },
  {
    route: buildIconicRoute({
      id: 'iconic-poggio-sanremo',
      name: 'Poggio di Sanremo',
      coords: [
        [43.8380, 7.7650],    // Sanremo base (5 m)
        [43.8400, 7.7700],    // Climb begins
        [43.8450, 7.7800],    // Mid-slope olive groves
        [43.8520, 7.7900],    // Poggio summit (162 m)
      ],
      elevationProfile: [
        { t: 0.00, ele:   5 },
        { t: 0.35, ele:  60 },
        { t: 0.70, ele: 120 },
        { t: 1.00, ele: 162 },
      ],
      numPts: 160,
    }),
    climbName: 'Poggio di Sanremo',
    region: 'Italy — Liguria',
    description:
      "The decisive climb of Milan–Sanremo: 3.7 km of winding road through olive groves and Ligurian villas, 5 km from the finish line. Whoever attacks here first wins La Classicissima — or so the story goes.",
    avgGradient: 3.7,
    maxGradient: 8.0,
    difficulty: 'category 2',
    mood: 'mediterranean-mist',
  },
  {
    route: buildIconicRoute({
      id: 'iconic-cipressa-sanremo',
      name: 'Cipressa — Milan-Sanremo',
      coords: [
        [43.8200, 7.7300],    // San Lorenzo al Mare base (10 m)
        [43.8250, 7.7380],    // Lower slope
        [43.8310, 7.7450],    // Mid-climb
        [43.8360, 7.7530],    // Cipressa village summit (239 m)
      ],
      elevationProfile: [
        { t: 0.00, ele:  10 },
        { t: 0.30, ele:  90 },
        { t: 0.65, ele: 175 },
        { t: 1.00, ele: 239 },
      ],
      numPts: 160,
    }),
    climbName: 'Cipressa',
    region: 'Italy — Liguria',
    description:
      "The first of Milan–Sanremo's two decisive climbs. 5.6 km at 4.1% through Ligurian terraced hills covered in cypress and olive trees — where the race's decisive breaks often form before the Poggio.",
    avgGradient: 4.1,
    maxGradient: 9.0,
    difficulty: 'category 2',
    mood: 'mediterranean-mist',
  },
  {
    route: buildIconicRoute({
      id: 'iconic-mur-de-huy',
      name: 'Mur de Huy — La Flèche Wallonne',
      coords: [
        [50.5190, 5.2370],    // Huy town base (80 m)
        [50.5210, 5.2390],    // First ramp
        [50.5230, 5.2400],    // Steepest middle (26%)
        [50.5250, 5.2410],    // Summit (204 m)
      ],
      elevationProfile: [
        { t: 0.00, ele:  80 },
        { t: 0.30, ele: 125 },
        { t: 0.65, ele: 175 },
        { t: 1.00, ele: 204 },
      ],
      numPts: 120,
    }),
    climbName: 'Mur de Huy',
    region: 'Belgium — Liège Province',
    description:
      "The finishing wall of La Flèche Wallonne: 1.3 km at an average 9.6% with a brutal 26% maximum. Climbed three times on race day — the Mur de Huy is one of cycling's most iconic finish lines.",
    avgGradient: 9.6,
    maxGradient: 26.0,
    difficulty: 'hors catégorie',
    mood: 'overcast',
  },
];
