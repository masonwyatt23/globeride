/**
 * SectionHeader — collapsible accordion-style section toggle button.
 * Used in RideAnalytics, PersonalRecords, and any panel with collapsible
 * sections that follow the same visual pattern.
 *
 * Section — non-collapsible labelled group with icon + title row.
 * Used in SettingsPanel and ProfilePanel.
 */

import * as React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

// ---------------------------------------------------------------------------
// SectionHeader — collapsible toggle button
// ---------------------------------------------------------------------------

export interface SectionHeaderProps {
  /** Icon shown left of the title. */
  icon: React.ReactNode;
  /** Label text, rendered in small-caps style. */
  title: string;
  /** Whether the controlled panel is currently open. */
  open: boolean;
  /** Called when the button is clicked. */
  onToggle: () => void;
  /** id applied to the <button> element (for aria-controls on the panel). */
  id: string;
  /** id of the controlled panel element. */
  panelId: string;
}

export function SectionHeader({
  icon,
  title,
  open,
  onToggle,
  id,
  panelId,
}: SectionHeaderProps) {
  return (
    <button
      type="button"
      id={id}
      aria-expanded={open}
      aria-controls={panelId}
      onClick={onToggle}
      className="w-full flex items-center justify-between gap-2 group rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background transition-colors"
    >
      <div className="flex items-center gap-2">
        <span className="text-accent" aria-hidden="true">{icon}</span>
        <span className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground group-hover:text-foreground transition-colors">
          {title}
        </span>
      </div>
      {open
        ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground transition-transform" aria-hidden="true" />
        : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform" aria-hidden="true" />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Section — non-collapsible labelled group (used in SettingsPanel / ProfilePanel)
// ---------------------------------------------------------------------------

export interface SectionProps {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}

export function Section({ icon, title, children }: SectionProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        {icon}
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
}
