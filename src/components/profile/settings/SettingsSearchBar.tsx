/**
 * SettingsSearchBar.tsx — Cross-tab settings search.
 *
 * Indexes all setting entries by tab, label, and description. On each
 * keystroke it filters to matching entries and renders a dropdown. Clicking
 * a result fires onJump(tabId, settingId) so the parent can switch tabs and
 * scroll to the target element.
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';

// ---------------------------------------------------------------------------
// Settings index — every setting name / description mapped to its tab.
// ---------------------------------------------------------------------------

export type TabId = 'rider' | 'trainer' | 'visual' | 'audio' | 'controls' | 'multiplayer' | 'data';

export interface SettingEntry {
  id: string;
  tab: TabId;
  tabLabel: string;
  label: string;
  description?: string;
}

export const TABS: ReadonlyArray<TabId> = [
  'rider', 'trainer', 'visual', 'audio', 'controls', 'multiplayer', 'data',
];

export const ALL_SETTINGS: SettingEntry[] = [
  // Rider
  { id: 'units',         tab: 'rider',   tabLabel: 'Rider',   label: 'Unit system',      description: 'Metric (kg/km·h) or Imperial (lb/mph)' },
  { id: 'ftpW',          tab: 'rider',   tabLabel: 'Rider',   label: 'FTP',              description: 'Functional Threshold Power in watts' },
  { id: 'riderMassKg',   tab: 'rider',   tabLabel: 'Rider',   label: 'Rider weight',     description: 'Body mass used in physics calculations' },
  { id: 'bikeMassKg',    tab: 'rider',   tabLabel: 'Rider',   label: 'Bike weight',      description: 'Bike + accessories mass' },
  { id: 'bikeType',      tab: 'rider',   tabLabel: 'Rider',   label: 'Bike type',        description: 'Road, gravel, or MTB — affects rolling resistance' },
  { id: 'riderPosition', tab: 'rider',   tabLabel: 'Rider',   label: 'Rider position',   description: 'Hoods, drops, or aero — affects drag coefficient' },
  { id: 'windSpeedMs',   tab: 'rider',   tabLabel: 'Rider',   label: 'Wind speed',       description: 'Ambient wind speed' },
  { id: 'windDirectionDeg', tab: 'rider', tabLabel: 'Rider',  label: 'Wind direction',   description: 'Headwind, tailwind, crosswind' },
  // Trainer
  { id: 'demoPowerW',    tab: 'trainer', tabLabel: 'Trainer', label: 'Demo power',       description: 'Target wattage used in demo / no-trainer mode' },
  { id: 'drivetrainEff', tab: 'trainer', tabLabel: 'Trainer', label: 'Drivetrain efficiency', description: 'Mechanical power loss from chain and drivetrain' },
  // Visual
  { id: 'cameraMode',    tab: 'visual',  tabLabel: 'Visual',  label: 'Camera mode',      description: 'Chase, first-person, overhead, side-tracking, cinematic' },
  { id: 'graphicsQuality', tab: 'visual', tabLabel: 'Visual', label: 'Graphics quality', description: 'Low, medium, or high globe rendering quality' },
  { id: 'lowLightHud',   tab: 'visual',  tabLabel: 'Visual',  label: 'Low-light HUD',    description: 'Boost HUD contrast for evening rides' },
  { id: 'avatar',        tab: 'visual',  tabLabel: 'Visual',  label: 'Garage / avatar',  description: 'Jersey, frame, wheel, and helmet colours' },
  // Audio
  { id: 'rideAudioEnabled', tab: 'audio', tabLabel: 'Audio', label: 'Ride sound effects', description: 'Procedural chain noise, road rumble, brake squeal, gear-shift clicks' },
  { id: 'rideAudioVolume',  tab: 'audio', tabLabel: 'Audio', label: 'Ride audio volume',  description: 'Master volume for procedural ride sound effects (0–100)' },
  { id: 'liveCommentaryEnabled', tab: 'audio', tabLabel: 'Audio', label: 'AI commentary', description: 'Live race-style spoken narration during rides' },
  { id: 'commentaryVolume',      tab: 'audio', tabLabel: 'Audio', label: 'Commentary volume', description: 'Volume for spoken commentary (0–100)' },
  { id: 'commentaryRate',        tab: 'audio', tabLabel: 'Audio', label: 'Speech rate',   description: 'Speed of commentary text-to-speech (80–120%)' },
  { id: 'commentaryThrottleSec', tab: 'audio', tabLabel: 'Audio', label: 'Commentary gap', description: 'Minimum seconds between commentary lines' },
  { id: 'workoutVoiceCuesEnabled', tab: 'audio', tabLabel: 'Audio', label: 'Workout voice cues', description: 'Spoken segment transitions and 30-second warnings' },
  { id: 'climbAnnouncementsEnabled', tab: 'audio', tabLabel: 'Audio', label: 'Climb announcements', description: 'Alert when a sustained climb is detected' },
  // Controls
  { id: 'gestureControlsEnabled', tab: 'controls', tabLabel: 'Controls', label: 'Handlebar gestures', description: 'Double-tap, long-press, 2-finger swipe during rides' },
  { id: 'voiceControlEnabled',    tab: 'controls', tabLabel: 'Controls', label: 'Voice control', description: 'Hands-free commands: pause, resume, lap, end ride' },
  // Multiplayer (placeholder — no settings in store yet)
  { id: 'multiplayer-coming-soon', tab: 'multiplayer', tabLabel: 'Multiplayer', label: 'Multiplayer settings', description: 'Room caps and peer-color preferences (coming soon)' },
  // Data
  { id: 'autoUploadStrava', tab: 'data', tabLabel: 'Data', label: 'Auto-upload to Strava', description: 'Upload finished rides automatically to Strava' },
  { id: 'strava-connect',   tab: 'data', tabLabel: 'Data', label: 'Strava connection',     description: 'Connect or disconnect your Strava account' },
  { id: 'clear-data',       tab: 'data', tabLabel: 'Data', label: 'Clear local data',       description: 'Reset all settings, routes, and rides to factory defaults' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SettingsSearchBarProps {
  onJump: (tab: TabId, settingId: string) => void;
}

export function SettingsSearchBar({ onJump }: SettingsSearchBarProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [highlighted, setHighlighted] = useState(0);

  const q = query.trim().toLowerCase();
  // Memoize so the useCallback dep below has a stable identity across renders.
  const results: SettingEntry[] = useMemo(
    () =>
      q
        ? ALL_SETTINGS.filter(
            (e) =>
              e.label.toLowerCase().includes(q) ||
              (e.description?.toLowerCase().includes(q) ?? false) ||
              e.tabLabel.toLowerCase().includes(q),
          )
        : [],
    [q],
  );

  // Reset highlight when results change
  useEffect(() => {
    setHighlighted(0);
  }, [q]);

  const handleSelect = useCallback(
    (entry: SettingEntry) => {
      setQuery('');
      setOpen(false);
      onJump(entry.tab, entry.id);
    },
    [onJump],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlighted((h) => Math.min(h + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlighted((h) => Math.max(h - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (results[highlighted]) handleSelect(results[highlighted]);
      } else if (e.key === 'Escape') {
        setQuery('');
        setOpen(false);
      }
    },
    [results, highlighted, handleSelect],
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (
        !inputRef.current?.contains(e.target as Node) &&
        !listRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card/40 px-3 py-2 focus-within:border-primary/60">
        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          placeholder="Search settings…"
          value={query}
          autoComplete="off"
          spellCheck={false}
          aria-label="Search all settings"
          aria-expanded={open && results.length > 0}
          aria-controls="settings-search-results"
          aria-autocomplete="list"
          role="combobox"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
        />
        {query && (
          <button
            aria-label="Clear search"
            onClick={() => { setQuery(''); setOpen(false); inputRef.current?.focus(); }}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <ul
          id="settings-search-results"
          ref={listRef}
          role="listbox"
          aria-label="Matching settings"
          className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg overflow-hidden max-h-64 overflow-y-auto"
        >
          {results.map((entry, i) => (
            <li
              key={entry.id}
              role="option"
              aria-selected={i === highlighted}
              onPointerDown={(e) => { e.preventDefault(); handleSelect(entry); }}
              className={`flex items-start gap-3 px-3 py-2 cursor-pointer text-xs transition-colors ${
                i === highlighted
                  ? 'bg-primary/10 text-foreground'
                  : 'text-foreground hover:bg-muted/60'
              }`}
            >
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {entry.tabLabel}
              </span>
              <div className="min-w-0">
                <p className="font-medium leading-tight">{entry.label}</p>
                {entry.description && (
                  <p className="text-[11px] text-muted-foreground truncate">{entry.description}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {open && q && results.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover px-3 py-3 shadow-lg text-xs text-muted-foreground">
          No settings match &ldquo;{query}&rdquo;
        </div>
      )}
    </div>
  );
}
