/**
 * Avatar appearance — colours for the procedural rider plus named presets.
 * Deliberately Cesium-free so the settings store can import it without
 * pulling the 3D engine into every bundle that touches settings.
 */

export interface AvatarColors {
  frame: string;
  wheel: string;
  kit: string;
  skin: string;
  helmet: string;
  accent: string;
}

/** Editable colour roles, in the order the Garage UI should present them. */
export const AVATAR_COLOR_ROLES: { key: keyof AvatarColors; label: string }[] = [
  { key: 'kit', label: 'Jersey' },
  { key: 'frame', label: 'Frame' },
  { key: 'wheel', label: 'Wheels' },
  { key: 'helmet', label: 'Helmet' },
  { key: 'accent', label: 'Accents' },
  { key: 'skin', label: 'Skin' },
];

export const DEFAULT_AVATAR_COLORS: AvatarColors = {
  frame: '#e2e8f0',
  wheel: '#0b1220',
  kit: '#22d3ee',
  skin: '#d8a877',
  helmet: '#0ea5e9',
  accent: '#f59e0b',
};

export interface AvatarPreset {
  id: string;
  name: string;
  colors: AvatarColors;
}

/** Built-in kit/bike presets shown in the Garage. */
export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: 'cyan', name: 'Cyan Pro', colors: DEFAULT_AVATAR_COLORS },
  {
    id: 'sunset',
    name: 'Sunset',
    colors: { frame: '#1e293b', wheel: '#0b1220', kit: '#f97316', skin: '#d8a877', helmet: '#fbbf24', accent: '#ef4444' },
  },
  {
    id: 'trail',
    name: 'Trail',
    colors: { frame: '#3f6212', wheel: '#1a2e05', kit: '#84cc16', skin: '#d8a877', helmet: '#65a30d', accent: '#fde047' },
  },
  {
    id: 'stealth',
    name: 'Stealth',
    colors: { frame: '#475569', wheel: '#020617', kit: '#1e293b', skin: '#d8a877', helmet: '#94a3b8', accent: '#e2e8f0' },
  },
  {
    id: 'royal',
    name: 'Royal',
    colors: { frame: '#e2e8f0', wheel: '#0b1220', kit: '#6366f1', skin: '#d8a877', helmet: '#4f46e5', accent: '#f472b6' },
  },
];
