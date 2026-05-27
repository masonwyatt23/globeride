import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, Globe2, KeyRound } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/**
 * CesiumTokenPrompt — friendly first-run dialog for a free Cesium ion token.
 *
 * A11y contract:
 *   - role="dialog" + aria-modal="true" + aria-labelledby + aria-describedby
 *   - Focus trapped inside the card while visible (Tab / Shift-Tab wrap)
 *   - Escape key invokes onDismiss when provided
 *   - Auto-focuses the token input on mount
 *
 * Storage is the caller's responsibility — this component fires onSubmit with
 * the token string and the parent (Ride.tsx) writes to localStorage.
 */
export function CesiumTokenPrompt({
  onSubmit,
  onDismiss,
}: {
  onSubmit: (token: string) => void;
  /** Optional. When provided: Escape closes and a "Skip" link appears. */
  onDismiss?: () => void;
}) {
  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(false);
  const [expandedHelp, setExpandedHelp] = useState(false);

  const trimmed = value.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < 20;

  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  // Auto-focus input on mount.
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Focus trap + Escape handling.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onDismiss?.(); return; }
      if (e.key !== 'Tab') return;

      const dialog = dialogRef.current;
      if (!dialog) return;

      const nodes = dialog.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])',
      );
      if (nodes.length === 0) return;

      const first = nodes[0];
      const last  = nodes[nodes.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onDismiss]);

  const handleSubmit = () => {
    if (trimmed.length >= 20) onSubmit(trimmed);
  };

  return (
    <Card
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cesium-prompt-title"
      aria-describedby="cesium-prompt-desc"
      className="max-w-md mx-auto w-full animate-scaleIn ring-halo"
    >
      {/* Brand mark */}
      <div className="flex flex-col items-center pt-7 pb-1 px-5 gap-3 text-center">
        <div
          className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 via-primary/8 to-accent/16 ring-1 ring-border/70 shadow-lg"
          aria-hidden="true"
        >
          <Globe2 className="h-7 w-7 text-primary drop-shadow-[0_0_8px_hsl(var(--primary)/0.6)]" />
        </div>
        <div>
          <h2
            id="cesium-prompt-title"
            className="text-lg font-bold tracking-tight text-foreground"
          >
            Connect to Cesium ion
          </h2>
          <p id="cesium-prompt-desc" className="text-sm text-muted-foreground mt-1 leading-relaxed">
            Required for the photoreal 3D globe. Free + unlimited for personal use — takes about a
            minute to set up.
          </p>
        </div>
      </div>

      <CardContent className="flex flex-col gap-5 pt-4 pb-6">
        {/* Numbered steps */}
        <ol className="flex flex-col gap-2.5" aria-label="Steps to get a Cesium ion token">
          <Step n={1}>
            Visit{' '}
            <a
              href="https://ion.cesium.com/tokens"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-2 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 rounded-sm"
            >
              ion.cesium.com/tokens
            </a>{' '}
            and sign up for free.
          </Step>
          <Step n={2}>Click "Create token" — the default settings are fine.</Step>
          <Step n={3}>Copy the token and paste it below.</Step>
        </ol>

        {/* CTA link */}
        <a
          href="https://ion.cesium.com/tokens"
          target="_blank"
          rel="noreferrer"
          aria-label="Open ion.cesium.com/tokens (opens in new tab)"
          className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/30 px-4 py-3 text-sm font-medium text-foreground hover:border-primary/40 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-all duration-200 group"
        >
          <div>
            <div className="font-semibold text-foreground text-sm">Open ion.cesium.com/tokens</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Sign up free → copy your default token
            </div>
          </div>
          <ExternalLink
            className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0"
            aria-hidden="true"
          />
        </a>

        {/* Token input */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="cesium-token"
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <KeyRound className="h-3 w-3" aria-hidden="true" />
            Paste your token here
          </label>
          <input
            ref={inputRef}
            id="cesium-token"
            aria-label="Cesium ion access token"
            value={value}
            onChange={(e) => { setValue(e.target.value); setTouched(true); }}
            onBlur={() => setTouched(true)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            placeholder="eyJhbGciOi…"
            aria-required="true"
            aria-invalid={touched && tooShort ? 'true' : undefined}
            aria-describedby={touched && tooShort ? 'cesium-token-error' : 'cesium-token-hint'}
            className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary/50 aria-[invalid=true]:border-destructive/60 aria-[invalid=true]:focus:ring-destructive/50 transition-colors font-mono tracking-tight"
          />
          {touched && tooShort ? (
            <p id="cesium-token-error" className="text-[11px] text-destructive/80" role="alert">
              Token looks too short — copy the full token from ion.cesium.com.
            </p>
          ) : (
            <p id="cesium-token-hint" className="text-[11px] text-muted-foreground/70">
              Stored in your browser only. Never sent to any server.
            </p>
          )}
        </div>

        {/* "Where do I find the token?" expanding help */}
        <div className="rounded-xl border border-border/60 overflow-hidden">
          <button
            type="button"
            aria-expanded={expandedHelp}
            aria-controls="cesium-help-body"
            onClick={() => setExpandedHelp((o) => !o)}
            className="flex w-full items-center justify-between px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset transition-colors"
          >
            <span className="font-medium">Where do I find the token?</span>
            {expandedHelp
              ? <ChevronUp   className="h-4 w-4 shrink-0" aria-hidden="true" />
              : <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />}
          </button>

          {expandedHelp && (
            <div
              id="cesium-help-body"
              className="px-4 pb-4 pt-1 flex flex-col gap-2 text-sm text-muted-foreground border-t border-border/60 bg-muted/10"
            >
              <p>After signing in at ion.cesium.com:</p>
              <ol className="flex flex-col gap-1 pl-4 list-decimal marker:text-muted-foreground/60 text-xs leading-relaxed">
                <li>Click "Access Tokens" in the left sidebar.</li>
                <li>
                  Select "My default token" (created on sign-up) or click "Create token" for a
                  new one.
                </li>
                <li>
                  Click the copy icon next to the token string — it starts with{' '}
                  <code className="font-mono text-[11px] bg-muted px-1 rounded">eyJ</code>.
                </li>
                <li>Come back here and paste it in the field above.</li>
              </ol>
              <p className="text-[11px] mt-1">
                The free tier is unlimited for personal / open-source use. No credit card needed.
              </p>
            </div>
          )}
        </div>

        {/* Submit */}
        <Button
          variant="accent"
          size="lg"
          onClick={handleSubmit}
          disabled={trimmed.length < 20}
          aria-label="Save token and load the globe"
          className="w-full rounded-pill focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Save &amp; load the globe
        </Button>

        {/* Optional dismiss / skip */}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs text-muted-foreground/60 hover:text-muted-foreground underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 rounded-sm self-center transition-colors"
          >
            Skip — use static globe instead
          </button>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary mt-0.5"
        aria-hidden="true"
      >
        {n}
      </span>
      <span className="text-sm text-muted-foreground leading-relaxed">{children}</span>
    </li>
  );
}
