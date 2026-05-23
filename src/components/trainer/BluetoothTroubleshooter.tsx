import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Bluetooth,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  detectBluetoothSupport,
  probeBluetoothAdapter,
  type BluetoothSupportReport,
} from '@/lib/bluetoothSupport';

/**
 * Step-by-step modal for getting a Wahoo Kickr Core (or any FTMS trainer)
 * paired over Web Bluetooth. Opens from the connect card and from the
 * "Trouble pairing?" affordance on connection errors.
 *
 * Renders a live capability report at the top so users immediately see if
 * they're on the wrong browser, an insecure context, or have Bluetooth
 * disabled at the OS level.
 */
export interface BluetoothTroubleshooterProps {
  open: boolean;
  onClose: () => void;
  /** Optional: jump straight to a specific step (e.g. permission denied → step 4). */
  initialStep?: number;
  /** Optional: triggered by the "Try pairing now" CTA at the bottom. */
  onRetryConnect?: () => void;
}

interface Step {
  title: string;
  body: React.ReactNode;
}

export function BluetoothTroubleshooter({
  open,
  onClose,
  initialStep = 0,
  onRetryConnect,
}: BluetoothTroubleshooterProps) {
  const [report, setReport] = useState<BluetoothSupportReport>(() => detectBluetoothSupport());
  const [openStep, setOpenStep] = useState<number>(initialStep);

  // Re-probe each time the modal opens — the user may have just toggled the
  // OS Bluetooth switch.
  useEffect(() => {
    if (!open) return;
    setOpenStep(initialStep);
    let cancelled = false;
    const baseline = detectBluetoothSupport();
    setReport(baseline);
    void probeBluetoothAdapter(baseline).then((full) => {
      if (!cancelled) setReport(full);
    });
    return () => {
      cancelled = true;
    };
  }, [open, initialStep]);

  // ESC + body-scroll lock
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  const steps = useMemo<Step[]>(
    () => [
      {
        title: 'Wake the Kickr',
        body: (
          <>
            <p>
              The Kickr Core sleeps after a few minutes of inactivity and stops
              advertising. Give the cranks one slow rotation and watch the LED on
              the head — it should pulse blue, meaning the radio is awake.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              On a Kickr v5 / v6, plug in the AC adapter — the trainer won't
              advertise on flywheel-only power forever.
            </p>
          </>
        ),
      },
      {
        title: 'Close every other app that talks to the trainer',
        body: (
          <>
            <p>
              FTMS allows exactly one consumer at a time. If your phone is still
              connected to the Wahoo app, or Zwift is paired in another window,
              GlobeRide will see the trainer in the chooser but the GATT
              connection will fail with "Already paired elsewhere."
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1 text-muted-foreground">
              <li>Force-quit Zwift, Wahoo Fitness, TrainerRoad, MyWhoosh</li>
              <li>Turn off Bluetooth on any phone/tablet that's auto-pairing</li>
              <li>Unplug ANT+ dongles if you're testing those in parallel</li>
            </ul>
          </>
        ),
      },
      {
        title: 'Use a supported browser',
        body: (
          <>
            <p>
              Web Bluetooth ships in <strong className="text-foreground">Chrome</strong>,{' '}
              <strong className="text-foreground">Edge</strong>, Opera, and Samsung Internet,
              on desktop or Android. Safari, Firefox, and any browser on iOS
              cannot reach the trainer — even if they're the latest version.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              On Linux, Web Bluetooth requires the
              <code className="mx-1 rounded bg-muted px-1 py-0.5 text-[11px]">
                chrome://flags/#enable-experimental-web-platform-features
              </code>
              flag. Restart Chrome after toggling.
            </p>
          </>
        ),
      },
      {
        title: 'Serve the app over HTTPS or localhost',
        body: (
          <>
            <p>
              Web Bluetooth refuses to run in an insecure context. GlobeRide's
              hosted build is HTTPS by default. If you're self-hosting, terminate
              TLS or proxy through a tunnel — or just run{' '}
              <code className="mx-0.5 rounded bg-muted px-1 py-0.5 text-[11px]">npm run dev</code>{' '}
              locally and visit{' '}
              <code className="mx-0.5 rounded bg-muted px-1 py-0.5 text-[11px]">http://localhost:5173</code>.
            </p>
          </>
        ),
      },
      {
        title: 'Allow Bluetooth in site permissions',
        body: (
          <>
            <p>
              First connect, the browser asks permission. If you said "Block,"
              the chooser won't appear again until you reset it:
            </p>
            <ol className="list-decimal pl-5 mt-2 space-y-1 text-muted-foreground">
              <li>Click the padlock icon to the left of the address bar.</li>
              <li>Open <em>Site settings</em>.</li>
              <li>Reset Bluetooth from "Block" back to "Ask (default)".</li>
              <li>Reload GlobeRide and click "Pair trainer" again.</li>
            </ol>
          </>
        ),
      },
      {
        title: 'Pick the Kickr in the chooser',
        body: (
          <>
            <p>
              When the chooser appears, pick the entry that starts with{' '}
              <code className="mx-0.5 rounded bg-muted px-1 py-0.5 text-[11px]">KICKR</code>{' '}
              followed by the four-digit serial printed on the underside of the
              trainer. Click <strong className="text-foreground">Pair</strong>.
              The status row will turn green and a <em>LIVE</em> badge appears
              once the FTMS handshake completes.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              If nothing shows up after ~10 seconds, the trainer probably went
              back to sleep. Cancel, give the pedals another half-turn, and try
              again from step 1.
            </p>
          </>
        ),
      },
    ],
    [],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-background/95 backdrop-blur-md p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="bt-troubleshoot-title"
    >
      <div className="glass glass-hairline rounded-2xl w-full max-w-xl max-h-[88vh] overflow-hidden flex flex-col">
        <header className="flex items-start justify-between gap-4 px-5 py-4 border-b border-border/60">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/15 text-primary p-2">
              <Bluetooth className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="bt-troubleshoot-title"
                className="text-base font-semibold text-foreground"
              >
                Pair a smart trainer
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Reference flow for the Wahoo Kickr Core — works the same for any
                FTMS-compliant trainer (Tacx, Saris, Elite, Zwift Hub).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="overflow-y-auto px-5 py-4 space-y-4">
          <CapabilityReport report={report} />

          <ol className="space-y-2">
            {steps.map((step, i) => (
              <StepDisclosure
                key={step.title}
                index={i}
                title={step.title}
                isOpen={openStep === i}
                onToggle={() => setOpenStep(openStep === i ? -1 : i)}
              >
                <div className="text-sm text-muted-foreground leading-relaxed space-y-2">
                  {step.body}
                </div>
              </StepDisclosure>
            ))}
          </ol>

          <div className="text-xs text-muted-foreground pt-2 border-t border-border/40">
            Still stuck? Open an issue with your trainer model + the browser
            console output —{' '}
            <a
              href="https://github.com/masonwyatt23/globeride/issues"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              github.com/masonwyatt23/globeride/issues
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border/60">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
          {onRetryConnect && (
            <Button
              variant="accent"
              size="sm"
              onClick={() => {
                onRetryConnect();
                onClose();
              }}
              disabled={!report.usable}
            >
              Try pairing now
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </footer>
      </div>
    </div>
  );
}

function CapabilityReport({ report }: { report: BluetoothSupportReport }) {
  const checks: { label: string; ok: boolean; note?: string }[] = [
    {
      label: 'Browser exposes Web Bluetooth',
      ok: report.apiPresent,
      note: report.apiPresent ? undefined : 'Use Chrome, Edge, Opera, or Samsung Internet.',
    },
    {
      label: 'Page is a secure context (HTTPS / localhost)',
      ok: report.secureContext,
      note: report.secureContext ? undefined : 'Reload over https:// or use localhost.',
    },
    {
      label: 'Bluetooth radio is on',
      ok: report.adapterAvailable !== false,
      note:
        report.adapterAvailable === false
          ? 'No adapter reported. Toggle Bluetooth in your OS settings.'
          : report.adapterAvailable === null
            ? 'Could not probe — pair anyway and check.'
            : undefined,
    },
  ];

  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Your environment
        </div>
        {report.usable ? (
          <Badge variant="success">Ready to pair</Badge>
        ) : (
          <Badge variant="destructive">Needs attention</Badge>
        )}
      </div>
      <ul className="space-y-1.5">
        {checks.map((c) => (
          <li key={c.label} className="flex items-start gap-2 text-sm">
            <CheckCircle2
              className={cn(
                'h-4 w-4 mt-0.5 shrink-0',
                c.ok ? 'text-emerald-400' : 'text-muted-foreground/60',
              )}
            />
            <div className="flex-1">
              <div className={cn('text-foreground', !c.ok && 'text-muted-foreground')}>
                {c.label}
              </div>
              {c.note && <div className="text-xs text-muted-foreground">{c.note}</div>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StepDisclosure({
  index,
  title,
  isOpen,
  onToggle,
  children,
}: {
  index: number;
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <li
      className={cn(
        'rounded-xl border transition-colors',
        isOpen ? 'border-primary/40 bg-card/60' : 'border-border/60 bg-card/30',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
        aria-expanded={isOpen}
      >
        <div
          className={cn(
            'flex items-center justify-center h-6 w-6 rounded-full text-xs font-semibold shrink-0',
            isOpen ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
          )}
        >
          {index + 1}
        </div>
        <div className="flex-1 text-sm font-medium text-foreground">{title}</div>
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {isOpen && <div className="px-3 pb-3 pl-12">{children}</div>}
    </li>
  );
}
