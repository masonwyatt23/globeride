import { useState, useMemo } from 'react';
import { Settings, X, RotateCcw, Bike, Wind, Weight, Activity, Gauge } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { cn } from '@/lib/utils';

/**
 * Floating settings panel — opens on top of either Home or Ride. Persists
 * everything to localStorage via the settingsStore so changes survive reload.
 */
export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useSettingsStore();

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <Card
        className="w-full max-w-lg max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            Rider settings
          </CardTitle>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="rounded-full p-1.5 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </CardHeader>
        <CardContent className="space-y-6">
          <UnitsRow value={s.units} onChange={(units) => s.setSettings({ units })} />

          <Section icon={<Weight className="h-4 w-4" />} title="Weight">
            <WeightRow
              units={s.units}
              riderMassKg={s.riderMassKg}
              bikeMassKg={s.bikeMassKg}
              onRiderChange={(riderMassKg) => s.setSettings({ riderMassKg })}
              onBikeChange={(bikeMassKg) => s.setSettings({ bikeMassKg })}
            />
          </Section>

          <Section icon={<Bike className="h-4 w-4" />} title="Bike & position">
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

          <Section icon={<Activity className="h-4 w-4" />} title="Drivetrain">
            <SliderRow
              label="Efficiency"
              min={88}
              max={100}
              step={0.5}
              value={s.drivetrainEff * 100}
              suffix="%"
              onChange={(pct) => s.setSettings({ drivetrainEff: pct / 100 })}
            />
          </Section>

          <Section icon={<Wind className="h-4 w-4" />} title="Wind">
            <WindRow
              units={s.units}
              windSpeedMs={s.windSpeedMs}
              windDirectionDeg={s.windDirectionDeg}
              onSpeedChange={(windSpeedMs) => s.setSettings({ windSpeedMs })}
              onDirChange={(windDirectionDeg) => s.setSettings({ windDirectionDeg })}
            />
          </Section>

          <Section icon={<Gauge className="h-4 w-4" />} title="Demo Mode power">
            <SliderRow
              label="Target power"
              min={80}
              max={400}
              step={5}
              value={s.demoPowerW}
              suffix=" W"
              onChange={(v) => s.setSettings({ demoPowerW: v })}
            />
          </Section>

          <div className="flex items-center justify-between pt-2">
            <Button variant="ghost" size="sm" onClick={() => s.reset()}>
              <RotateCcw className="h-4 w-4" /> Restore defaults
            </Button>
            <Button variant="accent" size="sm" onClick={onClose}>
              Done
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents — kept colocated since they only matter inside this panel.
// ---------------------------------------------------------------------------

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        {icon}
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
}

function UnitsRow({ value, onChange }: { value: UnitSystem; onChange: (u: UnitSystem) => void }) {
  return (
    <div className="flex items-center justify-end gap-1 text-xs">
      <button
        className={cn(
          'rounded-md px-2 py-1 transition-colors',
          value === 'metric' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/60',
        )}
        onClick={() => onChange('metric')}
      >
        kg · km/h
      </button>
      <button
        className={cn(
          'rounded-md px-2 py-1 transition-colors',
          value === 'imperial' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/60',
        )}
        onClick={() => onChange('imperial')}
      >
        lb · mph
      </button>
    </div>
  );
}

function PickerButton({
  selected,
  onClick,
  label,
  sub,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  sub: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center justify-center gap-0.5 rounded-lg border px-3 py-2 transition-colors',
        selected
          ? 'border-primary/60 bg-primary/10 text-foreground'
          : 'border-border bg-card/40 text-muted-foreground hover:text-foreground hover:bg-card/60',
      )}
    >
      <span className="text-sm font-semibold">{label}</span>
      <span className="text-[10px] num">{sub}</span>
    </button>
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
  const riderDisplay = useMemo(
    () => (imperial ? kgToLb(riderMassKg) : riderMassKg),
    [imperial, riderMassKg],
  );
  const bikeDisplay = useMemo(
    () => (imperial ? kgToLb(bikeMassKg) : bikeMassKg),
    [imperial, bikeMassKg],
  );
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
        label={`Speed`}
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

function SliderRow({
  label,
  min,
  max,
  step,
  value,
  suffix,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
        <span>{label}</span>
        <span className="num text-foreground">
          {formatNumber(value, step)}{suffix ?? ''}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
        aria-label={label}
      />
    </div>
  );
}

function NumberField({
  label,
  unit,
  value,
  step,
  min,
  max,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  step: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5 rounded-md border border-border bg-card/40 px-2 py-1.5 focus-within:border-primary/60">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={formatNumber(value, step)}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onChange(v);
          }}
          className="num bg-transparent w-full text-sm text-foreground outline-none"
        />
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

function bikeLabel(b: BikeType): string {
  return b === 'mtb' ? 'MTB' : b[0].toUpperCase() + b.slice(1);
}
function positionLabel(p: RiderPosition): string {
  return p[0].toUpperCase() + p.slice(1);
}
function formatNumber(v: number, step: number): string {
  if (step >= 1) return Math.round(v).toString();
  if (step >= 0.5) return (Math.round(v * 2) / 2).toFixed(1);
  if (step >= 0.1) return (Math.round(v * 10) / 10).toFixed(1);
  return (Math.round(v * 100) / 100).toFixed(2);
}

/** Map degrees of wind direction to a readable label (and an arrow). */
function windDescription(deg: number): string {
  const d = ((deg % 360) + 360) % 360;
  // 0 = headwind ↓ from rider's pov, 180 = tailwind ↑
  if (d < 22.5 || d >= 337.5) return 'Headwind ↓';
  if (d < 67.5) return 'Head-right ↘';
  if (d < 112.5) return 'Crosswind → (R)';
  if (d < 157.5) return 'Tail-right ↗';
  if (d < 202.5) return 'Tailwind ↑';
  if (d < 247.5) return 'Tail-left ↖';
  if (d < 292.5) return 'Crosswind ← (L)';
  return 'Head-left ↙';
}

/**
 * Standalone trigger button — drop into any toolbar; pairs with SettingsPanel.
 * Manages its own open/close state for convenience.
 */
export function SettingsButton({
  className,
  variant = 'outline',
  size = 'icon',
  showLabel = false,
}: {
  className?: string;
  variant?: 'outline' | 'ghost' | 'default' | 'accent';
  size?: 'icon' | 'sm' | 'default' | 'lg';
  showLabel?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={() => setOpen(true)}
        aria-label="Open settings"
      >
        <Settings className="h-4 w-4" />
        {showLabel && <span>Settings</span>}
      </Button>
      <SettingsPanel open={open} onClose={() => setOpen(false)} />
    </>
  );
}
