import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bluetooth,
  BluetoothConnected,
  BluetoothOff,
  HelpCircle,
  Loader2,
  Target,
  Waves,
  Zap,
} from 'lucide-react';

import { useRideStore } from '@/stores/rideStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  connect as ftmsConnect,
  disconnect as ftmsDisconnect,
  FtmsError,
  getDeviceName,
  setTrainerControlMode as ftmsSetMode,
  getTrainerControlMode,
  type TrainerControlMode,
} from '@/lib/ftms';
import {
  detectBluetoothSupport,
  probeBluetoothAdapter,
  type BluetoothSupportReport,
} from '@/lib/bluetoothSupport';
import { BluetoothTroubleshooter } from '@/components/BluetoothTroubleshooter';
import { cn } from '@/lib/utils';

// Suppress unused-import warning: getTrainerControlMode is used indirectly
void getTrainerControlMode;

/**
 * Connect / disconnect a Web Bluetooth FTMS smart trainer.
 * Shows capability state, current device, error remediation, and a pairing guide.
 */
export function TrainerConnect() {
  const connection          = useRideStore((s) => s.connection);
  const deviceName          = useRideStore((s) => s.deviceName);
  const error               = useRideStore((s) => s.errorMessage);
  const errorCode           = useRideStore((s) => s.errorCode);
  const battery             = useRideStore((s) => s.batteryLevel);
  const mode                = useRideStore((s) => s.mode);
  const trainerControlMode  = useRideStore((s) => s.trainerControlMode);
  const targetPowerW        = useRideStore((s) => s.targetPowerW);
  const setConnection       = useRideStore((s) => s.setConnection);
  const setMode             = useRideStore((s) => s.setMode);
  const storeSetCtrlMode    = useRideStore((s) => s.setTrainerControlMode);
  const pushToast           = useRideStore((s) => s.pushToast);

  const [report, setReport]                     = useState<BluetoothSupportReport>(() => detectBluetoothSupport());
  const [troubleshootOpen, setTroubleshootOpen] = useState(false);
  const [troubleshootStep, setTroubleshootStep] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void probeBluetoothAdapter(report).then((full) => {
      if (!cancelled) setReport(full);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = useCallback(async () => {
    if (!report.usable) {
      setTroubleshootStep(stepForReport(report));
      setTroubleshootOpen(true);
      return;
    }
    setConnection('connecting');
    try {
      await ftmsConnect();
      setConnection('connected', { deviceName: getDeviceName() });
      setMode('trainer');
      pushToast({
        kind: 'success',
        title: 'Trainer connected',
        message: getDeviceName() ?? 'Live trainer data is streaming.',
        durationMs: 3_500,
      });
    } catch (err) {
      const code    = err instanceof FtmsError ? err.code : 'unknown';
      const message = err instanceof Error ? err.message : 'Failed to connect';
      setConnection('error', { error: message, code });
      pushToast({
        kind: 'error',
        title: errorTitleFor(code),
        message,
        action: { label: 'Open guide', onClick: () => setTroubleshootOpen(true) },
        durationMs: 8_000,
      });
    }
  }, [report, setConnection, setMode, pushToast]);

  const handleDisconnect = useCallback(async () => {
    await ftmsDisconnect();
    setConnection('disconnected', { deviceName: null });
    pushToast({ kind: 'info', title: 'Trainer disconnected', durationMs: 3_000 });
  }, [setConnection, pushToast]);

  const handleToggleControlMode = useCallback(() => {
    const next: TrainerControlMode = trainerControlMode === 'erg' ? 'sim' : 'erg';
    ftmsSetMode(next);
    storeSetCtrlMode(next);
    pushToast({
      kind: 'info',
      title: next === 'erg' ? 'ERG mode active' : 'Simulation mode active',
      message: next === 'erg'
        ? 'Trainer will hold target power from the workout.'
        : 'Trainer resistance follows the route gradient.',
      durationMs: 3_000,
    });
  }, [trainerControlMode, storeSetCtrlMode, pushToast]);

  const statusLine = useMemo(() => {
    if (connection === 'connected') {
      if (trainerControlMode === 'erg') {
        return targetPowerW !== null
          ? `ERG mode · ${targetPowerW} W target`
          : 'ERG mode · awaiting target';
      }
      return 'Streaming · simulation mode';
    }
    if (connection === 'connecting')   return 'Negotiating control…';
    if (connection === 'reconnecting') return 'Reconnecting to trainer…';
    if (connection === 'error')        return error ?? 'Connection failed';
    if (!report.usable)                return report.reason ?? 'Web Bluetooth not available';
    return 'FTMS-compatible · ready to pair';
  }, [connection, error, report, trainerControlMode, targetPowerW]);

  const isConnected = connection === 'connected';
  const isBusy      = connection === 'connecting' || connection === 'reconnecting';

  return (
    <>
      <div className="flex flex-col gap-3">
        {/* Status row */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <StatusIcon connection={connection} usable={report.usable} />
            <div className="text-sm min-w-0">
              <div className="font-semibold text-foreground truncate">
                {isConnected ? (deviceName ?? 'Smart trainer') : 'Smart trainer'}
              </div>
              <div className={cn(
                'text-xs leading-snug',
                connection === 'error' ? 'text-destructive' : 'text-muted-foreground',
              )}>
                {statusLine}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {battery !== null && connection !== 'disconnected' && (
              <Badge
                variant={battery <= 15 ? 'destructive' : battery <= 30 ? 'warning' : 'success'}
                className="num"
                aria-label={`Trainer battery: ${battery}%`}
              >
                {battery}%
              </Badge>
            )}
            {isConnected && (
              <Badge variant="success" className="num" aria-label="Trainer connected and streaming">
                <Zap className="h-3 w-3" aria-hidden="true" /> LIVE
              </Badge>
            )}
            {isConnected && (
              <Badge
                variant={trainerControlMode === 'erg' ? 'warning' : 'muted'}
                className="num"
                aria-label={trainerControlMode === 'erg' ? 'ERG mode' : 'Simulation mode'}
              >
                {trainerControlMode === 'erg'
                  ? <><Target className="h-3 w-3" aria-hidden="true" /> ERG</>
                  : <><Waves className="h-3 w-3" aria-hidden="true" /> SIM</>
                }
              </Badge>
            )}
            {connection === 'reconnecting' && (
              <Badge variant="muted" className="num" aria-label="Reconnecting to trainer">
                <Loader2 className="h-3 w-3 animate-[spinSlow_1.5s_linear_infinite]" aria-hidden="true" /> Reconnect
              </Badge>
            )}
          </div>
        </div>

        {/* Error detail */}
        {connection === 'error' && (
          <ErrorPanel
            errorCode={errorCode}
            error={error}
            onOpenGuide={() => {
              setTroubleshootStep(stepForErrorCode(errorCode));
              setTroubleshootOpen(true);
            }}
          />
        )}

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-2">
          {!isConnected ? (
            <Button
              variant="default"
              size="sm"
              aria-label={isBusy ? (connection === 'connecting' ? 'Connecting to trainer…' : 'Reconnecting to trainer…') : !report.usable ? 'Show why Bluetooth is unavailable' : 'Pair smart trainer via Bluetooth'}
              aria-busy={isBusy}
              onClick={() => void handleConnect()}
              disabled={isBusy}
            >
              {isBusy ? (
                <><Loader2 className="h-3.5 w-3.5 animate-[spinSlow_1.5s_linear_infinite]" aria-hidden="true" />
                  {connection === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
                </>
              ) : !report.usable ? 'Why not?' : 'Pair trainer'}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              aria-label="Disconnect trainer"
              onClick={() => void handleDisconnect()}
            >
              Disconnect
            </Button>
          )}
          <Button
            variant={mode === 'demo' ? 'accent' : 'outline'}
            size="sm"
            aria-label={mode === 'demo' ? 'Demo mode on — click to disable' : 'Enable demo mode (simulated trainer)'}
            aria-pressed={mode === 'demo'}
            onClick={() => setMode(mode === 'demo' ? 'trainer' : 'demo')}
          >
            {mode === 'demo' ? 'Demo on' : 'Demo mode'}
          </Button>
        </div>

        {/* ERG / SIM mode toggle — only shown when a trainer is connected */}
        {isConnected && (
          <Button
            variant="ghost"
            size="sm"
            aria-label={trainerControlMode === 'erg'
              ? 'ERG mode active — click to switch to Simulation mode'
              : 'Simulation mode active — click to switch to ERG mode'}
            aria-pressed={trainerControlMode === 'erg'}
            onClick={handleToggleControlMode}
            className="w-full justify-start gap-2 text-xs text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {trainerControlMode === 'erg'
              ? <><Target className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" /> ERG mode active — tap to switch to SIM</>
              : <><Waves className="h-3.5 w-3.5" aria-hidden="true" /> SIM mode active — tap to switch to ERG</>
            }
          </Button>
        )}

        {/* Help link */}
        <button
          type="button"
          aria-label="Open pairing guide for Kickr Core and other FTMS trainers"
          onClick={() => { setTroubleshootStep(0); setTroubleshootOpen(true); }}
          className="self-start inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background rounded transition-colors"
        >
          <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
          How do I pair a Kickr Core?
        </button>
      </div>

      <BluetoothTroubleshooter
        open={troubleshootOpen}
        onClose={() => setTroubleshootOpen(false)}
        initialStep={troubleshootStep}
        onRetryConnect={report.usable ? () => void handleConnect() : undefined}
      />
    </>
  );
}

/* ---- Internal components ---- */

function StatusIcon({ connection, usable }: { connection: string; usable: boolean }) {
  if (connection === 'connected') {
    return <BluetoothConnected className="h-5 w-5 text-emerald-500 dark:text-emerald-400 animate-pulseGlow shrink-0" aria-hidden="true" />;
  }
  if (connection === 'connecting' || connection === 'reconnecting') {
    return <Loader2 className="h-5 w-5 text-primary animate-[spinSlow_1.5s_linear_infinite] shrink-0" aria-hidden="true" />;
  }
  if (connection === 'error' || !usable) {
    return <BluetoothOff className="h-5 w-5 text-destructive shrink-0" aria-hidden="true" />;
  }
  return <Bluetooth className="h-5 w-5 text-muted-foreground shrink-0" aria-hidden="true" />;
}

function ErrorPanel({
  errorCode,
  error,
  onOpenGuide,
}: {
  errorCode: string | null;
  error: string | null;
  onOpenGuide: () => void;
}) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="rounded-xl border border-destructive/35 bg-destructive/6 p-3 flex flex-col gap-1.5"
    >
      <div className="text-xs font-semibold text-destructive">{errorTitleFor(errorCode)}</div>
      {error && <div className="text-xs text-muted-foreground leading-snug">{error}</div>}
      <button
        type="button"
        onClick={onOpenGuide}
        className="self-start text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background rounded mt-0.5"
        aria-label="Show troubleshooting guide to fix this error"
      >
        Show me how to fix this →
      </button>
    </div>
  );
}

/* ---- Helpers ---- */

function errorTitleFor(code: string | null): string {
  switch (code) {
    case 'unsupported':              return "Browser doesn't support Web Bluetooth";
    case 'insecure-context':         return 'Bluetooth blocked: not a secure context';
    case 'permission-denied':        return 'Bluetooth permission was denied';
    case 'no-device-selected':       return 'No trainer selected';
    case 'no-device-found':          return 'No compatible trainer found';
    case 'gatt-connect-failed':      return "Couldn't open a GATT connection";
    case 'service-not-found':        return 'FTMS service unavailable on this trainer';
    case 'control-point-failed':     return 'Trainer refused the control handshake';
    case 'already-paired-elsewhere': return 'Trainer is paired with another app';
    case 'reconnect-failed':         return "Couldn't auto-reconnect to the trainer";
    default:                         return 'Bluetooth connection error';
  }
}

function stepForReport(report: BluetoothSupportReport): number {
  switch (report.reasonCode) {
    case 'ios-unsupported':
    case 'safari-unsupported':
    case 'firefox-unsupported':
    case 'api-missing':          return 2;
    case 'insecure-context':     return 3;
    case 'adapter-unavailable':  return 0;
    default:                     return 0;
  }
}

function stepForErrorCode(code: string | null): number {
  switch (code) {
    case 'unsupported':              return 2;
    case 'insecure-context':         return 3;
    case 'permission-denied':        return 4;
    case 'no-device-found':
    case 'gatt-connect-failed':      return 0;
    case 'service-not-found':
    case 'control-point-failed':
    case 'already-paired-elsewhere': return 1;
    default:                         return 5;
  }
}
