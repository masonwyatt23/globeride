/**
 * TrainerSettings.tsx — Trainer tab: demo power, drivetrain efficiency.
 *
 * BLE connection UX lives in the Ride page (connect-on-demand), so this tab
 * exposes the settings that affect trainer simulation.
 */

import { Activity, Gauge } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { Section } from '@/components/ui/section-header';
import { SliderRow } from './shared';

export function TrainerSettings() {
  const s = useSettingsStore();

  return (
    <div className="space-y-6">
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
        <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">
          Constant pedal output used when riding without a Bluetooth trainer.
        </p>
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
        <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">
          Mechanical power loss from chain, cassette, and bottom bracket. 97 % is typical for a
          clean drivetrain.
        </p>
      </Section>
    </div>
  );
}
