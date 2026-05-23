/**
 * RaceLobby.tsx
 *
 * Race hub for GlobeRide — lets riders browse Active / Upcoming / Past races,
 * see leaderboards, create new races, and import races from a .race.json file
 * or a shared URL.
 *
 * Intentionally avoids touching src/lib/race/* (Wave 21.A) or RaceResultCard
 * (Wave 21.C).  Everything here calls the protocol helpers + raceStore
 * through the documented public contract.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Flag,
  Trophy,
  Clock,
  ChevronDown,
  ChevronUp,
  Plus,
  Upload,
  Link,
  Share2,
  Play,
  Trash2,
  X,
  AlertCircle,
  CheckCircle2,
  Layers,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { useRaceStore } from '@/stores/raceStore';
import { useRideStore } from '@/stores/rideStore';
import {
  createManifest,
  encodeManifestUrl,
  parseManifestFile,
  decodeManifestUrl,
  type RaceManifest,
  type RaceResult,
} from '@/lib/race/raceProtocol';
import { ICONIC_ROUTES } from '@/lib/iconicRoutes';
import { WORLD_TOUR_STAGES } from '@/lib/worldTourStages';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function now() {
  return Date.now();
}

type RacePhase = 'active' | 'upcoming' | 'past';

function phaseOf(m: RaceManifest): RacePhase {
  const t = now();
  if (t < m.utcWindow.startMs) return 'upcoming';
  if (t > m.utcWindow.endMs) return 'past';
  return 'active';
}

function routeLabel(ref: RaceManifest['routeRef']): string {
  if (ref.kind === 'iconic' && ref.routeId) {
    const found = ICONIC_ROUTES.find((r) => r.route.id === ref.routeId);
    if (found) return found.climbName;
  }
  if (ref.kind === 'wts' && ref.stageId) {
    const found = WORLD_TOUR_STAGES.find((s) => s.route.id === ref.stageId);
    if (found) return found.info.name;
  }
  if (ref.kind === 'inline' && ref.route) return ref.route.name;
  return 'Custom route';
}

function routeForManifest(ref: RaceManifest['routeRef']) {
  if (ref.kind === 'iconic' && ref.routeId) {
    return ICONIC_ROUTES.find((r) => r.route.id === ref.routeId)?.route ?? null;
  }
  if (ref.kind === 'wts' && ref.stageId) {
    return WORLD_TOUR_STAGES.find((s) => s.route.id === ref.stageId)?.route ?? null;
  }
  if (ref.kind === 'inline') return ref.route ?? null;
  return null;
}

function formatDuration(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── Countdown hook ───────────────────────────────────────────────────────────

function useCountdown(targetMs: number) {
  const [remaining, setRemaining] = useState(() => Math.max(0, targetMs - now()));

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setInterval(() => {
      const r = Math.max(0, targetMs - now());
      setRemaining(r);
      if (r <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [targetMs, remaining]);

  const d = Math.floor(remaining / 86_400_000);
  const h = Math.floor((remaining % 86_400_000) / 3_600_000);
  const m = Math.floor((remaining % 3_600_000) / 60_000);
  const s = Math.floor((remaining % 60_000) / 1000);

  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Pill label for the three phases. */
function PhaseBadge({ phase }: { phase: RacePhase }) {
  if (phase === 'active') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
        </span>
        Live
      </span>
    );
  }
  if (phase === 'upcoming') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
        <Clock className="h-2.5 w-2.5" />
        Upcoming
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 text-muted-foreground border border-border/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
      <Trophy className="h-2.5 w-2.5" />
      Past
    </span>
  );
}

/** One row in the leaderboard. */
function LeaderboardRow({
  rank,
  result,
}: {
  rank: number;
  result: RaceResult;
}) {
  const medalColors = ['text-yellow-400', 'text-slate-300', 'text-amber-600'];
  const rankColor = rank <= 3 ? medalColors[rank - 1] : 'text-muted-foreground';

  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-border/40 last:border-0">
      <span className={cn('w-5 text-center text-xs font-bold num shrink-0', rankColor)}>
        {rank}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground truncate">{result.rider.name}</div>
        {result.avgPowerW && (
          <div className="text-[11px] text-muted-foreground num">
            {Math.round(result.avgPowerW)} W avg
            {result.rider.weightKg
              ? ` · ${(result.avgPowerW / result.rider.weightKg).toFixed(2)} W/kg`
              : ''}
          </div>
        )}
      </div>
      <span className="text-sm font-semibold num text-foreground shrink-0">
        {formatDuration(result.finishTimeMs)}
      </span>
    </div>
  );
}

/** Countdown display for upcoming races. */
function CountdownDisplay({ targetMs }: { targetMs: number }) {
  const label = useCountdown(targetMs);
  return (
    <div className="flex items-center gap-1.5 text-cyan-400">
      <Clock className="h-3.5 w-3.5 shrink-0" />
      <span className="text-sm font-semibold num tabular-nums">{label}</span>
    </div>
  );
}

/** Expandable per-race card. */
function RaceCard({
  manifest,
  results,
  onRide,
  onRemove,
}: {
  manifest: RaceManifest;
  results: RaceResult[];
  onRide: (m: RaceManifest) => void;
  onRemove: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const phase = phaseOf(manifest);

  const handleShare = async () => {
    const url = encodeManifestUrl(manifest);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback: open prompt
      window.prompt('Copy this race link:', url);
    }
  };

  const accentClass =
    phase === 'active'
      ? 'border-emerald-500/30 ring-1 ring-emerald-500/20'
      : phase === 'upcoming'
        ? 'border-cyan-500/25 ring-1 ring-cyan-500/15'
        : 'border-border/60';

  return (
    <div
      className={cn(
        'rounded-2xl border bg-card/70 glass overflow-hidden transition-all duration-200',
        accentClass,
        phase === 'active' && 'hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-12px_rgb(52_211_153/0.25)]',
      )}
    >
      {/* Card header — always visible */}
      <button
        className="w-full text-left p-4 flex items-start gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {/* Flag icon */}
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
            phase === 'active'
              ? 'bg-emerald-500/15 text-emerald-400'
              : phase === 'upcoming'
                ? 'bg-cyan-500/15 text-cyan-400'
                : 'bg-muted/50 text-muted-foreground',
          )}
        >
          <Flag className="h-4 w-4" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground leading-snug truncate">
              {manifest.name}
            </span>
            <PhaseBadge phase={phase} />
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="truncate">{routeLabel(manifest.routeRef)}</span>
            {manifest.organiser && (
              <>
                <span className="opacity-40">·</span>
                <span className="truncate">{manifest.organiser.name}</span>
              </>
            )}
            {results.length > 0 && (
              <>
                <span className="opacity-40">·</span>
                <span className="num">{results.length} result{results.length !== 1 ? 's' : ''}</span>
              </>
            )}
          </div>

          {/* Phase-specific secondary info */}
          <div className="mt-1.5">
            {phase === 'upcoming' && (
              <CountdownDisplay targetMs={manifest.utcWindow.startMs} />
            )}
            {phase === 'active' && (
              <div className="flex items-center gap-1.5 text-emerald-400 text-xs">
                <span className="num">Closes {formatDate(manifest.utcWindow.endMs)}</span>
              </div>
            )}
            {phase === 'past' && results.length > 0 && (
              <div className="text-xs text-muted-foreground num">
                Winner: <span className="text-foreground font-medium">{results[0].rider.name}</span>
                {' '}&mdash;{' '}{formatDuration(results[0].finishTimeMs)}
              </div>
            )}
          </div>
        </div>

        {/* Expand chevron */}
        <span className="text-muted-foreground shrink-0 mt-1">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {/* Expanded detail panel */}
      {expanded && (
        <div className="border-t border-border/40 px-4 pb-4 pt-3 space-y-3 animate-fadeUp">
          {/* Description */}
          {manifest.description && (
            <p className="text-sm text-muted-foreground leading-relaxed">{manifest.description}</p>
          )}

          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <MetaCell label="Opens" value={formatDate(manifest.utcWindow.startMs)} />
            <MetaCell label="Closes" value={formatDate(manifest.utcWindow.endMs)} />
            <MetaCell label="Route" value={routeLabel(manifest.routeRef)} />
            {manifest.rules.laps && (
              <MetaCell label="Laps" value={String(manifest.rules.laps)} />
            )}
            {manifest.rules.minSpeedKmh && (
              <MetaCell label="Min speed" value={`${manifest.rules.minSpeedKmh} km/h`} />
            )}
            {manifest.rules.maxAvgPowerWPerKg && (
              <MetaCell label="Max W/kg" value={`${manifest.rules.maxAvgPowerWPerKg}`} />
            )}
          </div>

          {/* Leaderboard */}
          {results.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2 flex items-center gap-1.5">
                <Trophy className="h-3 w-3" />
                Leaderboard
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-1">
                {results.slice(0, 10).map((r, i) => (
                  <LeaderboardRow key={r.rideHash} rank={i + 1} result={r} />
                ))}
                {results.length > 10 && (
                  <p className="text-center text-xs text-muted-foreground py-1.5">
                    +{results.length - 10} more
                  </p>
                )}
              </div>
            </div>
          )}

          {results.length === 0 && phase === 'past' && (
            <p className="text-xs text-muted-foreground italic">No results recorded yet.</p>
          )}

          {/* CTAs */}
          <div className="flex flex-wrap gap-2 pt-1">
            {(phase === 'active' || phase === 'upcoming') && (
              <Button size="sm" variant="accent" onClick={() => onRide(manifest)}>
                <Play className="h-3.5 w-3.5" />
                Ride this race
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={handleShare}>
              {copied ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  Copied!
                </>
              ) : (
                <>
                  <Share2 className="h-3.5 w-3.5" />
                  Share race
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive ml-auto"
              onClick={() => onRemove(manifest.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground uppercase tracking-wider text-[9px] font-semibold">{label}</span>
      <span className="text-foreground font-medium num">{value}</span>
    </div>
  );
}

// ─── Create Race Modal ─────────────────────────────────────────────────────────

type RouteOption = { label: string; kind: RaceManifest['routeRef']['kind']; id: string };

function buildRouteOptions(): RouteOption[] {
  const iconic: RouteOption[] = ICONIC_ROUTES.map((r) => ({
    label: r.climbName,
    kind: 'iconic',
    id: r.route.id,
  }));
  const wts: RouteOption[] = WORLD_TOUR_STAGES.map((s) => ({
    label: s.info.name,
    kind: 'wts',
    id: s.route.id,
  }));
  return [...iconic, ...wts];
}

interface CreateRaceModalProps {
  onClose: () => void;
  onCreate: (m: RaceManifest) => void;
}

function CreateRaceModal({ onClose, onCreate }: CreateRaceModalProps) {
  const routeOptions = buildRouteOptions();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [organiser, setOrganiser] = useState('');
  const [selectedRoute, setSelectedRoute] = useState(routeOptions[0]?.id ?? '');
  const [startDate, setStartDate] = useState(() => {
    // Default: tomorrow
    const d = new Date(Date.now() + 86_400_000);
    d.setSeconds(0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date(Date.now() + 7 * 86_400_000);
    d.setSeconds(0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [laps, setLaps] = useState('');
  const [minSpeed, setMinSpeed] = useState('');
  const [maxWkg, setMaxWkg] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) { setError('Race name is required.'); return; }

    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime();
    if (isNaN(startMs) || isNaN(endMs)) { setError('Invalid date.'); return; }
    if (endMs <= startMs) { setError('End date must be after start date.'); return; }

    const opt = routeOptions.find((r) => r.id === selectedRoute);
    if (!opt) { setError('Select a route.'); return; }

    const routeRef: RaceManifest['routeRef'] =
      opt.kind === 'iconic'
        ? { kind: 'iconic', routeId: opt.id }
        : { kind: 'wts', stageId: opt.id };

    const rules: RaceManifest['rules'] = {};
    if (laps) rules.laps = parseInt(laps, 10);
    if (minSpeed) rules.minSpeedKmh = parseFloat(minSpeed);
    if (maxWkg) rules.maxAvgPowerWPerKg = parseFloat(maxWkg);

    const manifest = createManifest({
      name: name.trim(),
      description: description.trim() || undefined,
      organiser: organiser.trim() ? { name: organiser.trim() } : undefined,
      routeRef,
      utcWindow: { startMs, endMs },
      rules,
    });

    onCreate(manifest);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-border/60 bg-card glass shadow-2xl animate-fadeUp max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border/40">
          <div className="flex items-center gap-2">
            <Flag className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-widest">Create a race</h2>
          </div>
          <button
            className="text-muted-foreground hover:text-foreground transition-colors rounded-md p-1 hover:bg-muted/50"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {/* Name */}
          <Field label="Race name *">
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Club Grimpeurs Sprint Series"
              autoFocus
              maxLength={80}
            />
          </Field>

          {/* Description */}
          <Field label="Description">
            <textarea
              className={cn(inputCls, 'min-h-[64px] resize-y')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional details about the race…"
              maxLength={500}
            />
          </Field>

          {/* Organiser */}
          <Field label="Organiser">
            <input
              className={inputCls}
              value={organiser}
              onChange={(e) => setOrganiser(e.target.value)}
              placeholder="Your name or club"
              maxLength={60}
            />
          </Field>

          {/* Route */}
          <Field label="Route *">
            <select
              className={inputCls}
              value={selectedRoute}
              onChange={(e) => setSelectedRoute(e.target.value)}
            >
              <optgroup label="Iconic Climbs">
                {routeOptions
                  .filter((r) => r.kind === 'iconic')
                  .map((r) => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
              </optgroup>
              <optgroup label="World Tour Stages">
                {routeOptions
                  .filter((r) => r.kind === 'wts')
                  .map((r) => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
              </optgroup>
            </select>
          </Field>

          {/* Window */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Opens *">
              <input
                className={inputCls}
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </Field>
            <Field label="Closes *">
              <input
                className={inputCls}
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </Field>
          </div>

          {/* Rules (collapsible) */}
          <details className="group">
            <summary className="cursor-pointer flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors list-none select-none">
              <span className="group-open:rotate-90 transition-transform inline-block">›</span>
              Advanced rules (optional)
            </summary>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <Field label="Laps">
                <input
                  className={inputCls}
                  type="number"
                  min="1"
                  max="99"
                  value={laps}
                  onChange={(e) => setLaps(e.target.value)}
                  placeholder="1"
                />
              </Field>
              <Field label="Min km/h">
                <input
                  className={inputCls}
                  type="number"
                  min="0"
                  step="0.1"
                  value={minSpeed}
                  onChange={(e) => setMinSpeed(e.target.value)}
                  placeholder="—"
                />
              </Field>
              <Field label="Max W/kg">
                <input
                  className={inputCls}
                  type="number"
                  min="0"
                  step="0.1"
                  value={maxWkg}
                  onChange={(e) => setMaxWkg(e.target.value)}
                  placeholder="—"
                />
              </Field>
            </div>
          </details>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="default" size="sm">
              <Flag className="h-3.5 w-3.5" />
              Create race
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputCls =
  'w-full rounded-lg border border-border/70 bg-muted/30 px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 focus:ring-offset-background transition';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

// ─── Import Race Modal ─────────────────────────────────────────────────────────

interface ImportRaceModalProps {
  onClose: () => void;
  onImport: (m: RaceManifest) => void;
}

function ImportRaceModal({ onClose, onImport }: ImportRaceModalProps) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setLoading(true);
    try {
      const manifest = await parseManifestFile(file);
      onImport(manifest);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error reading file.');
    } finally {
      setLoading(false);
    }
  };

  const handleUrl = () => {
    setError('');
    const manifest = decodeManifestUrl(url.trim());
    if (!manifest) {
      setError('Could not decode race from that URL. Make sure you pasted the full share link.');
      return;
    }
    onImport(manifest);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative w-full max-w-md rounded-2xl border border-border/60 bg-card glass shadow-2xl animate-fadeUp">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border/40">
          <div className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-widest">Import a race</h2>
          </div>
          <button
            className="text-muted-foreground hover:text-foreground transition-colors rounded-md p-1 hover:bg-muted/50"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* File picker */}
          <div>
            <div className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-2">
              From a .race.json file
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".json,.race.json"
              onChange={handleFile}
              className="hidden"
            />
            <button
              type="button"
              className="w-full rounded-xl border-2 border-dashed border-border/60 bg-muted/20 hover:bg-muted/40 hover:border-primary/40 transition-all p-5 flex flex-col items-center gap-2 text-muted-foreground hover:text-foreground"
              onClick={() => fileRef.current?.click()}
              disabled={loading}
            >
              <Upload className="h-6 w-6" />
              <span className="text-sm font-medium">Click to pick a .race.json</span>
              <span className="text-xs">Shared by a race organiser</span>
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border/60" />
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground/70">or paste a share link</span>
            <div className="h-px flex-1 bg-border/60" />
          </div>

          {/* URL paste */}
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 rounded-lg border border-border/70 bg-muted/30 px-3">
              <Link className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <input
                className="flex-1 bg-transparent py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                placeholder="https://globeride.app?race=..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUrl()}
              />
            </div>
            <Button size="sm" variant="outline" onClick={handleUrl} disabled={!url.trim()}>
              Load
            </Button>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({
  icon,
  label,
  count,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {icon}
      <span className="text-xs font-semibold uppercase tracking-widest text-foreground/80">{label}</span>
      {count > 0 && (
        <span className="ml-1 rounded-full bg-muted/60 border border-border/60 px-1.5 py-0.5 text-[10px] font-semibold num text-muted-foreground">
          {count}
        </span>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function RaceLobby() {
  const navigate = useNavigate();
  const { loadedManifests, localResults, loadManifest, removeManifest } = useRaceStore();
  const setRoute = useRideStore((s) => s.setRoute);

  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // Sort manifests into phases
  const activeRaces = loadedManifests.filter((m) => phaseOf(m) === 'active');
  const upcomingRaces = loadedManifests.filter((m) => phaseOf(m) === 'upcoming')
    .sort((a, b) => a.utcWindow.startMs - b.utcWindow.startMs);
  const pastRaces = loadedManifests.filter((m) => phaseOf(m) === 'past')
    .sort((a, b) => b.utcWindow.endMs - a.utcWindow.endMs);

  const handleRide = useCallback((manifest: RaceManifest) => {
    const route = routeForManifest(manifest.routeRef);
    if (route) setRoute(route);
    navigate('/ride');
  }, [navigate, setRoute]);

  const handleCreate = useCallback((manifest: RaceManifest) => {
    loadManifest(manifest);
    setShowCreate(false);
  }, [loadManifest]);

  const handleImport = useCallback((manifest: RaceManifest) => {
    loadManifest(manifest);
    setShowImport(false);
  }, [loadManifest]);

  const isEmpty = loadedManifests.length === 0;

  return (
    <>
      {/* Header strip */}
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Flag className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground leading-tight">Races</div>
            <div className="text-[11px] text-muted-foreground leading-tight">
              {isEmpty ? 'No races yet' : `${loadedManifests.length} race${loadedManifests.length !== 1 ? 's' : ''} loaded`}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowImport(true)}
          >
            <Upload className="h-3.5 w-3.5" />
            Import
          </Button>
          <Button
            size="sm"
            variant="default"
            onClick={() => setShowCreate(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Create race
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {isEmpty && (
        <EmptyState
          onCreate={() => setShowCreate(true)}
          onImport={() => setShowImport(true)}
        />
      )}

      {/* Active races */}
      {activeRaces.length > 0 && (
        <section className="mb-6">
          <SectionHeader
            icon={<span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" /></span>}
            label="Active now"
            count={activeRaces.length}
          />
          <div className="space-y-3">
            {activeRaces.map((m) => (
              <RaceCard
                key={m.id}
                manifest={m}
                results={localResults[m.id] ?? []}
                onRide={handleRide}
                onRemove={removeManifest}
              />
            ))}
          </div>
        </section>
      )}

      {/* Upcoming races */}
      {upcomingRaces.length > 0 && (
        <section className="mb-6">
          <SectionHeader
            icon={<Clock className="h-3.5 w-3.5 text-cyan-400" />}
            label="Upcoming"
            count={upcomingRaces.length}
          />
          <div className="space-y-3">
            {upcomingRaces.map((m) => (
              <RaceCard
                key={m.id}
                manifest={m}
                results={localResults[m.id] ?? []}
                onRide={handleRide}
                onRemove={removeManifest}
              />
            ))}
          </div>
        </section>
      )}

      {/* Past races */}
      {pastRaces.length > 0 && (
        <section className="mb-6">
          <SectionHeader
            icon={<Trophy className="h-3.5 w-3.5 text-amber-400" />}
            label="Past races"
            count={pastRaces.length}
          />
          <div className="space-y-3">
            {pastRaces.map((m) => (
              <RaceCard
                key={m.id}
                manifest={m}
                results={localResults[m.id] ?? []}
                onRide={handleRide}
                onRemove={removeManifest}
              />
            ))}
          </div>
        </section>
      )}

      {/* Modals */}
      {showCreate && (
        <CreateRaceModal onClose={() => setShowCreate(false)} onCreate={handleCreate} />
      )}
      {showImport && (
        <ImportRaceModal onClose={() => setShowImport(false)} onImport={handleImport} />
      )}
    </>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({
  onCreate,
  onImport,
}: {
  onCreate: () => void;
  onImport: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
      {/* Big decorative flag */}
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-primary/10 blur-2xl scale-150" aria-hidden />
        <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl border border-primary/20 bg-primary/8 text-primary">
          <Flag className="h-9 w-9" />
        </div>
      </div>

      <div className="space-y-1.5 max-w-xs">
        <h3 className="text-base font-semibold text-foreground">No races yet</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Import a race from a friend&rsquo;s share link or .race.json file, or create your own and challenge your club.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Button variant="outline" onClick={onImport}>
          <Upload className="h-4 w-4" />
          Import a race
        </Button>
        <Button variant="default" onClick={onCreate}>
          <Plus className="h-4 w-4" />
          Create a race
        </Button>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-muted/20 px-4 py-3 text-xs text-muted-foreground max-w-xs">
        <Layers className="h-4 w-4 shrink-0 text-primary/60" />
        <span>Results are stored locally — no account required.</span>
      </div>
    </div>
  );
}
