/**
 * SettingsPanel.tsx — Tabbed settings dialog.
 *
 * Replaces the former single-scroll layout with 7 tabs:
 *   Rider · Trainer · Visual · Audio · Controls · Multiplayer · Data
 *
 * Search bar above the tabs jumps directly to the relevant tab + scrolls
 * to the target field (via an id anchor on each section heading).
 *
 * Keyboard navigation: Arrow Left/Right cycles tabs when the tab strip is
 * focused. Tab key moves through interactive elements normally.
 *
 * Mobile: the tab strip scrolls horizontally; active panel is full-width.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Settings, X, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSettingsStore } from '@/stores/settingsStore';
import { cn } from '@/lib/utils';

import { RiderSettings }       from './settings/RiderSettings';
import { TrainerSettings }     from './settings/TrainerSettings';
import { VisualSettings }      from './settings/VisualSettings';
import { AudioSettings }       from './settings/AudioSettings';
import { ControlsSettings }    from './settings/ControlsSettings';
import { MultiplayerSettings } from './settings/MultiplayerSettings';
import { DataSettings }        from './settings/DataSettings';
import {
  SettingsSearchBar,
  TABS,
  type TabId,
} from './settings/SettingsSearchBar';

// ---------------------------------------------------------------------------
// Tab labels
// ---------------------------------------------------------------------------

const TAB_LABELS: Record<TabId, string> = {
  rider:       'Rider',
  trainer:     'Trainer',
  visual:      'Visual',
  audio:       'Audio',
  controls:    'Controls',
  multiplayer: 'Multiplayer',
  data:        'Data',
};

const TAB_PANEL: Record<TabId, React.ComponentType> = {
  rider:       RiderSettings,
  trainer:     TrainerSettings,
  visual:      VisualSettings,
  audio:       AudioSettings,
  controls:    ControlsSettings,
  multiplayer: MultiplayerSettings,
  data:        DataSettings,
};

// ---------------------------------------------------------------------------
// SettingsPanel
// ---------------------------------------------------------------------------

/**
 * Floating settings dialog — opens on top of either Home or Ride. Persists
 * everything to localStorage via the settingsStore so changes survive reload.
 */
export function SettingsPanel({
  open,
  onClose,
  initialTab = 'rider',
}: {
  open: boolean;
  onClose: () => void;
  /** Tab to focus when the panel opens. Defaults to 'rider'. */
  initialTab?: TabId;
}) {
  const reset = useSettingsStore((s) => s.reset);
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Re-sync the active tab when the caller asks us to open with a specific
  // initial tab (e.g. NoTokenBanner → 'visual'). Without this the second
  // open of the panel would stay on whatever tab the user last viewed.
  useEffect(() => {
    if (open) setActiveTab(initialTab);
  }, [open, initialTab]);

  // Jump to a tab (and optionally a setting anchor) from the search bar
  const handleJump = useCallback((tab: TabId, settingId: string) => {
    setActiveTab(tab);
    requestAnimationFrame(() => {
      const el = document.getElementById(`setting-${settingId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.classList.add('ring-2', 'ring-primary/60', 'rounded');
      setTimeout(() => el?.classList.remove('ring-2', 'ring-primary/60', 'rounded'), 1800);
    });
  }, []);

  // Arrow-key navigation on the tab strip
  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const next = (idx + 1) % TABS.length;
        setActiveTab(TABS[next]);
        tabRefs.current[next]?.focus();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const prev = (idx - 1 + TABS.length) % TABS.length;
        setActiveTab(TABS[prev]);
        tabRefs.current[prev]?.focus();
      }
    },
    [],
  );

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const ActivePanel = TAB_PANEL[activeTab];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Rider settings"
      onClick={onClose}
    >
      <Card
        className="w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <CardHeader className="flex flex-row items-center justify-between space-y-0 shrink-0 pb-3">
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            Settings
          </CardTitle>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="rounded-full p-1.5 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </CardHeader>

        <div className="px-6 pb-3 shrink-0">
          <SettingsSearchBar onJump={handleJump} />
        </div>

        {/* Tab strip — scrolls horizontally on mobile */}
        <div
          role="tablist"
          aria-label="Settings sections"
          className="flex gap-0.5 px-6 overflow-x-auto shrink-0 border-b border-border scrollbar-none"
        >
          {TABS.map((tab, idx) => (
            <button
              key={tab}
              ref={(el) => { tabRefs.current[idx] = el; }}
              role="tab"
              id={`settings-tab-${tab}`}
              aria-selected={activeTab === tab}
              aria-controls={`settings-panel-${tab}`}
              tabIndex={activeTab === tab ? 0 : -1}
              onClick={() => setActiveTab(tab)}
              onKeyDown={(e) => handleTabKeyDown(e, idx)}
              className={cn(
                'shrink-0 rounded-t-md px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                activeTab === tab
                  ? 'bg-background border border-b-background border-border text-foreground -mb-px relative z-10'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40',
              )}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>

        {/* Active tab panel — scrollable */}
        <div
          id={`settings-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`settings-tab-${activeTab}`}
          className="flex-1 overflow-y-auto"
        >
          <CardContent className="py-5">
            <ActivePanel />

            {/* Footer actions */}
            <div className="flex items-center justify-between pt-6 mt-2 border-t border-border">
              <Button variant="ghost" size="sm" onClick={() => reset()}>
                <RotateCcw className="h-4 w-4" /> Restore defaults
              </Button>
              <Button variant="accent" size="sm" onClick={onClose}>
                Done
              </Button>
            </div>
          </CardContent>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SettingsButton — standalone trigger (unchanged API)
// ---------------------------------------------------------------------------

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
  const [initialTab, setInitialTab] = useState<TabId>('rider');

  // Listen for global "open settings" events fired by lightweight nudges
  // like the NoTokenBanner. The custom-event channel keeps consumers from
  // having to prop-drill the setter or share a context.
  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent<{ tab?: TabId }>).detail;
      if (detail?.tab) setInitialTab(detail.tab);
      setOpen(true);
    }
    window.addEventListener('globeride:open-settings', onOpen);
    return () => window.removeEventListener('globeride:open-settings', onOpen);
  }, []);

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={() => { setInitialTab('rider'); setOpen(true); }}
        aria-label="Open settings"
      >
        <Settings className="h-4 w-4" />
        {showLabel && <span>Settings</span>}
      </Button>
      <SettingsPanel open={open} onClose={() => setOpen(false)} initialTab={initialTab} />
    </>
  );
}
