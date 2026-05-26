/**
 * commentatorStaticLines.ts — Hand-curated commentary strings for the live
 * AI race commentator.
 *
 * Static lines are used for trigger types where the phrasing is predictable
 * and LLM creativity adds little value (halfway milestone, speed thresholds).
 * All other triggers (bot_attack, climb_entry, etc.) use the LLM path.
 *
 * Cost gating:
 *   Static (no xAI call): halfway, speed_50, speed_60, speed_70, recovery,
 *                         descent_exit, power_dropout
 *   LLM (xAI call):       bot_attack, climb_entry, final_2km, bot_catch
 */

export type CommentaryTrigger =
  | 'bot_attack'
  | 'climb_entry'
  | 'speed_50'
  | 'speed_60'
  | 'speed_70'
  | 'halfway'
  | 'final_2km'
  | 'power_dropout'
  | 'recovery'
  | 'bot_catch'
  | 'descent_exit';

/**
 * Priority order for trigger selection (highest → lowest).
 * When multiple triggers fire in the same window, the highest-priority one wins.
 */
export const TRIGGER_PRIORITY: CommentaryTrigger[] = [
  'bot_attack',
  'bot_catch',
  'climb_entry',
  'final_2km',
  'halfway',
  'speed_70',
  'speed_60',
  'speed_50',
  'power_dropout',
  'descent_exit',
  'recovery',
];

export const STATIC_LINES: Partial<Record<CommentaryTrigger, string[]>> = {
  halfway: [
    'Exactly halfway through. Time to dig deep on the final push.',
    "The halfway marker is behind you. The second half is where champions are made.",
    "Halfway done. The legs know the way — let them carry you home.",
    "50 percent complete. This is the moment to commit to the finish.",
    "Halfway through and still in it. Manage the effort and bring it home.",
  ],

  speed_50: [
    'Breaking the 50 km/h barrier — flying now!',
    '50 kilometres per hour. That is serious speed on the road.',
    "Crossing 50 clicks. The wind is your biggest opponent now.",
    "Over fifty — the gradient is giving back everything it took on the climb.",
    "50 km/h on the dial. Hold the tuck and let the road come to you.",
  ],

  speed_60: [
    '60 km/h — this descent is turning into a real cracker!',
    "Sixty kilometres per hour. Hold your line and trust the wheels.",
    "Breaking 60 on the descent. Aero position is everything right now.",
    "Sixty clicks — that is the speed of commitment on a descent.",
    "60 km/h and still accelerating. This is what the long climb was for.",
  ],

  speed_70: [
    '70 km/h! This is absolutely blistering — full aero mode!',
    "Seventy kilometres per hour. That is the territory of pure descending.",
    "70 on the clock — breathtaking speed, hold steady.",
    "Breaking 70. At this velocity every gram of drag matters enormously.",
    "70 km/h — this is the fastest point of the entire route.",
  ],

  power_dropout: [
    "Power reading has dropped. Settle in and keep the legs turning.",
    "Lost the power signal — ride by feel and keep the cadence smooth.",
    "No power data right now. Trust the sensations and maintain the effort.",
    "Power meter gone quiet. Ride to heart rate and perceived exertion.",
    "Sensor dropout — stay focused on the road ahead.",
  ],

  recovery: [
    "The effort is easing now. Use this moment to breathe and regroup.",
    "Recovery time. Get the heart rate down before the next effort.",
    "Settling back into base pace. Take the rest and prepare to push again.",
    "The gradient relents. Use this window to refuel mentally and physically.",
    "Easy pedalling for now. The road has given you a brief respite.",
  ],

  descent_exit: [
    "The descent is levelling off. Time to start pushing the power again.",
    "Bottom of the descent — bring the legs back online.",
    "Descent complete. Rebuild the speed and find your rhythm on the flat.",
    "Flattening out after the descent. Get back on the pedals now.",
    "The slope eases. Shift up and start driving the pace forward.",
  ],
};

/**
 * Returns true when the trigger has a curated static pool (no LLM needed).
 */
export function hasStaticLines(trigger: CommentaryTrigger): boolean {
  return !!(STATIC_LINES[trigger] && STATIC_LINES[trigger]!.length > 0);
}

/**
 * Pick a random static line for the given trigger.
 * Returns null if no static lines are registered for this trigger.
 */
export function pickStaticLine(trigger: CommentaryTrigger): string | null {
  const pool = STATIC_LINES[trigger];
  if (!pool || pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Fallback line used when the LLM call fails. */
export const FALLBACK_LINES: string[] = [
  "Keep the effort going — every pedal stroke counts.",
  "Stay focused and keep pushing.",
  "Ride your own race. Consistent effort wins the day.",
  "The road demands your best — give it.",
  "One kilometre at a time. Keep moving forward.",
];

export function pickFallbackLine(): string {
  return FALLBACK_LINES[Math.floor(Math.random() * FALLBACK_LINES.length)];
}
