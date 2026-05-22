/**
 * RideAnalytics — post-ride deep performance panel.
 *
 * Renders three sections:
 *   1. Power Curve (MMP chart) — bar chart of best mean power per window.
 *   2. Time in Zones — horizontal stacked bar + legend with seconds/%.
 *   3. Splits table — per-km pace, power, HR, and elevation.
 *
 * All data is derived client-side from rideStore.samples + settingsStore.
 * Nothing is fetched; nothing is persisted here.
 */

import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChevronDown, ChevronUp, BarChart2, Layers, ListOrdered } from 'lucide-react';

import { useRideStore } from '@/stores/rideStore';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  computePowerCurve,
  computeTimeInZones,
  computeSplits,
  type PowerCurvePoint,
  type ZoneTime,
  type RideSplit,
} from '@/lib/rideAnalytics';
import { formatDuration, cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Section toggle button
// ---------------------------------------------------------------------------

function SectionHeader({
  icon,
  title,
  open,
  onToggle,
  id,
  panelId,
}: {
  icon: React.ReactNode;
  title: string;
  open: boolean;
  onToggle: () => void;
  id: string;
  panelId: string;
}) {
  return (
    <button
      type="button"
      id={id}
      aria-expanded={open}
      aria-controls={panelId}
      onClick={onToggle}
      className="w-full flex items-center justify-between gap-2 group rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background transition-colors"
    >
      <div className="flex items-center gap-2">
        <span className="text-accent" aria-hidden="true">{icon}</span>
        <span className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground group-hover:text-foreground transition-colors">
          {title}
        </span>
      </div>
      {open
        ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground transition-transform" aria-hidden="true" />
        : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform" aria-hidden="true" />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Shared tooltip style
// ---------------------------------------------------------------------------

const TOOLTIP_STYLE: React.CSSProperties = {
  background:   'rgba(12, 18, 36, 0.96)',
  border:       '1px solid rgba(255,255,255,0.08)',
  borderRadius: 10,
  color:        'hsl(210 28% 96%)',
  fontSize:     12,
  boxShadow:    '0 10px 30px -12px rgba(0, 0, 0, 0.55)',
  padding:      '6px 10px',
};

// ---------------------------------------------------------------------------
// 1 · Power Curve chart
// ---------------------------------------------------------------------------

function PowerCurveChart({
  curve,
  ftpW,
}: {
  curve: PowerCurvePoint[];
  ftpW: number;
}) {
  const hasPower = curve.some((p) => p.powerW !== null);
  if (!hasPower) {
    return (
      <div className="flex items-center justify-center h-28 text-xs text-muted-foreground/60 italic">
        No power data recorded
      </div>
    );
  }

  const data = curve
    .filter((p) => p.powerW !== null)
    .map((p) => ({
      label:  p.label,
      powerW: p.powerW as number,
      pctFtp: p.pctFtp,
    }));

  return (
    <div className="h-36">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: 'hsl(215 18% 56%)' }}
            tickLine={false}
            axisLine={false}
            height={18}
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'hsl(215 18% 56%)' }}
            tickLine={false}
            axisLine={false}
            width={36}
            tickFormatter={(v) => `${v}W`}
            domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.15 / 50) * 50]}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={{ fill: 'rgba(255,255,255,0.03)' }}
            formatter={(value, _name, entry) => {
              if (value === undefined || value === null) return ['—', 'Best avg'];
              const w = Number(value);
              const d = entry.payload as { powerW: number; pctFtp: number | null };
              const pct = d.pctFtp != null ? ` (${d.pctFtp}% FTP)` : '';
              return [`${Math.round(w)} W${pct}`, 'Best avg'];
            }}
          />
          <Bar dataKey="powerW" radius={[4, 4, 0, 0]} maxBarSize={36}>
            {data.map((entry, i) => {
              // Colour bars by %FTP: grey → cyan → green → amber → red
              const pct = entry.pctFtp ?? (ftpW > 0 ? Math.round((entry.powerW / ftpW) * 100) : 100);
              const color =
                pct < 75  ? '#64748b' :
                pct < 90  ? '#22d3ee' :
                pct < 105 ? '#34d399' :
                pct < 120 ? '#fbbf24' :
                pct < 150 ? '#f97316' : '#a855f7';
              return <Cell key={i} fill={color} fillOpacity={0.85} />;
            })}
            <LabelList
              dataKey="powerW"
              position="top"
              style={{ fontSize: 9, fill: 'hsl(215 18% 56%)', fontWeight: 600 }}
              formatter={(v: unknown) => (v != null ? `${Math.round(Number(v))}` : '')}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2 · Time in Zones
// ---------------------------------------------------------------------------

function TimeInZonesChart({ zones }: { zones: ZoneTime[] }) {
  const total = zones.reduce((s, z) => s + z.seconds, 0);
  const hasPower = total > 0 && zones.some((z) => z.seconds > 0 && z.zone > 1);

  if (!hasPower) {
    return (
      <div className="flex items-center justify-center h-14 text-xs text-muted-foreground/60 italic">
        No power data — zones require FTP + power recording
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Stacked horizontal bar */}
      <div className="flex h-5 rounded-full overflow-hidden gap-px" role="img" aria-label="Time in power zones">
        {zones.map((z) =>
          z.fraction > 0.005 ? (
            <div
              key={z.zone}
              style={{ width: `${z.fraction * 100}%`, background: z.color }}
              title={`${z.label} ${z.description}: ${formatDuration(z.seconds)}`}
              className="transition-all duration-500"
            />
          ) : null,
        )}
      </div>

      {/* Legend rows */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {zones.map((z) => (
          <div key={z.zone} className="flex items-center gap-2 min-w-0">
            <div
              className="h-2.5 w-2.5 rounded-sm shrink-0"
              style={{ background: z.color }}
              aria-hidden="true"
            />
            <div className="flex-1 min-w-0 flex items-baseline justify-between gap-1">
              <span className="text-[10px] text-muted-foreground truncate">
                <span className="font-semibold text-foreground/80">{z.label}</span>
                {' '}
                <span className="hidden sm:inline">{z.description}</span>
              </span>
              <span className="text-[10px] tabular-nums num text-foreground/70 shrink-0">
                {z.seconds > 0 ? formatDuration(z.seconds) : '—'}
                {z.fraction >= 0.01 && (
                  <span className="text-muted-foreground ml-1">
                    {Math.round(z.fraction * 100)}%
                  </span>
                )}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3 · Splits table
// ---------------------------------------------------------------------------

type SortKey = 'km' | 'pace' | 'power' | 'hr' | 'ascent';

function SplitsTable({ splits }: { splits: RideSplit[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('km');
  const [sortAsc, setSortAsc] = useState(true);

  if (splits.length === 0) {
    return (
      <div className="flex items-center justify-center h-12 text-xs text-muted-foreground/60 italic">
        Ride shorter than 1 km — no splits available
      </div>
    );
  }

  const hasPower = splits.some((s) => s.avgPowerW !== null);
  const hasHr    = splits.some((s) => s.avgHrBpm !== null);

  // Sorting
  const sorted = [...splits].sort((a, b) => {
    let va = 0, vb = 0;
    if (sortKey === 'km')     { va = a.km;             vb = b.km; }
    if (sortKey === 'pace')   { va = a.secPerKm;       vb = b.secPerKm; }
    if (sortKey === 'power')  { va = a.avgPowerW ?? 0; vb = b.avgPowerW ?? 0; }
    if (sortKey === 'hr')     { va = a.avgHrBpm ?? 0;  vb = b.avgHrBpm ?? 0; }
    if (sortKey === 'ascent') { va = a.ascentM;        vb = b.ascentM; }
    return sortAsc ? va - vb : vb - va;
  });

  const Th = ({
    sk,
    children,
    className,
  }: {
    sk: SortKey;
    children: React.ReactNode;
    className?: string;
  }) => {
    const isActive = sortKey === sk;
    return (
      <th
        scope="col"
        aria-sort={isActive ? (sortAsc ? 'ascending' : 'descending') : 'none'}
        className={cn(
          'px-2.5 py-1.5 text-[9px] uppercase tracking-wide font-semibold text-muted-foreground',
          'cursor-pointer select-none hover:text-foreground transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
          isActive && 'text-accent',
          className,
        )}
        tabIndex={0}
        onClick={() => {
          if (sortKey === sk) setSortAsc((a) => !a);
          else { setSortKey(sk); setSortAsc(true); }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (sortKey === sk) setSortAsc((a) => !a);
            else { setSortKey(sk); setSortAsc(true); }
          }
        }}
      >
        {children}
        {isActive && (
          <span className="ml-0.5 opacity-60" aria-hidden="true">{sortAsc ? '↑' : '↓'}</span>
        )}
      </th>
    );
  };

  // Fastest pace for colour coding
  const minPace = Math.min(...splits.filter((s) => s.secPerKm > 0).map((s) => s.secPerKm));
  const maxPace = Math.max(...splits.filter((s) => s.secPerKm > 0).map((s) => s.secPerKm));

  return (
    <div className="rounded-xl border border-border/40 overflow-x-auto">
      <table className="w-full min-w-[20rem] text-xs">
        <thead>
          <tr className="border-b border-border/40 bg-muted/20">
            <Th sk="km"     className="text-left">KM</Th>
            <Th sk="pace"   className="text-right">Pace</Th>
            {hasPower && <Th sk="power" className="text-right">Avg W</Th>}
            {hasHr    && <Th sk="hr"    className="text-right">Avg HR</Th>}
            <Th sk="ascent" className="text-right">↑ m</Th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => {
            // Pace bar: faster = more cyan
            const paceRange = maxPace - minPace;
            const pacePct =
              paceRange > 0 && s.secPerKm > 0
                ? 1 - (s.secPerKm - minPace) / paceRange
                : 0.5;
            const paceColor = `hsl(${Math.round(lerp(0, 200, pacePct))} 80% 55%)`;

            const paceStr =
              s.secPerKm > 0
                ? `${Math.floor(s.secPerKm / 60)}:${String(Math.round(s.secPerKm % 60)).padStart(2, '0')}`
                : '—';

            return (
              <tr
                key={s.km}
                className="border-b border-border/20 last:border-0 hover:bg-muted/15 transition-colors"
              >
                <td className="px-2.5 py-1.5 font-semibold text-foreground/80 tabular-nums num">
                  {s.km}
                </td>
                <td className="px-2.5 py-1.5 text-right tabular-nums num font-semibold" style={{ color: paceColor }}>
                  {paceStr}
                  <span className="text-muted-foreground font-normal ml-0.5 text-[9px]">/km</span>
                </td>
                {hasPower && (
                  <td className="px-2.5 py-1.5 text-right tabular-nums num text-foreground">
                    {s.avgPowerW !== null ? Math.round(s.avgPowerW) : '—'}
                  </td>
                )}
                {hasHr && (
                  <td className="px-2.5 py-1.5 text-right tabular-nums num text-foreground">
                    {s.avgHrBpm !== null ? s.avgHrBpm : '—'}
                  </td>
                )}
                <td className={cn(
                  'px-2.5 py-1.5 text-right tabular-nums num',
                  s.ascentM > 20 ? 'text-emerald-400' : 'text-muted-foreground',
                )}>
                  {s.ascentM > 0.5 ? `+${Math.round(s.ascentM)}` : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

/**
 * RideAnalytics — full post-ride analytics panel.
 *
 * Reads samples/ftpW from stores; all computation is memoised.
 * Designed to be dropped into the FinishCard below the existing stats grid.
 * Returns null when there are fewer than 5 samples (too short to be meaningful).
 */
export function RideAnalytics() {
  const samples   = useRideStore((s) => s.samples);
  const ftpW      = useSettingsStore((s) => s.ftpW);
  const massKg    = useSettingsStore((s) => s.riderMassKg);

  const [curveOpen,  setCurveOpen]  = useState(true);
  const [zonesOpen,  setZonesOpen]  = useState(true);
  const [splitsOpen, setSplitsOpen] = useState(false);

  const curve  = useMemo(() => computePowerCurve(samples, ftpW, massKg), [samples, ftpW, massKg]);
  const zones  = useMemo(() => computeTimeInZones(samples, ftpW),        [samples, ftpW]);
  const splits = useMemo(() => computeSplits(samples),                   [samples]);

  if (samples.length < 5) return null;

  return (
    <div className="flex flex-col gap-4">
      {/* Divider */}
      <div className="h-px bg-border/40" aria-hidden="true" />

      {/* Section: Power Curve */}
      <div className="flex flex-col gap-2.5">
        <SectionHeader
          id="analytics-curve-header"
          panelId="analytics-curve-panel"
          icon={<BarChart2 className="h-3.5 w-3.5" />}
          title="Power Curve"
          open={curveOpen}
          onToggle={() => setCurveOpen((o) => !o)}
        />
        <div
          id="analytics-curve-panel"
          role="region"
          aria-labelledby="analytics-curve-header"
          hidden={!curveOpen}
        >
          {curveOpen && <PowerCurveChart curve={curve} ftpW={ftpW} />}
        </div>
      </div>

      {/* Section: Time in Zones */}
      <div className="flex flex-col gap-2.5">
        <SectionHeader
          id="analytics-zones-header"
          panelId="analytics-zones-panel"
          icon={<Layers className="h-3.5 w-3.5" />}
          title="Time in Zones"
          open={zonesOpen}
          onToggle={() => setZonesOpen((o) => !o)}
        />
        <div
          id="analytics-zones-panel"
          role="region"
          aria-labelledby="analytics-zones-header"
          hidden={!zonesOpen}
        >
          {zonesOpen && <TimeInZonesChart zones={zones} />}
        </div>
      </div>

      {/* Section: Splits */}
      <div className="flex flex-col gap-2.5">
        <SectionHeader
          id="analytics-splits-header"
          panelId="analytics-splits-panel"
          icon={<ListOrdered className="h-3.5 w-3.5" />}
          title={`Splits (${splits.length} km)`}
          open={splitsOpen}
          onToggle={() => setSplitsOpen((o) => !o)}
        />
        <div
          id="analytics-splits-panel"
          role="region"
          aria-labelledby="analytics-splits-header"
          hidden={!splitsOpen}
        >
          {splitsOpen && <SplitsTable splits={splits} />}
        </div>
      </div>
    </div>
  );
}
