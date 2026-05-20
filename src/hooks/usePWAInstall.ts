/**
 * PWA install plumbing — wraps the browser's `beforeinstallprompt` flow
 * and the iOS Safari special case (Safari does not fire that event so the
 * user must add the site to the Home Screen manually).
 *
 * Mason runs GlobeRide on an iPad next to the Kickr; "Add to Home Screen"
 * is the difference between a browser tab and a real training app. This
 * hook gives the UI everything it needs to surface that, dismiss it
 * sensibly, and disappear forever once installed.
 */

import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISS_KEY = 'globeride.pwaInstallDismissedAt';
/** Re-surface the prompt after this long so a stale dismiss doesn't hide it forever. */
const DISMISS_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iPad on iPadOS 13+ reports as MacIntel — fall back to the touch-points test.
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && navigator.maxTouchPoints > 1);
}

function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  // iOS Safari exposes a non-standard `standalone` flag on navigator.
  return (window.navigator as { standalone?: boolean }).standalone === true;
}

function isRecentlyDismissed(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

export interface UsePWAInstallReturn {
  /** Browser fired beforeinstallprompt and we have a deferred event ready. */
  canInstall: boolean;
  /** Running on iOS Safari — needs the manual Add-to-Home-Screen path. */
  isIOS: boolean;
  /** App is already running in standalone / installed mode. */
  isStandalone: boolean;
  /** User dismissed the prompt within the TTL window. */
  dismissed: boolean;
  /** Trigger the native install prompt. Resolves true if the user accepted. */
  install: () => Promise<boolean>;
  /** Suppress the affordance for DISMISS_TTL_MS. */
  dismiss: () => void;
}

export function usePWAInstall(): UsePWAInstallReturn {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState<boolean>(() => isStandaloneMode());
  const [dismissed, setDismissed] = useState<boolean>(() => isRecentlyDismissed());
  const [isIOS] = useState<boolean>(() => isIOSDevice());

  useEffect(() => {
    if (typeof window === 'undefined') return;

    function onBeforeInstall(e: Event) {
      // Prevent Chrome's default mini-infobar so we can present our own UI.
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setDeferred(null);
      setIsStandalone(true);
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    const mql = window.matchMedia?.('(display-mode: standalone)');
    const onChange = () => setIsStandalone(isStandaloneMode());
    mql?.addEventListener?.('change', onChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      mql?.removeEventListener?.('change', onChange);
    };
  }, []);

  const install = useCallback(async (): Promise<boolean> => {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    // The deferred event is one-shot — the browser won't re-fire it for this
    // page, so null it out either way and let `appinstalled` settle isStandalone.
    setDeferred(null);
    return outcome === 'accepted';
  }, [deferred]);

  const dismiss = useCallback(() => {
    if (typeof localStorage !== 'undefined') {
      try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* private mode */ }
    }
    setDismissed(true);
  }, []);

  return {
    canInstall: !!deferred && !isStandalone,
    isIOS,
    isStandalone,
    dismissed,
    install,
    dismiss,
  };
}
