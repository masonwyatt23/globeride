import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bluetooth,
  BluetoothConnected,
  BluetoothOff,
  HelpCircle,
  Loader2,
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
} from '@/lib/ftms';
import {
  detectBluetoothSupport,
  probeBluetoothAdapter,
  type BluetoothSupportReport,
} from '@/lib/bluetoothSupport';
import { BluetoothTroubleshooter } from '@/components/BluetoothTroubleshooter';

/**
 * Connect / disconnect a Web Bluetooth FTMS smart trainer (e.g. Wahoo Kickr
 * Core). Shows the browser capability state, the current device, friendly
 * remediation copy for any error, and a "How to pair" modal.
 */
export function TrainerConnect() {
  const connection = useRideStore((s) => s.connection);
  const deviceName = useRideStore((s) => s.deviceName);
  const error = useRideStore((s) => s.errorMessage);
  const errorCode = useRideStore((s) => s.errorCode);
  const battery = useRideStore((s) => s.batteryLevel);
  const mode = useRideStore((s) => s.mode);
  const setConnection = useRideStore((s) => s.setConnection);
  const setMode = useRideStore((s) => s.setMode);
  const pushToast = useRideStore((s) => s.pushToast);

  const [report, setReport] = useState<BluetoothSupportReport>(() => detectBluetoothSupport());
  const [troubleshootOpen, setTroubleshootOpen] = useState(false);
  const [troubleshootStep, setTroubleshootStep] = useState(0);

  // Async adapter probe after first render — keeps initial paint sync.
  useEffect(() => {
    let cancelled = false;
    void probeBluetoothAdapter(report).then((full) => {
      if (!cancelled) setReport(full);
    });
    return () => {
      cancelled = true;
    };
    // intentional — run once on mount, the report is otherwise stable.
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
      const code = err instanceof FtmsError ? err.code : 'unknown';
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
    pushToast({
      kind: 'info',
      title: 'Trainer disconnected',
      durationMs: 3_000,
    });
  }, [setConnection, pushToast]);

  const statusLine = useMemo(() => {
    if (connection === 'connected') return 'Streaming · simulation mode';
    if (connection === 'connecting') return 'Negotiating control…';
    if (connection === 'reconnecting') return 'Reconnecting to trainer…';
    if (connection === 'error') return error ?? 'Connection failed';
    if (!report.usable) {
      // Use the specific reason from the capability detector.
      return report.reason ?? 'Web Bluetooth not available';
    }
    return 'FTMS-compatible · ready to pair';
  }, [connection, error, report]);

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <StatusIcon connection={connection} usable={report.usable} />
            <div className="text-sm min-w-0">
              <div className="font-medium text-foreground truncate">
                {connection === 'connected' ? deviceName ?? 'Smart trainer' : 'Smart trainer'}
              </div>
              <div className="text-xs text-muted-foreground leading-snug">{statusLine}</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {battery !== null && connection !== 'disconnected' && (
              <Badge
                variant={battery <= 15 ? 'destructive' : battery <= 30 ? 'muted' : 'success'}
                className="num"
              >
                {battery}%
              </Badge>
            )}
            {connection === 'connected' && (
              <Badge variant="success" className="num">
                <Zap className="h-3 w-3" /> LIVE
              </Badge>
            )}
            {connection === 'reconnecting' && (
              <Badge variant="muted" className="num">
                <Loader2 className="h-3 w-3 animate-spin" /> Reconnect
              </Badge>
            )}
          </div>
        </div>

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

        <div className="grid grid-cols-2 gap-2">
          {connection !== 'connected' ? (
            <Button
              variant="default"
              size="sm"
              onClick={handleConnect}
              disabled={connection === 'connecting' || connection === 'reconnecting'}
            >
              {connection === 'connecting'
                ? 'Connecting…'
                : connection === 'reconnecting'
                  ? 'Reconnecting…'
                  : !report.usable
                    ? 'Why not?'
                    : 'Pair trainer'}
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={handleDisconnect}>
              Disconnect
            </Button>
          )}
          <Button
            variant={mode === 'demo' ? 'accent' : 'outline'}
            size="sm"
            onClick={() => setMode(mode === 'demo' ? 'trainer' : 'demo')}
          >
            {mode === 'demo' ? 'Demo mode on' : 'Use demo mode'}
          </Button>
        </div>

        <button
          type="button"
          onClick={() => {
            setTroubleshootStep(0);
            setTroubleshootOpen(true);
          }}
          className="self-start inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <HelpCircle className="h-3.5 w-3.5" />
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

function StatusIcon({ connection, usable }: { connection: string; usable: boolean }) {
  if (connection === 'connected') {
    return <BluetoothConnected className="h-5 w-5 text-emerald-300 animate-pulseGlow" />;
  }
  if (connection === 'connecting' || connection === 'reconnecting') {
    return <Loader2 className="h-5 w-5 text-primary animate-spin" />;
  }
  if (connection === 'error' || !usable) {
    return <BluetoothOff className="h-5 w-5 text-destructive" />;
  }
  return <Bluetooth className="h-5 w-5 text-muted-foreground" />;
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
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 flex flex-col gap-2">
      <div className="text-xs font-semibold text-destructive">{errorTitleFor(errorCode)}</div>
      {error && <div className="text-xs text-muted-foreground leading-snug">{error}</div>}
      <button
        type="button"
        onClick={onOpenGuide}
        className="self-start text-xs font-medium text-primary hover:underline"
      >
        Show me how to fix this →
      </button>
    </div>
  );
}

function errorTitleFor(code: string | null): string {
  switch (code) {
    case 'unsupported':
      return "Browser doesn't support Web Bluetooth";
    case 'insecure-context':
      return 'Bluetooth blocked: not a secure context';
    case 'permission-denied':
      return 'Bluetooth permission was denied';
    case 'no-device-selected':
      return 'No trainer selected';
    case 'no-device-found':
      return 'No compatible trainer found';
    case 'gatt-connect-failed':
      return "Couldn't open a GATT connection";
    case 'service-not-found':
      return 'FTMS service unavailable on this trainer';
    case 'control-point-failed':
      return 'Trainer refused the control handshake';
    case 'already-paired-elsewhere':
      return 'Trainer is paired with another app';
    case 'reconnect-failed':
      return "Couldn't auto-reconnect to the trainer";
    case 'unknown':
    default:
      return 'Bluetooth connection error';
  }
}

/** Open the troubleshooter to the most relevant step for a capability gap. */
function stepForReport(report: BluetoothSupportReport): number {
  switch (report.reasonCode) {
    case 'ios-unsupported':
    case 'safari-unsupported':
    case 'firefox-unsupported':
    case 'api-missing':
      return 2; // "Use a supported browser"
    case 'insecure-context':
      return 3; // "Serve over HTTPS"
    case 'adapter-unavailable':
      return 0; // wake the trainer / check OS
    default:
      return 0;
  }
}

/** Open the troubleshooter to the most relevant step for a runtime error. */
function stepForErrorCode(code: string | null): number {
  switch (code) {
    case 'unsupported':
      return 2;
    case 'insecure-context':
      return 3;
    case 'permission-denied':
      return 4;
    case 'no-device-found':
    case 'gatt-connect-failed':
      return 0;
    case 'service-not-found':
    case 'control-point-failed':
    case 'already-paired-elsewhere':
      return 1;
    case 'no-device-selected':
    default:
      return 5;
  }
}
