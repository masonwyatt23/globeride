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

/** One crowd zone on an iconic climb — used by the spectator system. */
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
     * Sections of the route where spectator crowds line the road.
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
      spectatorClimbs: [
        { startDistance: 133_000, endDistance: 135_000, densityPerKm: 80 },
      ],
    },
  },

  // ---------------------------------------------------------------------------
  // TdF 2022 Stage 12 — Briançon → Alpe d'Huez
  // 165 km | Col du Galibier + Croix de Fer + Alpe d'Huez
  // ---------------------------------------------------------------------------
  {
    route: buildStageRoute({
      id: 'wt-tdf-2022-s12',
      name: "TdF 2022 S12 — Alpe d'Huez",
      coords: [
        [44.8960, 6.6400],   // Briançon — start
        [45.0640, 6.4080],   // Col du Galibier (2642 m)
        [45.2200, 6.1500],   // Saint-Jean-de-Maurienne
        [45.2500, 6.2000],   // Croix de Fer foot
        [45.2290, 6.1790],   // Croix de Fer (2067 m)
        [45.1600, 6.0800],   // Rochetaillée descent
        [45.0539, 6.0338],   // Bourg-d'Oisans — Alpe d'Huez foot
        [45.1131, 6.0743],   // Alpe d'Huez summit (1791 m)
      ],
      elevationProfile: [
        { t: 0.00, ele: 1326 },
        { t: 0.18, ele: 2642 },  // Galibier summit
        { t: 0.28, ele:  555 },  // Saint-Jean valley
        { t: 0.40, ele:  680 },  // Croix de Fer foot
        { t: 0.55, ele: 2067 },  // Croix de Fer summit
        { t: 0.68, ele:  720 },  // Bourg-d'Oisans
        { t: 0.75, ele:  720 },  // Alpe d'Huez base
        { t: 1.00, ele: 1791 },  // Alpe d'Huez summit
      ],
      numPts: 500,
    }),
    info: {
      grandTour: 'tour',
      year: 2022,
      stageNumber: 12,
      name: "Stage 12 — Alpe d'Huez",
      region: "France — Hautes-Alpes / Isère",
      description:
        "The Alpine monster of the 2022 Tour de France — three legendary cols in one stage. The Galibier and Croix de Fer precede a summit finish on Alpe d'Huez where Vingegaard made his decisive TdF winning move.",
      keyClimbs: ["Col du Galibier", "Col de la Croix de Fer", "Alpe d'Huez"],
      distanceKm: 165,
      ascentM: 5000,
      difficulty: 'queen',
      heroNarrative: "Galibier, Croix de Fer, then Huez — the Alps delivered a champion.",
      mood: 'golden-hour',
      spectatorClimbs: [
        { startDistance: 148_000, endDistance: 165_000, densityPerKm: 90 },
      ],
    },
  },

  // ---------------------------------------------------------------------------
  // TdF 2021 Stage 11 — Sorgues → Malaucène (Mont Ventoux twice)
  // 199 km | Mont Ventoux × 2
  // ---------------------------------------------------------------------------
  {
    route: buildStageRoute({
      id: 'wt-tdf-2021-s11',
      name: 'TdF 2021 S11 — Mont Ventoux ×2',
      coords: [
        [44.0050, 4.8740],   // Sorgues — start
        [44.0630, 5.0000],   // Carpentras
        [44.1238, 5.1790],   // Bédoin — first Ventoux foot
        [44.2100, 5.2785],   // Ventoux summit first time (1912 m)
        [44.1720, 5.3140],   // Malaucène — between climbs
        [44.2100, 5.2785],   // Ventoux summit second time (1912 m)
        [44.1720, 5.3140],   // Malaucène finish
      ],
      elevationProfile: [
        { t: 0.00, ele:  40 },
        { t: 0.08, ele: 100 },
        { t: 0.20, ele: 295 },  // Bédoin
        { t: 0.38, ele: 1912 }, // Ventoux summit #1
        { t: 0.50, ele: 380 },  // Malaucène
        { t: 0.68, ele: 1912 }, // Ventoux summit #2
        { t: 1.00, ele: 380 },  // Malaucène finish
      ],
      numPts: 500,
    }),
    info: {
      grandTour: 'tour',
      year: 2021,
      stageNumber: 11,
      name: 'Stage 11 — Mont Ventoux ×2',
      region: 'France — Vaucluse',
      description:
        "The stage that broke Primož Roglič — Mont Ventoux climbed twice in a single day. First via Bédoin's brutal south face, then the gentler Malaucène north side, finishing in the same town. Wout van Aert won after a memorable descent.",
      keyClimbs: ['Mont Ventoux (Bédoin)', 'Mont Ventoux (Malaucène)'],
      distanceKm: 199,
      ascentM: 4400,
      difficulty: 'queen',
      heroNarrative: 'The Giant of Provence demanded twice its toll.',
      mood: 'mediterranean-mist',
      spectatorClimbs: [
        { startDistance: 72_000,  endDistance:  86_000, densityPerKm: 65 },
        { startDistance: 155_000, endDistance: 170_000, densityPerKm: 65 },
      ],
    },
  },

  // ---------------------------------------------------------------------------
  // Paris-Roubaix 2024 — Compiègne → Roubaix Velodrome
  // 260 km | 29 cobbled sectors
  // ---------------------------------------------------------------------------
  {
    route: buildStageRoute({
      id: 'wt-paris-roubaix-2024',
      name: 'Paris-Roubaix 2024',
      coords: [
        [49.4170, 2.8260],   // Compiègne — start
        [50.0000, 3.0000],   // Arras area
        [50.3500, 3.0500],   // Arenberg forest sector
        [50.5000, 3.0800],   // Mons-en-Pévèle sector
        [50.5500, 3.1200],   // Carrefour de l'Arbre
        [50.6900, 3.1570],   // Roubaix Velodrome finish
      ],
      elevationProfile: [
        { t: 0.00, ele: 70 },
        { t: 0.25, ele: 80 },
        { t: 0.50, ele: 55 },  // Arenberg depression
        { t: 0.70, ele: 35 },
        { t: 0.88, ele: 40 },
        { t: 1.00, ele: 28 },
      ],
      numPts: 400,
    }),
    info: {
      grandTour: 'tour',  // classic, using 'tour' as placeholder
      year: 2024,
      stageNumber: 1,
      name: 'Paris-Roubaix 2024',
      region: 'France — Nord-Pas-de-Calais',
      description:
        "The Hell of the North — 260 km from Compiègne to the Roubaix velodrome via 29 cobbled sectors. Mathieu van der Poel won a dominant solo victory in 2024, cementing his status as the greatest cobbled classics rider of his generation.",
      keyClimbs: ['Arenberg Forest', 'Mons-en-Pévèle', 'Carrefour de l\'Arbre'],
      distanceKm: 260,
      ascentM: 1500,
      difficulty: 'hilly',
      heroNarrative: 'Mud, cobbles, and the velodrome — Hell rewards only the brave.',
      mood: 'overcast',
    },
  },

  // ---------------------------------------------------------------------------
  // Tour of Flanders 2024 — Antwerp → Oudenaarde
  // 273 km | Koppenberg + Paterberg (final circuit)
  // ---------------------------------------------------------------------------
  {
    route: buildStageRoute({
      id: 'wt-flanders-2024',
      name: 'Tour of Flanders 2024',
      coords: [
        [51.2190, 4.4020],   // Antwerp — start
        [51.0000, 3.8000],   // Ghent area
        [50.9360, 3.7630],   // Koppenberg
        [50.8860, 3.5890],   // Paterberg
        [50.8480, 3.6100],   // Oudenaarde finish
      ],
      elevationProfile: [
        { t: 0.00, ele:  10 },
        { t: 0.40, ele:  20 },
        { t: 0.62, ele:  77 },  // Koppenberg
        { t: 0.72, ele:  20 },
        { t: 0.84, ele:  80 },  // Paterberg
        { t: 1.00, ele:  22 },  // Oudenaarde
      ],
      numPts: 450,
    }),
    info: {
      grandTour: 'tour',
      year: 2024,
      stageNumber: 1,
      name: 'Tour of Flanders 2024',
      region: 'Belgium — East Flanders',
      description:
        "The Ronde van Vlaanderen — 273 km through the Flemish Ardennes. Mathieu van der Poel won his third consecutive title in 2024 in a dominant solo performance over the Koppenberg and Paterberg, the two decisive bergs.",
      keyClimbs: ['Koppenberg', 'Paterberg', 'Oude Kwaremont'],
      distanceKm: 273,
      ascentM: 2600,
      difficulty: 'hilly',
      heroNarrative: 'From Antwerp to Oudenaarde — the Ronde claims its king.',
      mood: 'overcast',
      spectatorClimbs: [
        { startDistance: 255_000, endDistance: 263_000, densityPerKm: 85 },
      ],
    },
  },

  // ---------------------------------------------------------------------------
  // Liège-Bastogne-Liège 2024 — Liège → Liège (La Redoute)
  // 253 km | La Redoute + Côte de Saint-Nicolas
  // ---------------------------------------------------------------------------
  {
    route: buildStageRoute({
      id: 'wt-liege-2024',
      name: 'Liège-Bastogne-Liège 2024',
      coords: [
        [50.6320, 5.5690],   // Liège — start
        [50.2580, 5.7250],   // Bastogne turnaround
        [50.3500, 5.6000],   // La Redoute foot
        [50.3600, 5.5800],   // La Redoute summit (499 m)
        [50.5500, 5.5200],   // Côte de Saint-Nicolas
        [50.6320, 5.5690],   // Liège finish
      ],
      elevationProfile: [
        { t: 0.00, ele: 68 },
        { t: 0.28, ele: 515 },  // Bastogne plateau
        { t: 0.55, ele: 280 },
        { t: 0.65, ele: 499 },  // La Redoute
        { t: 0.78, ele: 200 },
        { t: 0.88, ele: 320 },  // Saint-Nicolas
        { t: 1.00, ele:  68 },
      ],
      numPts: 450,
    }),
    info: {
      grandTour: 'tour',
      year: 2024,
      stageNumber: 1,
      name: 'Liège-Bastogne-Liège 2024',
      region: 'Belgium — Liège Province (Ardennes)',
      description:
        "La Doyenne — the oldest Monument in cycling. 253 km through the rolling Ardennes with La Redoute as the pivotal climb. Tadej Pogačar won a commanding solo victory in 2024, his fourth Monument of the season.",
      keyClimbs: ['La Redoute', 'Côte de Saint-Nicolas', 'Côte de la Roche-aux-Faucons'],
      distanceKm: 253,
      ascentM: 4000,
      difficulty: 'mountain',
      heroNarrative: 'La Doyenne has no mercy — only the strongest survive La Redoute.',
      mood: 'overcast',
    },
  },

  // ---------------------------------------------------------------------------
  // Strade Bianche 2024 — Siena → Siena (white gravel roads)
  // 215 km | 15 white-road sectors through Tuscany
  // ---------------------------------------------------------------------------
  {
    route: buildStageRoute({
      id: 'wt-strade-bianche-2024',
      name: 'Strade Bianche 2024',
      coords: [
        [43.3180, 11.3310],  // Siena — start
        [43.2500, 11.1500],  // Monte Sante Marie sector
        [43.1500, 11.2000],  // Montalcino area
        [43.2000, 11.3000],  // Colle Pinzuto white sector
        [43.3000, 11.3300],  // Tollena sector
        [43.3180, 11.3310],  // Piazza del Campo, Siena — finish
      ],
      elevationProfile: [
        { t: 0.00, ele: 322 },
        { t: 0.20, ele: 520 },
        { t: 0.40, ele: 380 },
        { t: 0.60, ele: 480 },
        { t: 0.80, ele: 350 },
        { t: 0.92, ele: 300 },
        { t: 1.00, ele: 322 },
      ],
      numPts: 400,
    }),
    info: {
      grandTour: 'tour',
      year: 2024,
      stageNumber: 1,
      name: 'Strade Bianche 2024',
      region: 'Italy — Tuscany (Siena)',
      description:
        "Racing on the white gravel roads of Tuscany, finishing on the medieval cobbles of Siena's Piazza del Campo. Pogačar won his third consecutive Strade Bianche in 2024 with a devastating solo attack on the final white sector.",
      keyClimbs: ['Monte Sante Marie', 'Colle Pinzuto', 'Via Santa Caterina in Fontebranda'],
      distanceKm: 215,
      ascentM: 3400,
      difficulty: 'hilly',
      heroNarrative: 'White dust, medieval stones, and one rider above all others.',
      mood: 'golden-hour',
    },
  },

  // ---------------------------------------------------------------------------
  // Giro 2025 Stage 20 — Bormio → Santa Cristina Val Gardena
  // 111 km | Stelvio + Passo del Tonale
  // ---------------------------------------------------------------------------
  {
    route: buildStageRoute({
      id: 'wt-giro-2025-s20',
      name: 'Giro 2025 S20 — Stelvio',
      coords: [
        [46.4700, 10.3700],  // Bormio — start
        [46.5280, 10.4530],  // Stelvio summit (2758 m)
        [46.5500, 10.5500],  // Prato Stelvio
        [46.4500, 10.7000],  // Malles / Vinschgau descent
        [46.5900, 11.3500],  // Bolzano valley
        [46.5760, 11.7040],  // Santa Cristina Val Gardena (1428 m)
      ],
      elevationProfile: [
        { t: 0.00, ele: 1225 },
        { t: 0.22, ele: 2758 },  // Stelvio summit
        { t: 0.38, ele:  920 },  // Malles valley
        { t: 0.60, ele:  262 },  // Bolzano
        { t: 0.80, ele:  800 },  // Val Gardena approach
        { t: 1.00, ele: 1428 },  // Santa Cristina
      ],
      numPts: 450,
    }),
    info: {
      grandTour: 'giro',
      year: 2025,
      stageNumber: 20,
      name: 'Stage 20 — Stelvio',
      region: 'Italy — Alto Adige / Val Gardena',
      description:
        "The Giro's queen stage: the Stelvio from Bormio with its 48 hairpins at 2758 m provides the GC-deciding moment before a long descent into the Dolomite valleys and a hilltop finish in Santa Cristina Val Gardena.",
      keyClimbs: ['Stelvio Pass', 'Val Gardena'],
      distanceKm: 111,
      ascentM: 3200,
      difficulty: 'queen',
      heroNarrative: "The Stelvio — where Giro champions are truly forged.",
      mood: 'clear-noon',
      spectatorClimbs: [
        { startDistance: 18_000, endDistance: 30_000, densityPerKm: 60 },
      ],
    },
  },

  // ---------------------------------------------------------------------------
  // Vuelta 2024 Stage 17 — Arnedo → Alto de Moncalvillo
  // 144 km | La Rioja mountain finish
  // ---------------------------------------------------------------------------
  {
    route: buildStageRoute({
      id: 'wt-vuelta-2024-s17',
      name: 'Vuelta 2024 S17 — Moncalvillo',
      coords: [
        [42.2200, -2.0950],  // Arnedo — start
        [42.2800, -2.3000],  // Logroño valley
        [42.3500, -2.4500],  // Navarrete
        [42.3900, -2.5500],  // Moncalvillo lower slopes
        [42.4020, -2.6430],  // Alto de Moncalvillo summit (1260 m)
      ],
      elevationProfile: [
        { t: 0.00, ele:  440 },
        { t: 0.25, ele:  380 },  // Logroño
        { t: 0.55, ele:  600 },
        { t: 0.78, ele:  950 },
        { t: 1.00, ele: 1260 },
      ],
      numPts: 380,
    }),
    info: {
      grandTour: 'vuelta',
      year: 2024,
      stageNumber: 17,
      name: 'Stage 17 — Alto de Moncalvillo',
      region: 'Spain — La Rioja',
      description:
        "A medium-mountain stage through the wine country of La Rioja with a summit finish on Moncalvillo. The Vuelta frequently uses this climb as a GC selector — steep enough to hurt, short enough to create explosive racing.",
      keyClimbs: ['Alto de Moncalvillo'],
      distanceKm: 144,
      ascentM: 2800,
      difficulty: 'mountain',
      heroNarrative: 'La Rioja vineyards give way to the rocky Moncalvillo summit.',
      mood: 'golden-hour',
    },
  },

  // ---------------------------------------------------------------------------
  // Tour Down Under 2024 Stage 6 — Adelaide Hills circuit
  // 90 km | Corkscrew Road + Norton Summit (queen stage)
  // ---------------------------------------------------------------------------
  {
    route: buildStageRoute({
      id: 'wt-tdu-2024-s6',
      name: 'Tour Down Under 2024 S6 — Adelaide Hills',
      coords: [
        [-34.9290, 138.6010],  // Adelaide central — start
        [-34.9200, 138.6800],  // Eastern suburbs
        [-34.9000, 138.7100],  // Corkscrew Road foot
        [-34.8800, 138.7300],  // Corkscrew summit
        [-34.9050, 138.7310],  // Norton Summit back to valley
        [-34.9290, 138.7392],  // Norton Summit summit (481 m)
      ],
      elevationProfile: [
        { t: 0.00, ele:  50 },
        { t: 0.25, ele: 100 },
        { t: 0.45, ele: 380 },  // Corkscrew summit
        { t: 0.60, ele: 200 },
        { t: 0.80, ele: 380 },
        { t: 1.00, ele: 481 },  // Norton Summit
      ],
      numPts: 350,
    }),
    info: {
      grandTour: 'tour',
      year: 2024,
      stageNumber: 6,
      name: 'Stage 6 — Norton Summit',
      region: 'Australia — South Australia (Adelaide)',
      description:
        "The queen stage of the Santos Tour Down Under, finishing on the iconic Norton Summit above Adelaide. Multiple ascents of the Adelaide Hills create a punishing finale with sun-baked roads and partisan Australian crowd support.",
      keyClimbs: ['Corkscrew Road', 'Norton Summit'],
      distanceKm: 90,
      ascentM: 2200,
      difficulty: 'mountain',
      heroNarrative: 'Under the Australian sun, Norton Summit separates the champions.',
      mood: 'clear-noon',
      spectatorClimbs: [
        { startDistance: 82_000, endDistance: 90_000, densityPerKm: 50 },
      ],
    },
  },

  // ---------------------------------------------------------------------------
  // Tour of California 2023 Stage 5 — Monterey → Big Sur (coastal)
  // 157 km | Pacific Coast Highway + Nacimiento-Fergusson Road
  // ---------------------------------------------------------------------------
  {
    route: buildStageRoute({
      id: 'wt-toc-2023-s5',
      name: 'Tour of California 2023 S5 — Big Sur',
      coords: [
        [36.6002, -121.8947],  // Monterey — start
        [36.5500, -121.9200],  // Pacific Grove
        [36.4500, -121.9300],  // Carmel-by-the-Sea
        [36.2500, -121.8500],  // Big Sur coast
        [35.9700, -121.5000],  // Nacimiento-Fergusson Road
        [35.8000, -121.4000],  // Santa Lucia summit (900 m)
      ],
      elevationProfile: [
        { t: 0.00, ele:   5 },
        { t: 0.20, ele:  15 },
        { t: 0.45, ele:  80 },
        { t: 0.65, ele: 200 },
        { t: 0.82, ele: 600 },
        { t: 1.00, ele: 900 },
      ],
      numPts: 380,
    }),
    info: {
      grandTour: 'tour',
      year: 2023,
      stageNumber: 5,
      name: 'Stage 5 — Big Sur',
      region: 'USA — California (Pacific Coast)',
      description:
        "One of cycling's most scenic stages — the Pacific Coast Highway along the Big Sur coastline followed by the brutal Nacimiento-Fergusson climb into the Santa Lucia Mountains. Ocean views give way to redwood forest.",
      keyClimbs: ['Nacimiento-Fergusson Road', 'Santa Lucia summit'],
      distanceKm: 157,
      ascentM: 2800,
      difficulty: 'mountain',
      heroNarrative: 'The Pacific recedes as the Santa Lucia Mountains demand everything.',
      mood: 'mediterranean-mist',
    },
  },

  // ---------------------------------------------------------------------------
  // Tour of Catalonia 2024 Stage 5 — Masnou → Andorra La Vella
  // 188 km | Port del Cantó + Arcalís
  // ---------------------------------------------------------------------------
  {
    route: buildStageRoute({
      id: 'wt-volta-2024-s5',
      name: 'Volta Catalunya 2024 S5 — Arcalís',
      coords: [
        [41.4820, 2.3230],   // Masnou — coastal start
        [41.6000, 1.5000],   // Llobregat valley
        [42.0000, 1.2000],   // Tremp area
        [42.3500, 1.3000],   // Port del Cantó foot
        [42.4800, 1.3500],   // Port del Cantó (1725 m)
        [42.5480, 1.5440],   // Andorra La Vella
        [42.5800, 1.5000],   // Arcalís base
        [42.5850, 1.4990],   // Arcalís summit (2240 m)
      ],
      elevationProfile: [
        { t: 0.00, ele:   5 },
        { t: 0.20, ele: 300 },
        { t: 0.40, ele: 600 },
        { t: 0.58, ele: 1725 },  // Port del Cantó
        { t: 0.70, ele: 1020 },  // Andorra valley
        { t: 0.82, ele: 1500 },  // Arcalís base
        { t: 1.00, ele: 2240 },  // Arcalís summit
      ],
      numPts: 450,
    }),
    info: {
      grandTour: 'tour',
      year: 2024,
      stageNumber: 5,
      name: 'Stage 5 — Arcalís (Andorra)',
      region: 'Spain / Andorra — Pyrenees',
      description:
        "From the Mediterranean coast to the Andorran Pyrenees in one stage. The remote Arcalís ski station provides one of the most dramatic summit finishes in the Volta a Catalunya, 2240 m above sea level.",
      keyClimbs: ['Port del Cantó', 'Arcalís'],
      distanceKm: 188,
      ascentM: 4600,
      difficulty: 'queen',
      heroNarrative: 'From the sea to the sky — Arcalís crowns the king of Catalunya.',
      mood: 'clear-noon',
      spectatorClimbs: [
        { startDistance: 178_000, endDistance: 188_000, densityPerKm: 45 },
      ],
    },
  },

  // ---------------------------------------------------------------------------
  // Vuelta 2024 Stage 13 — Luarca → Lagos de Covadonga
  // 152 km | Asturian mountain finish
  // ---------------------------------------------------------------------------
  {
    route: buildStageRoute({
      id: 'wt-vuelta-2024-s13',
      name: 'Vuelta 2024 S13 — Lagos de Covadonga',
      coords: [
        [43.5430, -6.5360],  // Luarca — north coast start
        [43.4000, -5.8000],  // Oviedo area
        [43.3500, -5.4000],  // Cangas de Onís
        [43.2700, -5.0000],  // Lagos foot
        [43.2628, -4.9999],  // Lagos de Covadonga (1134 m)
      ],
      elevationProfile: [
        { t: 0.00, ele:   10 },
        { t: 0.25, ele:  200 },
        { t: 0.50, ele:  300 },
        { t: 0.72, ele:  400 },
        { t: 0.85, ele:  750 },
        { t: 1.00, ele: 1134 },
      ],
      numPts: 400,
    }),
    info: {
      grandTour: 'vuelta',
      year: 2024,
      stageNumber: 13,
      name: 'Stage 13 — Lagos de Covadonga',
      region: 'Spain — Asturias (Picos de Europa)',
      description:
        "The most iconic stage finish in the Vuelta a España. Lagos de Covadonga in the Picos de Europa has hosted decisive GC battles for decades. The final 12 km feature an average gradient of 7% with sections above 15%.",
      keyClimbs: ['Lagos de Covadonga'],
      distanceKm: 152,
      ascentM: 3200,
      difficulty: 'mountain',
      heroNarrative: 'The lakes of the gods — where Vuelta champions are made.',
      mood: 'overcast',
      spectatorClimbs: [
        { startDistance: 140_000, endDistance: 152_000, densityPerKm: 70 },
      ],
    },
  },

  // ---------------------------------------------------------------------------
  // Il Lombardia 2024 — Bergamo → Como
  // 253 km | San Fermo della Battaglia + Madonna del Ghisallo
  // ---------------------------------------------------------------------------
  {
    route: buildStageRoute({
      id: 'wt-lombardia-2024',
      name: 'Il Lombardia 2024',
      coords: [
        [45.6950, 9.6700],   // Bergamo — start
        [45.8500, 9.3800],   // Lecco, Lake Como
        [45.9500, 9.2500],   // Madonna del Ghisallo foot
        [45.9570, 9.2490],   // Ghisallo summit (754 m)
        [45.8800, 9.1500],   // Civiglio
        [45.8130, 9.0850],   // San Fermo della Battaglia
        [45.7953, 9.0841],   // Como finish
      ],
      elevationProfile: [
        { t: 0.00, ele: 249 },
        { t: 0.28, ele: 214 },  // Lecco lakefront
        { t: 0.45, ele: 400 },  // Ghisallo approach
        { t: 0.55, ele: 754 },  // Madonna del Ghisallo
        { t: 0.68, ele: 300 },
        { t: 0.82, ele: 450 },  // San Fermo
        { t: 1.00, ele: 210 },  // Como
      ],
      numPts: 450,
    }),
    info: {
      grandTour: 'giro',
      year: 2024,
      stageNumber: 1,
      name: 'Il Lombardia 2024',
      region: 'Italy — Lombardy (Lakes)',
      description:
        "The Race of the Falling Leaves — 253 km along the shores of Lake Como through the autumn Lombardy countryside. Tadej Pogačar won a dominant solo victory in 2024, his third consecutive Monument of the season.",
      keyClimbs: ['Madonna del Ghisallo', 'Civiglio', 'San Fermo della Battaglia'],
      distanceKm: 253,
      ascentM: 4100,
      difficulty: 'mountain',
      heroNarrative: 'Autumn leaves, lake views, and one champion standing alone at Como.',
      mood: 'golden-hour',
      spectatorClimbs: [
        { startDistance: 230_000, endDistance: 243_000, densityPerKm: 55 },
      ],
    },
  },

  // ---------------------------------------------------------------------------
  // Tour of Romandy 2024 Stage 5 — Champéry → Crans-Montana
  // 161 km | Col de la Croix + Crans-Montana summit finish
  // ---------------------------------------------------------------------------
  {
    route: buildStageRoute({
      id: 'wt-romandy-2024-s5',
      name: 'Tour of Romandy 2024 S5 — Crans-Montana',
      coords: [
        [46.1740, 6.8700],   // Champéry — start
        [46.2500, 7.0000],   // Aigle valley
        [46.3000, 7.1500],   // Col de la Croix foot
        [46.3300, 7.1300],   // Col de la Croix (1778 m)
        [46.3000, 7.3500],   // Sion valley
        [46.3100, 7.5300],   // Crans-Montana base
        [46.3059, 7.5253],   // Crans-Montana summit (1500 m)
      ],
      elevationProfile: [
        { t: 0.00, ele: 1000 },
        { t: 0.18, ele:  430 },  // Aigle valley
        { t: 0.38, ele: 1300 },  // Col de la Croix approach
        { t: 0.50, ele: 1778 },  // Col de la Croix summit
        { t: 0.62, ele:  490 },  // Sion
        { t: 0.78, ele:  900 },  // Crans-Montana lower
        { t: 1.00, ele: 1500 },  // Crans-Montana finish
      ],
      numPts: 400,
    }),
    info: {
      grandTour: 'tour',
      year: 2024,
      stageNumber: 5,
      name: 'Stage 5 — Crans-Montana',
      region: 'Switzerland — Valais Alps',
      description:
        "The queen stage of the Tour de Romandy — a Swiss Alpine classic finishing on the Crans-Montana plateau above the Rhône valley. An early-season GC decider amid spectacular Valais scenery.",
      keyClimbs: ['Col de la Croix', 'Crans-Montana'],
      distanceKm: 161,
      ascentM: 3800,
      difficulty: 'mountain',
      heroNarrative: 'Swiss precision meets Alpine brutality on Crans-Montana.',
      mood: 'clear-noon',
      spectatorClimbs: [
        { startDistance: 150_000, endDistance: 161_000, densityPerKm: 40 },
      ],
    },
  },
];
