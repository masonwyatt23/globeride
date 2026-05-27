/**
 * ComparisonSection — GlobeRide vs Zwift side-by-side table.
 *
 * Framing: different philosophy, not competitive attack. GlobeRide column
 * carries a subtle aqua highlight; both columns present facts, no hype.
 */

const ROWS: { axis: string; globeride: string; zwift: string }[] = [
  { axis: 'Pricing',           globeride: '$0 forever',                    zwift: '$19.99 / month' },
  { axis: 'Account required',  globeride: 'No',                            zwift: 'Yes' },
  { axis: 'Source code',       globeride: 'Open — MIT licensed',           zwift: 'Closed source' },
  { axis: 'Works offline',     globeride: 'Yes (installable PWA)',         zwift: 'No' },
  { axis: 'World coverage',    globeride: 'Any GPX file, any city on Earth', zwift: 'Curated virtual worlds only' },
  { axis: 'Smart trainer',     globeride: 'Web Bluetooth FTMS — no dongle', zwift: 'Companion app + ANT+ dongle' },
  { axis: 'Data ownership',    globeride: 'Local-first, full export',      zwift: 'Stored on Zwift servers' },
  { axis: 'Multiplayer',       globeride: 'WebRTC P2P direct',             zwift: 'Cloud-relayed servers' },
  { axis: 'VR / WebXR',        globeride: 'Yes (Quest, Vision Pro)',       zwift: 'No' },
  { axis: 'AI commentary',     globeride: 'Yes (on-device)',               zwift: 'No' },
];

// Tick — aqua checkmark for GlobeRide advantages
function Tick() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className="inline-block shrink-0 mt-0.5"
    >
      <title>Yes</title>
      <circle cx="8" cy="8" r="8" fill="#22d3ee" fillOpacity="0.12" />
      <path d="M4.5 8.5l2.5 2.5 4.5-5" stroke="#22d3ee" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ComparisonSection() {
  return (
    <section className="relative px-4 sm:px-6 lg:px-10 py-20 sm:py-28 overflow-hidden">
      {/* Ambient glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[36rem] w-[60rem] rounded-full"
          style={{ background: 'radial-gradient(ellipse, hsl(195 92% 56% / 0.04) 0%, transparent 70%)' }}
        />
      </div>

      <div className="max-w-5xl mx-auto">
        {/* Heading */}
        <div className="text-center mb-12">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: '#22d3ee' }}>
            Philosophy
          </p>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            GlobeRide vs Zwift
          </h2>
          <p className="mt-4 text-base sm:text-lg max-w-xl mx-auto leading-relaxed" style={{ color: 'hsl(215 18% 52%)' }}>
            Different philosophy. No subscription. Local-first.
          </p>
        </div>

        {/* Table wrapper — horizontal scroll on mobile */}
        <div className="overflow-x-auto rounded-2xl" style={{ border: '1px solid hsl(215 26% 14%)' }}>
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr>
                <th
                  className="py-4 px-5 text-left font-medium text-xs uppercase tracking-widest"
                  style={{ color: 'hsl(215 18% 38%)', background: 'hsl(215 32% 6%)' }}
                >
                  Feature
                </th>
                {/* GlobeRide header — aqua accent */}
                <th
                  className="py-4 px-5 text-center font-bold text-sm"
                  style={{
                    color: '#22d3ee',
                    background: 'hsl(195 92% 56% / 0.06)',
                    borderLeft: '1px solid hsl(195 92% 56% / 0.15)',
                  }}
                >
                  GlobeRide
                </th>
                <th
                  className="py-4 px-5 text-center font-semibold text-sm"
                  style={{ color: 'hsl(215 18% 52%)', background: 'hsl(215 32% 6%)', borderLeft: '1px solid hsl(215 26% 12%)' }}
                >
                  Zwift
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, i) => (
                <tr
                  key={row.axis}
                  style={{
                    borderTop: '1px solid hsl(215 26% 10%)',
                    background: i % 2 === 0 ? 'hsl(220 42% 4%)' : 'hsl(215 32% 5%)',
                  }}
                >
                  <td className="py-3.5 px-5 font-medium" style={{ color: 'hsl(215 18% 62%)' }}>
                    {row.axis}
                  </td>
                  <td
                    className="py-3.5 px-5 text-center"
                    style={{
                      color: 'hsl(195 80% 80%)',
                      background: i % 2 === 0 ? 'hsl(195 92% 56% / 0.04)' : 'hsl(195 92% 56% / 0.06)',
                      borderLeft: '1px solid hsl(195 92% 56% / 0.12)',
                    }}
                  >
                    <span className="flex items-center justify-center gap-1.5">
                      <Tick />
                      {row.globeride}
                    </span>
                  </td>
                  <td
                    className="py-3.5 px-5 text-center"
                    style={{ color: 'hsl(215 18% 48%)', borderLeft: '1px solid hsl(215 26% 12%)' }}
                  >
                    {row.zwift}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footnote */}
        <p className="mt-5 text-xs text-center" style={{ color: 'hsl(215 18% 32%)' }}>
          Zwift pricing as of 2025. All GlobeRide features are free and open-source.
        </p>
      </div>
    </section>
  );
}

// Export data for testing
export { ROWS as COMPARISON_ROWS };
