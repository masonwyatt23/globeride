/**
 * Curated World Tour stage routes — famous race stages from the Grand Tours
 * and Monuments, ready to ride. Each stage is a simplified polyline from
 * start to finish with a plausible elevation profile.
 *
 * Shape mirrors IconicRouteInfo so both catalogs can be unified in
 * ExploreMarkers. Marker position is derived from route.points[0] (start).
 */

import type { Route, RoutePoint } from '@/types';
import { haversine } from '@/lib/utils';

export interface WorldTourStageInfo {
  route: Route;
  stageName: string;
  race: string;
  region: string;
  description: string;
  year: number;
  stageType: 'mountain' | 'flat' | 'hilly' | 'tt';
}

// ---------------------------------------------------------------------------
// Internal builder — same approach as iconicRoutes.ts
// ---------------------------------------------------------------------------

interface ElevControl {
  t: number;
  ele: number;
}

function buildStageRoute(opts: {
  id: string;
  name: string;
  coords: [number, number][];
  elevationProfile: ElevControl[];
  numPts?: number;
}): Route {
  const { id, name, coords, elevationProfile, numPts = 250 } = opts;
  const profile = [...elevationProfile].sort((a, b) => a.t - b.t);

  function elevAt(t: number): number {
    for (let i = 1; i < profile.length; i++) {
      if (t <= profile[i].t) {
        const span = profile[i].t - profile[i - 1].t;
        const frac = span > 0 ? (t - profile[i - 1].t) / span : 0;
        return profile[i - 1].ele + (profile[i].ele - profile[i - 1].ele) * frac;
      }
    }
    return profile[profile.length - 1].ele;
  }

  function posAt(t: number): [number, number] {
    if (coords.length === 1) return coords[0];
    const segCount = coords.length - 1;
    const raw = t * segCount;
    const seg = Math.min(Math.floor(raw), segCount - 1);
    const frac = raw - seg;
    const [lat0, lon0] = coords[seg];
    const [lat1, lon1] = coords[seg + 1];
    return [lat0 + (lat1 - lat0) * frac, lon0 + (lon1 - lon0) * frac];
  }

  const points: RoutePoint[] = [];
  let cumDist = 0;
  let prevPt: [number, number] | null = null;

  for (let i = 0; i < numPts; i++) {
    const t = i / (numPts - 1);
    const [lat, lon] = posAt(t);
    const ele = elevAt(t);
    if (prevPt) cumDist += haversine(prevPt[0], prevPt[1], lat, lon);
    points.push({ lat, lon, ele, distance: cumDist });
    prevPt = [lat, lon];
  }

  let ascent = 0;
  let descent = 0;
  for (let i = 1; i < points.length; i++) {
    const diff = points[i].ele - points[i - 1].ele;
    if (diff > 0) ascent += diff;
    else descent -= diff;
  }
  const eles = points.map((p) => p.ele);

  return {
    id,
    name,
    points,
    totalDistance: cumDist,
    ascent: Math.round(ascent),
    descent: Math.round(descent),
    minElevation: Math.min(...eles),
    maxElevation: Math.max(...eles),
    loadedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Stage factory functions
// ---------------------------------------------------------------------------

function makeTdFAlped2024(): Route {
  return buildStageRoute({
    id: 'wts-tdf-alpe-2024',
    name: "TdF 2024 — Stage 14 — Alpe d'Huez Finish",
    coords: [
      [45.09, 5.73],   // Grenoble start
      [45.12, 5.97],   // heading east
      [45.08, 6.03],   // Vizille
      [45.07, 6.12],   // Bourg-d'Oisans base
      [45.11, 6.07],   // Alpe d'Huez hairpins
      [45.09, 6.07],   // summit
    ],
    elevationProfile: [
      { t: 0, ele: 210 },
      { t: 0.6, ele: 720 },
      { t: 0.8, ele: 800 },
      { t: 1, ele: 1850 },
    ],
  });
}

function makeTdFGalibierFinish(): Route {
  return buildStageRoute({
    id: 'wts-tdf-galibier-finish',
    name: 'TdF 2011 — Stage 18 — Galibier Summit Finish',
    coords: [
      [45.22, 6.63],   // Pinerolo-area start
      [45.18, 6.55],
      [45.11, 6.47],   // Briançon
      [45.07, 6.42],   // Lautaret
      [45.06, 6.40],   // Galibier summit
    ],
    elevationProfile: [
      { t: 0, ele: 370 },
      { t: 0.5, ele: 1000 },
      { t: 0.75, ele: 2058 },
      { t: 1, ele: 2645 },
    ],
  });
}

function makeGiroZoncolanStage(): Route {
  return buildStageRoute({
    id: 'wts-giro-zoncolan',
    name: 'Giro 2022 — Stage 14 — Monte Zoncolan',
    coords: [
      [46.37, 13.10],  // Paluzza start
      [46.42, 13.07],
      [46.49, 13.00],  // Ovaro
      [46.50, 12.95],  // Zoncolan
    ],
    elevationProfile: [
      { t: 0, ele: 370 },
      { t: 0.5, ele: 700 },
      { t: 0.8, ele: 1400 },
      { t: 1, ele: 1730 },
    ],
  });
}

function makeVueltaAngliru(): Route {
  return buildStageRoute({
    id: 'wts-vuelta-angliru',
    name: 'Vuelta 2023 — Stage 17 — Alto de l\'Angliru',
    coords: [
      [43.42, -5.98],  // Oviedo start
      [43.30, -5.90],
      [43.22, -5.82],  // Riosa
      [43.21, -5.80],  // Angliru
    ],
    elevationProfile: [
      { t: 0, ele: 228 },
      { t: 0.5, ele: 400 },
      { t: 0.8, ele: 900 },
      { t: 1, ele: 1570 },
    ],
  });
}

function makeParisRoubaixCobbles(): Route {
  return buildStageRoute({
    id: 'wts-paris-roubaix',
    name: 'Paris–Roubaix 2023 — Compiègne to Roubaix',
    coords: [
      [49.42, 2.83],   // Compiègne
      [50.20, 3.05],   // Arras area
      [50.42, 3.23],   // Mons-en-Pévèle cobbles
      [50.54, 3.32],   // Carrefour de l'Arbre
      [50.69, 3.18],   // Roubaix velodrome
    ],
    elevationProfile: [
      { t: 0, ele: 40 },
      { t: 0.3, ele: 80 },
      { t: 0.6, ele: 90 },
      { t: 1, ele: 30 },
    ],
  });
}

function makeTdFChamps(): Route {
  return buildStageRoute({
    id: 'wts-tdf-champs',
    name: "TdF 2024 — Stage 21 — Champs-Élysées Finale",
    coords: [
      [48.87, 2.32],   // Saint-Quentin-en-Yvelines
      [48.83, 2.26],
      [48.84, 2.32],
      [48.86, 2.33],   // Versailles
      [48.87, 2.35],
      [48.86, 2.35],
      [48.88, 2.37],
      [48.87, 2.31],   // Pont de Sèvres
      [48.86, 2.29],
      [48.85, 2.30],
      [48.84, 2.33],
      [48.86, 2.36],
      [48.87, 2.33],   // Arc de Triomphe
      [48.866, 2.313], // Champs-Élysées finish
    ],
    elevationProfile: [
      { t: 0, ele: 150 },
      { t: 0.5, ele: 80 },
      { t: 1, ele: 35 },
    ],
  });
}

function makeLombardia(): Route {
  return buildStageRoute({
    id: 'wts-lombardia',
    name: 'Il Lombardia 2023 — Bergamo to Como',
    coords: [
      [45.70, 9.67],   // Bergamo
      [45.83, 9.39],   // Lecco
      [45.87, 9.24],   // Ghisallo chapel
      [45.84, 9.08],   // San Fermo della Battaglia
      [45.81, 9.08],   // Como finish
    ],
    elevationProfile: [
      { t: 0, ele: 249 },
      { t: 0.4, ele: 400 },
      { t: 0.55, ele: 754 },
      { t: 0.75, ele: 400 },
      { t: 1, ele: 200 },
    ],
  });
}

function makeMilanoSanRemo(): Route {
  return buildStageRoute({
    id: 'wts-milan-sanremo',
    name: 'Milan–Sanremo 2024 — La Classicissima',
    coords: [
      [45.46, 9.19],   // Milan
      [44.87, 8.63],   // Tortona
      [44.41, 8.45],   // Genova
      [43.98, 7.98],   // Cipressa
      [43.84, 7.77],   // Poggio di Sanremo
      [43.82, 7.77],   // Sanremo finish
    ],
    elevationProfile: [
      { t: 0, ele: 122 },
      { t: 0.3, ele: 300 },
      { t: 0.5, ele: 200 },
      { t: 0.85, ele: 240 },
      { t: 0.95, ele: 160 },
      { t: 1, ele: 5 },
    ],
  });
}

function makeLiègeBastogneLiège(): Route {
  return buildStageRoute({
    id: 'wts-liege-bastogne',
    name: 'Liège–Bastogne–Liège 2024 — La Doyenne',
    coords: [
      [50.63, 5.57],   // Liège start
      [50.25, 5.72],   // Bastogne
      [50.35, 5.68],   // return
      [50.47, 5.62],   // La Redoute
      [50.55, 5.60],   // Côte de la Roche-aux-Faucons
      [50.63, 5.57],   // Liège finish
    ],
    elevationProfile: [
      { t: 0, ele: 60 },
      { t: 0.2, ele: 500 },
      { t: 0.35, ele: 530 },
      { t: 0.5, ele: 450 },
      { t: 0.7, ele: 490 },
      { t: 0.85, ele: 400 },
      { t: 1, ele: 65 },
    ],
  });
}

function makeFlèche(): Route {
  return buildStageRoute({
    id: 'wts-fleche-wallonne',
    name: "La Flèche Wallonne 2024 — Mur de Huy Finish",
    coords: [
      [50.48, 4.87],   // Charleroi
      [50.52, 4.82],
      [50.52, 5.15],   // Huy approach
      [50.52, 5.23],   // Mur de Huy
    ],
    elevationProfile: [
      { t: 0, ele: 270 },
      { t: 0.6, ele: 150 },
      { t: 0.85, ele: 120 },
      { t: 1, ele: 204 },
    ],
  });
}

function makeTourDeSwitzerlandMatterhorn(): Route {
  return buildStageRoute({
    id: 'wts-tour-swiss-matterhorn',
    name: 'Tour de Suisse 2023 — Zermatt Stage',
    coords: [
      [46.22, 7.36],   // Sion
      [46.10, 7.58],   // Visp
      [46.02, 7.75],   // Zermatt finish
    ],
    elevationProfile: [
      { t: 0, ele: 490 },
      { t: 0.5, ele: 650 },
      { t: 1, ele: 1608 },
    ],
  });
}

function makeGrandTourPyrenees(): Route {
  return buildStageRoute({
    id: 'wts-tdf-pyrenees',
    name: 'TdF 2023 — Stage 6 — Tarbes to Cauterets-Cambasque',
    coords: [
      [43.23, 0.07],   // Tarbes
      [43.01, -0.10],  // Lourdes
      [42.93, -0.11],  // Argelès-Gazost
      [42.89, -0.14],  // Cauterets
      [42.87, -0.16],  // Cambasque summit
    ],
    elevationProfile: [
      { t: 0, ele: 304 },
      { t: 0.3, ele: 400 },
      { t: 0.7, ele: 600 },
      { t: 0.9, ele: 1400 },
      { t: 1, ele: 1720 },
    ],
  });
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const WORLD_TOUR_STAGES: WorldTourStageInfo[] = [
  {
    route: makeTdFAlped2024(),
    stageName: "Stage 14 — Alpe d'Huez Finish",
    race: 'Tour de France',
    region: 'France — Isère',
    description:
      "The Tour's greatest arena: a rolling 151 km from Grenoble ending on the 21 hairpin cathedral of Alpe d'Huez. Pantani's ghost haunts every bend.",
    year: 2024,
    stageType: 'mountain',
  },
  {
    route: makeTdFGalibierFinish(),
    stageName: 'Stage 18 — Galibier Summit Finish',
    race: 'Tour de France',
    region: 'France — Hautes-Alpes',
    description:
      'One of the highest finishes in Tour de France history. Andy Schleck rode alone to the roof of the Alps in a stage that became instant legend.',
    year: 2011,
    stageType: 'mountain',
  },
  {
    route: makeGiroZoncolanStage(),
    stageName: 'Stage 14 — Monte Zoncolan',
    race: 'Giro d\'Italia',
    region: 'Italy — Friuli',
    description:
      "The Giro's most feared test. 125 km culminating on Zoncolan's savage 12% average — every GC contender who cracks here goes home broken.",
    year: 2022,
    stageType: 'mountain',
  },
  {
    route: makeVueltaAngliru(),
    stageName: "Stage 17 — Alto de l'Angliru",
    race: 'Vuelta a España',
    region: 'Spain — Asturias',
    description:
      "The Vuelta's ultimate punishment. A 155 km stage ending on the 23% nightmare of Angliru — where even pros have walked their bikes.",
    year: 2023,
    stageType: 'mountain',
  },
  {
    route: makeParisRoubaixCobbles(),
    stageName: 'Paris–Roubaix — Hell of the North',
    race: 'Paris–Roubaix',
    region: 'France — Nord',
    description:
      '257 km from Compiègne to the Roubaix velodrome over 55 km of brutal pavé. Every year it destroys the greatest classics specialists alive.',
    year: 2023,
    stageType: 'flat',
  },
  {
    route: makeTdFChamps(),
    stageName: "Stage 21 — Champs-Élysées Finale",
    race: 'Tour de France',
    region: 'France — Île-de-France',
    description:
      "The grandest procession in sport — until the sprinters fire up. 115 km from Saint-Quentin-en-Yvelines to the most famous finish line in cycling.",
    year: 2024,
    stageType: 'flat',
  },
  {
    route: makeLombardia(),
    stageName: 'Il Lombardia — Race of the Falling Leaves',
    race: 'Il Lombardia',
    region: 'Italy — Lombardy',
    description:
      "Cycling's most beautiful Monument. The Madonna del Ghisallo chapel blesses each rider before the Bergamo–Como descent through autumn foliage.",
    year: 2023,
    stageType: 'hilly',
  },
  {
    route: makeMilanoSanRemo(),
    stageName: 'Milan–Sanremo — La Classicissima',
    race: 'Milan–Sanremo',
    region: 'Italy — Liguria',
    description:
      "298 km — cycling's longest Monument. Everything decides on the Poggio. One burst of acceleration separates winner from history.",
    year: 2024,
    stageType: 'hilly',
  },
  {
    route: makeLiègeBastogneLiège(),
    stageName: 'Liège–Bastogne–Liège — La Doyenne',
    race: 'Liège–Bastogne–Liège',
    region: 'Belgium — Ardennes',
    description:
      "The oldest Monument, first ridden in 1892. Fifteen punishing Ardennes climbs — La Redoute and Roche-aux-Faucons always split the favourites.",
    year: 2024,
    stageType: 'hilly',
  },
  {
    route: makeFlèche(),
    stageName: "La Flèche Wallonne — Mur de Huy",
    race: "La Flèche Wallonne",
    region: 'Belgium — Wallonia',
    description:
      "Three ascents of the Mur de Huy decide everything. The 26% wall is short enough to survive — but only if you time the last 200 m perfectly.",
    year: 2024,
    stageType: 'hilly',
  },
  {
    route: makeTourDeSwitzerlandMatterhorn(),
    stageName: 'Zermatt Stage — Matterhorn Backdrop',
    race: 'Tour de Suisse',
    region: 'Switzerland — Valais',
    description:
      "A Tour de Suisse queen stage finishing in Zermatt with the Matterhorn looming overhead. Alpine beauty at its most cinematic.",
    year: 2023,
    stageType: 'mountain',
  },
  {
    route: makeGrandTourPyrenees(),
    stageName: 'Stage 6 — Tarbes to Cauterets-Cambasque',
    race: 'Tour de France',
    region: 'France — Hautes-Pyrénées',
    description:
      "A Pyrenean power day — 145 km ending at 1720 m on Cambasque. The finish ramp hits 16% and always produces an explosive GC battle.",
    year: 2023,
    stageType: 'mountain',
  },
];
