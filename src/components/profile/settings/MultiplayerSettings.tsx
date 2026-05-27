/**
 * MultiplayerSettings.tsx — Multiplayer tab.
 *
 * No multiplayer-specific settings exist in the store yet (multi-rider ghost
 * peloton is on the roadmap). This tab is a placeholder that will be populated
 * when the WebRTC peloton feature lands.
 */

import { Users } from 'lucide-react';
import { Section } from '@/components/ui/section-header';

export function MultiplayerSettings() {
  return (
    <div className="space-y-6">
      <Section icon={<Users className="h-4 w-4" />} title="Multiplayer">
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-6 text-center space-y-1">
          <p className="text-sm font-medium text-foreground">Coming soon</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed max-w-xs mx-auto">
            Multi-rider ghost peloton over WebRTC is on the roadmap. Room caps and
            peer-color preferences will appear here once the feature ships.
          </p>
        </div>
      </Section>
    </div>
  );
}
