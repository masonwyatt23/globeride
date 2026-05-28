/**
 * NoTokenBanner.tsx — subtle dismissible nudges around the photoreal Cesium
 * ion path. The same banner shell handles two distinct states:
 *
 *   1. **No token installed.** Renders the "Add a free Cesium ion token"
 *      upgrade pitch. GlobeRide works out-of-the-box without an ion token —
 *      OSM imagery covers the globe, GPX elevations drive the avatar — but
 *      a token (free for personal use) unlocks Bing Aerial, Cesium World
 *      Terrain, OSM Buildings, and Google Photoreal 3D Tiles.
 *
 *   2. **Token present but tiles stalled.** Listens for the
 *      IMAGERY_FALLBACK_EVENT dispatched from `cesiumUtils.setupBaseImagery`
 *      when the 4-second Bing watchdog fires. Renders a "Photoreal terrain
 *      temporarily unavailable. Using map fallback." status so the user
 *      knows the downgraded look is intentional and transient.
 *
 * Both states are dismissible per-session via sessionStorage so the banner
 * never nags within a single ride. The fallback variant uses its own
 * dismiss key so dismissing the upgrade pitch doesn't silently hide the
 * outage notice (and vice versa).
 */
import { useEffect, useState } from 'react';
import { Sparkles, X, CloudOff } from 'lucide-react';

import { IMAGERY_FALLBACK_EVENT } from '@/lib/cesiumUtils';

const UPGRADE_DISMISS_KEY = 'globeride.noTokenBannerDismissedAt';
const FALLBACK_DISMISS_KEY = 'globeride.imageryFallbackBannerDismissedAt';

function readSessionDismissed(key: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

function writeSessionDismissed(key: string): void {
  try {
    sessionStorage.setItem(key, String(Date.now()));
  } catch {
    // sessionStorage may be blocked (private browsing) — that's fine,
    // the user will just see the banner once per route load.
  }
}

export function NoTokenBanner({ hasToken }: { hasToken: boolean }) {
  const [upgradeDismissed, setUpgradeDismissed] = useState<boolean>(() =>
    readSessionDismissed(UPGRADE_DISMISS_KEY),
  );
  const [fallbackVisible, setFallbackVisible] = useState<boolean>(false);
  const [fallbackDismissed, setFallbackDismissed] = useState<boolean>(() =>
    readSessionDismissed(FALLBACK_DISMISS_KEY),
  );

  // Listen for the imagery-fallback event dispatched by setupBaseImagery
  // when the photoreal Bing path stalls and we swap in OSM at runtime.
  // We listen unconditionally (Rules of Hooks) and gate the render below;
  // the listener cost is negligible even when no token is installed.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onFallback = (): void => setFallbackVisible(true);
    window.addEventListener(IMAGERY_FALLBACK_EVENT, onFallback);
    return () => window.removeEventListener(IMAGERY_FALLBACK_EVENT, onFallback);
  }, []);

  // ---- Render decision -----------------------------------------------------
  // Fallback notice takes precedence — it's a "thing went wrong right now"
  // signal and matters more than the optional upgrade pitch.
  const showFallback = hasToken && fallbackVisible && !fallbackDismissed;
  const showUpgrade = !hasToken && !upgradeDismissed;

  if (!showFallback && !showUpgrade) return null;

  const handleDismissUpgrade = () => {
    writeSessionDismissed(UPGRADE_DISMISS_KEY);
    setUpgradeDismissed(true);
  };

  const handleDismissFallback = () => {
    writeSessionDismissed(FALLBACK_DISMISS_KEY);
    setFallbackDismissed(true);
  };

  const handleOpenSettings = () => {
    // SettingsPanel listens for this event and opens itself on the Visual
    // tab where the ion-token affordance lives.
    window.dispatchEvent(
      new CustomEvent('globeride:open-settings', { detail: { tab: 'visual' } }),
    );
  };

  // ---- Fallback variant ----------------------------------------------------
  // Rendered when the photoreal Bing layer stalled and OSM is now active.
  // Quiet copy — no CTA, no settings link; this is a status notice.
  if (showFallback) {
    return (
      <div
        className="absolute z-[3] pointer-events-auto"
        style={{
          bottom: 'calc(max(env(safe-area-inset-bottom), 1.25rem) + 4.5rem)',
          left: '50%',
          transform: 'translateX(-50%)',
          maxWidth: 'min(28rem, calc(100vw - 1.5rem))',
        }}
        role="status"
        aria-live="polite"
      >
        <div className="glass glass-hairline rounded-pill px-4 py-2 flex items-center gap-3 shadow-lg backdrop-blur-md">
          <CloudOff
            className="h-4 w-4 text-muted-foreground shrink-0"
            aria-hidden="true"
          />
          <p className="text-xs text-foreground/90 leading-snug">
            <span className="font-medium">Photoreal terrain temporarily unavailable.</span>{' '}
            <span className="text-muted-foreground">Using map fallback.</span>
          </p>
          <button
            type="button"
            onClick={handleDismissFallback}
            className="text-muted-foreground/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-full p-0.5 shrink-0"
            aria-label="Dismiss photoreal-unavailable notice"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  // ---- Upgrade variant -----------------------------------------------------
  // Original behaviour: no token installed → photoreal upgrade pitch.
  return (
    <div
      className="absolute z-[3] pointer-events-auto"
      style={{
        bottom: 'calc(max(env(safe-area-inset-bottom), 1.25rem) + 4.5rem)',
        left: '50%',
        transform: 'translateX(-50%)',
        maxWidth: 'min(28rem, calc(100vw - 1.5rem))',
      }}
      role="status"
      aria-live="polite"
    >
      <div className="glass glass-hairline rounded-pill px-4 py-2 flex items-center gap-3 shadow-lg backdrop-blur-md">
        <Sparkles className="h-4 w-4 text-accent shrink-0" aria-hidden="true" />
        <p className="text-xs text-foreground/90 leading-snug">
          <span className="font-medium">Add a free Cesium ion token</span>{' '}
          <span className="text-muted-foreground hidden sm:inline">
            for photoreal terrain &amp; satellite imagery
          </span>
          <span className="text-muted-foreground sm:hidden">for photoreal Earth</span>
        </p>
        <button
          type="button"
          onClick={handleOpenSettings}
          className="text-[11px] font-semibold text-primary hover:text-primary/80 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm whitespace-nowrap"
        >
          Settings
        </button>
        <button
          type="button"
          onClick={handleDismissUpgrade}
          className="text-muted-foreground/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-full p-0.5 shrink-0"
          aria-label="Dismiss photoreal upgrade banner"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
