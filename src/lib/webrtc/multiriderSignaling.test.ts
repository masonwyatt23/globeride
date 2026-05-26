/**
 * Tests for the multi-rider signaling manifest encode/decode.
 */

import { describe, it, expect } from 'vitest';
import {
  encodeInvite,
  decodeInvite,
  MULTIRIDER_SCHEMA_VERSION,
  type MultiRiderInvite,
} from './multiriderSignaling';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInvite(overrides: Partial<MultiRiderInvite> = {}): MultiRiderInvite {
  return {
    schemaVersion: MULTIRIDER_SCHEMA_VERSION,
    sessionId: 'test-session-id-123',
    role: 'offer',
    sdp: 'v=0\r\no=- 123 456 IN IP4 127.0.0.1\r\n',
    routeId: 'alpe-du-zwift',
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('encodeInvite / decodeInvite', () => {
  it('roundtrips an offer invite', () => {
    const invite = makeInvite({ role: 'offer' });
    const blob = encodeInvite(invite);
    const decoded = decodeInvite(blob);

    expect(decoded).not.toBeNull();
    expect(decoded!.schemaVersion).toBe(MULTIRIDER_SCHEMA_VERSION);
    expect(decoded!.sessionId).toBe(invite.sessionId);
    expect(decoded!.role).toBe('offer');
    expect(decoded!.sdp).toBe(invite.sdp);
    expect(decoded!.routeId).toBe(invite.routeId);
    expect(decoded!.createdAt).toBe(invite.createdAt);
  });

  it('roundtrips an answer invite', () => {
    const invite = makeInvite({ role: 'answer' });
    const blob = encodeInvite(invite);
    const decoded = decodeInvite(blob);
    expect(decoded!.role).toBe('answer');
  });

  it('roundtrips null routeId (custom GPX)', () => {
    const invite = makeInvite({ routeId: null });
    const blob = encodeInvite(invite);
    const decoded = decodeInvite(blob);
    expect(decoded!.routeId).toBeNull();
  });

  it('produces a non-empty base64 string', () => {
    const blob = encodeInvite(makeInvite());
    expect(blob.length).toBeGreaterThan(20);
    // Only base64 characters (+ padding)
    expect(blob).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it('decodes a base64url variant (- and _ instead of + and /)', () => {
    const invite = makeInvite();
    const b64 = encodeInvite(invite);
    // Convert to base64url
    const b64url = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const decoded = decodeInvite(b64url);
    expect(decoded).not.toBeNull();
    expect(decoded!.sessionId).toBe(invite.sessionId);
  });

  it('trims whitespace around the blob', () => {
    const blob = encodeInvite(makeInvite());
    const decoded = decodeInvite(`  ${blob}  `);
    expect(decoded).not.toBeNull();
  });

  it('returns null for empty string', () => {
    expect(decodeInvite('')).toBeNull();
  });

  it('returns null for random garbage', () => {
    expect(decodeInvite('not-base64-!!!')).toBeNull();
  });

  it('returns null for valid JSON but missing required fields', () => {
    const partial = { schemaVersion: 1, sessionId: 'x' };
    const blob = btoa(JSON.stringify(partial));
    expect(decodeInvite(blob)).toBeNull();
  });

  it('returns null when schemaVersion is wrong type', () => {
    const raw = { ...makeInvite(), schemaVersion: '1' };
    const blob = btoa(new TextDecoder().decode(
      new Uint8Array(Array.from(new TextEncoder().encode(JSON.stringify(raw)))),
    ));
    expect(decodeInvite(blob)).toBeNull();
  });

  it('returns null for unknown future schemaVersion', () => {
    const raw = { ...makeInvite(), schemaVersion: 99 };
    const bytes = new TextEncoder().encode(JSON.stringify(raw));
    const binStr = Array.from(bytes).map((b) => String.fromCharCode(b)).join('');
    const blob = btoa(binStr);
    expect(decodeInvite(blob)).toBeNull();
  });

  it('returns null for invalid role value', () => {
    const raw = { ...makeInvite(), role: 'observer' };
    const bytes = new TextEncoder().encode(JSON.stringify(raw));
    const binStr = Array.from(bytes).map((b) => String.fromCharCode(b)).join('');
    const blob = btoa(binStr);
    expect(decodeInvite(blob)).toBeNull();
  });

  it('roundtrips a long SDP string (realistic)', () => {
    const sdp = [
      'v=0',
      'o=- 8770656990916221407 2 IN IP4 127.0.0.1',
      's=-',
      't=0 0',
      'a=group:BUNDLE 0',
      'a=extmap-allow-mixed',
      'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
      'c=IN IP4 0.0.0.0',
      'a=ice-ufrag:ABCD',
      'a=ice-pwd:abcdefghijklmnopqrstuvwxyz',
      'a=fingerprint:sha-256 AA:BB:CC:DD:EE',
      'a=setup:actpass',
      'a=mid:0',
      'a=sctp-port:5000',
    ].join('\r\n');
    const invite = makeInvite({ sdp });
    const decoded = decodeInvite(encodeInvite(invite));
    expect(decoded!.sdp).toBe(sdp);
  });
});
