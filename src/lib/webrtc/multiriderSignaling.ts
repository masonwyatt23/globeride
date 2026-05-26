/**
 * multiriderSignaling.ts — Base64 manifest for copy-paste SDP exchange.
 *
 * The invite blob is a base64-encoded JSON object that encodes the SDP offer
 * or answer. Both sides exchange blobs via clipboard (copy-paste). No server.
 *
 * Schema note: plain JSON-base64, no HMAC signing — this is a personal-trust
 * invite flow (you share with someone you know), not a public race lobby.
 * The schemaVersion field future-proofs us for breaking changes.
 */

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const MULTIRIDER_SCHEMA_VERSION = 1 as const;

export interface MultiRiderInvite {
  /** Schema version — decoders reject unknown future versions. */
  schemaVersion: 1;
  /** Stable session identifier shared between both peers. */
  sessionId: string;
  /** Which role produced this blob. */
  role: 'offer' | 'answer';
  /** Raw SDP string from RTCPeerConnection.localDescription.sdp. */
  sdp: string;
  /**
   * The routeId this session is intended for, or null if the route is not
   * from the pre-loaded catalog (custom GPX, drawn route, etc.).
   */
  routeId: string | null;
  /** Unix ms when this invite was created. */
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Encode / Decode
// ---------------------------------------------------------------------------

/**
 * Encode a MultiRiderInvite as a base64 string suitable for clipboard copy.
 *
 * Uses the same base64url encoding pattern as raceProtocol.ts for consistency:
 * TextEncoder → binary string → btoa → replace +/= with URL-safe chars.
 */
export function encodeInvite(invite: MultiRiderInvite): string {
  const json = JSON.stringify(invite);
  const bytes = new TextEncoder().encode(json);
  const binStr = Array.from(bytes)
    .map((b) => String.fromCharCode(b))
    .join('');
  // Standard base64 (with padding) for easier copy-paste resilience.
  return btoa(binStr);
}

/**
 * Decode a base64 invite blob.
 * Returns null on any parse or validation failure so callers can show a
 * user-friendly error rather than crashing.
 */
export function decodeInvite(blob: string): MultiRiderInvite | null {
  try {
    // Accept both standard base64 and base64url (in case users copy URLs).
    const b64std = blob.trim().replace(/-/g, '+').replace(/_/g, '/');
    const binStr = atob(b64std);
    const bytes = Uint8Array.from(binStr, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const parsed: unknown = JSON.parse(json);
    return validateInviteShape(parsed);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Shape validation
// ---------------------------------------------------------------------------

function validateInviteShape(raw: unknown): MultiRiderInvite | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;

  // Schema version guard
  if (typeof m.schemaVersion !== 'number') return null;
  if (m.schemaVersion !== MULTIRIDER_SCHEMA_VERSION) return null;

  // Required string fields
  if (typeof m.sessionId !== 'string' || !m.sessionId) return null;
  if (typeof m.sdp !== 'string' || !m.sdp) return null;
  if (typeof m.createdAt !== 'number') return null;

  // Role enum
  if (m.role !== 'offer' && m.role !== 'answer') return null;

  // routeId: string or null
  if (m.routeId !== null && typeof m.routeId !== 'string') return null;

  return m as unknown as MultiRiderInvite;
}
