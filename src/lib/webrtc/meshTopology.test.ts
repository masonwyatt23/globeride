/**
 * Tests for meshTopology.ts — N-rider mesh peloton management.
 *
 * WebRTC primitives (RTCPeerConnection, RTCDataChannel, crypto) are stubbed
 * with minimal fakes so the tests run in Vitest's Node environment.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createRoom,
  generateRoomCode,
  generatePeerId,
  encodeManifest,
  decodeManifest,
  broadcastState,
  onPeerJoin,
  onPeerLeave,
  emitPeerJoin,
  emitPeerLeave,
  closeMesh,
  MESH_MAX_PEERS,
  type MeshState,
  type JoinManifest,
} from './meshTopology';

// ---------------------------------------------------------------------------
// Crypto stub (Node doesn't have crypto.randomUUID in older versions)
// ---------------------------------------------------------------------------

beforeEach(() => {
  if (!global.crypto) {
    (global as unknown as { crypto: unknown }).crypto = {};
  }
  const c = global.crypto as { randomUUID?: () => string; getRandomValues?: (a: Uint8Array) => Uint8Array };
  if (!c.randomUUID) {
    let counter = 0;
    c.randomUUID = () => `00000000-0000-0000-0000-${String(++counter).padStart(12, '0')}`;
  }
  if (!c.getRandomValues) {
    c.getRandomValues = (arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) arr[i] = (i * 37 + 13) % 256;
      return arr;
    };
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMesh(isHost = false): MeshState {
  return {
    localPeerId: generatePeerId(),
    roomCode: generateRoomCode(),
    peers: new Map(),
    dataChannels: new Map(),
    isHost,
  };
}

function makeFakeChannel(readyState: RTCDataChannelState = 'open'): RTCDataChannel {
  const listeners: Record<string, Array<(e: unknown) => void>> = {};
  return {
    readyState,
    send: vi.fn(),
    addEventListener: vi.fn((ev: string, fn: (e: unknown) => void) => {
      listeners[ev] = listeners[ev] ?? [];
      listeners[ev].push(fn);
    }),
    removeEventListener: vi.fn(),
    _listeners: listeners,
  } as unknown as RTCDataChannel;
}

// ---------------------------------------------------------------------------
// generateRoomCode
// ---------------------------------------------------------------------------

describe('generateRoomCode', () => {
  it('returns exactly 6 characters', () => {
    expect(generateRoomCode()).toHaveLength(6);
  });

  it('contains only valid alphabet characters', () => {
    const code = generateRoomCode();
    expect(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(code)).toBe(true);
  });

  it('does not include ambiguous chars 0, O, 1, I, L', () => {
    // Generate many codes and check none contain ambiguous chars.
    for (let i = 0; i < 20; i++) {
      expect(generateRoomCode()).not.toMatch(/[01OIL]/);
    }
  });
});

// ---------------------------------------------------------------------------
// generatePeerId
// ---------------------------------------------------------------------------

describe('generatePeerId', () => {
  it('returns a non-empty string', () => {
    expect(generatePeerId().length).toBeGreaterThan(0);
  });

  it('returns distinct values on successive calls', () => {
    const a = generatePeerId();
    const b = generatePeerId();
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// createRoom
// ---------------------------------------------------------------------------

describe('createRoom', () => {
  it('returns a 6-char room code', () => {
    const { roomCode } = createRoom();
    expect(roomCode).toHaveLength(6);
  });

  it('returns a non-empty localPeerId', () => {
    const { localPeerId } = createRoom();
    expect(localPeerId.length).toBeGreaterThan(0);
  });

  it('marks mesh as host', () => {
    const { mesh } = createRoom();
    expect(mesh.isHost).toBe(true);
  });

  it('starts with empty peers and dataChannels', () => {
    const { mesh } = createRoom();
    expect(mesh.peers.size).toBe(0);
    expect(mesh.dataChannels.size).toBe(0);
  });

  it('stores the room code in mesh', () => {
    const { roomCode, mesh } = createRoom();
    expect(mesh.roomCode).toBe(roomCode);
  });
});

// ---------------------------------------------------------------------------
// encodeManifest / decodeManifest
// ---------------------------------------------------------------------------

describe('encodeManifest / decodeManifest', () => {
  const sample: JoinManifest = {
    schemaVersion: 2,
    type: 'join-offer',
    roomCode: 'ABC123',
    fromPeerId: 'peer-a',
    sdp: 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n',
    createdAt: 1_700_000_000_000,
  };

  it('roundtrips a join-offer manifest', () => {
    const blob = encodeManifest(sample);
    const decoded = decodeManifest(blob);
    expect(decoded).not.toBeNull();
    expect(decoded!.type).toBe('join-offer');
    expect(decoded!.roomCode).toBe('ABC123');
    expect(decoded!.fromPeerId).toBe('peer-a');
    expect(decoded!.sdp).toBe(sample.sdp);
  });

  it('roundtrips a join-answer manifest with toPeerId', () => {
    const answer: JoinManifest = { ...sample, type: 'join-answer', toPeerId: 'peer-b' };
    const blob = encodeManifest(answer);
    const decoded = decodeManifest(blob);
    expect(decoded!.type).toBe('join-answer');
    expect(decoded!.toPeerId).toBe('peer-b');
  });

  it('returns null for garbage input', () => {
    expect(decodeManifest('not-base64!!!')).toBeNull();
  });

  it('returns null for wrong schemaVersion', () => {
    const bad = { ...sample, schemaVersion: 1 };
    const blob = btoa(JSON.stringify(bad));
    expect(decodeManifest(blob)).toBeNull();
  });

  it('returns null for unknown type', () => {
    const bad = { ...sample, type: 'unknown' };
    const blob = btoa(JSON.stringify(bad));
    expect(decodeManifest(blob)).toBeNull();
  });

  it('returns null for missing sdp field', () => {
    const bad = { ...sample, sdp: undefined };
    const blob = btoa(JSON.stringify(bad));
    expect(decodeManifest(blob)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// broadcastState
// ---------------------------------------------------------------------------

describe('broadcastState', () => {
  it('sends to all open channels', () => {
    const mesh = makeMesh(true);
    const ch1 = makeFakeChannel('open');
    const ch2 = makeFakeChannel('open');
    mesh.dataChannels.set('peer-1', ch1);
    mesh.dataChannels.set('peer-2', ch2);

    const payload = new Uint8Array([0x02, 0x01, 0x02, 0x03]);
    broadcastState(mesh, payload);

    expect(ch1.send).toHaveBeenCalledTimes(1);
    expect(ch2.send).toHaveBeenCalledTimes(1);
  });

  it('skips channels that are not open', () => {
    const mesh = makeMesh(true);
    const openCh = makeFakeChannel('open');
    const closedCh = makeFakeChannel('closed');
    mesh.dataChannels.set('peer-open', openCh);
    mesh.dataChannels.set('peer-closed', closedCh);

    broadcastState(mesh, new Uint8Array([0x02]));

    expect(openCh.send).toHaveBeenCalledTimes(1);
    expect(closedCh.send).not.toHaveBeenCalled();
  });

  it('sends a copy (slice) not the original buffer', () => {
    const mesh = makeMesh(true);
    const ch = makeFakeChannel('open');
    mesh.dataChannels.set('peer-1', ch);

    const original = new Uint8Array([0x01, 0x02]);
    broadcastState(mesh, original);

    const sent = (ch.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    // Modifying original should not affect the sent buffer.
    original[0] = 0xff;
    expect(sent[0]).toBe(0x01);
  });

  it('does nothing when no channels are registered', () => {
    const mesh = makeMesh(true);
    expect(() => broadcastState(mesh, new Uint8Array([0x01]))).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// onPeerJoin / emitPeerJoin
// ---------------------------------------------------------------------------

describe('onPeerJoin / emitPeerJoin', () => {
  it('fires callback when emitPeerJoin is called', () => {
    const mesh = makeMesh(true);
    const cb = vi.fn();
    onPeerJoin(mesh, cb);
    emitPeerJoin(mesh, 'peer-x');
    expect(cb).toHaveBeenCalledWith('peer-x');
  });

  it('supports multiple join callbacks', () => {
    const mesh = makeMesh(true);
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    onPeerJoin(mesh, cb1);
    onPeerJoin(mesh, cb2);
    emitPeerJoin(mesh, 'peer-y');
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes correctly', () => {
    const mesh = makeMesh(true);
    const cb = vi.fn();
    const unsub = onPeerJoin(mesh, cb);
    unsub();
    emitPeerJoin(mesh, 'peer-z');
    expect(cb).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// onPeerLeave / emitPeerLeave
// ---------------------------------------------------------------------------

describe('onPeerLeave / emitPeerLeave', () => {
  it('fires callback when emitPeerLeave is called', () => {
    const mesh = makeMesh(true);
    const cb = vi.fn();
    onPeerLeave(mesh, cb);
    emitPeerLeave(mesh, 'peer-gone');
    expect(cb).toHaveBeenCalledWith('peer-gone');
  });

  it('removes peer from mesh.peers on leave', () => {
    const mesh = makeMesh(true);
    mesh.peers.set('peer-gone', {} as RTCPeerConnection);
    mesh.dataChannels.set('peer-gone', makeFakeChannel());
    emitPeerLeave(mesh, 'peer-gone');
    expect(mesh.peers.has('peer-gone')).toBe(false);
    expect(mesh.dataChannels.has('peer-gone')).toBe(false);
  });

  it('unsubscribes correctly', () => {
    const mesh = makeMesh(true);
    const cb = vi.fn();
    const unsub = onPeerLeave(mesh, cb);
    unsub();
    emitPeerLeave(mesh, 'peer-q');
    expect(cb).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// closeMesh
// ---------------------------------------------------------------------------

describe('closeMesh', () => {
  it('clears peers and dataChannels', () => {
    const mesh = makeMesh(true);
    const fakePc = { close: vi.fn() } as unknown as RTCPeerConnection;
    mesh.peers.set('peer-1', fakePc);
    mesh.dataChannels.set('peer-1', makeFakeChannel());

    closeMesh(mesh);

    expect(mesh.peers.size).toBe(0);
    expect(mesh.dataChannels.size).toBe(0);
  });

  it('calls close() on each RTCPeerConnection', () => {
    const mesh = makeMesh(true);
    const pc1 = { close: vi.fn() } as unknown as RTCPeerConnection;
    const pc2 = { close: vi.fn() } as unknown as RTCPeerConnection;
    mesh.peers.set('a', pc1);
    mesh.peers.set('b', pc2);

    closeMesh(mesh);

    expect(pc1.close).toHaveBeenCalledTimes(1);
    expect(pc2.close).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// MESH_MAX_PEERS constant
// ---------------------------------------------------------------------------

describe('MESH_MAX_PEERS', () => {
  it('is 4', () => {
    expect(MESH_MAX_PEERS).toBe(4);
  });
});
