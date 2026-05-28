/**
 * CesiumIonTokenSection.tsx — "Boost graphics: photoreal Earth" affordance.
 *
 * Lives inside the Visual tab of SettingsPanel. Replaces the old hard
 * `CesiumTokenPrompt` modal that gated /ride and /explore. The app now
 * works without a token (OSM imagery + flat terrain); this section is the
 * opt-in path for the photoreal upgrade.
 *
 * Three states:
 *   1. **No token installed** — show the "Get a free token" CTA, paste
 *      field, and 3-step instructions.
 *   2. **Env-supplied token** — show a read-only "Provided by VITE_CESIUM_ION_TOKEN"
 *      pill; no remove button (the env var wins regardless).
 *   3. **Locally-saved token** — show a "Connected" pill with a Remove
 *      button.
 *
 * Storage is the same as the legacy modal: localStorage key
 * `globeride.cesiumIonToken`. Saving fires a reload prompt because the
 * Cesium viewer caches its terrain/imagery providers on first construct.
 */
import { useState } from 'react';
import { ExternalLink, KeyRound, Sparkles, CheckCircle2, Trash2 } from 'lucide-react';
import { Section } from '@/components/ui/section-header';

const TOKEN_STORAGE_KEY = 'globeride.cesiumIonToken';

/**
 * Read the current ion token. Returns `{ value, source }` so the UI can
 * differentiate env-supplied tokens (which the user cannot remove from the
 * app) from locally-saved ones.
 */
function readToken(): { value: string; source: 'env' | 'local' } | null {
  const envToken = import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined;
  if (envToken && envToken.trim().length > 0) {
    return { value: envToken.trim(), source: 'env' };
  }
  try {
    const stored = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (stored && stored.trim().length > 0) {
      return { value: stored.trim(), source: 'local' };
    }
  } catch {
    // localStorage blocked — treat as no token.
  }
  return null;
}

export function CesiumIonTokenSection() {
  const [token, setToken] = useState<{ value: string; source: 'env' | 'local' } | null>(() =>
    readToken(),
  );
  const [draft, setDraft] = useState('');
  const [touched, setTouched] = useState(false);

  const trimmed = draft.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < 20;

  const handleSave = () => {
    if (trimmed.length < 20) return;
    try {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, trimmed);
    } catch {
      // Storage blocked — the user will need to retry.
      return;
    }
    setToken({ value: trimmed, source: 'local' });
    setDraft('');
    setTouched(false);
    // Cesium caches the token on viewer construct. Reload so the next
    // viewer picks up the new providers (Bing Aerial + World Terrain).
    window.location.reload();
  };

  const handleRemove = () => {
    try {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      return;
    }
    setToken(null);
    window.location.reload();
  };

  return (
    <Section
      icon={<Sparkles className="h-4 w-4" />}
      title="Photoreal Earth (Cesium ion)"
    >
      <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
        GlobeRide works out of the box with OpenStreetMap tiles. Adding a
        free Cesium ion token unlocks{' '}
        <span className="font-semibold text-foreground">Bing Aerial satellite imagery</span>,{' '}
        <span className="font-semibold text-foreground">Cesium World Terrain</span>, and{' '}
        <span className="font-semibold text-foreground">Google Photoreal 3D Tiles</span>{' '}
        — the photoreal Earth.
      </p>

      {token ? (
        <div className="rounded-lg border border-border bg-card/40 px-3 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" aria-hidden="true" />
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium text-foreground">
                {token.source === 'env' ? 'Provided by environment' : 'Token connected'}
              </span>
              <span className="text-[11px] text-muted-foreground truncate font-mono">
                {token.value.slice(0, 12)}…
              </span>
            </div>
          </div>
          {token.source === 'local' && (
            <button
              type="button"
              onClick={handleRemove}
              aria-label="Remove saved Cesium ion token"
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
            >
              <Trash2 className="h-3 w-3" aria-hidden="true" />
              Remove
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Step 1: get a token */}
          <a
            href="https://ion.cesium.com/tokens"
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2.5 hover:border-primary/40 hover:bg-muted/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary group"
          >
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-foreground">
                Get a free token at ion.cesium.com
              </span>
              <span className="text-[11px] text-muted-foreground">
                Free + unlimited for personal use — no credit card.
              </span>
            </div>
            <ExternalLink
              className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0"
              aria-hidden="true"
            />
          </a>

          {/* Step 2: paste it */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="cesium-ion-token-input"
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
            >
              <KeyRound className="h-3 w-3" aria-hidden="true" />
              Paste your token
            </label>
            <input
              id="cesium-ion-token-input"
              type="text"
              value={draft}
              onChange={(e) => { setDraft(e.target.value); setTouched(true); }}
              onBlur={() => setTouched(true)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              placeholder="eyJhbGciOi…"
              aria-invalid={touched && tooShort ? 'true' : undefined}
              className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary/50 aria-[invalid=true]:border-destructive/60 transition-colors font-mono tracking-tight"
            />
            {touched && tooShort && (
              <p className="text-[11px] text-destructive/80" role="alert">
                Token looks too short — copy the full token (starts with “eyJ”).
              </p>
            )}
            {!touched && (
              <p className="text-[11px] text-muted-foreground/70">
                Stored in your browser only. Reloads the page to apply.
              </p>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={trimmed.length < 20}
              className="mt-1 self-start rounded-pill bg-accent text-accent-foreground px-4 py-1.5 text-xs font-semibold hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Save token &amp; reload
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}
