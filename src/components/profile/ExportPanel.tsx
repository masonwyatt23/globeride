/**
 * ExportPanel — download buttons for all local GlobeRide data.
 *
 * Each button calls its exporter, builds a Blob-URL, and fires a synthetic
 * <a> click — no server, no upload, purely local.
 */

import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  exportRidesCsv,
  exportAchievementsJson,
  exportRecordsJson,
  exportRacesJson,
  exportAllJson,
} from '@/lib/exports/exporters';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayIso(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // Revoke shortly after to release memory.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ---------------------------------------------------------------------------
// Individual export button
// ---------------------------------------------------------------------------

interface ExportButtonProps {
  label: string;
  filename: string;
  exporter: () => Promise<Blob>;
}

function ExportButton({ label, filename, exporter }: ExportButtonProps) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    try {
      const blob = await exporter();
      triggerDownload(blob, filename);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="w-full justify-start gap-2 text-left"
      onClick={handleClick}
      disabled={busy}
      aria-label={`Download ${label}`}
    >
      <Download className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="flex-1 truncate">{busy ? 'Preparing…' : label}</span>
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function ExportPanel() {
  const date = todayIso();

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-xs">
          <Download className="h-4 w-4 text-primary" aria-hidden="true" />
          Export Data
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <ExportButton
          label="Rides (CSV)"
          filename={`globeride-rides-${date}.csv`}
          exporter={exportRidesCsv}
        />
        <ExportButton
          label="Achievements (JSON)"
          filename={`globeride-achievements-${date}.json`}
          exporter={exportAchievementsJson}
        />
        <ExportButton
          label="Personal Records (JSON)"
          filename={`globeride-records-${date}.json`}
          exporter={exportRecordsJson}
        />
        <ExportButton
          label="Races (JSON)"
          filename={`globeride-races-${date}.json`}
          exporter={exportRacesJson}
        />
        <ExportButton
          label="Export All (JSON)"
          filename={`globeride-all-${date}.json`}
          exporter={exportAllJson}
        />
      </CardContent>
    </Card>
  );
}
