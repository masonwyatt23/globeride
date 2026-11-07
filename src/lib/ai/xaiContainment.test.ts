import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import handler from '../../../api/xai';
import { generateWorkout, getProviderInfo } from './provider';
import { coachRecommendation } from './coach';
import { recommendRoute } from './routeRecommender';
import { pickAndGenerate, type RideSnapshot } from './commentator';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('hosted xAI containment', () => {
  it.each(['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS'])(
    'rejects %s even with stale server credentials and caller authorization',
    async (method) => {
      vi.stubEnv('XAI_API_KEY', 'synthetic-not-a-real-key');
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);
      const req = new Request('https://example.invalid/api/xai?__tail=v1/chat/completions', {
        method,
        headers: { Authorization: 'Bearer synthetic-caller-key' },
        ...(method === 'POST' ? { body: '{"messages":[]}' } : {}),
      });
      const res = await handler(req);
      expect(res.status).toBe(503);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(await res.text()).not.toContain('synthetic');
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it('does not route auto mode based on a legacy client key', () => {
    vi.stubEnv('VITE_AI_PROVIDER', 'auto');
    vi.stubEnv('VITE_XAI_API_KEY', 'synthetic-not-a-real-key');
    expect(getProviderInfo().name).toBe('ollama');
  });

  it('fails all explicit xAI generation paths without network calls', async () => {
    vi.stubEnv('VITE_AI_PROVIDER', 'xai');
    vi.stubEnv('VITE_XAI_API_KEY', 'synthetic-not-a-real-key');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(generateWorkout('easy ride', { ftpW: 200 })).rejects.toThrow('temporarily disabled');
    await expect(coachRecommendation({ recentRides: [], fitness: { ctl: 0, atl: 0, tsb: 0 }, ftpW: 200 })).rejects.toThrow('temporarily disabled');
    await expect(recommendRoute('easy loop')).rejects.toThrow('temporarily disabled');
    const ride: RideSnapshot = {
      speed: 10, power: 200, grade: 5, distance: 1000, totalDistance: 10000,
      rideState: 'running', leadBotGapM: null, botCount: 0,
    };
    expect(await pickAndGenerate(['climb_entry'], ride)).toBeTypeOf('string');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not configure key uploads or client authorization in AI source', () => {
    for (const file of ['provider', 'coach', 'commentator', 'routeRecommender']) {
      const source = readFileSync(new URL(`./${file}.ts`, import.meta.url), 'utf8');
      expect(source).not.toContain('VITE_XAI_API_KEY');
      expect(source).not.toContain('Authorization:');
      expect(source).not.toContain('/xai/v1/chat/completions');
    }
    const script = readFileSync(new URL('../../../scripts/vercel-env-push.sh', import.meta.url), 'utf8');
    expect(script).not.toMatch(/push\s+(?:VITE_)?XAI_API_KEY/);
    const config = readFileSync(new URL('../../../vite.config.ts', import.meta.url), 'utf8');
    expect(config).not.toContain("'/xai':");
    expect(config).toContain("'import.meta.env.VITE_XAI_API_KEY': 'undefined'");
  });
});
