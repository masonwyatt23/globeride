import * as React from 'react';
import { cn } from '@/lib/utils';

export type TabId = 'ride' | 'routes' | 'workouts' | 'history';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

interface HomeTabsProps {
  tabs: Tab[];
  activeTab: TabId;
  onChange: (id: TabId) => void;
}

/**
 * Minimal pill-style tab bar for the Home page.
 * Responsive: scrolls horizontally on very small screens, no overflow clip.
 */
export function HomeTabBar({ tabs, activeTab, onChange }: HomeTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Navigation"
      className="flex items-center gap-1 rounded-xl border border-border/60 bg-muted/40 p-1 overflow-x-auto scrollbar-none"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={activeTab === tab.id}
          aria-controls={`tabpanel-${tab.id}`}
          id={`tab-${tab.id}`}
          onClick={() => onChange(tab.id)}
          className={cn(
            'relative flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all duration-200 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 shrink-0',
            activeTab === tab.id
              ? 'bg-card shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
          )}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}

interface HomeTabPanelProps {
  id: TabId;
  activeTab: TabId;
  children: React.ReactNode;
}

/** Renders children only when the panel is active (keeps DOM clean, avoids hidden panel work). */
export function HomeTabPanel({ id, activeTab, children }: HomeTabPanelProps) {
  return (
    <div
      role="tabpanel"
      id={`tabpanel-${id}`}
      aria-labelledby={`tab-${id}`}
      hidden={activeTab !== id}
      className={cn(activeTab === id ? 'animate-fadeUp' : '')}
    >
      {children}
    </div>
  );
}
