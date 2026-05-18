import { useState } from 'react';
import { ExternalLink, KeyRound } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Inline prompt for a free Cesium ion access token. Cesium ≥ 1.105
 * removed its default token, so the globe will render flat (or not at all)
 * until the user pastes one in. We persist it to localStorage.
 */
export function CesiumTokenPrompt({ onSubmit }: { onSubmit: (token: string) => void }) {
  const [value, setValue] = useState('');

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" />
          Add a free Cesium ion token
        </CardTitle>
        <CardDescription className="leading-relaxed">
          GlobeRide uses Cesium ion to stream world terrain and OSM 3D buildings.
          The free tier is generous — sign up, copy your default token, and paste
          it below. We store it in your browser only.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <a
          href="https://ion.cesium.com/tokens"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline self-start"
        >
          Open ion.cesium.com/tokens
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          placeholder="eyJhbGciOi…"
          className="w-full rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <div className="flex items-center gap-2 justify-end">
          <Button
            variant="default"
            onClick={() => {
              const v = value.trim();
              if (v) onSubmit(v);
            }}
            disabled={value.trim().length < 20}
          >
            Save & continue
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
