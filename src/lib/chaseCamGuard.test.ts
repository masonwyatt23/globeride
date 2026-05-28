import { describe, it, expect } from 'vitest';
import { shouldChaseCamUpdate } from './chaseCamGuard';

describe('shouldChaseCamUpdate', () => {
  it('disengages while idle (no route loaded)', () => {
    expect(shouldChaseCamUpdate('idle')).toBe(false);
  });

  it('engages once a route is loaded but ride not started (regression: was false)', () => {
    expect(shouldChaseCamUpdate('ready')).toBe(true);
  });

  it('engages during an active ride', () => {
    expect(shouldChaseCamUpdate('running')).toBe(true);
  });

  it('engages while paused (so the camera doesn\'t jerk on resume)', () => {
    expect(shouldChaseCamUpdate('paused')).toBe(true);
  });

  it('disengages at finish so the FinishCard overlay is stable', () => {
    expect(shouldChaseCamUpdate('finished')).toBe(false);
  });
});
