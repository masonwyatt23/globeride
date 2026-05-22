import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Bluetooth,
  BluetoothConnected,
  BluetoothOff,
  Heart,
  Loader2,
  Zap,
} from 'lucide-react';

import { useRideStore } from '@/stores/rideStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  connectHr,
  disconnectHr,
  hrDeviceName,
  hrIsConnected,
  onHrData,
  onHrStatus,
  connectCadence,
  disconnectCadence,
  cadenceDeviceName,
  cadenceIsConnected,
  cadenceProfile,
  onCadenceData,
  onCadenceStatus,
  BleSensorError,
} from '@/lib/bleSensors';
import {
  detectBluetoothSupport,
  probeBluetoothAdapter,
  type BluetoothSupportReport,
} from '@/lib/bluetoothSupport';
import type { SensorConnectionStatus } from '@/lib/bleSensors';

// Suppress unused-import warnings for functions used indirectly
void hrIsConnected;
void cadenceIsConnected;

/**
 * SensorConnect — Pair dedicated BLE Heart Rate and Cadence sensors.
 *
 * Mirrors the TrainerConnect styling and flow:
 *   - Web Bluetooth capability gating (Chrome/Edge only; degrades gracefully)
 *   - Per-sensor status chips with live values
 *   - Connect / disconnect buttons
 *   - Error messages with actionable copy
 *
 * When a dedicated sensor is live, its value overrides the trainer-derived
 * one for that metric; on disconnect, the store falls back automatically.
 */
export function SensorConnect() {
  const [report, setReport] = useState<BluetoothSupportReport>(() => detectBluetoothSupport());

  // Async adapter probe — keep sync initial render, fill in async.
  useEffect(() => {
    let cancelled = false;
    void probeBluetoothAdapter(report).then((full) => {
      if (!cancelled) setReport(full);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <HrSensorRow report={report} />
      <div className="h-px bg-border/60" aria-hidden="true" />
      <CadenceSensorRow report={report} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Heart Rate row
// ---------------------------------------------------------------------------

function HrSensorRow({ report }: { report: BluetoothSupportReport }) {
  const status            = useRideStore((s) => s.hrSensorStatus);
  const deviceName        = useRideStore((s) => s.hrSensorDeviceName);
  const liveValue         = useRideStore((s) => s.hrSensorValue);
  const setHrSensorStatus = useRideStore((s) => s.setHrSensorStatus);
  const ingestHrSensorData = useRideStore((s) => s.ingestHrSensorData);
  const pushToast         = useRideStore((s) => s.pushToast);

  const [error, setError] = useState<string | null>(null);

  // Wire up BLE callbacks → store whenever this component is mounted.
  useEffect(() => {
    onHrStatus((s) => {
      setHrSensorStatus(s, hrDeviceName());
      if (s === 'connected') setError(null);
    });
    onHrData((bpm) => ingestHrSensorData(bpm));
    return () => {
      onHrStatus(null);
      onHrData(null);
    };
  }, [setHrSensorStatus, ingestHrSensorData]);

  const handleConnect = useCallback(async () => {
    if (!report.usable) return;
    setError(null);
    try {
      await connectHr();
      pushToast({
        kind: 'success',
        title: 'Heart rate monitor connected',
        message: hrDeviceName() ?? 'Live HR is streaming.',
        durationMs: 3_500,
      });
    } catch (err) {
      const msg  = err instanceof Error ? err.message : 'Failed to connect HR monitor';
      const code = err instanceof BleSensorError ? err.code : 'unknown';
      setError(msg);
      setHrSensorStatus('error', null);
      pushToast({
        kind: 'error',
        title: hrErrorTitle(code),
        message: msg,
        durationMs: 6_000,
      });
    }
  }, [report, setHrSensorStatus, pushToast]);

  const handleDisconnect = useCallback(async () => {
    await disconnectHr();
    setHrSensorStatus('disconnected', null);
    pushToast({
      kind: 'info',
      title: 'Heart rate monitor disconnected',
      durationMs: 2_500,
    });
  }, [setHrSensorStatus, pushToast]);

  const statusLine = useMemo(() => sensorStatusLine(status, report, error), [status, report, error]);

  return (
    <SensorRow
      icon={<Heart className="h-4 w-4 text-rose-500 dark:text-rose-400" aria-hidden="true" />}
      label="Heart rate monitor"
      sublabel="BLE Heart Rate Service (0x180D)"
      statusLine={statusLine}
      status={status}
      usable={report.usable}
      deviceName={deviceName}
      liveValue={liveValue !== null ? `${Math.round(liveValue)} bpm` : null}
      valueBadgeIcon={<Heart className="h-3 w-3" aria-hidden="true" />}
      valueBadgeLabel={liveValue !== null ? `${Math.round(liveValue)} bpm` : undefined}
      error={error}
      onConnect={handleConnect}
      onDisconnect={handleDisconnect}
    />
  );
}

// ---------------------------------------------------------------------------
// Cadence row
// ---------------------------------------------------------------------------

function CadenceSensorRow({ report }: { report: BluetoothSupportReport }) {
  const status                = useRideStore((s) => s.cadenceSensorStatus);
  const deviceName            = useRideStore((s) => s.cadenceSensorDeviceName);
  const liveValue             = useRideStore((s) => s.cadenceSensorValue);
  const setCadenceSensorStatus = useRideStore((s) => s.setCadenceSensorStatus);
  const ingestCadenceSensorData = useRideStore((s) => s.ingestCadenceSensorData);
  const pushToast             = useRideStore((s) => s.pushToast);

  const [error, setError] = useState<string | null>(null);

  // Wire up BLE callbacks → store whenever this component is mounted.
  useEffect(() => {
    onCadenceStatus((s) => {
      setCadenceSensorStatus(s, cadenceDeviceName());
      if (s === 'connected') setError(null);
    });
    onCadenceData((rpm) => ingestCadenceSensorData(rpm));
    return () => {
      onCadenceStatus(null);
      onCadenceData(null);
    };
  }, [setCadenceSensorStatus, ingestCadenceSensorData]);

  const handleConnect = useCallback(async () => {
    if (!report.usable) return;
    setError(null);
    try {
      await connectCadence();
      const profile = cadenceProfile();
      const profileLabel = profile === 'csc' ? 'CSC' : profile === 'cycling-power' ? 'Cycling Power' : '';
      pushToast({
        kind: 'success',
        title: 'Cadence sensor connected',
        message: [cadenceDeviceName(), profileLabel].filter(Boolean).join(' · ') || 'Live cadence is streaming.',
        durationMs: 3_500,
      });
    } catch (err) {
      const msg  = err instanceof Error ? err.message : 'Failed to connect cadence sensor';
      const code = err instanceof BleSensorError ? err.code : 'unknown';
      setError(msg);
      setCadenceSensorStatus('error', null);
      pushToast({
        kind: 'error',
        title: hrErrorTitle(code),
        message: msg,
        durationMs: 6_000,
      });
    }
  }, [report, setCadenceSensorStatus, pushToast]);

  const handleDisconnect = useCallback(async () => {
    await disconnectCadence();
    setCadenceSensorStatus('disconnected', null);
    pushToast({
      kind: 'info',
      title: 'Cadence sensor disconnected',
      durationMs: 2_500,
    });
  }, [setCadenceSensorStatus, pushToast]);

  const statusLine = useMemo(() => sensorStatusLine(status, report, error), [status, report, error]);

  const profile = cadenceProfile();
  const profileNote = status === 'connected' && profile
    ? profile === 'csc' ? 'CSC (0x1816)' : 'Cycling Power (0x1818)'
    : 'CSC (0x1816) or Cycling Power (0x1818)';

  return (
    <SensorRow
      icon={<Activity className="h-4 w-4 text-emerald-500 dark:text-emerald-400" aria-hidden="true" />}
      label="Cadence sensor"
      sublabel={profileNote}
      statusLine={statusLine}
      status={status}
      usable={report.usable}
      deviceName={deviceName}
      liveValue={liveValue !== null ? `${Math.round(liveValue)} rpm` : null}
      valueBadgeIcon={<Activity className="h-3 w-3" aria-hidden="true" />}
      valueBadgeLabel={liveValue !== null ? `${Math.round(liveValue)} rpm` : undefined}
      error={error}
      onConnect={handleConnect}
      onDisconnect={handleDisconnect}
    />
  );
}

// ---------------------------------------------------------------------------
// Shared sensor row layout
// ---------------------------------------------------------------------------

interface SensorRowProps {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  statusLine: string;
  status: SensorConnectionStatus;
  usable: boolean;
  deviceName: string | null;
  liveValue: string | null;
  valueBadgeIcon: React.ReactNode;
  valueBadgeLabel?: string;
  error: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
}

function SensorRow({
  icon,
  label,
  sublabel,
  statusLine,
  status,
  usable,
  deviceName,
  liveValue,
  valueBadgeIcon,
  valueBadgeLabel,
  error,
  onConnect,
  onDisconnect,
}: SensorRowProps) {
  const isConnected = status === 'connected';
  const isBusy      = status === 'connecting' || status === 'reconnecting';

  return (
    <div className="flex flex-col gap-3">
      {/* Status header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <SensorStatusIcon status={status} usable={usable} baseIcon={icon} />
          <div className="text-sm min-w-0">
            <div className="font-medium text-foreground truncate">
              {isConnected ? (deviceName ?? label) : label}
            </div>
            <div className="text-xs text-muted-foreground leading-snug">{sublabel}</div>
          </div>
        </div>

        {/* Live value + status chips */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isConnected && liveValue && (
            <Badge variant="success" className="num" aria-label={valueBadgeLabel ?? liveValue}>
              {valueBadgeIcon}
              {liveValue}
            </Badge>
          )}
          {isConnected && !liveValue && (
            <Badge variant="success" className="num" aria-label="Sensor connected and streaming">
              <Zap className="h-3 w-3" aria-hidden="true" /> LIVE
            </Badge>
          )}
          {status === 'reconnecting' && (
            <Badge variant="muted" className="num" aria-label="Reconnecting to sensor">
              <Loader2 className="h-3 w-3 animate-[spinSlow_1.5s_linear_infinite]" aria-hidden="true" /> Reconnect
            </Badge>
          )}
        </div>
      </div>

      {/* Status line */}
      <div className="text-xs text-muted-foreground leading-snug" aria-live="polite">
        {statusLine}
      </div>

      {/* Error panel */}
      {status === 'error' && error && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-lg border border-destructive/35 bg-destructive/8 p-2.5"
        >
          <div className="text-xs text-destructive leading-snug">{error}</div>
        </div>
      )}

      {/* Action button */}
      {!isConnected ? (
        <Button
          variant="outline"
          size="sm"
          aria-label={isBusy
            ? (status === 'connecting' ? 'Connecting to sensor…' : 'Reconnecting to sensor…')
            : !usable
              ? 'Web Bluetooth not available'
              : `Pair ${getSensorShortName(label)} sensor via Bluetooth`}
          aria-busy={isBusy}
          onClick={onConnect}
          disabled={isBusy || !usable}
          className="self-start focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background"
        >
          {isBusy
            ? status === 'connecting'
              ? 'Connecting…'
              : 'Reconnecting…'
            : !usable
              ? 'Unavailable'
              : `Pair ${getSensorShortName(label)}`}
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          aria-label={`Disconnect ${label}`}
          onClick={onDisconnect}
          className="self-start focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background"
        >
          Disconnect
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function SensorStatusIcon({
  status,
  usable,
  baseIcon,
}: {
  status: SensorConnectionStatus;
  usable: boolean;
  baseIcon: React.ReactNode;
}) {
  if (status === 'connected') {
    return <BluetoothConnected className="h-5 w-5 text-emerald-300 animate-pulseGlow" aria-hidden="true" />;
  }
  if (status === 'connecting' || status === 'reconnecting') {
    return <Loader2 className="h-5 w-5 text-primary animate-[spinSlow_1.5s_linear_infinite]" aria-hidden="true" />;
  }
  if (status === 'error' || !usable) {
    return <BluetoothOff className="h-5 w-5 text-destructive" aria-hidden="true" />;
  }
  // Idle — show the metric icon dimly so it's clear this row is BLE-based.
  void baseIcon; // kept for future themed icon; currently using generic BT icon
  return <Bluetooth className="h-5 w-5 text-muted-foreground" aria-hidden="true" />;
}

function sensorStatusLine(
  status: SensorConnectionStatus,
  report: BluetoothSupportReport,
  error: string | null,
): string {
  switch (status) {
    case 'connected':    return 'Streaming · dedicated sensor';
    case 'connecting':   return 'Connecting…';
    case 'reconnecting': return 'Reconnecting…';
    case 'error':        return error ?? 'Connection failed';
    case 'disconnected':
    default:
      if (!report.usable) return report.reason ?? 'Web Bluetooth not available';
      return 'Ready to pair';
  }
}

function getSensorShortName(label: string): string {
  if (label.toLowerCase().includes('heart')) return 'HR';
  if (label.toLowerCase().includes('cadence')) return 'cadence';
  return 'sensor';
}

function hrErrorTitle(code: string): string {
  switch (code) {
    case 'unsupported':
    case 'insecure-context':   return 'Web Bluetooth unavailable';
    case 'no-device-selected': return 'No sensor selected';
    case 'no-device-found':    return 'No compatible sensor found';
    case 'gatt-connect-failed':return "Couldn't open a GATT connection";
    case 'service-not-found':  return 'Required BLE service not found';
    default:                   return 'Bluetooth connection error';
  }
}

// ---------------------------------------------------------------------------
// Compact sensor status chips for the Ride HUD / ConnectionStatus area
// ---------------------------------------------------------------------------

/**
 * Minimal pill showing paired sensor status. Designed to sit alongside the
 * existing ConnectionStatus component in the ride view.
 */
export function SensorStatusPills() {
  const hrStatus  = useRideStore((s) => s.hrSensorStatus);
  const hrValue   = useRideStore((s) => s.hrSensorValue);
  const cadStatus = useRideStore((s) => s.cadenceSensorStatus);
  const cadValue  = useRideStore((s) => s.cadenceSensorValue);

  const showHr  = hrStatus  !== 'disconnected';
  const showCad = cadStatus !== 'disconnected';

  if (!showHr && !showCad) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Sensor status">
      {showHr && (
        <SensorPill
          icon={<Heart className="h-3 w-3 text-rose-400" aria-hidden="true" />}
          status={hrStatus}
          value={hrValue !== null ? `${Math.round(hrValue)}` : null}
          unit="bpm"
          ariaLabel={hrValue !== null ? `Heart rate: ${Math.round(hrValue)} bpm` : `Heart rate sensor: ${hrStatus}`}
        />
      )}
      {showCad && (
        <SensorPill
          icon={<Activity className="h-3 w-3 text-emerald-400" aria-hidden="true" />}
          status={cadStatus}
          value={cadValue !== null ? `${Math.round(cadValue)}` : null}
          unit="rpm"
          ariaLabel={cadValue !== null ? `Cadence: ${Math.round(cadValue)} rpm` : `Cadence sensor: ${cadStatus}`}
        />
      )}
    </div>
  );
}

function SensorPill({
  icon,
  status,
  value,
  unit,
  ariaLabel,
}: {
  icon: React.ReactNode;
  status: SensorConnectionStatus;
  value: string | null;
  unit: string;
  ariaLabel: string;
}) {
  const isConnected = status === 'connected';
  const isBusy      = status === 'connecting' || status === 'reconnecting';

  return (
    <div
      aria-label={ariaLabel}
      className={[
        'glass glass-hairline rounded-full flex items-center gap-1.5 px-2.5 py-1 transition-shadow duration-300',
        isConnected ? 'ring-1 ring-emerald-500/40' : isBusy ? 'ring-1 ring-primary/30' : 'ring-1 ring-destructive/30',
      ].join(' ')}
    >
      {isBusy
        ? <Loader2 className="h-3 w-3 animate-[spinSlow_1.5s_linear_infinite] text-primary" aria-hidden="true" />
        : icon
      }
      {isConnected && value ? (
        <span className="num text-xs font-semibold text-foreground tabular-nums" aria-hidden="true">
          {value} <span className="text-[10px] text-muted-foreground">{unit}</span>
        </span>
      ) : (
        <span className="text-[10px] text-muted-foreground" aria-hidden="true">
          {isBusy ? '…' : status === 'error' ? 'err' : '—'}
        </span>
      )}
    </div>
  );
}
