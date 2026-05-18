import { useState } from 'react';
import { ExternalLink, KeyRound, Globe2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * First-run prompt for a free Cesium ion token. Welcoming, clear, not a wall.
 * Persists to localStorage so the user only sees this once.
 */
export function CesiumTokenPrompt({ onSubmit }: { onSubmit: (token: string) => void }) {
  const [value, setValue] = useState('');

  return (
    <Card className="max-w-md mx-auto w-full animate-scaleIn ring-halo">
      {/* Brand mark */}
      <div className="flex flex-col items-center pt-7 pb-1 px-5 gap-3 text-center">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 via-primary/8 to-accent/16 ring-1 ring-border/70 shadow-lg">
          <Globe2 className="h-7 w-7 text-primary drop-shadow-[0_0_8px_hsl(var(--primary)/0.6)]" />
        </div>
        <div>
          <h2 className="text-lg font-bold tracking-tight text-foreground">One small step</h2>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            GlobeRide needs a free Cesium ion token to stream world terrain and
            3D buildings. It takes about a minute to get one.
          </p>
        </div>
      </div>

      <CardContent className="flex flex-col gap-4 pt-4 pb-6">
        {/* CTA to get token */}
        <a
          href="https://ion.cesium.com/tokens"
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/30 px-4 py-3 text-sm font-medium text-foreground hover:border-primary/40 hover:bg-muted/50 transition-all duration-200 group"
        >
          <div>
            <div className="font-semibold text-foreground text-sm">Open ion.cesium.com/tokens</div>
            <div className="text-xs text-muted-foreground mt-0.5">Sign up free → copy your default token</div>
          </div>
          <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
        </a>

        {/* Token input */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="cesium-token" className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <KeyRound className="h-3 w-3" />
            Paste your token here
          </label>
          <input
            id="cesium-token"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            placeholder="eyJhbGciOi…"
            className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary/50 transition-colors font-mono tracking-tight"
          />
          <p className="text-[11px] text-muted-foreground/70">
            Stored in your browser only. Never sent to any server.
          </p>
        </div>

        <Button
          variant="accent"
          size="lg"
          onClick={() => {
            const v = value.trim();
            if (v) onSubmit(v);
          }}
          disabled={value.trim().length < 20}
          className="w-full rounded-pill"
        >
          Save & load the globe
        </Button>
      </CardContent>
    </Card>
  );
}
