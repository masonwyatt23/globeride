/**
 * InstallPWAButton — surfaces the right install affordance per platform.
 *
 * Renders nothing when:
 *   - The app is already running standalone (already installed)
 *   - The user dismissed the prompt within the TTL window
 *   - The browser doesn't support install AND it isn't iOS Safari
 *
 * On Chromium / Edge / Android Chrome: a single-click install button that
 * fires the captured beforeinstallprompt event so the OS shows its real
 * install dialog.
 *
 * On iOS Safari (no beforeinstallprompt support): a "tap Share → Add to
 * Home Screen" popover, because that's the only path Apple gives us.
 */

import { useEffect, useRef, useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { cn } from '@/lib/utils';

export function InstallPWAButton({ className }: { className?: string }) {
  const { canInstall, install, isIOS, isStandalone, dismissed, dismiss } = usePWAInstall();
  const [showIOSHelp, setShowIOSHelp] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Click-outside closes the iOS help popover so the user isn't trapped on it.
  useEffect(() => {
    if (!showIOSHelp) return;
    function onPointer(e: PointerEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setShowIOSHelp(false);
    }
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [showIOSHelp]);

  // Hide outright in any state where there's nothing useful to offer.
  if (isStandalone || dismissed) return null;
  if (!canInstall && !isIOS) return null;

  // iOS Safari path — no programmatic install; show instructions instead.
  if (isIOS && !canInstall) {
    return (
      <div ref={wrapRef} className={cn('relative', className)}>
        <Button
          variant="outline"
          size="sm"
          className="gap-1 text-xs h-9"
          onClick={() => setShowIOSHelp((s) => !s)}
          aria-expanded={showIOSHelp}
          aria-haspopup="dialog"
          title="Add GlobeRide to your Home Screen"
        >
          <Smartphone className="h-3.5 w-3.5" />
          Install
        </Button>
        {showIOSHelp && (
          <div
            role="dialog"
            aria-label="Add to Home Screen"
            className="absolute right-0 top-full mt-2 w-72 z-30 glass glass-hairline rounded-xl p-3 text-xs shadow-lg animate-fadeIn"
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 leading-relaxed">
                <div className="font-semibold text-foreground mb-1.5">Add to Home Screen</div>
                <ol className="text-muted-foreground list-decimal list-inside space-y-1">
                  <li>
                    Tap the <span className="font-semibold text-foreground">Share</span> icon in
                    Safari
                  </li>
                  <li>
                    Scroll to{' '}
                    <span className="font-semibold text-foreground">Add to Home Screen</span>
                  </li>
                  <li>
                    Tap <span className="font-semibold text-foreground">Add</span> — GlobeRide
                    launches full-screen next to your trainer
                  </li>
                </ol>
              </div>
              <button
                type="button"
                aria-label="Dismiss install help"
                onClick={() => {
                  dismiss();
                  setShowIOSHelp(false);
                }}
                className="text-muted-foreground hover:text-foreground p-0.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Chromium / Edge / Android — programmatic install.
  return (
    <Button
      variant="outline"
      size="sm"
      className={cn('gap-1 text-xs h-9', className)}
      onClick={() => {
        void install();
      }}
      title="Install GlobeRide as an app"
    >
      <Download className="h-3.5 w-3.5" />
      Install
    </Button>
  );
}
