import { useEffect } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

import { useRideStore } from '@/stores/rideStore';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Toast } from '@/types';

/**
 * Stacked, auto-dismissing toast notifications. Mounted once at the route
 * level; consumers push messages via `useRideStore.getState().pushToast(...)`.
 *
 * Sticky behaviour:
 *   - `durationMs: null`  → never auto-dismisses (e.g. a "still trying to
 *     reconnect" notice that updates in-place).
 *   - `durationMs: 0`     → coerced to default 5s so callers can't pin a
 *     toast by accident.
 */
export function Toaster() {
  const toasts = useRideStore((s) => s.toasts);

  return (
    <div
      className="pointer-events-none fixed top-4 right-4 z-[60] flex flex-col gap-2 w-[min(96vw,360px)]"
      role="region"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastCard({ toast }: { toast: Toast }) {
  const dismiss = useRideStore((s) => s.dismissToast);

  useEffect(() => {
    if (toast.durationMs === null) return undefined;
    const ms = toast.durationMs > 0 ? toast.durationMs : 5_000;
    const handle = window.setTimeout(() => dismiss(toast.id), ms);
    return () => window.clearTimeout(handle);
  }, [toast.id, toast.durationMs, dismiss]);

  const Icon = iconFor(toast.kind);

  return (
    <div
      className={cn(
        'pointer-events-auto glass glass-hairline rounded-xl px-3 py-2.5 flex items-start gap-2.5',
        'animate-[toastIn_180ms_ease-out]',
        toneRing(toast.kind),
      )}
      role={toast.kind === 'error' ? 'alert' : 'status'}
    >
      <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', toneText(toast.kind))} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-foreground leading-tight">{toast.title}</div>
        {toast.message && (
          <div className="text-xs text-muted-foreground leading-snug mt-0.5 break-words">
            {toast.message}
          </div>
        )}
        {toast.action && (
          <div className="mt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                toast.action?.onClick();
                dismiss(toast.id);
              }}
            >
              {toast.action.label}
            </Button>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => dismiss(toast.id)}
        className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
        aria-label="Dismiss notification"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function iconFor(kind: Toast['kind']) {
  switch (kind) {
    case 'success':
      return CheckCircle2;
    case 'warning':
      return AlertTriangle;
    case 'error':
      return AlertCircle;
    case 'info':
    default:
      return Info;
  }
}

function toneText(kind: Toast['kind']): string {
  switch (kind) {
    case 'success':
      return 'text-emerald-300';
    case 'warning':
      return 'text-amber-300';
    case 'error':
      return 'text-destructive';
    case 'info':
    default:
      return 'text-primary';
  }
}

function toneRing(kind: Toast['kind']): string {
  switch (kind) {
    case 'success':
      return 'ring-1 ring-emerald-500/30';
    case 'warning':
      return 'ring-1 ring-amber-500/30';
    case 'error':
      return 'ring-1 ring-destructive/40';
    case 'info':
    default:
      return 'ring-1 ring-primary/25';
  }
}
