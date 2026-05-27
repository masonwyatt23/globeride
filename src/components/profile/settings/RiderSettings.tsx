/**
 * RiderSettings.tsx — Rider tab: FTP, body/bike mass, position, units.
 */

import { useMemo } from 'react';
import { Activity, Bike, Weight } from 'lucide-react';
import {
  useSettingsStore,
  type UnitSystem,
  kgToLb,
  lbToKg,
  msToKmh,
  msToMph,
  MS_PER_KMH,
  MS_PER_MPH,
} from '@/stores/settingsStore';
import { CDA_BY_POSITION, CRR_BY_BIKE, type BikeType, type RiderPosition } from '@/lib/physics';
import { Section } from '@/components/ui/section-header';
import { PickerButton, SliderRow, NumberField } from './shared';

// ---------------------------------------------------------------------------
// Rider tab
// ---------------------------------------------------------------------------

export function RiderSettings() {
  const s = useSettingsStore();

  return (
    <div className="space-y-6">
      <UnitsRow value={s.units} onChange={(units) => s.setSettings({ units })} />

      {/* FTP */}
      <Section icon={<Activity className="h-4 w-4" />} title="Training">
        <SliderRow
          label="FTP"
          min={80}
          max={500}
          step={5}
          value={s.ftpW}
          suffix=" W"
          onChange={(v) => s.setSettings({ ftpW: v })}
        />
        <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">
          Functional Threshold Power — used to calculate workout zones and %FTP targets.
        </p>
      </Section>

      {/* Weight */}
      <Section icon={<Weight className="h-4 w-4" />} title="Weight">
        <WeightRow
          units={s.units}
          riderMassKg={s.riderMassKg}
          bikeMassKg={s.bikeMassKg}
          onRiderChange={(riderMassKg) => s.setSettings({ riderMassKg })}
          onBikeChange={(bikeMassKg) => s.setSettings({ bikeMassKg })}
        />
      </Section>

      {/* Bike & position */}
      <Section icon={<Bike className="h-4 w-4" />} title="Bike &amp; position">
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(CRR_BY_BIKE) as BikeType[]).map((b) => (
            <PickerButton
              key={b}
              selected={s.bikeType === b}
              onClick={() => s.setSettings({ bikeType: b })}
              label={bikeLabel(b)}
              sub={`Crr ${CRR_BY_BIKE[b].toFixed(3)}`}
            />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2 mt-2">
          {(Object.keys(CDA_BY_POSITION) as RiderPosition[]).map((p) => (
            <PickerButton
              key={p}
              selected={s.riderPosition === p}
              onClick={() => s.setSettings({ riderPosition: p })}
              label={positionLabel(p)}
              sub={`CdA ${CDA_BY_POSITION[p].toFixed(2)} m²`}
            />
          ))}
        </div>
      </Section>

      {/* Wind */}
      <Section icon={<Activity className="h-4 w-4" />} title="Wind">
        <WindRow
          units={s.units}
          windSpeedMs={s.windSpeedMs}
          windDirectionDeg={s.windDirectionDeg}
          onSpeedChange={(windSpeedMs) => s.setSettings({ windSpeedMs })}
          onDirChange={(windDirectionDeg) => s.setSettings({ windDirectionDeg })}
        />
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function UnitsRow({ value, onChange }: { value: UnitSystem; onChange: (u: UnitSystem) => void }) {
  return (
    <div className="flex items-center justify-end gap-1 text-xs" role="group" aria-label="Unit system">
      <button
        aria-pressed={value === 'metric'}
        className={`rounded-md px-2 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${value === 'metric' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/60'}`}
        onClick={() => onChange('metric')}
      >
        kg · km/h
      </button>
      <button
        aria-pressed={value === 'imperial'}
        className={`rounded-md px-2 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${value === 'imperial' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/60'}`}
        onClick={() => onChange('imperial')}
      >
        lb · mph
      </button>
    </div>
  );
}

function WeightRow({
  units,
  riderMassKg,
  bikeMassKg,
  onRiderChange,
  onBikeChange,
}: {
  units: UnitSystem;
  riderMassKg: number;
  bikeMassKg: number;
  onRiderChange: (kg: number) => void;
  onBikeChange: (kg: number) => void;
}) {
  const imperial = units === 'imperial';
  const riderDisplay = useMemo(() => (imperial ? kgToLb(riderMassKg) : riderMassKg), [imperial, riderMassKg]);
  const bikeDisplay = useMemo(() => (imperial ? kgToLb(bikeMassKg) : bikeMassKg), [imperial, bikeMassKg]);
  const unit = imperial ? 'lb' : 'kg';

  return (
    <div className="grid grid-cols-2 gap-3">
      <NumberField
        label="Rider"
        unit={unit}
        value={riderDisplay}
        step={imperial ? 1 : 0.5}
        min={imperial ? 60 : 30}
        max={imperial ? 400 : 180}
        onChange={(v) => onRiderChange(imperial ? lbToKg(v) : v)}
      />
      <NumberField
        label="Bike"
        unit={unit}
        value={bikeDisplay}
        step={imperial ? 0.5 : 0.2}
        min={imperial ? 8 : 4}
        max={imperial ? 50 : 22}
        onChange={(v) => onBikeChange(imperial ? lbToKg(v) : v)}
      />
    </div>
  );
}

function WindRow({
  units,
  windSpeedMs,
  windDirectionDeg,
  onSpeedChange,
  onDirChange,
}: {
  units: UnitSystem;
  windSpeedMs: number;
  windDirectionDeg: number;
  onSpeedChange: (ms: number) => void;
  onDirChange: (deg: number) => void;
}) {
  const imperial = units === 'imperial';
  const speedDisplay = imperial ? msToMph(windSpeedMs) : msToKmh(windSpeedMs);
  const speedUnit = imperial ? 'mph' : 'km/h';
  const toMs = (v: number) => (imperial ? v * MS_PER_MPH : v * MS_PER_KMH);

  return (
    <div className="space-y-3">
      <SliderRow
        label="Speed"
        min={0}
        max={imperial ? 30 : 50}
        step={imperial ? 0.5 : 1}
        value={speedDisplay}
        suffix={` ${speedUnit}`}
        onChange={(v) => onSpeedChange(toMs(v))}
      />
      <div>
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span>Direction</span>
          <span className="num text-foreground">{windDescription(windDirectionDeg)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={360}
          step={5}
          value={windDirectionDeg}
          onChange={(e) => onDirChange(Number(e.target.value))}
          className="w-full accent-primary"
          aria-label="Wind direction"
        />
      </div>
    </div>
  );
}

function bikeLabel(b: BikeType): string {
  return b === 'mtb' ? 'MTB' : b[0].toUpperCase() + b.slice(1);
}
function positionLabel(p: RiderPosition): string {
  return p[0].toUpperCase() + p.slice(1);
}
function windDescription(deg: number): string {
  const d = ((deg % 360) + 360) % 360;
  if (d < 22.5 || d >= 337.5) return 'Headwind ↓';
  if (d < 67.5) return 'Head-right ↘';
  if (d < 112.5) return 'Crosswind → (R)';
  if (d < 157.5) return 'Tail-right ↗';
  if (d < 202.5) return 'Tailwind ↑';
  if (d < 247.5) return 'Tail-left ↖';
  if (d < 292.5) return 'Crosswind ← (L)';
  return 'Head-left ↙';
}
