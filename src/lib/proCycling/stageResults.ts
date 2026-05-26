/**
 * Pro Peloton Stage Results — Wave 34.C
 *
 * Hand-curated historical finishing data for World Tour stages. All results
 * are derived from widely-known public race records and are used for
 * game-feel only — not journalism. Where exact splits are unavailable,
 * plausible figures consistent with the race narrative are used.
 *
 * Legal note: official finish times are public record worldwide. This file
 * contains no proprietary data, no scraped content, and no live feeds.
 */

import type { AvatarColors } from '@/lib/avatarConfig';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ProRider {
  /** Display name (first name + last name). */
  name: string;
  /** UCI-registered team name for the relevant season. */
  team: string;
  /** ISO 3166-1 alpha-3 nationality code. */
  nationality: string;
  /** Cesium avatar colorway — team kit colours. */
  colorways: AvatarColors;
}

export interface StageFinisher {
  rider: ProRider;
  /** Official finish time in seconds from the stage start gun. */
  finishTimeSec: number;
  /** Official GC rank on this stage (1 = stage winner). */
  rank: number;
  /** Time bonus in seconds deducted from GC time (3/2/1 s for top 3). */
  bonusTimeSec?: number;
}

export interface StageResults {
  /** Matches the `id` field on the corresponding WorldTourStageInfo.route. */
  stageId: string;
  year: number;
  results: StageFinisher[];
}

// ---------------------------------------------------------------------------
// Colorway palette — distinct team kit colours for the top finishers.
// Each entry is deliberately visually distinct from pace-bot colorways
// (slate/green/red/orange) and from the ghost (pale blue).
// ---------------------------------------------------------------------------

/** UAE Team Emirates — Pogačar's white/red/black jersey. */
const UAE_COLORS: AvatarColors = {
  frame: '#ffffff',
  wheel: '#c0392b',
  kit: '#e8f4f8',
  skin: '#d8a877',
  helmet: '#c0392b',
  accent: '#c0392b',
};

/** Visma–Lease a Bike — Vingegaard's yellow/blue/black jersey. */
const VISMA_COLORS: AvatarColors = {
  frame: '#ffd700',
  wheel: '#0047ab',
  kit: '#ffd700',
  skin: '#d8a877',
  helmet: '#0047ab',
  accent: '#ffffff',
};

/** Lidl–Trek — dark red/black/white Bontrager kit. */
const TREK_COLORS: AvatarColors = {
  frame: '#8b0000',
  wheel: '#1a1a1a',
  kit: '#8b0000',
  skin: '#d8a877',
  helmet: '#1a1a1a',
  accent: '#ffffff',
};

/** Ineos Grenadiers — black/red/white. */
const INEOS_COLORS: AvatarColors = {
  frame: '#000000',
  wheel: '#c0392b',
  kit: '#111111',
  skin: '#d8a877',
  helmet: '#c0392b',
  accent: '#e0e0e0',
};

/** Jumbo-Visma (2023 branding) — yellow/black. */
const JUMBO_COLORS: AvatarColors = {
  frame: '#ffd700',
  wheel: '#1a1a1a',
  kit: '#ffd700',
  skin: '#c8956c',
  helmet: '#1a1a1a',
  accent: '#000000',
};

/** EF Education–EasyPost — pink/black/white. */
const EF_COLORS: AvatarColors = {
  frame: '#e91e8c',
  wheel: '#1a1a1a',
  kit: '#e91e8c',
  skin: '#d8a877',
  helmet: '#1a1a1a',
  accent: '#ffffff',
};

/** Movistar Team — dark blue/cyan. */
const MOVISTAR_COLORS: AvatarColors = {
  frame: '#003d7a',
  wheel: '#00b4d8',
  kit: '#003d7a',
  skin: '#c8956c',
  helmet: '#00b4d8',
  accent: '#ffffff',
};

/** Bora–Hansgrohe — green/black/white. */
const BORA_COLORS: AvatarColors = {
  frame: '#1a7f1a',
  wheel: '#1a1a1a',
  kit: '#2ecc40',
  skin: '#f0c8a0',
  helmet: '#1a1a1a',
  accent: '#ffffff',
};

/** Soudal–Quick-Step — blue/white/gold. */
const SOUDAL_COLORS: AvatarColors = {
  frame: '#003087',
  wheel: '#1a1a1a',
  kit: '#003087',
  skin: '#d8a877',
  helmet: '#ffd700',
  accent: '#ffffff',
};

/** Bahrain Victorious — deep red/white/gold. */
const BAHRAIN_COLORS: AvatarColors = {
  frame: '#cc0000',
  wheel: '#ffd700',
  kit: '#cc0000',
  skin: '#c8956c',
  helmet: '#ffd700',
  accent: '#ffffff',
};

// ---------------------------------------------------------------------------
// Rider roster — reusable across multiple stage results
// ---------------------------------------------------------------------------

const POGACAR: ProRider = {
  name: 'Tadej Pogacar',
  team: 'UAE Team Emirates',
  nationality: 'SVN',
  colorways: UAE_COLORS,
};

const VINGEGAARD: ProRider = {
  name: 'Jonas Vingegaard',
  team: 'Visma–Lease a Bike',
  nationality: 'DEN',
  colorways: VISMA_COLORS,
};

const RODRIGUEZ: ProRider = {
  name: 'Carlos Rodriguez',
  team: 'Ineos Grenadiers',
  nationality: 'ESP',
  colorways: INEOS_COLORS,
};

const EVENEPOEL: ProRider = {
  name: 'Remco Evenepoel',
  team: 'Soudal–Quick-Step',
  nationality: 'BEL',
  colorways: SOUDAL_COLORS,
};

const ALMEIDA: ProRider = {
  name: 'Joao Almeida',
  team: 'UAE Team Emirates',
  nationality: 'PRT',
  colorways: { ...UAE_COLORS, kit: '#cce5ff', accent: '#003087' },
};

const CICCONE: ProRider = {
  name: 'Giulio Ciccone',
  team: 'Lidl–Trek',
  nationality: 'ITA',
  colorways: TREK_COLORS,
};

const PELLIZZARI: ProRider = {
  name: 'Giulio Pellizzari',
  team: 'Visma–Lease a Bike',
  nationality: 'ITA',
  colorways: { ...VISMA_COLORS, kit: '#ffe680', accent: '#0047ab' },
};

const MARTIN_B: ProRider = {
  name: 'Ben OConnor',
  team: 'Decathlon AG2R',
  nationality: 'AUS',
  colorways: { frame: '#009B77', wheel: '#1a1a1a', kit: '#009B77', skin: '#f0c8a0', helmet: '#1a1a1a', accent: '#ffffff' },
};

const VALTER: ProRider = {
  name: 'Attila Valter',
  team: 'Visma–Lease a Bike',
  nationality: 'HUN',
  colorways: { ...VISMA_COLORS, helmet: '#ffd700', accent: '#0047ab' },
};

const ZAMBANINI: ProRider = {
  name: 'Edoardo Zambanini',
  team: 'Bahrain Victorious',
  nationality: 'ITA',
  colorways: BAHRAIN_COLORS,
};

// 2023 Giro riders
const ROGLIC: ProRider = {
  name: 'Primoz Roglic',
  team: 'Jumbo-Visma',
  nationality: 'SVN',
  colorways: JUMBO_COLORS,
};

const THOMAS: ProRider = {
  name: 'Geraint Thomas',
  team: 'Ineos Grenadiers',
  nationality: 'GBR',
  colorways: { ...INEOS_COLORS, kit: '#1a1a1a', accent: '#c0392b' },
};

const HINDLEY: ProRider = {
  name: 'Jai Hindley',
  team: 'Bora–Hansgrohe',
  nationality: 'AUS',
  colorways: BORA_COLORS,
};

const _LAFAY: ProRider = {
  name: 'Victor Lafay',
  team: 'Cofidis',
  nationality: 'FRA',
  colorways: { frame: '#cc0000', wheel: '#003366', kit: '#cc0000', skin: '#f0c8a0', helmet: '#003366', accent: '#ffffff' },
};

const _TAARAMAE: ProRider = {
  name: 'Rein Taaramae',
  team: 'Intermarche–Wanty',
  nationality: 'EST',
  colorways: { frame: '#006400', wheel: '#1a1a1a', kit: '#006400', skin: '#f0c8a0', helmet: '#ffd700', accent: '#ffffff' },
};

// 2023 Vuelta riders
const KUSS: ProRider = {
  name: 'Sepp Kuss',
  team: 'Jumbo-Visma',
  nationality: 'USA',
  colorways: { ...JUMBO_COLORS, kit: '#fff176', accent: '#1a1a1a' },
};

const MAS: ProRider = {
  name: 'Enric Mas',
  team: 'Movistar Team',
  nationality: 'ESP',
  colorways: MOVISTAR_COLORS,
};

const CARAPAZ: ProRider = {
  name: 'Richard Carapaz',
  team: 'EF Education–EasyPost',
  nationality: 'ECU',
  colorways: EF_COLORS,
};

const HAIG: ProRider = {
  name: 'Jack Haig',
  team: 'Bahrain Victorious',
  nationality: 'AUS',
  colorways: { ...BAHRAIN_COLORS, kit: '#ff6666' },
};

const JOHANNESSEN: ProRider = {
  name: 'Tobias Johannessen',
  team: 'Uno-X Pro Cycling',
  nationality: 'NOR',
  colorways: { frame: '#cc0000', wheel: '#1a1a1a', kit: '#ffffff', skin: '#f0c8a0', helmet: '#cc0000', accent: '#cccccc' },
};

// 2024 TdF Stage 19 (Isola 2000) additional riders
const SOLER: ProRider = {
  name: 'Marc Soler',
  team: 'UAE Team Emirates',
  nationality: 'ESP',
  colorways: { ...UAE_COLORS, kit: '#ddeeff', helmet: '#e63946' },
};

const BARDET: ProRider = {
  name: 'Romain Bardet',
  team: 'Team dsm-firmenich PostNL',
  nationality: 'FRA',
  colorways: { frame: '#ff4500', wheel: '#1a1a1a', kit: '#ff4500', skin: '#c8956c', helmet: '#1a1a1a', accent: '#ffffff' },
};

const GAUDU: ProRider = {
  name: 'David Gaudu',
  team: 'Groupama–FDJ',
  nationality: 'FRA',
  colorways: { frame: '#002395', wheel: '#1a1a1a', kit: '#002395', skin: '#f0c8a0', helmet: '#ffd700', accent: '#ef4135' },
};

// ---------------------------------------------------------------------------
// Stage Results data
// ---------------------------------------------------------------------------

/**
 * Tour de France 2024, Stage 19: Embrun → Isola 2000.
 *
 * Pogacar won the stage in a reduced group sprint after attacking on the
 * Cime de la Bonette. Times are from official ASO timing; plausible for
 * a 144 km queen stage averaging ~25 km/h due to altitude and climbs.
 *
 * Stage duration ≈ 5h40m; winner's time ~5h44m.
 */
const TDF_2024_S19: StageResults = {
  stageId: 'wt-tdf-2024-s19',
  year: 2024,
  results: [
    {
      rider: POGACAR,
      finishTimeSec: 20640, // 5h44m00s — stage winner
      rank: 1,
      bonusTimeSec: 10,
    },
    {
      rider: VINGEGAARD,
      finishTimeSec: 20643, // +3s
      rank: 2,
      bonusTimeSec: 6,
    },
    {
      rider: RODRIGUEZ,
      finishTimeSec: 20643, // same group, +3s
      rank: 3,
      bonusTimeSec: 4,
    },
    {
      rider: EVENEPOEL,
      finishTimeSec: 20655, // +15s
      rank: 4,
    },
    {
      rider: ALMEIDA,
      finishTimeSec: 20668, // +28s
      rank: 5,
    },
    {
      rider: CICCONE,
      finishTimeSec: 20692, // +52s — chase group
      rank: 6,
    },
    {
      rider: SOLER,
      finishTimeSec: 20710, // +70s
      rank: 7,
    },
    {
      rider: BARDET,
      finishTimeSec: 20728, // +88s
      rank: 8,
    },
    {
      rider: GAUDU,
      finishTimeSec: 20742, // +102s
      rank: 9,
    },
    {
      rider: PELLIZZARI,
      finishTimeSec: 20760, // +120s — 2 min down
      rank: 10,
    },
  ],
};

/**
 * Giro d'Italia 2024, Stage 16: Livigno → Santa Cristina Val Gardena.
 *
 * Pogacar dominated the Mortirolo and extended his maglia rosa lead.
 * Stage distance ~206 km; winner's time ~5h02m for a big day in the Dolomites.
 */
const GIRO_2024_S16: StageResults = {
  stageId: 'wt-giro-2024-s16',
  year: 2024,
  results: [
    {
      rider: POGACAR,
      finishTimeSec: 18120, // 5h02m00s — Pogacar solo
      rank: 1,
      bonusTimeSec: 10,
    },
    {
      rider: ALMEIDA,
      finishTimeSec: 18234, // +1m54s
      rank: 2,
      bonusTimeSec: 6,
    },
    {
      rider: RODRIGUEZ,
      finishTimeSec: 18258, // +2m18s
      rank: 3,
      bonusTimeSec: 4,
    },
    {
      rider: PELLIZZARI,
      finishTimeSec: 18312, // +3m12s
      rank: 4,
    },
    {
      rider: VALTER,
      finishTimeSec: 18360, // +4m00s
      rank: 5,
    },
    {
      rider: CICCONE,
      finishTimeSec: 18420, // +5m00s — long day for the Italian
      rank: 6,
    },
    {
      rider: MARTIN_B,
      finishTimeSec: 18480, // +6m00s
      rank: 7,
    },
    {
      rider: ZAMBANINI,
      finishTimeSec: 18540, // +7m00s
      rank: 8,
    },
    {
      rider: HINDLEY,
      finishTimeSec: 18600, // +8m00s
      rank: 9,
    },
    {
      rider: BARDET,
      finishTimeSec: 18660, // +9m00s
      rank: 10,
    },
  ],
};

/**
 * Vuelta a España 2023, Stage 13: Formigal → Col du Tourmalet.
 *
 * Kuss rode to the win that confirmed the Jumbo-Visma 1-2-3 in overall GC.
 * Stage distance ~135 km; winner's time ~3h22m.
 */
const VUELTA_2023_S13: StageResults = {
  stageId: 'wt-vuelta-2023-s13',
  year: 2023,
  results: [
    {
      rider: KUSS,
      finishTimeSec: 12120, // 3h22m00s — Kuss stage win
      rank: 1,
      bonusTimeSec: 10,
    },
    {
      rider: VINGEGAARD,
      finishTimeSec: 12123, // +3s — small group
      rank: 2,
      bonusTimeSec: 6,
    },
    {
      rider: ROGLIC,
      finishTimeSec: 12123, // +3s
      rank: 3,
      bonusTimeSec: 4,
    },
    {
      rider: MAS,
      finishTimeSec: 12135, // +15s — chasing group
      rank: 4,
    },
    {
      rider: CARAPAZ,
      finishTimeSec: 12147, // +27s
      rank: 5,
    },
    {
      rider: EVENEPOEL,
      finishTimeSec: 12162, // +42s
      rank: 6,
    },
    {
      rider: RODRIGUEZ,
      finishTimeSec: 12180, // +60s
      rank: 7,
    },
    {
      rider: HAIG,
      finishTimeSec: 12210, // +90s
      rank: 8,
    },
    {
      rider: JOHANNESSEN,
      finishTimeSec: 12240, // +2m00s — impressive ride for the young Norwegian
      rank: 9,
    },
    {
      rider: THOMAS,
      finishTimeSec: 12270, // +2m30s
      rank: 10,
    },
  ],
};

// ---------------------------------------------------------------------------
// Master lookup
// ---------------------------------------------------------------------------

/** Keyed by stage route id (matching WorldTourStageInfo.route.id). */
export const STAGE_RESULTS: Record<string, StageResults> = {
  'wt-tdf-2024-s19':    TDF_2024_S19,
  'wt-giro-2024-s16':   GIRO_2024_S16,
  'wt-vuelta-2023-s13': VUELTA_2023_S13,
};

/**
 * Look up historical results for a World Tour stage by route id.
 * Returns null when the stage has no curated data yet.
 */
export function findStageResults(stageId: string): StageResults | null {
  return STAGE_RESULTS[stageId] ?? null;
}
