/**
 * AudioSettings.tsx — Audio tab: procedural ride audio, AI commentary, voice cues.
 * Composes RideAudioSettings + CommentarySettings + VoiceCuesSettings.
 */

import { CommentarySettings } from '@/components/profile/CommentarySettings';
import { VoiceCuesSettings } from '@/components/profile/VoiceCuesSettings';
import { RideAudioSettings } from '@/components/profile/RideAudioSettings';

export function AudioSettings() {
  return (
    <div className="space-y-6">
      <RideAudioSettings />
      <CommentarySettings />
      <VoiceCuesSettings />
    </div>
  );
}
