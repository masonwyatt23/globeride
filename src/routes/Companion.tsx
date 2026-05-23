/**
 * Companion.tsx — Phone companion screen for GlobeRide.
 *
 * Optimised for a phone held in portrait: large tap targets (≥56 px), giant
 * metric typography, no hover-only interactions.
 *
 * What it does:
 *   - Pairs HR and Cadence BLE sensors independently of the tablet.
 *   - Broadcasts each sensor reading to the tablet via BroadcastChannel.
 *   - Receives workout-segment updates and toast events from the tablet.
 *   - Provides Pause / Resume / Mark Lap / Next Segment remote-control buttons.
 *   - Shows a scrolling activity feed of the last 20 tablet toasts.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Activity,
  Bluetooth,
  BluetoothConnected,
  BluetoothOff,
  ChevronRight,
  Flag,
  Heart,
  Loader2,
  Pause,
  Play,
  SkipForward,
  Wifi,
  WifiOff,
} from 'lucide-react';

import {
  connectHr,
  disconnectHr,
  onHrData,
  onHrStatus,
  hrDeviceName,
  connectCadence,
  disconnectCadence,
  onCadenceData,
  onCadenceStatus,
  cadenceDeviceName,
} from '@/lib/bleSensors';
import {
  openCompanionChannel,
  PRESENCE_TIMEOUT_MS,
  type CompanionChannel,
  type CompanionMessage,
} from '@/lib/companion/companionChannel';
import type { SensorConnectionStatus } from '@/lib/bleSensors';
import { detectBluetoothSupport } from '@/lib/bluetoothSupport';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorkoutSegmentState {
  label: string;
  targetLabel: string;
  remainingSec: number;
  durationSec: number;
  workoutElapsedSec: number;
  workoutDurationSec: number;
  receivedAt: number;
}

interface ActivityEntry {
  id: string;
  kind: 'success' | 'info' | 'warning' | 'error';
  title: string;
  message?: string;
  receivedAt: number;
}

// ---------------------------------------------------------------------------
// Main route component
// ---------------------------------------------------------------------------

export function Companion() {
  // ── BroadcastChannel ──────────────────────────────────────────────────
  const chRef = useRef<CompanionChannel | null>(null);
  const [tabletSeen, setTabletSeen] = useState<number>(0); // epoch ms of last hello/bye from tablet

  // ── HR sensor state ───────────────────────────────────────────────────
  const [hrStatus, setHrStatus] = useState<SensorConnectionStatus>('disconnected');
  const [hrBpm, setHrBpm]       = useState<number | null>(null);
  const [hrDevice, setHrDevice] = useState<string | null>(null);
  const [hrError, setHrError]   = useState<string | null>(null);

  // ── Cadence sensor state ──────────────────────────────────────────────
  const [cadStatus, setCadStatus] = useState<SensorConnectionStatus>('disconnected');
  const [cadRpm, setCadRpm]       = useState<number | null>(null);
  const [cadDevice, setCadDevice] = useState<string | null>(null);
  const [cadError, setCadError]   = useState<string | null>(null);

  // ── Workout segment from tablet ───────────────────────────────────────
  const [segment, setSegment] = useState<WorkoutSegmentState | null>(null);

  // ── Activity feed ─────────────────────────────────────────────────────
  const [feed, setFeed] = useState<ActivityEntry[]>([]);

  // ── Tablet presence ───────────────────────────────────────────────────
  const tabletConnected = tabletSeen > 0 && Date.now() - tabletSeen < PRESENCE_TIMEOUT_MS;

  // ── Open companion channel ────────────────────────────────────────────
  useEffect(() => {
    const ch = openCompanionChannel('phone');
    chRef.current = ch;

    const unsub = ch.onMessage((msg: CompanionMessage) => {
      switch (msg.type) {
        case 'hello':
        case 'bye':
          if (msg.role === 'tablet') setTabletSeen(msg.t);
          break;

        case 'workout-segment':
          setSegment({
            label:              msg.label,
            targetLabel:        msg.targetLabel,
            remainingSec:       msg.remainingSec,
            durationSec:        msg.durationSec,
            workoutElapsedSec:  msg.workoutElapsedSec,
            workoutDurationSec: msg.workoutDurationSec,
            receivedAt:         Date.now(),
          });
          // Any workout-segment message means the tablet is alive.
          setTabletSeen(msg.t);
          break;

        case 'toast':
          setFeed((prev) => {
            // De-dupe by id.
            const filtered = prev.filter((e) => e.id !== msg.id);
            const next: ActivityEntry[] = [
              ...filtered,
              { id: msg.id, kind: msg.kind, title: msg.title, message: msg.message, receivedAt: Date.now() },
            ];
            // Keep last 20 only.
            return next.slice(-20);
          });
          break;

        default:
          break;
      }
    });

    // Periodically re-announce presence so the tablet sees us as live.
    const heartbeat = setInterval(() => {
      ch.post({ type: 'hello', role: 'phone', t: Date.now() });
    }, 3_000);

    return () => {
      unsub();
      clearInterval(heartbeat);
      ch.close();
      chRef.current = null;
    };
  }, []);

  // ── Wire HR BLE → broadcast ───────────────────────────────────────────
  useEffect(() => {
    onHrStatus((s) => {
      setHrStatus(s);
      setHrDevice(hrDeviceName());
      if (s !== 'connected') setHrBpm(null);
    });
    onHrData((bpm) => {
      setHrBpm(bpm);
      chRef.current?.post({ type: 'hr', bpm, t: Date.now() });
    });
    return () => {
      onHrStatus(null);
      onHrData(null);
    };
  }, []);

  // ── Wire Cadence BLE → broadcast ─────────────────────────────────────
  useEffect(() => {
    onCadenceStatus((s) => {
      setCadStatus(s);
      setCadDevice(cadenceDeviceName());
      if (s !== 'connected') setCadRpm(null);
    });
    onCadenceData((rpm) => {
      setCadRpm(rpm);
      chRef.current?.post({ type: 'cadence', rpm, t: Date.now() });
    });
    return () => {
      onCadenceStatus(null);
      onCadenceData(null);
    };
  }, []);

  // ── HR pair handlers ──────────────────────────────────────────────────
  const handlePairHr = useCallback(async () => {
    setHrError(null);
    try {
      await connectHr();
    } catch (err) {
      setHrError(err instanceof Error ? err.message : 'Failed to connect HR monitor');
    }
  }, []);

  const handleUnpairHr = useCallback(async () => {
    await disconnectHr().catch(() => undefined);
    setHrStatus('disconnected');
    setHrBpm(null);
  }, []);

  // ── Cadence pair handlers ─────────────────────────────────────────────
  const handlePairCad = useCallback(async () => {
    setCadError(null);
    try {
      await connectCadence();
    } catch (err) {
      setCadError(err instanceof Error ? err.message : 'Failed to connect cadence sensor');
    }
  }, []);

  const handleUnpairCad = useCallback(async () => {
    await disconnectCadence().catch(() => undefined);
    setCadStatus('disconnected');
    setCadRpm(null);
  }, []);

  // ── Remote control ────────────────────────────────────────────────────
  const sendControl = useCallback((action: 'pause' | 'resume' | 'lap' | 'next-segment') => {
    chRef.current?.post({ type: 'remote-control', action, t: Date.now() });
  }, []);

  const bleUsable = detectBluetoothSupport().usable;

  return (
    <div
      className="fixed inset-0 flex flex-col bg-[#0a0a0f] text-white overflow-y-auto"
      style={{
        paddingTop:    'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <CompanionHeader tabletConnected={tabletConnected} />

      <div className="flex flex-col gap-4 px-4 pb-6 pt-2">
        {/* ── HR card ──────────────────────────────────────────────────── */}
        <HrCard
          status={hrStatus}
          bpm={hrBpm}
          deviceName={hrDevice}
          error={hrError}
          bleUsable={bleUsable}
          onPair={handlePairHr}
          onUnpair={handleUnpairHr}
        />

        {/* ── Cadence card ─────────────────────────────────────────────── */}
        <CadenceCard
          status={cadStatus}
          rpm={cadRpm}
          deviceName={cadDevice}
          error={cadError}
          bleUsable={bleUsable}
          onPair={handlePairCad}
          onUnpair={handleUnpairCad}
        />

        {/* ── Workout segment card ──────────────────────────────────────── */}
        <WorkoutSegmentCard segment={segment} />

        {/* ── Remote control row ────────────────────────────────────────── */}
        <RemoteControlRow onAction={sendControl} />

        {/* ── Activity feed ─────────────────────────────────────────────── */}
        <ActivityFeed entries={feed} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function CompanionHeader({ tabletConnected }: { tabletConnected: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
      <div className="flex items-center gap-2.5">
        {/* Globe icon — inline SVG matching GlobeRide branding */}
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center shrink-0">
          <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4 text-black" aria-hidden="true">
            <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
            <ellipse cx="10" cy="10" rx="3.5" ry="8" stroke="currentColor" strokeWidth="1.5" />
            <line x1="2" y1="10" x2="18" y2="10" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </div>
        <div>
          <div className="text-sm font-semibold leading-none text-white">GlobeRide</div>
          <div className="text-[11px] text-white/40 leading-none mt-0.5">Companion</div>
        </div>
      </div>

      {/* Tablet connection pill */}
      <div
        aria-label={tabletConnected ? 'Connected to tablet' : 'Waiting for tablet'}
        className={[
          'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors duration-300',
          tabletConnected
            ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30'
            : 'bg-white/6 text-white/40 ring-1 ring-white/10',
        ].join(' ')}
      >
        {tabletConnected
          ? <Wifi className="h-3 w-3 shrink-0" aria-hidden="true" />
          : <WifiOff className="h-3 w-3 shrink-0" aria-hidden="true" />}
        {tabletConnected ? 'Tablet connected' : 'Waiting for tablet'}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HR Card
// ---------------------------------------------------------------------------

interface HrCardProps {
  status: SensorConnectionStatus;
  bpm: number | null;
  deviceName: string | null;
  error: string | null;
  bleUsable: boolean;
  onPair: () => void;
  onUnpair: () => void;
}

function HrCard({ status, bpm, deviceName, error, bleUsable, onPair, onUnpair }: HrCardProps) {
  const isConnected = status === 'connected';
  const isBusy = status === 'connecting' || status === 'reconnecting';

  return (
    <MetricCard
      accent="rose"
      icon={
        <Heart
          className={['h-5 w-5', isConnected ? 'text-rose-400 animate-pulse' : 'text-white/30'].join(' ')}
          aria-hidden="true"
        />
      }
      label="Heart rate"
      deviceName={deviceName}
      status={status}
      error={error}
      bleUsable={bleUsable}
      isBusy={isBusy}
      isConnected={isConnected}
      onPair={onPair}
      onUnpair={onUnpair}
      pairLabel="Pair HR monitor"
    >
      {isConnected ? (
        <div className="flex items-end gap-2 mt-1">
          <span className="text-[6rem] leading-none font-black tabular-nums text-rose-100 tracking-tighter">
            {bpm !== null ? Math.round(bpm) : '—'}
          </span>
          <span className="text-xl font-medium text-rose-300/70 mb-3">bpm</span>
        </div>
      ) : (
        <div className="text-[6rem] leading-none font-black tabular-nums text-white/10 tracking-tighter mt-1">
          —
        </div>
      )}
    </MetricCard>
  );
}

// ---------------------------------------------------------------------------
// Cadence Card
// ---------------------------------------------------------------------------

interface CadenceCardProps {
  status: SensorConnectionStatus;
  rpm: number | null;
  deviceName: string | null;
  error: string | null;
  bleUsable: boolean;
  onPair: () => void;
  onUnpair: () => void;
}

function CadenceCard({ status, rpm, deviceName, error, bleUsable, onPair, onUnpair }: CadenceCardProps) {
  const isConnected = status === 'connected';
  const isBusy = status === 'connecting' || status === 'reconnecting';

  return (
    <MetricCard
      accent="emerald"
      icon={
        <Activity
          className={['h-5 w-5', isConnected ? 'text-emerald-400' : 'text-white/30'].join(' ')}
          aria-hidden="true"
        />
      }
      label="Cadence"
      deviceName={deviceName}
      status={status}
      error={error}
      bleUsable={bleUsable}
      isBusy={isBusy}
      isConnected={isConnected}
      onPair={onPair}
      onUnpair={onUnpair}
      pairLabel="Pair cadence sensor"
    >
      {isConnected ? (
        <div className="flex items-end gap-2 mt-1">
          <span className="text-[6rem] leading-none font-black tabular-nums text-emerald-100 tracking-tighter">
            {rpm !== null ? Math.round(rpm) : '—'}
          </span>
          <span className="text-xl font-medium text-emerald-300/70 mb-3">rpm</span>
        </div>
      ) : (
        <div className="text-[6rem] leading-none font-black tabular-nums text-white/10 tracking-tighter mt-1">
          —
        </div>
      )}
    </MetricCard>
  );
}

// ---------------------------------------------------------------------------
// Shared MetricCard wrapper
// ---------------------------------------------------------------------------

interface MetricCardProps {
  accent: 'rose' | 'emerald';
  icon: React.ReactNode;
  label: string;
  deviceName: string | null;
  status: SensorConnectionStatus;
  error: string | null;
  bleUsable: boolean;
  isBusy: boolean;
  isConnected: boolean;
  onPair: () => void;
  onUnpair: () => void;
  pairLabel: string;
  children: React.ReactNode;
}

function MetricCard({
  accent,
  icon,
  label,
  deviceName,
  status,
  error,
  bleUsable,
  isBusy,
  isConnected,
  onPair,
  onUnpair,
  pairLabel,
  children,
}: MetricCardProps) {
  const accentRing = accent === 'rose'
    ? 'ring-rose-500/25'
    : 'ring-emerald-500/25';
  const cardBg = isConnected
    ? accent === 'rose'
      ? 'bg-rose-950/30'
      : 'bg-emerald-950/30'
    : 'bg-white/4';

  return (
    <div
      className={[
        'rounded-2xl p-5 ring-1 transition-colors duration-300',
        cardBg,
        isConnected ? accentRing : 'ring-white/8',
      ].join(' ')}
    >
      {/* Card header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SensorStatusIcon status={status} bleUsable={bleUsable} />
          <div>
            <div className="text-sm font-semibold text-white/90">
              {isConnected ? (deviceName ?? label) : label}
            </div>
            {isConnected && (
              <div className="text-[11px] text-white/40 leading-none mt-0.5">
                Streaming · broadcasting to tablet
              </div>
            )}
          </div>
        </div>
        {icon}
      </div>

      {/* Big number */}
      {children}

      {/* Error */}
      {status === 'error' && error && (
        <div className="mt-3 rounded-xl bg-red-500/10 ring-1 ring-red-500/20 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Action button */}
      <div className="mt-4">
        {!isConnected ? (
          <button
            type="button"
            onClick={onPair}
            disabled={isBusy || !bleUsable}
            aria-label={isBusy ? 'Connecting…' : !bleUsable ? 'Web Bluetooth unavailable' : pairLabel}
            aria-busy={isBusy}
            className={[
              'w-full flex items-center justify-center gap-2 rounded-xl py-4 text-sm font-semibold',
              'transition-all duration-200 active:scale-[0.97]',
              isBusy || !bleUsable
                ? 'bg-white/6 text-white/30 cursor-not-allowed'
                : accent === 'rose'
                  ? 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30 hover:bg-rose-500/20'
                  : 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30 hover:bg-emerald-500/20',
            ].join(' ')}
          >
            {isBusy
              ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              : !bleUsable
                ? <BluetoothOff className="h-4 w-4" aria-hidden="true" />
                : <Bluetooth className="h-4 w-4" aria-hidden="true" />}
            {isBusy ? 'Connecting…' : !bleUsable ? 'Web Bluetooth unavailable' : pairLabel}
          </button>
        ) : (
          <button
            type="button"
            onClick={onUnpair}
            aria-label={`Disconnect sensor`}
            className="w-full flex items-center justify-center gap-2 rounded-xl py-4 text-sm font-semibold text-white/40 bg-white/4 ring-1 ring-white/8 transition-all duration-200 active:scale-[0.97] hover:bg-white/8"
          >
            Disconnect
          </button>
        )}
      </div>
    </div>
  );
}

function SensorStatusIcon({ status, bleUsable }: { status: SensorConnectionStatus; bleUsable: boolean }) {
  if (status === 'connected') {
    return <BluetoothConnected className="h-5 w-5 text-emerald-400" aria-hidden="true" />;
  }
  if (status === 'connecting' || status === 'reconnecting') {
    return <Loader2 className="h-5 w-5 text-blue-400 animate-spin" aria-hidden="true" />;
  }
  if (status === 'error' || !bleUsable) {
    return <BluetoothOff className="h-5 w-5 text-red-400" aria-hidden="true" />;
  }
  return <Bluetooth className="h-5 w-5 text-white/30" aria-hidden="true" />;
}

// ---------------------------------------------------------------------------
// Workout Segment Card
// ---------------------------------------------------------------------------

function WorkoutSegmentCard({ segment }: { segment: WorkoutSegmentState | null }) {
  // Stale if last update was >5 s ago.
  const isStale = segment !== null && Date.now() - segment.receivedAt > 5_000;
  const show = segment && !isStale;

  const progressPct = show
    ? Math.round(((segment.workoutElapsedSec) / Math.max(1, segment.workoutDurationSec)) * 100)
    : 0;

  return (
    <div className="rounded-2xl p-5 bg-white/4 ring-1 ring-white/8">
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="text-xs font-semibold uppercase tracking-widest text-white/40">
          Workout segment
        </span>
        {show && (
          <span className="text-xs text-white/40 tabular-nums">
            {progressPct}% done
          </span>
        )}
      </div>

      {show ? (
        <>
          {/* Segment label + target */}
          <div className="text-2xl font-bold text-white leading-tight mb-0.5">
            {segment.label}
          </div>
          <div className="text-sm text-white/50 mb-4">{segment.targetLabel}</div>

          {/* Remaining time — large */}
          <div className="flex items-end gap-1.5 mb-4">
            <span className="text-5xl font-black tabular-nums text-white tracking-tight leading-none">
              {formatMMSS(segment.remainingSec)}
            </span>
            <span className="text-sm text-white/40 mb-1.5">remaining</span>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-1000"
              style={{ width: `${progressPct}%` }}
              role="progressbar"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Workout ${progressPct}% complete`}
            />
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-6 gap-2 text-white/25">
          <ChevronRight className="h-6 w-6" aria-hidden="true" />
          <span className="text-sm">Waiting for tablet…</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Remote Control Row
// ---------------------------------------------------------------------------

interface RemoteControlRowProps {
  onAction: (action: 'pause' | 'resume' | 'lap' | 'next-segment') => void;
}

function RemoteControlRow({ onAction }: RemoteControlRowProps) {
  return (
    <div className="rounded-2xl p-4 bg-white/4 ring-1 ring-white/8">
      <div className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-3">
        Remote control
      </div>
      <div className="grid grid-cols-4 gap-2">
        <ControlButton
          label="Pause"
          icon={<Pause className="h-6 w-6" aria-hidden="true" />}
          accent="amber"
          onPress={() => onAction('pause')}
        />
        <ControlButton
          label="Resume"
          icon={<Play className="h-6 w-6" aria-hidden="true" />}
          accent="emerald"
          onPress={() => onAction('resume')}
        />
        <ControlButton
          label="Lap"
          icon={<Flag className="h-6 w-6" aria-hidden="true" />}
          accent="blue"
          onPress={() => onAction('lap')}
        />
        <ControlButton
          label="Next"
          icon={<SkipForward className="h-6 w-6" aria-hidden="true" />}
          accent="purple"
          onPress={() => onAction('next-segment')}
        />
      </div>
    </div>
  );
}

function ControlButton({
  label,
  icon,
  accent,
  onPress,
}: {
  label: string;
  icon: React.ReactNode;
  accent: 'amber' | 'emerald' | 'blue' | 'purple';
  onPress: () => void;
}) {
  const accentMap: Record<string, string> = {
    amber:   'bg-amber-500/12 text-amber-300 ring-amber-500/25 active:bg-amber-500/25',
    emerald: 'bg-emerald-500/12 text-emerald-300 ring-emerald-500/25 active:bg-emerald-500/25',
    blue:    'bg-blue-500/12 text-blue-300 ring-blue-500/25 active:bg-blue-500/25',
    purple:  'bg-purple-500/12 text-purple-300 ring-purple-500/25 active:bg-purple-500/25',
  };

  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={label}
      className={[
        'flex flex-col items-center justify-center gap-1.5 rounded-xl py-4 ring-1',
        'min-h-[72px] transition-all duration-150 active:scale-95 select-none',
        accentMap[accent] ?? accentMap.blue,
      ].join(' ')}
    >
      {icon}
      <span className="text-[10px] font-semibold tracking-wide uppercase">{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Activity Feed
// ---------------------------------------------------------------------------

function ActivityFeed({ entries }: { entries: ActivityEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <div className="rounded-2xl p-4 bg-white/4 ring-1 ring-white/8">
      <div className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-3">
        Activity feed
      </div>
      <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
        {[...entries].reverse().map((entry) => (
          <ActivityRow key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const kindColor: Record<string, string> = {
    success: 'bg-emerald-500/12 ring-emerald-500/20 text-emerald-300',
    info:    'bg-blue-500/12 ring-blue-500/20 text-blue-300',
    warning: 'bg-amber-500/12 ring-amber-500/20 text-amber-300',
    error:   'bg-red-500/12 ring-red-500/20 text-red-300',
  };
  const dotColor: Record<string, string> = {
    success: 'bg-emerald-400',
    info:    'bg-blue-400',
    warning: 'bg-amber-400',
    error:   'bg-red-400',
  };

  return (
    <div
      className={[
        'flex items-start gap-2.5 rounded-xl px-3 py-2.5 ring-1',
        kindColor[entry.kind] ?? kindColor.info,
      ].join(' ')}
    >
      <div className={['w-1.5 h-1.5 rounded-full mt-1.5 shrink-0', dotColor[entry.kind] ?? 'bg-blue-400'].join(' ')} aria-hidden="true" />
      <div className="min-w-0">
        <div className="text-xs font-semibold leading-snug truncate">{entry.title}</div>
        {entry.message && (
          <div className="text-[11px] opacity-70 leading-snug mt-0.5 line-clamp-2">{entry.message}</div>
        )}
        <div className="text-[10px] opacity-40 mt-1 tabular-nums">
          {formatRelativeTime(entry.receivedAt)}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function formatMMSS(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function formatRelativeTime(epochMs: number): string {
  const diffSec = Math.round((Date.now() - epochMs) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  return `${diffMin}m ago`;
}
