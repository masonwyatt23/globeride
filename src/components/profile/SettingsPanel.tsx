import { useState, useMemo, useCallback, useEffect } from 'react';
import { Settings, X, RotateCcw, Bike, Wind, Weight, Activity, Gauge, Zap, CheckCircle2, AlertCircle, Loader2, ExternalLink, Copy, Palette, Monitor } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  useSettingsStore,
  type UnitSystem,
  kgToLb,
  lbToKg,
  msToKmh,
  msToMph,
  MS_PER_KMH,
  MS_PER_MPH,
} from '@/stores/settingsStore';
import { type GraphicsQuality, QUALITY_LABELS } from '@/lib/graphicsQuality';
import { CDA_BY_POSITION, CRR_BY_BIKE, type BikeType, type RiderPosition } from '@/lib/physics';
import { AVATAR_PRESETS, AVATAR_COLOR_ROLES } from '@/lib/avatarConfig';
import { cn } from '@/lib/utils';
import { Section } from '@/components/ui/section-header';
import {
  buildStravaAuthorizeUrl,
  exchangeCodeForRefreshToken,
  saveRefreshTokenOverride,
  getRefreshTokenOverride,
  clearRefreshTokenOverride,
  forceReauth,
} from '@/lib/stravaOauth';
import { verifyStravaAccess, stravaCredsPresent, clearCachedToken, type StravaVerifyResult } from '@/lib/strava';

/**
 * Floating settings panel — opens on top of either Home or Ride. Persists
 * everything to localStorage via the settingsStore so changes survive reload.
 */
export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useSettingsStore();

  if (!open) return null;

  return (
    <div
      id="settings-strava"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Rider settings"
      onClick={onClose}
    >
      <Card
        className="w-full max-w-lg max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            Rider settings
          </CardTitle>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="rounded-full p-1.5 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </CardHeader>
        <CardContent className="space-y-6">
          <UnitsRow value={s.units} onChange={(units) => s.setSettings({ units })} />

          <Section icon={<Weight className="h-4 w-4" />} title="Weight">
            <WeightRow
              units={s.units}
              riderMassKg={s.riderMassKg}
              bikeMassKg={s.bikeMassKg}
              onRiderChange={(riderMassKg) => s.setSettings({ riderMassKg })}
              onBikeChange={(bikeMassKg) => s.setSettings({ bikeMassKg })}
            />
          </Section>

          <Section icon={<Bike className="h-4 w-4" />} title="Bike &amp; position">
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(CRR_BY_BIKE) as BikeType[]).map((b) => (
                <PickerButton
                  key={b}
                  selected={s.bikeType === b}
                  onClick={() => s.setSettings({ bikeType: b })}
                  label={bikeLabel(b)}
                  sub={`Crr ${CRR_BY_BIKE[b].toFixed(3)}`}
                />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {(Object.keys(CDA_BY_POSITION) as RiderPosition[]).map((p) => (
                <PickerButton
                  key={p}
                  selected={s.riderPosition === p}
                  onClick={() => s.setSettings({ riderPosition: p })}
                  label={positionLabel(p)}
                  sub={`CdA ${CDA_BY_POSITION[p].toFixed(2)} m²`}
                />
              ))}
            </div>
          </Section>

          <Section icon={<Activity className="h-4 w-4" />} title="Drivetrain">
            <SliderRow
              label="Efficiency"
              min={88}
              max={100}
              step={0.5}
              value={s.drivetrainEff * 100}
              suffix="%"
              onChange={(pct) => s.setSettings({ drivetrainEff: pct / 100 })}
            />
          </Section>

          <Section icon={<Wind className="h-4 w-4" />} title="Wind">
            <WindRow
              units={s.units}
              windSpeedMs={s.windSpeedMs}
              windDirectionDeg={s.windDirectionDeg}
              onSpeedChange={(windSpeedMs) => s.setSettings({ windSpeedMs })}
              onDirChange={(windDirectionDeg) => s.setSettings({ windDirectionDeg })}
            />
          </Section>

          <Section icon={<Gauge className="h-4 w-4" />} title="Demo Mode power">
            <SliderRow
              label="Target power"
              min={80}
              max={400}
              step={5}
              value={s.demoPowerW}
              suffix=" W"
              onChange={(v) => s.setSettings({ demoPowerW: v })}
            />
          </Section>

          {/* Graphics quality */}
          <GraphicsSection />

          {/* Avatar garage */}
          <GarageSection />

          {/* Strava integration */}
          <StravaSection />

          <div className="flex items-center justify-between pt-2">
            <Button variant="ghost" size="sm" onClick={() => s.reset()}>
              <RotateCcw className="h-4 w-4" /> Restore defaults
            </Button>
            <Button variant="accent" size="sm" onClick={onClose}>
              Done
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Strava section
// ---------------------------------------------------------------------------

type StravaFlowStep = 'idle' | 'waiting_code' | 'exchanging' | 'done';

function StravaSection() {
  const autoUploadStrava = useSettingsStore((st) => st.autoUploadStrava);
  const setSettings = useSettingsStore((st) => st.setSettings);

  const [verifyResult, setVerifyResult] = useState<StravaVerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [flowStep, setFlowStep] = useState<StravaFlowStep>('idle');
  const [codeInput, setCodeInput] = useState('');
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const [hasOverride, setHasOverride] = useState(() => !!getRefreshTokenOverride());

  // Auto-verify on mount if creds are present
  useEffect(() => {
    if (stravaCredsPresent()) {
      handleVerify();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleVerify = useCallback(async () => {
    setVerifying(true);
    setVerifyResult(null);
    const result = await verifyStravaAccess();
    setVerifyResult(result);
    setVerifying(false);
  }, []);

  const handleConnect = useCallback(() => {
    // Validate that client_id is set before opening the tab
    if (!import.meta.env.VITE_STRAVA_CLIENT_ID) {
      setExchangeError(
        'VITE_STRAVA_CLIENT_ID is not set. Add it to .env.local and restart the dev server.',
      );
      return;
    }
    const url = buildStravaAuthorizeUrl();
    window.open(url, '_blank', 'noopener,noreferrer');
    setFlowStep('waiting_code');
    setExchangeError(null);
  }, []);

  const handleExchange = useCallback(async () => {
    const trimmed = codeInput.trim();
    if (!trimmed) return;
    setFlowStep('exchanging');
    setExchangeError(null);
    try {
      const result = await exchangeCodeForRefreshToken(trimmed);
      // Token is auto-saved by exchangeCodeForRefreshToken
      setHasOverride(true);
      setFlowStep('done');
      setCodeInput('');
      // Clear the cached access token so it re-fetches with the new refresh token
      clearCachedToken();
      // Re-verify with the new token
      setVerifying(true);
      const freshResult = await verifyStravaAccess();
      setVerifyResult(freshResult);
      setVerifying(false);
      // Athlete name comes from the exchange result if verify fails
      if (!freshResult.ok && result.athlete) {
        setVerifyResult({
          ok: true,
          athleteName: [result.athlete.firstname, result.athlete.lastname]
            .filter(Boolean)
            .join(' '),
        });
      }
    } catch (err) {
      setExchangeError(err instanceof Error ? err.message : String(err));
      setFlowStep('waiting_code');
    }
  }, [codeInput]);

  const handleDisconnect = useCallback(() => {
    clearRefreshTokenOverride();
    clearCachedToken();
    setHasOverride(false);
    setVerifyResult(null);
    setFlowStep('idle');
    setCodeInput('');
    setExchangeError(null);
  }, []);

  const canConnect = !!(
    import.meta.env.VITE_STRAVA_CLIENT_ID &&
    import.meta.env.VITE_STRAVA_CLIENT_SECRET
  );

  return (
    <Section icon={<Zap className="h-4 w-4" />} title="Strava">
      <div className="space-y-3">
        {/* Status chip */}
        <div className="flex items-center gap-2">
          <StravaStatusChip verifying={verifying} result={verifyResult} />
          <button
            onClick={handleVerify}
            disabled={verifying}
            className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
            aria-label="Test Strava connection"
          >
            {verifying ? 'Checking…' : 'Test connection'}
          </button>
        </div>

        {/* Auto-upload toggle */}
        <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/40 px-3 py-2 cursor-pointer select-none">
          <div>
            <p className="text-xs font-medium text-foreground">Auto-upload finished rides</p>
            <p className="text-[11px] text-muted-foreground">
              Automatically upload to Strava when a ride finishes (requires Strava connected)
            </p>
          </div>
          <input
            type="checkbox"
            role="switch"
            aria-label="Auto-upload finished rides to Strava"
            checked={autoUploadStrava}
            onChange={(e) => setSettings({ autoUploadStrava: e.target.checked })}
            className="h-4 w-4 accent-primary cursor-pointer shrink-0"
          />
        </label>

        {/* Insufficient scope warning */}
        {verifyResult && !verifyResult.ok && verifyResult.error?.kind === 'insufficient_scope' && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/8 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 space-y-1">
            <p className="font-semibold">Refresh token lacks activity:write scope</p>
            <p>
              Your current token only has <code>activity:read</code>.
              Uploads will fail with 401. Click below to re-authorize with
              the correct scope — this will clear the stale token and open
              the Strava authorization page immediately.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-1 border-amber-500/50 text-amber-700 dark:text-amber-300 hover:border-amber-500 hover:bg-amber-500/10 focus-visible:ring-amber-500/40"
              onClick={() => forceReauth(clearCachedToken)}
            >
              Re-authorize with activity:write
            </Button>
          </div>
        )}

        {/* Not configured notice */}
        {!canConnect && (
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground space-y-1">
            <p className="font-semibold text-foreground">Credentials not configured</p>
            <p>
              Add <code>VITE_STRAVA_CLIENT_ID</code> and <code>VITE_STRAVA_CLIENT_SECRET</code> to{' '}
              <code>.env.local</code>, then restart the dev server.
            </p>
          </div>
        )}

        {/* Connect / Re-authorize button */}
        {canConnect && flowStep === 'idle' && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="hover:border-[#FC4C02]/60 hover:text-[#FC4C02] focus-visible:ring-[#FC4C02]/40"
              onClick={handleConnect}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {hasOverride || verifyResult?.ok ? 'Re-authorize Strava' : 'Connect Strava'}
            </Button>
            {hasOverride && (
              <button
                onClick={handleDisconnect}
                className="text-[11px] text-muted-foreground hover:text-destructive underline underline-offset-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive rounded"
              >
                Disconnect
              </button>
            )}
          </div>
        )}

        {/* Authorization flow — waiting for the user to paste the code */}
        {canConnect && (flowStep === 'waiting_code' || flowStep === 'exchanging') && (
          <div className="space-y-2 rounded-lg border border-border bg-card/40 px-3 py-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground">Step 1</span> — A Strava authorization
              page opened in a new tab. Approve the request (scope:{' '}
              <code className="text-[10px]">activity:write,activity:read_all</code>).
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground">Step 2</span> — After approving, copy
              the <code className="text-[10px]">code</code> value from the URL bar (it looks like{' '}
              <code className="text-[10px]">?code=abc123…</code>) and paste it below.
            </p>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="text"
                placeholder="Paste authorization code…"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleExchange(); }}
                disabled={flowStep === 'exchanging'}
                className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50"
                aria-label="Authorization code"
                autoComplete="off"
                spellCheck={false}
              />
              <Button
                size="sm"
                variant="default"
                onClick={handleExchange}
                disabled={!codeInput.trim() || flowStep === 'exchanging'}
              >
                {flowStep === 'exchanging' ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Exchanging…</>
                ) : (
                  'Confirm'
                )}
              </Button>
            </div>
            {exchangeError && (
              <p className="text-[11px] text-destructive mt-1">{exchangeError}</p>
            )}
            <button
              onClick={() => { setFlowStep('idle'); setCodeInput(''); setExchangeError(null); }}
              className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Success confirmation after exchange */}
        {flowStep === 'done' && (
          <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            New refresh token saved — uploads will use activity:write scope.
          </div>
        )}

        {/* Instruction callout for manual env-var approach */}
        <details className="group">
          <summary className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors list-none flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded">
            <Copy className="h-3 w-3" />
            <span>Or paste a refresh token directly</span>
          </summary>
          <div className="mt-2 space-y-2">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              If you already have a refresh token with <code>activity:write</code> scope, paste it
              here. It will be stored in <code>localStorage</code> and override the env var without
              requiring a server restart.
            </p>
            <PasteRefreshTokenField onSave={(token) => {
              saveRefreshTokenOverride(token);
              clearCachedToken();
              setHasOverride(true);
              handleVerify();
            }} />
          </div>
        </details>
      </div>
    </Section>
  );
}

function StravaStatusChip({
  verifying,
  result,
}: {
  verifying: boolean;
  result: StravaVerifyResult | null;
}) {
  if (verifying) {
    return (
      <Badge variant="muted" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking…
      </Badge>
    );
  }

  if (!stravaCredsPresent()) {
    return <Badge variant="muted">Not configured</Badge>;
  }

  if (!result) {
    return <Badge variant="muted">Not tested</Badge>;
  }

  if (result.ok) {
    return (
      <Badge variant="success" className="gap-1">
        <CheckCircle2 className="h-3 w-3" />
        Connected{result.athleteName ? ` as ${result.athleteName}` : ''}
      </Badge>
    );
  }

  const kind = result.error?.kind;
  if (kind === 'insufficient_scope') {
    return (
      <Badge variant="warning" className="gap-1">
        <AlertCircle className="h-3 w-3" />
        Insufficient scope
      </Badge>
    );
  }
  if (kind === 'creds_missing') {
    return <Badge variant="muted">Not configured</Badge>;
  }
  if (kind === 'refresh_failed') {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertCircle className="h-3 w-3" />
        Auth failed
      </Badge>
    );
  }

  return (
    <Badge variant="destructive" className="gap-1">
      <AlertCircle className="h-3 w-3" />
      Error
    </Badge>
  );
}

function PasteRefreshTokenField({ onSave }: { onSave: (token: string) => void }) {
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <input
        type="password"
        placeholder="Paste refresh token…"
        value={value}
        onChange={(e) => { setValue(e.target.value); setSaved(false); }}
        className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        aria-label="Strava refresh token override"
        autoComplete="off"
        spellCheck={false}
      />
      <Button
        size="sm"
        variant="outline"
        disabled={!value.trim() || saved}
        onClick={() => {
          if (!value.trim()) return;
          onSave(value.trim());
          setValue('');
          setSaved(true);
        }}
      >
        {saved ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : 'Save'}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents — kept colocated since they only matter inside this panel.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Garage — avatar appearance
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Graphics quality
// ---------------------------------------------------------------------------

const QUALITY_TIERS: GraphicsQuality[] = ['low', 'medium', 'high'];

function GraphicsSection() {
  const quality = useSettingsStore((st) => st.graphicsQuality);
  const setSettings = useSettingsStore((st) => st.setSettings);

  return (
    <Section icon={<Monitor className="h-4 w-4" />} title="Graphics">
      <div className="grid grid-cols-3 gap-2">
        {QUALITY_TIERS.map((tier) => (
          <PickerButton
            key={tier}
            selected={quality === tier}
            onClick={() => setSettings({ graphicsQuality: tier })}
            label={QUALITY_LABELS[tier].label}
            sub={QUALITY_LABELS[tier].sub}
          />
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Controls anti-aliasing, shadows, fog, and tile detail on the 3D globe.
        Use <span className="font-semibold text-foreground">Low</span> on integrated
        GPUs or for longer battery life.
      </p>
    </Section>
  );
}

function GarageSection() {
  const avatar = useSettingsStore((st) => st.avatar);
  const setSettings = useSettingsStore((st) => st.setSettings);
  const activePresetId = AVATAR_PRESETS.find((p) =>
    AVATAR_COLOR_ROLES.every((r) => p.colors[r.key] === avatar[r.key]),
  )?.id;

  return (
    <Section icon={<Palette className="h-4 w-4" />} title="Garage">
      <div className="grid grid-cols-3 gap-2">
        {AVATAR_PRESETS.map((p) => (
          <PickerButton
            key={p.id}
            selected={activePresetId === p.id}
            onClick={() => setSettings({ avatar: p.colors })}
            label={p.name}
            sub="preset"
          />
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {AVATAR_COLOR_ROLES.map((role) => (
          <label
            key={role.key}
            className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card/40 px-3 py-2 text-sm"
          >
            <span className="text-muted-foreground">{role.label}</span>
            <input
              type="color"
              value={avatar[role.key]}
              onChange={(e) =>
                setSettings({ avatar: { ...avatar, [role.key]: e.target.value } })
              }
              className="h-6 w-9 cursor-pointer rounded border border-border bg-transparent p-0"
              aria-label={`${role.label} colour`}
            />
          </label>
        ))}
      </div>
    </Section>
  );
}

function UnitsRow({ value, onChange }: { value: UnitSystem; onChange: (u: UnitSystem) => void }) {
  return (
    <div className="flex items-center justify-end gap-1 text-xs" role="group" aria-label="Unit system">
      <button
        aria-pressed={value === 'metric'}
        className={cn(
          'rounded-md px-2 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          value === 'metric' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/60',
        )}
        onClick={() => onChange('metric')}
      >
        kg · km/h
      </button>
      <button
        aria-pressed={value === 'imperial'}
        className={cn(
          'rounded-md px-2 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          value === 'imperial' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/60',
        )}
        onClick={() => onChange('imperial')}
      >
        lb · mph
      </button>
    </div>
  );
}

function PickerButton({
  selected,
  onClick,
  label,
  sub,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  sub: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center justify-center gap-0.5 rounded-lg border px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        selected
          ? 'border-primary/60 bg-primary/10 text-foreground'
          : 'border-border bg-card/40 text-muted-foreground hover:text-foreground hover:bg-card/60',
      )}
    >
      <span className="text-sm font-semibold">{label}</span>
      <span className="text-[10px] num">{sub}</span>
    </button>
  );
}

function WeightRow({
  units,
  riderMassKg,
  bikeMassKg,
  onRiderChange,
  onBikeChange,
}: {
  units: UnitSystem;
  riderMassKg: number;
  bikeMassKg: number;
  onRiderChange: (kg: number) => void;
  onBikeChange: (kg: number) => void;
}) {
  const imperial = units === 'imperial';
  const riderDisplay = useMemo(
    () => (imperial ? kgToLb(riderMassKg) : riderMassKg),
    [imperial, riderMassKg],
  );
  const bikeDisplay = useMemo(
    () => (imperial ? kgToLb(bikeMassKg) : bikeMassKg),
    [imperial, bikeMassKg],
  );
  const unit = imperial ? 'lb' : 'kg';

  return (
    <div className="grid grid-cols-2 gap-3">
      <NumberField
        label="Rider"
        unit={unit}
        value={riderDisplay}
        step={imperial ? 1 : 0.5}
        min={imperial ? 60 : 30}
        max={imperial ? 400 : 180}
        onChange={(v) => onRiderChange(imperial ? lbToKg(v) : v)}
      />
      <NumberField
        label="Bike"
        unit={unit}
        value={bikeDisplay}
        step={imperial ? 0.5 : 0.2}
        min={imperial ? 8 : 4}
        max={imperial ? 50 : 22}
        onChange={(v) => onBikeChange(imperial ? lbToKg(v) : v)}
      />
    </div>
  );
}

function WindRow({
  units,
  windSpeedMs,
  windDirectionDeg,
  onSpeedChange,
  onDirChange,
}: {
  units: UnitSystem;
  windSpeedMs: number;
  windDirectionDeg: number;
  onSpeedChange: (ms: number) => void;
  onDirChange: (deg: number) => void;
}) {
  const imperial = units === 'imperial';
  const speedDisplay = imperial ? msToMph(windSpeedMs) : msToKmh(windSpeedMs);
  const speedUnit = imperial ? 'mph' : 'km/h';
  const toMs = (v: number) => (imperial ? v * MS_PER_MPH : v * MS_PER_KMH);

  return (
    <div className="space-y-3">
      <SliderRow
        label="Speed"
        min={0}
        max={imperial ? 30 : 50}
        step={imperial ? 0.5 : 1}
        value={speedDisplay}
        suffix={` ${speedUnit}`}
        onChange={(v) => onSpeedChange(toMs(v))}
      />
      <div>
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span>Direction</span>
          <span className="num text-foreground">{windDescription(windDirectionDeg)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={360}
          step={5}
          value={windDirectionDeg}
          onChange={(e) => onDirChange(Number(e.target.value))}
          className="w-full accent-primary"
          aria-label="Wind direction"
        />
      </div>
    </div>
  );
}

function SliderRow({
  label,
  min,
  max,
  step,
  value,
  suffix,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
        <span>{label}</span>
        <span className="num text-foreground">
          {formatNumber(value, step)}{suffix ?? ''}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
        aria-label={label}
      />
    </div>
  );
}

function NumberField({
  label,
  unit,
  value,
  step,
  min,
  max,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  step: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5 rounded-md border border-border bg-card/40 px-2 py-1.5 focus-within:border-primary/60">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={formatNumber(value, step)}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onChange(v);
          }}
          aria-label={label}
          className="num bg-transparent w-full text-sm text-foreground outline-none"
        />
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

function bikeLabel(b: BikeType): string {
  return b === 'mtb' ? 'MTB' : b[0].toUpperCase() + b.slice(1);
}
function positionLabel(p: RiderPosition): string {
  return p[0].toUpperCase() + p.slice(1);
}
function formatNumber(v: number, step: number): string {
  if (step >= 1) return Math.round(v).toString();
  if (step >= 0.5) return (Math.round(v * 2) / 2).toFixed(1);
  if (step >= 0.1) return (Math.round(v * 10) / 10).toFixed(1);
  return (Math.round(v * 100) / 100).toFixed(2);
}

/** Map degrees of wind direction to a readable label (and an arrow). */
function windDescription(deg: number): string {
  const d = ((deg % 360) + 360) % 360;
  // 0 = headwind ↓ from rider's pov, 180 = tailwind ↑
  if (d < 22.5 || d >= 337.5) return 'Headwind ↓';
  if (d < 67.5) return 'Head-right ↘';
  if (d < 112.5) return 'Crosswind → (R)';
  if (d < 157.5) return 'Tail-right ↗';
  if (d < 202.5) return 'Tailwind ↑';
  if (d < 247.5) return 'Tail-left ↖';
  if (d < 292.5) return 'Crosswind ← (L)';
  return 'Head-left ↙';
}

/**
 * Standalone trigger button — drop into any toolbar; pairs with SettingsPanel.
 * Manages its own open/close state for convenience.
 */
export function SettingsButton({
  className,
  variant = 'outline',
  size = 'icon',
  showLabel = false,
}: {
  className?: string;
  variant?: 'outline' | 'ghost' | 'default' | 'accent';
  size?: 'icon' | 'sm' | 'default' | 'lg';
  showLabel?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={() => setOpen(true)}
        aria-label="Open settings"
      >
        <Settings className="h-4 w-4" />
        {showLabel && <span>Settings</span>}
      </Button>
      <SettingsPanel open={open} onClose={() => setOpen(false)} />
    </>
  );
}
