/**
 * shared.tsx — micro-components shared across settings tab sub-panels.
 *
 * PickerButton, SliderRow, NumberField, formatNumber are copied from
 * SettingsPanel.tsx so the tab panels stay self-contained. SettingsPanel
 * itself can also import from here.
 */

import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// PickerButton
// ---------------------------------------------------------------------------

export function PickerButton({
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
        'flex flex-col items-center justify-center gap-0.5 rounded-lg border px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
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

// ---------------------------------------------------------------------------
// SliderRow
// ---------------------------------------------------------------------------

export function SliderRow({
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

// ---------------------------------------------------------------------------
// NumberField
// ---------------------------------------------------------------------------

export function NumberField({
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
          aria-label={label}
          className="num bg-transparent w-full text-sm text-foreground outline-none"
        />
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
    </label>
  );
}

// ---------------------------------------------------------------------------
// ToggleRow
// ---------------------------------------------------------------------------

export function ToggleRow({
  label,
  description,
  checked,
  ariaLabel,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  ariaLabel: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/40 px-3 py-2 cursor-pointer select-none">
      <div>
        <p className="text-xs font-medium text-foreground">{label}</p>
        {description && (
          <p className="text-[11px] text-muted-foreground">{description}</p>
        )}
      </div>
      <input
        type="checkbox"
        role="switch"
        aria-label={ariaLabel}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-primary cursor-pointer shrink-0"
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// formatNumber helper
// ---------------------------------------------------------------------------

export function formatNumber(v: number, step: number): string {
  if (step >= 1) return Math.round(v).toString();
  if (step >= 0.5) return (Math.round(v * 2) / 2).toFixed(1);
  if (step >= 0.1) return (Math.round(v * 10) / 10).toFixed(1);
  return (Math.round(v * 100) / 100).toFixed(2);
}
