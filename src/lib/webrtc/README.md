# `src/lib/webrtc/` — Multiplayer peer-to-peer (1:1 and mesh up to 4 riders)

## What's here

- `multiriderConnection.ts` — RTCPeerConnection lifecycle: create offer/answer, ICE handling, data channel open, ICE restart on transient disconnect (up to 3 retries over 30 s)
- `multiriderSignaling.ts` — Base64-encoded JSON invite blobs for copy-paste SDP exchange; no signaling server required
- `multiriderCodec.ts` — Binary DataChannel message encoding (v2 protocol): BASELINE handshake, per-frame STATE at ~10 Hz, ROOM_ANNOUNCE for mesh membership; v2 adds 1-byte opcode + 16-byte `senderPeerId` header
- `meshTopology.ts` — N-rider mesh (up to 4 peers) coordinated by a room host; host-relayed SDP exchange using 6-char room codes

## Public API

```ts
// multiriderConnection.ts
createPeerConnection(): RTCPeerConnection
createOffer(pc: RTCPeerConnection): Promise<RTCSessionDescriptionInit>
acceptOffer(pc: RTCPeerConnection, offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit>
acceptAnswer(pc: RTCPeerConnection, answer: RTCSessionDescriptionInit): Promise<void>
onConnectionStateChange(pc: RTCPeerConnection, cb: (state: RTCPeerConnectionState) => void): void
onDataChannelMessage(pc: RTCPeerConnection, cb: (data: ArrayBuffer) => void): void
attachIceRestartHandler(pc: RTCPeerConnection, ...): void
closeConnection(pc: RTCPeerConnection): void

// multiriderSignaling.ts
encodeInvite(invite: MultiRiderInvite): string   // → base64 blob
decodeInvite(blob: string): MultiRiderInvite | null
// MultiRiderInvite: { schemaVersion, sessionId, sdp, role, routeId, createdAt }

// multiriderCodec.ts
encodePeerStateV2(msg: PeerStateMsgV2): Uint8Array
decodePeerStateV2(buf: Uint8Array): PeerStateMsgV2 | null
exchangeBaselineV2(peerId, lat, lon): Uint8Array
decodeBaselineV2(buf: Uint8Array): { peerId, lat, lon } | null
encodeRoomAnnounce(msg: RoomAnnounceMsg): Uint8Array
decodeRoomAnnounce(buf: Uint8Array): RoomAnnounceMsg | null
isV2Frame(buf: Uint8Array): boolean

// meshTopology.ts
createRoom(): { roomCode, localPeerId, mesh: MeshState }
generateJoinManifest(roomCode, localPeerId, offer): Promise<string>
acceptJoinRequest(mesh, manifestBlob): Promise<string>  // returns host answer blob
completeJoin(mesh, answerBlob): Promise<void>
broadcastState(mesh: MeshState, encodedState: Uint8Array): void
onPeerJoin(mesh, cb): void
onPeerLeave(mesh, cb): void
closeMesh(mesh: MeshState): void
```

## How it's consumed

- `src/stores/multiriderStore.ts` — top-level connection state (1:1 mode)
- `src/hooks/useMultiriderSync.ts` — 1:1 ride state sync via `multiriderCodec`
- `src/hooks/useMeshSync.ts` — mesh mode sync via `meshTopology` + `multiriderCodec`
- `src/components/ride/MultiRiderInvite.tsx` — copy-paste SDP UI (1:1)
- `src/components/ride/PelotonRoom.tsx` — room code UI (mesh mode)

## Constraints / gotchas

- **STUN-only ICE**: no TURN relay. Symmetric NAT users (common on mobile/enterprise networks) may fail to connect. Same-LAN testing is reliable; public internet is best-effort.
- **No signaling server**: all SDP exchange is manual copy-paste. This means joining takes ~3 manual steps per peer.
- **Mesh cap**: `MESH_MAX_PEERS = 4`. The host bears O(n) connection load.
- **v1/v2 wire compatibility**: v2 frames include a 17-byte header prefix. `isV2Frame()` discriminates by magic bytes — v1 receivers dispatch on the first opcode byte (0x01/0x02) which is unchanged.
- **DataChannel name**: `'globeride.multirider.v1'` (1:1) and `'globeride.mesh.v1'` (mesh). Only one channel per peer connection.
