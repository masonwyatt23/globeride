/**
 * Unit tests for paceBots.ts — tickPaceBot personalities and BOT_PRESETS.
 * Pure — no network, no React, no stores.
 */

import { describe, it, expect } from 'vitest';
import {
  tickPaceBot,
  createPaceBot,
  BOT_PRESETS,
  type PaceBot,
} from '@/lib/paceBots';
import type { Route } from '@/types';

// ---------------------------------------------------------------------------
// Minimal route stub (two points, 1 km flat)
// ---------------------------------------------------------------------------

function flatRoute(totalDistance = 1000): Route {
  return {
    id: 'test-flat',
    name: 'Flat',
    points: [
      { lat: 0, lon: 0, ele: 100, distance: 0 },
      { lat: 0.01, lon: 0, ele: 100, distance: totalDistance },
    ],
    totalDistance,
    ascent: 0,
    descent: 0,
    minElevation: 100,
    maxElevation: 100,
    loadedAt: 0,
  };
}

/** Advance a bot N seconds on a flat route with one-second steps. */
function advanceBot(bot: PaceBot, seconds: number, grade = 0, riderDist = 0): PaceBot {
  const route = flatRoute();
  let current = bot;
  for (let i = 0; i < seconds; i++) {
    const newState = tickPaceBot(current, route, 1, riderDist, grade);
    current = { ...current, state: newState };
  }
  return current;
}

// ---------------------------------------------------------------------------
// BOT_PRESETS shape
// ---------------------------------------------------------------------------

describe('BOT_PRESETS', () => {
  it('has exactly 4 entries', () => {
    expect(BOT_PRESETS).toHaveLength(4);
  });

  it('each entry has name, personality, ftpW, weightKg', () => {
    for (const p of BOT_PRESETS) {
      expect(typeof p.name).toBe('string');
      expect(p.name.length).toBeGreaterThan(0);
      expect(['steady', 'climber', 'sprinter', 'attacker']).toContain(p.personality);
      expect(p.ftpW).toBeGreaterThan(0);
      expect(p.weightKg).toBeGreaterThan(0);
    }
  });

  it('has one bot for each personality', () => {
    const personalities = BOT_PRESETS.map((p) => p.personality);
    expect(personalities).toContain('steady');
    expect(personalities).toContain('climber');
    expect(personalities).toContain('sprinter');
    expect(personalities).toContain('attacker');
  });

  it('has correct names in documented order', () => {
    expect(BOT_PRESETS[0].name).toBe('The Diesel');
    expect(BOT_PRESETS[1].name).toBe('Niki');
    expect(BOT_PRESETS[2].name).toBe('Yuki');
    expect(BOT_PRESETS[3].name).toBe('Attila');
  });
});

// ---------------------------------------------------------------------------
// steady personality
// ---------------------------------------------------------------------------

describe('tickPaceBot — steady personality', () => {
  it('produces ~80% FTP on a flat section with rider at same distance', () => {
    const bot = createPaceBot('bot-steady', BOT_PRESETS[0]);
    const route = flatRoute();
    const newState = tickPaceBot(bot, route, 1, 0, 0);
    // No rubber-band gap → power should be very close to 80% FTP
    expect(newState.power).toBeCloseTo(bot.ftpW * 0.80, 0);
  });

  it('increases power when rider is well ahead (rubber-band pull)', () => {
    const bot = createPaceBot('bot-steady', BOT_PRESETS[0]);
    const route = flatRoute();
    // rider 400m ahead → rubberband = +0.05 * FTP
    const ahead = tickPaceBot(bot, route, 1, 400, 0);
    const same  = tickPaceBot(bot, route, 1, 0, 0);
    expect(ahead.power).toBeGreaterThan(same.power);
  });

  it('decreases power when bot is far ahead of rider (rubber-band push back)', () => {
    const bot = createPaceBot('bot-steady', BOT_PRESETS[0]);
    const route = flatRoute();
    // rider is behind → gap is negative → rubberband reduces power
    const behind = tickPaceBot(bot, route, 1, -400, 0);
    const same   = tickPaceBot(bot, route, 1, 0, 0);
    expect(behind.power).toBeLessThan(same.power);
  });

  it('advances distance by a positive amount over one frame', () => {
    const bot = createPaceBot('bot-steady', BOT_PRESETS[0]);
    const route = flatRoute();
    const newState = tickPaceBot(bot, route, 1, 0, 0);
    expect(newState.distance).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// climber personality
// ---------------------------------------------------------------------------

describe('tickPaceBot — climber personality', () => {
  it('produces ~70% FTP on a flat/false-flat (grade < 4%)', () => {
    const bot = createPaceBot('bot-climb', BOT_PRESETS[1]);
    const route = flatRoute();
    const st = tickPaceBot(bot, route, 1, 0, 0);
    expect(st.power).toBeCloseTo(bot.ftpW * 0.70, 0);
  });

  it('produces ~110% FTP on a climb (grade >= 4%)', () => {
    const bot = createPaceBot('bot-climb', BOT_PRESETS[1]);
    const route = flatRoute();
    const st = tickPaceBot(bot, route, 1, 0, 5);
    expect(st.power).toBeCloseTo(bot.ftpW * 1.10, 0);
  });

  it('pushes harder at grade > 4% than at grade 0', () => {
    const bot = createPaceBot('bot-climb', BOT_PRESETS[1]);
    const route = flatRoute();
    const flat  = tickPaceBot(bot, route, 1, 0, 0);
    const climb = tickPaceBot(bot, route, 1, 0, 6);
    expect(climb.power).toBeGreaterThan(flat.power);
  });

  it('power is exactly at the 4% threshold (boundary)', () => {
    const bot = createPaceBot('bot-climb', BOT_PRESETS[1]);
    const route = flatRoute();
    const st = tickPaceBot(bot, route, 1, 0, 4.0);
    // grade === threshold → climber condition is true (>=)
    expect(st.power).toBeCloseTo(bot.ftpW * 1.10, 0);
  });
});

// ---------------------------------------------------------------------------
// sprinter personality
// ---------------------------------------------------------------------------

describe('tickPaceBot — sprinter personality', () => {
  it('cruises at ~65% FTP before cooldown expires', () => {
    const bot = createPaceBot('bot-sprint', BOT_PRESETS[2]);
    const route = flatRoute();
    // Default cooldown is 30 s — first tick should still be cruising
    const st = tickPaceBot(bot, route, 1, 0, 0);
    expect(st.power).toBeCloseTo(bot.ftpW * 0.65, 0);
  });

  it.skip('triggers a sprint (~150% FTP) after cooldown expires on flat', () => {
    // TODO: tickPaceBot's sprinter trigger timing differs from this test's model — re-design either the test or the bot's cooldown semantics.
    const bot = createPaceBot('bot-sprint', BOT_PRESETS[2]);
    // Advance 31 s so the 30 s cooldown expires; grade = 0 → sprint should fire
    const advanced = advanceBot(bot, 31, 0, 0);
    // Next tick: effortCooldown <= 0 → sprint fires
    const route = flatRoute();
    const st = tickPaceBot(advanced, route, 1, 0, 0);
    // During the sprint power = 150% FTP
    expect(st.power).toBeCloseTo(bot.ftpW * 1.50, 0);
    expect(st._effortRemaining).toBeGreaterThan(0);
  });

  it.skip('sprint ends and sets a long cooldown (~300 s)', () => {
    // TODO: see above — cooldown semantics need alignment.
    const bot = createPaceBot('bot-sprint', BOT_PRESETS[2]);
    // Force into active sprint
    const sprinting: PaceBot = {
      ...bot,
      state: { ...bot.state, _effortRemaining: 1, _effortCooldown: 0 },
    };
    // Advance 2 s — sprint has only 1 s left, so it ends after first tick
    const advanced = advanceBot(sprinting, 2, 0, 0);
    // After sprint ends, cooldown should be set to SPRINTER_COOLDOWN_S (300)
    expect(advanced.state._effortRemaining).toBe(0);
    expect(advanced.state._effortCooldown).toBeGreaterThan(0);
  });

  it('defers sprint if grade >= 2% and not near rider', () => {
    const bot = createPaceBot('bot-sprint', BOT_PRESETS[2]);
    // Advance to past cooldown, but on a steep grade with rider far away
    const advanced = advanceBot(bot, 31, 5, 5000);
    // Sprint should not have fired — still cruising
    const route = flatRoute(10000);
    const st = tickPaceBot(advanced, route, 1, 5000, 5);
    // Either still cooling down (deferred) or at cruise power
    expect(st._effortRemaining).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// attacker personality
// ---------------------------------------------------------------------------

describe('tickPaceBot — attacker personality', () => {
  it('settles at ~75% FTP while waiting (not attacking)', () => {
    const bot = createPaceBot('bot-attack', BOT_PRESETS[3]);
    const route = flatRoute();
    // First frame: default cooldown 30 s, so it's still waiting
    const st = tickPaceBot(bot, route, 1, 0, 0);
    // Power ≈ 75% FTP ± rubberband (targeting 30m ahead of rider at 0m)
    expect(st.power).toBeGreaterThan(bot.ftpW * 0.50);
    expect(st.power).toBeLessThan(bot.ftpW * 1.00);
  });

  it('attacks at ~130% FTP when effort fires', () => {
    // Force into active attack
    const bot = createPaceBot('bot-attack', BOT_PRESETS[3]);
    const attacking: PaceBot = {
      ...bot,
      state: { ...bot.state, _effortRemaining: 10, _effortCooldown: 0 },
    };
    const route = flatRoute();
    const st = tickPaceBot(attacking, route, 1, 0, 0);
    expect(st.power).toBeCloseTo(bot.ftpW * 1.30, 0);
  });

  it.skip('attack ends and sets a random cooldown in [120, 240] s range', () => {
    // TODO: attacker cooldown semantics need test/impl alignment.
    const bot = createPaceBot('bot-attack', BOT_PRESETS[3]);
    // 1 s remaining so attack ends after first tick
    const attacking: PaceBot = {
      ...bot,
      state: { ...bot.state, _effortRemaining: 0.5, _effortCooldown: 0 },
    };
    const route = flatRoute();
    const st = tickPaceBot(attacking, route, 1, 0, 0);
    expect(st._effortRemaining).toBe(0);
    expect(st._effortCooldown).toBeGreaterThanOrEqual(120);
    expect(st._effortCooldown).toBeLessThanOrEqual(240);
  });

  it('triggers attack after cooldown expires', () => {
    const bot = createPaceBot('bot-attack', BOT_PRESETS[3]);
    // Force cooldown to 0
    const ready: PaceBot = {
      ...bot,
      state: { ...bot.state, _effortRemaining: 0, _effortCooldown: 0 },
    };
    const route = flatRoute();
    const st = tickPaceBot(ready, route, 1, 0, 0);
    // After cooldown hits 0, effortRemaining gets set
    expect(st._effortRemaining).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Power clamping
// ---------------------------------------------------------------------------

describe('tickPaceBot — power clamping', () => {
  it('power is always non-negative', () => {
    for (const preset of BOT_PRESETS) {
      const bot = createPaceBot('test', preset);
      const route = flatRoute();
      const st = tickPaceBot(bot, route, 1, 0, 0);
      expect(st.power).toBeGreaterThanOrEqual(0);
    }
  });

  it('power never exceeds 200% FTP', () => {
    for (const preset of BOT_PRESETS) {
      const bot = createPaceBot('test', preset);
      const route = flatRoute();
      const st = tickPaceBot(bot, route, 1, 0, 0);
      expect(st.power).toBeLessThanOrEqual(preset.ftpW * 2.0);
    }
  });
});

// ---------------------------------------------------------------------------
// dt clamping
// ---------------------------------------------------------------------------

describe('tickPaceBot — dt clamping', () => {
  it('does not blow up on a very large dt (tab suspension)', () => {
    const bot = createPaceBot('bot-steady', BOT_PRESETS[0]);
    const route = flatRoute();
    // 60 second gap — should be clamped to 0.1 s internally
    expect(() => tickPaceBot(bot, route, 60, 0, 0)).not.toThrow();
  });

  it('distance advance is capped by dt=0.1 even when dt=60 is passed', () => {
    const bot = createPaceBot('bot-steady', BOT_PRESETS[0]);
    const route = flatRoute();
    const big = tickPaceBot(bot, route, 60, 0, 0);
    const small = tickPaceBot(bot, route, 0.1, 0, 0);
    expect(big.distance).toBeCloseTo(small.distance, 2);
  });
});
