/**
 * World Tour Stages — six curated Grand Tour stage routes built as ready-to-ride
 * Route objects. Every stage follows a plausible polyline between real start/finish
 * towns via the key summit waypoints, with an elevation profile derived from the
 * stage's known character, cols, and published data.
 *
 * The builder pattern is identical to iconicRoutes.ts: sparse control coords +
 * elevation knots → densified polyline with monotonic cumulative distance.
 */

import type { Route, RoutePoint } from '@/types';
import { haversine } from '@/lib/utils';
import type { MoodId } from '@/lib/cesiumUtils';

// ---------------------------------------------------------------------------
// Extra metadata
// ---------------------------------------------------------------------------

/** One crowd zone on an iconic climb — used by the spectator system (Wave 30.D). */
export interface SpectatorClimb {
  /** Distance from route start where the crowd section begins, meters. */
  startDistance: number;
  /** Distance from route start where the crowd section ends, meters. */
  endDistance: number;
  /**
   * Target spectator count per km of road within this zone.
   * ~40–80 for Tour-de-France famous climbs, lower for less iconic ones.
   */
  densityPerKm: number;
}

export interface WorldTourStageInfo {
  route: Route;
  info: {
    /** Grand tour family. */
    grandTour: 'tour' | 'giro' | 'vuelta';
    year: number;
    stageNumber: number;
    /** Display name e.g. "Stage 19 — Isola 2000". */
    name: string;
    /** Country / region string. */
    region: string;
    /** ~150 char prose description of the stage story. */
    description: string;
    /** Names of key climbs in order. */
    keyClimbs: string[];
    /** Approximate stage distance in km. */
    distanceKm: number;
    /** Total elevation gain in metres. */
    ascentM: number;
    /** Broad stage character. */
    difficulty: 'flat' | 'hilly' | 'mountain' | 'queen';
    /** ~80 char voice-over style overlay quote. */
    heroNarrative: string;
    /**
     * Preferred atmospheric mood for this stage.
     * Applied at ride-start to tune sun angle, sky, fog, and ground tint.
     * Falls back to `moodForRoute()` heuristics when absent.
     */
    mood?: MoodId;
    /**
     * Sections of the route where spectator crowds line the road (Wave 30.D).
     * Defined only for stages with famous climbs where crowds are expected.
     * Absent = no crowd rendering for this stage.
     */
    spectatorClimbs?: SpectatorClimb[];
  };
}

// ---------------------------------------------------------------------------
// Internal builder (mirrors iconicRoutes.ts buildIconicRoute)
// ---------------------------------------------------------------------------

interface ControlPoint {
  /** 0..1 fractional position along the stage. */
  t: number;
  /** Elevation in metres at this control. */
  ele: number;
}

/**
 * Build a Route from a sparse control polyline. Generates `numPts` evenly
 * spaced track points by linearly interpolating between consecutive controls
 * for both position and elevation.
 */
function buildStageRoute(opts: {
  id: string;
  name: string;
  /** [lat, lon] control waypoints — start to finish. */
  coords: [number, number][];
  /**
   * Elevation control points keyed to fractional route length (0..1).
   * Must include t=0 and t=1.
   */
  elevationProfile: ControlPoint[];
  /** Total generated track points. */
  numPts?: number;
}): Route {
  const { id, name, coords, elevationProfile, numPts = 400 } = opts;

  const profile = [...elevationProfile].sort((a, b) => a.t - b.t);

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

  const raw: { lat: number; lon: number; ele: number }[] = [];
  for (let i = 0; i < numPts; i++) {
    const t = i / (numPts - 1);
    const [lat, lon] = positionAt(t);
    raw.push({ lat, lon, ele: elevationAt(t) });
  }

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
      if (d < 0.01) continue;
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
// Stage 1 — Tour de France 2024, Stage 19: Embrun → Isola 2000
// 144 km | Col de Vars + Cime de la Bonette + Isola 2000
// Embrun (780 m) → Isola 2000 summit finish (2005 m)
// ---------------------------------------------------------------------------

function makeTDF2024Stage19(): Route {
  return buildStageRoute({
    id: 'wt-tdf-2024-s19',
    name: 'TdF 2024 S19 — Isola 2000',
    coords: [
      [44.5640,  6.4980],  // Embrun — start
      [44.5300,  6.6010],  // Savines-le-Lac valley
      [44.5170,  6.6800],  // Vars village, col approach
      [44.5380,  6.7040],  // Col de Vars (2109 m)
      [44.4800,  6.7600],  // Descent into Barcelonnette
      [44.3900,  6.6500],  // Barcelonnette
      [44.3300,  6.7700],  // Jausiers — foot of Bonette
      [44.3600,  6.8200],  // Mid Bonette flanks
      [44.3900,  6.8100],  // Cime de la Bonette (2802 m)
      [44.2800,  6.9300],  // Descent via Saint-Étienne
      [44.1700,  7.0300],  // Saint-Sauveur-sur-Tinée
      [44.1900,  7.0700],  // Final valley run
      [44.1670,  7.0190],  // Isola 2000 finish
    ],
    elevationProfile: [
      { t: 0.00, ele:  780 },  // Embrun
      { t: 0.04, ele:  750 },  // Savines valley
      { t: 0.10, ele:  890 },  // Vars approach begins
      { t: 0.18, ele: 1600 },  // Mid Col de Vars
      { t: 0.24, ele: 2109 },  // Col de Vars summit
      { t: 0.30, ele: 1130 },  // Barcelonnette descent
      { t: 0.36, ele: 1100 },  // Barcelonnette
      { t: 0.42, ele: 1280 },  // Jausiers / Bonette foot
      { t: 0.55, ele: 2000 },  // Mid Bonette
      { t: 0.62, ele: 2802 },  // Cime de la Bonette
      { t: 0.72, ele: 1300 },  // Descent — Saint-Étienne
      { t: 0.82, ele:  850 },  // Saint-Sauveur valley
      { t: 0.90, ele: 1100 },  // Isola approach ramps
      { t: 1.00, ele: 2005 },  // Isola 2000 finish
    ],
    numPts: 500,
  });
}

// ---------------------------------------------------------------------------
// Stage 2 — Giro d'Italia 2024, Stage 16: Livigno → Santa Cristina Val Gardena
// 206 km | Passo del Mortirolo + Passo Sella
// Livigno (1816 m) → Santa Cristina (1428 m)
// ---------------------------------------------------------------------------

function makeGiro2024Stage16(): Route {
  return buildStageRoute({
    id: 'wt-giro-2024-s16',
    name: "Giro 2024 S16 — Val Gardena",
    coords: [
      [46.5370, 10.1370],  // Livigno — start
      [46.5950, 10.3100],  // Tirano descent
      [46.2580, 10.3030],  // Mazzo di Valtellina — Mortirolo base
      [46.2200, 10.3450],  // Mid Mortirolo
      [46.1830, 10.3600],  // Passo del Mortirolo (1852 m)
      [46.1700, 10.4200],  // Edolo descent
      [46.2300, 10.5200],  // Val Camonica valley run
      [46.5100, 11.6700],  // Ortisei approach
      [46.5350, 11.7580],  // Passo Sella (2244 m)
      [46.5270, 11.7770],  // Descent to Val Gardena
      [46.5580, 11.7140],  // Santa Cristina Val Gardena finish
    ],
    elevationProfile: [
      { t: 0.00, ele: 1816 },  // Livigno
      { t: 0.05, ele: 1200 },  // Tirano descent
      { t: 0.12, ele:  530 },  // Mazzo di Valtellina (Mortirolo base)
      { t: 0.20, ele: 1150 },  // Mid Mortirolo (nasty ramps)
      { t: 0.26, ele: 1852 },  // Passo del Mortirolo summit
      { t: 0.33, ele:  700 },  // Edolo valley descent
      { t: 0.42, ele:  650 },  // Val Camonica flat
      { t: 0.62, ele:  800 },  // Long valley transition
      { t: 0.76, ele: 1236 },  // Ortisei — Sella foot
      { t: 0.88, ele: 2100 },  // Mid Passo Sella
      { t: 0.92, ele: 2244 },  // Passo Sella summit
      { t: 0.96, ele: 1700 },  // Descent to Val Gardena
      { t: 1.00, ele: 1428 },  // Santa Cristina finish
    ],
    numPts: 550,
  });
}

// ---------------------------------------------------------------------------
// Stage 3 — Vuelta a España 2024, Stage 15: Infiesto → Cuitu Negru
// 143 km | Alto de la Cobertoria + Cuitu Negru summit finish
// Infiesto (170 m) → Cuitu Negru (1915 m)
// ---------------------------------------------------------------------------

function makeVuelta2024Stage15(): Route {
  return buildStageRoute({
    id: 'wt-vuelta-2024-s15',
    name: 'Vuelta 2024 S15 — Cuitu Negru',
    coords: [
      [43.3530, -5.3570],  // Infiesto — start
      [43.2750, -5.5200],  // Oviedo bypass
      [43.1850, -5.8600],  // Ujo valley
      [43.1600, -5.9800],  // Cobertoria foot
      [43.1300, -6.0100],  // Alto de la Cobertoria (1069 m)
      [43.1000, -6.0800],  // Trubia descent
      [43.1580, -5.9650],  // Lena valley
      [43.0800, -5.9900],  // Pola de Lena
      [43.1150, -5.9500],  // Cuitu Negru access road
      [43.0950, -5.9100],  // Upper ramps (brutal grades)
      [43.0780, -5.8970],  // Cuitu Negru finish
    ],
    elevationProfile: [
      { t: 0.00, ele:  170 },  // Infiesto
      { t: 0.08, ele:  250 },  // Rolling Asturian foothills
      { t: 0.18, ele:  300 },  // Ujo valley flat
      { t: 0.30, ele:  600 },  // Cobertoria approach
      { t: 0.38, ele: 1069 },  // Alto de la Cobertoria
      { t: 0.46, ele:  320 },  // Trubia descent
      { t: 0.54, ele:  350 },  // Lena valley
      { t: 0.64, ele:  420 },  // Pola de Lena
      { t: 0.72, ele:  800 },  // Cuitu Negru lower ramps
      { t: 0.84, ele: 1350 },  // Mid climb (12–15% sections)
      { t: 0.93, ele: 1750 },  // Final brutal ramps
      { t: 1.00, ele: 1915 },  // Cuitu Negru summit
    ],
    numPts: 450,
  });
}

// ---------------------------------------------------------------------------
// Stage 4 — Tour de France 2023, Stage 17: Saint-Gervais → Courchevel
// 166 km | Col de la Croix de Fer + Col du Télégraphe + Galibier + Col de la Loze
// Saint-Gervais (815 m) → Courchevel (1850 m)
// ---------------------------------------------------------------------------

function makeTDF2023Stage17(): Route {
  return buildStageRoute({
    id: 'wt-tdf-2023-s17',
    name: 'TdF 2023 S17 — Courchevel / Col de la Loze',
    coords: [
      [45.8930,  6.7070],  // Saint-Gervais — start
      [45.6700,  6.5100],  // Albertville valley
      [45.3850,  6.2980],  // Croix de Fer approach
      [45.3180,  6.2130],  // Col de la Croix de Fer (2067 m)
      [45.2900,  6.2700],  // Saint-Jean-de-Maurienne descent
      [45.2850,  6.3500],  // Valloire — Télégraphe foot
      [45.2430,  6.4040],  // Col du Télégraphe (1566 m)
      [45.1320,  6.4050],  // Galibier flanks
      [45.0631,  6.4076],  // Col du Galibier (2645 m)
      [45.3540,  6.6340],  // Modane descent
      [45.4010,  6.7000],  // Bourg-Saint-Maurice valley
      [45.4160,  6.6330],  // Courchevel 1850 road
      [45.4080,  6.6350],  // Col de la Loze (2304 m) — summit approach
      [45.3960,  6.6280],  // Courchevel 1850 finish
    ],
    elevationProfile: [
      { t: 0.00, ele:  815 },  // Saint-Gervais
      { t: 0.05, ele:  450 },  // Albertville valley floor
      { t: 0.14, ele:  700 },  // Croix de Fer approach
      { t: 0.22, ele: 1600 },  // Mid Croix de Fer
      { t: 0.28, ele: 2067 },  // Col de la Croix de Fer
      { t: 0.34, ele:  550 },  // Saint-Jean-de-Maurienne
      { t: 0.40, ele:  900 },  // Valloire
      { t: 0.44, ele: 1566 },  // Col du Télégraphe
      { t: 0.52, ele: 1900 },  // Galibier lower flanks
      { t: 0.60, ele: 2645 },  // Col du Galibier
      { t: 0.68, ele: 1100 },  // Modane descent
      { t: 0.76, ele:  850 },  // Valley run
      { t: 0.84, ele: 1450 },  // Courchevel lower road
      { t: 0.92, ele: 2100 },  // Col de la Loze ramps (8–12%)
      { t: 0.96, ele: 2304 },  // Col de la Loze summit
      { t: 1.00, ele: 1850 },  // Courchevel 1850 finish
    ],
    numPts: 550,
  });
}

// ---------------------------------------------------------------------------
// Stage 5 — Giro d'Italia 2023, Stage 19: Longarone → Tre Cime di Lavaredo
// 183 km | Passo Tre Croci + Tre Cime di Lavaredo summit finish (2304 m)
// Longarone (473 m) → Tre Cime summit (2304 m)
// ---------------------------------------------------------------------------

function makeGiro2023Stage19(): Route {
  return buildStageRoute({
    id: 'wt-giro-2023-s19',
    name: 'Giro 2023 S19 — Tre Cime di Lavaredo',
    coords: [
      [46.2750, 12.3000],  // Longarone — start
      [46.5200, 12.2200],  // Cortina d'Ampezzo approach
      [46.5400, 12.1400],  // Passo Tre Croci (1809 m)
      [46.5900, 12.2200],  // Misurina lake — Tre Cime foot
      [46.6150, 12.2800],  // Tre Cime access road lower
      [46.6250, 12.3050],  // Mid Tre Cime climb
      [46.6172, 12.3064],  // Tre Cime di Lavaredo finish
    ],
    elevationProfile: [
      { t: 0.00, ele:  473 },  // Longarone
      { t: 0.12, ele:  700 },  // Dolomite foothills
      { t: 0.24, ele: 1100 },  // Cortina approach
      { t: 0.38, ele: 1224 },  // Cortina d'Ampezzo
      { t: 0.50, ele: 1809 },  // Passo Tre Croci
      { t: 0.60, ele: 1754 },  // Misurina lake (brief descent)
      { t: 0.68, ele: 1790 },  // Tre Cime road begins
      { t: 0.78, ele: 1950 },  // Lower ramps
      { t: 0.88, ele: 2150 },  // Mid climb (steep unpaved section)
      { t: 0.95, ele: 2260 },  // Final push
      { t: 1.00, ele: 2304 },  // Tre Cime di Lavaredo summit
    ],
    numPts: 500,
  });
}

// ---------------------------------------------------------------------------
// Stage 6 — Vuelta a España 2023, Stage 13: Formigal → Col du Tourmalet
// 135 km | Puerto de Portalet + Col du Pourtalet + Col du Tourmalet
// Formigal (1510 m) → Col du Tourmalet (2115 m)
// ---------------------------------------------------------------------------

function makeVuelta2023Stage13(): Route {
  return buildStageRoute({
    id: 'wt-vuelta-2023-s13',
    name: 'Vuelta 2023 S13 — Col du Tourmalet',
    coords: [
      [42.7850, -0.3880],  // Formigal — start (Spanish side)
      [42.7990, -0.4380],  // Puerto de Portalet (1794 m) — Spain/France border
      [42.8700, -0.4300],  // Laruns — Ossau valley descent
      [43.0000, -0.4200],  // Lourdes bypass
      [43.0820,  0.0000],  // Argelès-Gazost
      [42.9600,  0.0300],  // Luz-Saint-Sauveur — Tourmalet foot
      [42.8820,  0.0120],  // Lower Tourmalet (Barèges)
      [42.8970,  0.0560],  // Mid Tourmalet
      [42.9105,  0.1000],  // Col du Tourmalet summit
    ],
    elevationProfile: [
      { t: 0.00, ele: 1510 },  // Formigal ski resort
      { t: 0.06, ele: 1794 },  // Puerto de Portalet (border)
      { t: 0.14, ele:  850 },  // Laruns valley
      { t: 0.26, ele:  420 },  // Lourdes plain
      { t: 0.40, ele:  395 },  // Argelès-Gazost valley
      { t: 0.52, ele:  710 },  // Luz-Saint-Sauveur — Tourmalet base
      { t: 0.62, ele:  900 },  // Barèges village
      { t: 0.72, ele: 1250 },  // Mid Tourmalet
      { t: 0.82, ele: 1680 },  // Upper flanks
      { t: 0.92, ele: 2000 },  // Final ramps
      { t: 1.00, ele: 2115 },  // Col du Tourmalet summit
    ],
    numPts: 450,
  });
}

// ---------------------------------------------------------------------------
// Exported catalogue
// ---------------------------------------------------------------------------

/** Six curated Grand Tour stages — instantiated once at module load. */
export const WORLD_TOUR_STAGES: WorldTourStageInfo[] = [
  {
    route: makeTDF2024Stage19(),
    info: {
      grandTour: 'tour',
      year: 2024,
      stageNumber: 19,
      name: 'Stage 19 — Isola 2000',
      region: 'France — Hautes-Alpes / Alpes-Maritimes',
      description:
        'The stage that defined the 2024 Tour. Pogačar and Vingegaard traded blows over Col de Vars and the fearsome Cime de la Bonette before a summit sprint at Isola 2000 settled the yellow jersey battle.',
      keyClimbs: ['Col de Vars', 'Cime de la Bonette', 'Isola 2000'],
      distanceKm: 144,
      ascentM: 4850,
      difficulty: 'queen',
      heroNarrative: 'Three giants of the Alps — only the strongest survive Bonette.',
      mood: 'alpine-storm',  // Bonette in summer invites dramatic storm fronts
      // Spectator crowds on the Isola 2000 summit finish (final 2 km).
      // Packed crowds line the narrow resort road on the approach to the line.
      spectatorClimbs: [
        { startDistance: 142_000, endDistance: 144_000, densityPerKm: 75 },
      ],
    },
  },
  {
    route: makeGiro2024Stage16(),
    info: {
      grandTour: 'giro',
      year: 2024,
      stageNumber: 16,
      name: 'Stage 16 — Val Gardena',
      region: 'Italy — Lombardy / South Tyrol',
      description:
        "A monster Dolomites stage starting in altitude at Livigno. The Passo del Mortirolo's savage gradients shattered the peloton before the beautiful Sella climb led into the Val Gardena finish.",
      keyClimbs: ['Passo del Mortirolo', 'Passo Sella'],
      distanceKm: 206,
      ascentM: 5200,
      difficulty: 'queen',
      heroNarrative: "Mortirolo breaks the body — Sella breaks the spirit. Survive both.",
      mood: 'overcast',  // Mortirolo and the Dolomites are moody and grey
      // Spectator crowds on Passo del Mortirolo (the most feared
      // climb in the Giro). Dense crowds pack the narrowest hairpins in pro
      // cycling, ~2 km before the summit.
      spectatorClimbs: [
        { startDistance: 51_500, endDistance: 53_560, densityPerKm: 70 },
      ],
    },
  },
  {
    route: makeVuelta2024Stage15(),
    info: {
      grandTour: 'vuelta',
      year: 2024,
      stageNumber: 15,
      name: 'Stage 15 — Cuitu Negru',
      region: 'Spain — Asturias',
      description:
        "Asturian mountain brutality at its finest. The unpaved summit finish at Cuitu Negru — unique in modern Grand Tour racing — punished any weakness with ramps exceeding 18% on loose terrain.",
      keyClimbs: ['Alto de la Cobertoria', 'Cuitu Negru'],
      distanceKm: 143,
      ascentM: 3800,
      difficulty: 'mountain',
      heroNarrative: 'Gravel, gradient, glory — Asturias demands everything.',
      mood: 'overcast',  // Asturian coast is perpetually green and overcast
    },
  },
  {
    route: makeTDF2023Stage17(),
    info: {
      grandTour: 'tour',
      year: 2023,
      stageNumber: 17,
      name: 'Stage 17 — Courchevel / Col de la Loze',
      region: 'France — Savoie',
      description:
        "A day with four major Alpine passes culminating in the Col de la Loze — one of the Tour's highest and most modern summit finishes at 2304 m. Vingegaard's power on Galibier was legendary.",
      keyClimbs: ['Col de la Croix de Fer', 'Col du Télégraphe', 'Col du Galibier', 'Col de la Loze'],
      distanceKm: 166,
      ascentM: 5200,
      difficulty: 'queen',
      heroNarrative: 'Four passes, one winner — Galibier separates the greats.',
      mood: 'alpine-storm',  // four cols in one day invite classic Tour storm drama
    },
  },
  {
    route: makeGiro2023Stage19(),
    info: {
      grandTour: 'giro',
      year: 2023,
      stageNumber: 19,
      name: 'Stage 19 — Tre Cime di Lavaredo',
      region: 'Italy — Veneto / South Tyrol',
      description:
        "The most iconic finish in modern Giro history. The unpaved switchbacks to the Tre Cime di Lavaredo under the three Dolomite towers created images that belong alongside Coppi and Bartali.",
      keyClimbs: ['Passo Tre Croci', 'Tre Cime di Lavaredo'],
      distanceKm: 183,
      ascentM: 5400,
      difficulty: 'queen',
      heroNarrative: 'Under the three stone sentinels, legends are made.',
      mood: 'dusk-cool',  // the late-stage Giro finish under the towers at dusk
    },
  },
  {
    route: makeVuelta2023Stage13(),
    info: {
      grandTour: 'vuelta',
      year: 2023,
      stageNumber: 13,
      name: 'Stage 13 — Col du Tourmalet',
      region: 'Spain / France — Pyrenees',
      description:
        "A cross-border Pyrenean epic starting in Spanish Formigal, crossing into France via the Portalet, then finishing on the legendary Tourmalet — the most-climbed mountain in Tour de France history.",
      keyClimbs: ['Puerto de Portalet', 'Col du Tourmalet'],
      distanceKm: 135,
      ascentM: 3600,
      difficulty: 'mountain',
      heroNarrative: 'Where Spain meets France — the Tourmalet awaits both nations.',
      mood: 'golden-hour',  // Vuelta stage finishes late — warm Pyrenean sunset light
      // Spectator crowds on Col du Tourmalet, the most-climbed
      // mountain in Tour de France history. Two km of roadside fans on the
      // upper flanks leading to the 2115 m summit.
      spectatorClimbs: [
        { startDistance: 133_000, endDistance: 135_000, densityPerKm: 80 },
      ],
    },
  },
];
