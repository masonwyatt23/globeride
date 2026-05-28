/**
 * VisualSettings.tsx — Visual tab: camera mode, graphics quality,
 * low-light HUD, avatar/garage colours.
 */

import { Camera, Monitor, Palette, Smartphone } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import type { LowLightSetting } from '@/lib/lowLightMode';
import { type GraphicsQuality, QUALITY_LABELS } from '@/lib/graphicsQuality';
import { CAMERA_MODES, type CameraMode } from '@/lib/cesiumCameras';
import { AVATAR_PRESETS, AVATAR_COLOR_ROLES } from '@/lib/avatarConfig';
import { Section } from '@/components/ui/section-header';
import { PickerButton } from './shared';
import { CesiumIonTokenSection } from './CesiumIonTokenSection';

// ---------------------------------------------------------------------------
// Camera label map
// ---------------------------------------------------------------------------

const CAMERA_LABEL: Record<CameraMode, { label: string; sub: string }> = {
  chase:        { label: 'Chase',       sub: 'behind rider'  },
  firstPerson:  { label: '1st Person',  sub: 'helmet cam'    },
  overhead:     { label: 'Overhead',    sub: 'top-down'      },
  sideTracking: { label: 'Side',        sub: 'tracking shot' },
  cinematic:    { label: 'Cinematic',   sub: 'dynamic cuts'  },
};

// ---------------------------------------------------------------------------
// Low-light options
// ---------------------------------------------------------------------------

const LOW_LIGHT_OPTIONS: { value: LowLightSetting; label: string; sub: string }[] = [
  { value: 'auto', label: 'Auto',   sub: '18:00–06:00' },
  { value: 'on',   label: 'Always', sub: 'always on'   },
  { value: 'off',  label: 'Off',    sub: 'always off'  },
];

// ---------------------------------------------------------------------------
// Graphics tiers
// ---------------------------------------------------------------------------

const QUALITY_TIERS: GraphicsQuality[] = ['low', 'medium', 'high'];

// ---------------------------------------------------------------------------
// Visual tab
// ---------------------------------------------------------------------------

export function VisualSettings() {
  const s = useSettingsStore();

  return (
    <div className="space-y-6">
      {/* Camera mode */}
      <Section icon={<Camera className="h-4 w-4" />} title="Camera">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {CAMERA_MODES.map((mode) => (
            <PickerButton
              key={mode}
              selected={s.cameraMode === mode}
              onClick={() => s.setCameraMode(mode)}
              label={CAMERA_LABEL[mode].label}
              sub={CAMERA_LABEL[mode].sub}
            />
          ))}
        </div>
      </Section>

      {/* Photoreal Earth — Cesium ion upgrade */}
      <CesiumIonTokenSection />

      {/* Graphics quality */}
      <Section icon={<Monitor className="h-4 w-4" />} title="Graphics">
        <div className="grid grid-cols-3 gap-2">
          {QUALITY_TIERS.map((tier) => (
            <PickerButton
              key={tier}
              selected={s.graphicsQuality === tier}
              onClick={() => s.setSettings({ graphicsQuality: tier })}
              label={QUALITY_LABELS[tier].label}
              sub={QUALITY_LABELS[tier].sub}
            />
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">
          Controls anti-aliasing, shadows, fog, and tile detail on the 3D globe.
          Use <span className="font-semibold text-foreground">Low</span> on integrated
          GPUs or for longer battery life.
        </p>
      </Section>

      {/* Low-light HUD */}
      <Section icon={<Smartphone className="h-4 w-4" />} title="Low-light HUD">
        <p className="text-[11px] text-muted-foreground mb-2 leading-relaxed">
          Boosts contrast (darker background, heavier text, higher opacity) for evening or dim
          indoor rides. <span className="font-semibold text-foreground">Auto</span> switches on
          between 18:00 and 06:00 local time.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {LOW_LIGHT_OPTIONS.map((opt) => (
            <PickerButton
              key={opt.value}
              selected={s.lowLightHud === opt.value}
              onClick={() => s.setLowLightHud(opt.value)}
              label={opt.label}
              sub={opt.sub}
            />
          ))}
        </div>
      </Section>

      {/* Garage — avatar colours */}
      <Section icon={<Palette className="h-4 w-4" />} title="Garage">
        <div className="grid grid-cols-3 gap-2">
          {AVATAR_PRESETS.map((p) => (
            <PickerButton
              key={p.id}
              selected={AVATAR_PRESETS.find((pr) =>
                AVATAR_COLOR_ROLES.every((r) => pr.colors[r.key] === s.avatar[r.key]),
              )?.id === p.id}
              onClick={() => s.setSettings({ avatar: p.colors })}
              label={p.name}
              sub="preset"
            />
          ))}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {AVATAR_COLOR_ROLES.map((role) => (
            <label
              key={role.key}
              className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card/40 px-3 py-2 text-sm"
            >
              <span className="text-muted-foreground">{role.label}</span>
              <input
                type="color"
                value={s.avatar[role.key]}
                onChange={(e) =>
                  s.setSettings({ avatar: { ...s.avatar, [role.key]: e.target.value } })
                }
                className="h-6 w-9 cursor-pointer rounded border border-border bg-transparent p-0"
                aria-label={`${role.label} colour`}
              />
            </label>
          ))}
        </div>
      </Section>
    </div>
  );
}
