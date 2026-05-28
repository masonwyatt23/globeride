/**
 * NoTokenBanner.tsx — subtle dismissible nudge offering the Cesium ion
 * "photoreal" upgrade when no token is installed.
 *
 * GlobeRide works out-of-the-box without an ion token: OSM imagery covers
 * the globe, the route's GPX elevations drive the avatar, and the ride is
 * fully playable. An ion token (free for personal use) unlocks Bing Aerial
 * imagery, Cesium World Terrain, OSM Buildings, and Google Photoreal 3D
 * Tiles. This banner advertises that upgrade without blocking anyone.
 *
 * Behaviour:
 *   - Renders nothing when a token is already installed.
 *   - Dismissable per-session via sessionStorage so it never nags within a
 *     single ride.
 *   - The "Add token" affordance opens the Settings panel directly to the
 *     Visual tab via a custom event consumed by SettingsPanel.
 */
import { useState } from 'react';
import { Sparkles, X } from 'lucide-react';

const SESSION_DISMISS_KEY = 'globeride.noTokenBannerDismissedAt';

export function NoTokenBanner({ hasToken }: { hasToken: boolean }) {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return sessionStorage.getItem(SESSION_DISMISS_KEY) !== null;
    } catch {
      return false;
    }
  });

  if (hasToken) return null;
  if (dismissed) return null;

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(SESSION_DISMISS_KEY, String(Date.now()));
    } catch {
      // sessionStorage may be blocked (private browsing) — that's fine,
      // the user will just see the banner once per route load.
    }
    setDismissed(true);
  };

  const handleOpenSettings = () => {
    // SettingsPanel listens for this event and opens itself on the Visual
    // tab where the ion-token affordance lives.
    window.dispatchEvent(
      new CustomEvent('globeride:open-settings', { detail: { tab: 'visual' } }),
    );
  };

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
          onClick={handleDismiss}
          className="text-muted-foreground/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-full p-0.5 shrink-0"
          aria-label="Dismiss photoreal upgrade banner"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
