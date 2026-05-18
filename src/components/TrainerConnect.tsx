import { useCallback, useEffect } from 'react';
import { Bluetooth, BluetoothConnected, BluetoothOff, Loader2, Zap } from 'lucide-react';

import { useRideStore } from '@/stores/rideStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  connect as ftmsConnect,
  disconnect as ftmsDisconnect,
  getDeviceName,
  onDisconnect,
  onTrainerData,
} from '@/lib/ftms';

/**
 * Connect / disconnect a Web Bluetooth FTMS smart trainer (e.g. Wahoo Kickr
 * Core). Surfaces the browser permission flow, current device name, and
 * lets the user fall back to Demo Mode if Bluetooth isn't available.
 */
export function TrainerConnect() {
  const connection = useRideStore((s) => s.connection);
  const deviceName = useRideStore((s) => s.deviceName);
  const error = useRideStore((s) => s.errorMessage);
  const mode = useRideStore((s) => s.mode);
  const setConnection = useRideStore((s) => s.setConnection);
  const setMode = useRideStore((s) => s.setMode);
  const ingestTrainerData = useRideStore((s) => s.ingestTrainerData);

  const supported = typeof navigator !== 'undefined' && 'bluetooth' in navigator;

  // Wire trainer data → store, and watch for unexpected disconnects.
  useEffect(() => {
    onTrainerData(ingestTrainerData);
    onDisconnect(() => {
      setConnection('disconnected', null, 'Trainer disconnected unexpectedly');
    });
  }, [ingestTrainerData, setConnection]);

  const handleConnect = useCallback(async () => {
    setConnection('connecting');
    try {
      await ftmsConnect();
      setConnection('connected', getDeviceName(), null);
      setMode('trainer');
    } catch (err) {
      setConnection('error', null, err instanceof Error ? err.message : 'Failed to connect');
    }
  }, [setConnection, setMode]);

  const handleDisconnect = useCallback(async () => {
    await ftmsDisconnect();
    setConnection('disconnected', null, null);
  }, [setConnection]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {connection === 'connected' ? (
            <BluetoothConnected className="h-5 w-5 text-accent animate-pulseGlow" />
          ) : connection === 'connecting' ? (
            <Loader2 className="h-5 w-5 text-primary animate-spin" />
          ) : connection === 'error' ? (
            <BluetoothOff className="h-5 w-5 text-destructive" />
          ) : (
            <Bluetooth className="h-5 w-5 text-muted-foreground" />
          )}
          <div className="text-sm">
            <div className="font-medium text-foreground">
              {connection === 'connected' ? deviceName ?? 'Smart trainer' : 'Smart trainer'}
            </div>
            <div className="text-xs text-muted-foreground">
              {connection === 'connected' && 'Streaming · simulation mode'}
              {connection === 'connecting' && 'Negotiating control…'}
              {connection === 'disconnected' && (supported ? 'FTMS-compatible · ready to pair' : 'Web Bluetooth not available')}
              {connection === 'error' && (error ?? 'Connection failed')}
            </div>
          </div>
        </div>
        {connection === 'connected' && (
          <Badge variant="success" className="num">
            <Zap className="h-3 w-3" /> LIVE
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {connection !== 'connected' ? (
          <Button
            variant="default"
            size="sm"
            onClick={handleConnect}
            disabled={!supported || connection === 'connecting'}
          >
            {connection === 'connecting' ? 'Connecting…' : 'Pair trainer'}
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

      {!supported && (
        <p className="text-xs text-muted-foreground leading-relaxed">
          Web Bluetooth is required to talk to a Kickr / FTMS trainer. Use the
          latest Chrome / Edge on desktop or Android. Demo mode lets you preview
          the ride experience without hardware.
        </p>
      )}
    </div>
  );
}
