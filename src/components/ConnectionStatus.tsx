import {
  Battery,
  BatteryLow,
  BatteryMedium,
  BatteryWarning,
  Bluetooth,
  BluetoothConnected,
  BluetoothOff,
  Cpu,
  Loader2,
} from 'lucide-react';

import { useRideStore } from '@/stores/rideStore';
import { cn } from '@/lib/utils';

/**
 * Always-visible connection pill for the ride view. Lives in the HUD
 * column and reflects:
 *   - trainer connection state (connected / reconnecting / disconnected / error)
 *   - device name when known
 *   - reconnect attempt counter, while we're retrying
 *   - battery level when the trainer exposes the Battery Service
 *   - a "demo" pill when we've fallen back from a failed trainer connection
 *
 * The component never mounts modals or alerts on its own — toasts handle
 * those — it's a status badge.
 */
export function ConnectionStatus({ compact = false }: { compact?: boolean }) {
  const connection = useRideStore((s) => s.connection);
  const deviceName = useRideStore((s) => s.deviceName);
  const mode = useRideStore((s) => s.mode);
  const battery = useRideStore((s) => s.batteryLevel);
  const reconnectAttempt = useRideStore((s) => s.reconnectAttempt);
  const reconnectMaxAttempts = useRideStore((s) => s.reconnectMaxAttempts);

  const tone = useTone(connection, mode);

  return (
    <div
      className={cn(
        'glass glass-hairline rounded-full flex items-center gap-2 px-3 py-1.5',
        tone.ring,
      )}
      role="status"
      aria-live="polite"
      title={ariaTitle({ connection, mode, deviceName, battery, reconnectAttempt })}
    >
      <StatusIcon
        connection={connection}
        mode={mode}
        className={cn('h-4 w-4 shrink-0', tone.icon)}
      />
      <div className={cn('flex items-center gap-2 min-w-0', compact && 'hidden sm:flex')}>
        <div className="flex flex-col leading-none min-w-0">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {primaryLabel(connection, mode)}
          </span>
          <span className="text-xs font-semibold text-foreground truncate max-w-[160px]">
            {secondaryLabel({ connection, mode, deviceName, reconnectAttempt, reconnectMaxAttempts })}
          </span>
        </div>
        {battery !== null && connection !== 'disconnected' && (
          <BatteryBadge level={battery} />
        )}
      </div>
    </div>
  );
}

function useTone(connection: string, mode: string) {
  if (mode === 'demo' && connection !== 'connected') {
    return { ring: 'ring-1 ring-primary/30', icon: 'text-primary' };
  }
  switch (connection) {
    case 'connected':
      return { ring: 'ring-1 ring-emerald-500/40', icon: 'text-emerald-300' };
    case 'reconnecting':
      return { ring: 'ring-1 ring-amber-500/40', icon: 'text-amber-300' };
    case 'connecting':
      return { ring: 'ring-1 ring-primary/30', icon: 'text-primary' };
    case 'error':
      return { ring: 'ring-1 ring-destructive/40', icon: 'text-destructive' };
    case 'disconnected':
    default:
      return { ring: '', icon: 'text-muted-foreground' };
  }
}

function StatusIcon({
  connection,
  mode,
  className,
}: {
  connection: string;
  mode: string;
  className?: string;
}) {
  if (mode === 'demo' && connection !== 'connected') {
    return <Cpu className={className} />;
  }
  switch (connection) {
    case 'connected':
      return <BluetoothConnected className={cn(className, 'animate-pulseGlow')} />;
    case 'reconnecting':
      return <Loader2 className={cn(className, 'animate-spin')} />;
    case 'connecting':
      return <Loader2 className={cn(className, 'animate-spin')} />;
    case 'error':
      return <BluetoothOff className={className} />;
    case 'disconnected':
    default:
      return <Bluetooth className={className} />;
  }
}

function primaryLabel(connection: string, mode: string): string {
  if (mode === 'demo' && connection !== 'connected') return 'mode';
  switch (connection) {
    case 'connected':
      return 'trainer';
    case 'reconnecting':
      return 'reconnecting';
    case 'connecting':
      return 'connecting';
    case 'error':
      return 'error';
    case 'disconnected':
    default:
      return 'trainer';
  }
}

function secondaryLabel({
  connection,
  mode,
  deviceName,
  reconnectAttempt,
  reconnectMaxAttempts,
}: {
  connection: string;
  mode: string;
  deviceName: string | null;
  reconnectAttempt: number;
  reconnectMaxAttempts: number;
}): string {
  if (mode === 'demo' && connection !== 'connected') return 'Demo mode';
  switch (connection) {
    case 'connected':
      return deviceName ?? 'Live · streaming';
    case 'reconnecting':
      return `Attempt ${reconnectAttempt} of ${reconnectMaxAttempts || '—'}`;
    case 'connecting':
      return 'Negotiating control…';
    case 'error':
      return 'Connection failed';
    case 'disconnected':
    default:
      return 'Not paired';
  }
}

function ariaTitle(args: {
  connection: string;
  mode: string;
  deviceName: string | null;
  battery: number | null;
  reconnectAttempt: number;
}): string {
  const bits: string[] = [];
  if (args.mode === 'demo' && args.connection !== 'connected') {
    bits.push('Demo mode active');
  } else {
    bits.push(`Trainer ${args.connection}`);
    if (args.deviceName) bits.push(`Device: ${args.deviceName}`);
    if (args.connection === 'reconnecting') bits.push(`Reconnect attempt ${args.reconnectAttempt}`);
  }
  if (args.battery !== null) bits.push(`Battery ${args.battery}%`);
  return bits.join(' · ');
}

function BatteryBadge({ level }: { level: number }) {
  const { Icon, tone, label } = batteryStyle(level);
  return (
    <div
      className={cn(
        'flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
        tone,
      )}
      aria-label={`Trainer battery: ${level}%`}
    >
      <Icon className="h-3 w-3" />
      <span>{label}</span>
    </div>
  );
}

function batteryStyle(level: number) {
  if (level <= 10) {
    return { Icon: BatteryWarning, tone: 'bg-destructive/20 text-destructive', label: `${level}%` };
  }
  if (level <= 30) {
    return { Icon: BatteryLow, tone: 'bg-amber-500/20 text-amber-300', label: `${level}%` };
  }
  if (level <= 70) {
    return {
      Icon: BatteryMedium,
      tone: 'bg-muted/40 text-muted-foreground',
      label: `${level}%`,
    };
  }
  return { Icon: Battery, tone: 'bg-emerald-500/20 text-emerald-300', label: `${level}%` };
}
