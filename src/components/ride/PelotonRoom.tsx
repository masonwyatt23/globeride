/**
 * PelotonRoom — Mesh-aware multi-rider room UI.
 *
 * Supports up to 4 peers (host + 3 joiners) without a signaling server.
 * The host creates a room code and manually relays SDP blobs to each joiner
 * via copy-paste (any messaging app). Once all handshakes are done, each pair
 * of peers has a direct WebRTC DataChannel — no traffic flows through the host.
 *
 * UX flow:
 *   Host side:
 *     1. "Create peloton" → generates room code (e.g. "A7K3FX")
 *     2. Share room code + offer manifest with each friend
 *     3. Paste each friend's join request → get an answer manifest to send back
 *
 *   Joiner side:
 *     1. "Join peloton" → enter room code + paste host's offer manifest
 *     2. Copy answer manifest → send back to host
 *     3. Wait for DataChannel to open
 *
 * Cap: 4 peers. Path to 8: add a lightweight WebSocket relay for SDP exchange.
 */

import { useState, useCallback, useRef } from 'react';
import {
  X,
  Copy,
  Check,
  Users,
  Wifi,
  WifiOff,
  Loader2,
  Plus,
  LogIn,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMultiriderStore } from '@/stores/multiriderStore';
import {
  createRoom,
  generateJoinManifest,
  acceptJoinRequest,
  completeJoin,
  closeMesh,
  emitPeerJoin,
  emitPeerLeave,
  onPeerJoin,
  onPeerLeave,
  MESH_MAX_PEERS,
  type MeshState,
} from '@/lib/webrtc/meshTopology';
import { attachIceRestartHandler } from '@/lib/webrtc/multiriderConnection';

interface Props {
  onClose: () => void;
  /** Called when mesh is ready — parent mounts useMeshSync with this state. */
  onMeshReady: (mesh: MeshState) => void;
  /** Called when mesh is torn down. */
  onMeshClosed: () => void;
}

type Mode = 'idle' | 'host' | 'join';

interface ConnectedPeer {
  peerId: string;
  connectedAt: number;
}

export function PelotonRoom({ onClose, onMeshReady, onMeshClosed }: Props) {
  const [mode, setMode] = useState<Mode>('idle');
  const [status, setStatus] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [peers, setPeers] = useState<ConnectedPeer[]>([]);
  const [isBusy, setIsBusy] = useState(false);

  // Host state
  const [hostOfferBlob, setHostOfferBlob] = useState('');
  const [joinRequestInput, setJoinRequestInput] = useState('');
  const [answerBlobForJoiner, setAnswerBlobForJoiner] = useState('');

  // Joiner state
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [joinManifestBlob, setJoinManifestBlob] = useState('');
  const [hostAnswerInput, setHostAnswerInput] = useState('');

  const meshRef = useRef<MeshState | null>(null);
  const joinerPcRef = useRef<RTCPeerConnection | null>(null);
  const unsubsRef = useRef<Array<() => void>>([]);

  const store = useMultiriderStore.getState;
  const roomCode = useMultiriderStore((s) => s.roomCode);
  const peerCount = peers.length;
  const isConnected = peerCount > 0;

  // ---- Clipboard ----
  const copyToClipboard = useCallback(async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard unavailable — user can Ctrl+C from the textarea.
    }
  }, []);

  // ---- Wire up mesh event callbacks ----
  function wireCallbacks(mesh: MeshState) {
    const unsubJoin = onPeerJoin(mesh, (peerId) => {
      setPeers((prev) => {
        if (prev.some((p) => p.peerId === peerId)) return prev;
        return [...prev, { peerId, connectedAt: Date.now() }];
      });
      setStatus(`Peer connected: ${peerId.slice(0, 8)}…`);
    });
    const unsubLeave = onPeerLeave(mesh, (peerId) => {
      setPeers((prev) => prev.filter((p) => p.peerId !== peerId));
      store().removePeer(peerId);
      setStatus(`Peer disconnected: ${peerId.slice(0, 8)}…`);
    });
    unsubsRef.current.push(unsubJoin, unsubLeave);
  }

  // ---- HOST: Create room ----
  const handleCreateRoom = useCallback(async () => {
    setIsBusy(true);
    setStatus('Creating room…');
    try {
      const { roomCode: code, mesh } = createRoom();
      meshRef.current = mesh;
      store().setMeshHost(true);
      store().setRoomCode(code);
      wireCallbacks(mesh);

      // Generate a "host offer" manifest — this is the initial invite blob
      // the host shares so joiners know the room code + can send their own offer.
      // (The host does NOT create a PC yet — the host reacts to join requests.)
      const hostInvite = btoa(
        JSON.stringify({ type: 'room-invite', roomCode: code, hostPeerId: mesh.localPeerId, v: 2 }),
      );
      setHostOfferBlob(hostInvite);
      setMode('host');
      setStatus(`Room created. Share the room code: ${code}`);
    } catch (err) {
      setStatus(`Failed to create room: ${String(err)}`);
    } finally {
      setIsBusy(false);
    }
  }, [store, wireCallbacks]);

  // ---- HOST: Accept a joiner's manifest ----
  const handleAcceptJoinRequest = useCallback(async () => {
    const mesh = meshRef.current;
    if (!mesh) { setStatus('No active room.'); return; }
    if (mesh.peers.size >= MESH_MAX_PEERS - 1) {
      setStatus(`Room full — maximum ${MESH_MAX_PEERS} peers.`);
      return;
    }
    setIsBusy(true);
    setStatus('Generating answer for joiner…');
    try {
      const answer = await acceptJoinRequest(mesh, joinRequestInput.trim(), (peerId, channel) => {
        // DataChannel opened with this joiner.
        mesh.dataChannels.set(peerId, channel);
        emitPeerJoin(mesh, peerId);
        store().acceptPendingJoinRequest(peerId);
        attachIceRestartHandler(mesh.peers.get(peerId)!, () => {
          emitPeerLeave(mesh, peerId);
        });
      });
      if (!answer) {
        setStatus('Invalid join request — check the pasted blob.');
        return;
      }
      setAnswerBlobForJoiner(answer);
      setJoinRequestInput('');
      setStatus('Copy and send this answer back to the joiner.');
      // Notify parent that mesh is active (first joiner).
      if (mesh.dataChannels.size === 1) {
        onMeshReady(mesh);
      }
    } catch (err) {
      setStatus(`Error: ${String(err)}`);
    } finally {
      setIsBusy(false);
    }
  }, [joinRequestInput, store, onMeshReady]);

  // ---- JOINER: Generate join manifest ----
  const handleGenerateJoinManifest = useCallback(async () => {
    if (!roomCodeInput.trim()) { setStatus('Enter the room code first.'); return; }
    setIsBusy(true);
    setStatus('Generating join offer…');
    try {
      const { mesh, manifest, pc } = await generateJoinManifest(roomCodeInput.trim().toUpperCase());
      meshRef.current = mesh;
      joinerPcRef.current = pc;
      store().setRoomCode(mesh.roomCode);
      wireCallbacks(mesh);
      setJoinManifestBlob(manifest);
      setMode('join');
      setStatus('Send this manifest to the host, then paste their answer below.');
    } catch (err) {
      setStatus(`Failed: ${String(err)}`);
    } finally {
      setIsBusy(false);
    }
  }, [roomCodeInput, store, wireCallbacks]);

  // ---- JOINER: Complete handshake with host's answer ----
  const handleCompleteJoin = useCallback(async () => {
    const mesh = meshRef.current;
    const pc = joinerPcRef.current;
    if (!mesh || !pc) { setStatus('No pending join. Generate a manifest first.'); return; }
    setIsBusy(true);
    setStatus('Completing handshake…');
    try {
      const ok = await completeJoin(mesh, pc, hostAnswerInput.trim(), (peerId, channel) => {
        mesh.dataChannels.set(peerId, channel);
        emitPeerJoin(mesh, peerId);
        attachIceRestartHandler(pc, () => {
          emitPeerLeave(mesh, peerId);
        });
        onMeshReady(mesh);
      });

      // Wire up initiator-side DataChannel open via the custom property set in completeJoin.
      const setupFn = (pc as RTCPeerConnection & { _meshSetupChannel?: (ch: RTCDataChannel) => void })._meshSetupChannel;

      // The joiner created the DataChannel in generateJoinManifest; it opens once
      // the answer is applied and ICE completes. We listen via the pc directly.
      pc.addEventListener('datachannel', (ev) => {
        const ch = ev.channel;
        if (setupFn) {
          ch.addEventListener('open', () => setupFn(ch), { once: true });
        }
      });

      if (!ok) {
        setStatus('Invalid answer — paste the exact text the host sent.');
        return;
      }
      setStatus('Handshake complete — waiting for connection…');
    } catch (err) {
      setStatus(`Error: ${String(err)}`);
    } finally {
      setIsBusy(false);
    }
  }, [hostAnswerInput, onMeshReady]);

  // ---- Disconnect ----
  const handleDisconnect = useCallback(() => {
    const mesh = meshRef.current;
    if (mesh) {
      closeMesh(mesh);
      meshRef.current = null;
    }
    for (const unsub of unsubsRef.current) unsub();
    unsubsRef.current = [];
    joinerPcRef.current = null;
    store().disconnect();
    store().setMeshHost(false);
    store().setRoomCode(null);
    setPeers([]);
    setMode('idle');
    setStatus('');
    setHostOfferBlob('');
    setJoinManifestBlob('');
    setAnswerBlobForJoiner('');
    setHostAnswerInput('');
    setJoinRequestInput('');
    onMeshClosed();
  }, [store, onMeshClosed]);

  const canAddMorePeers = peerCount < MESH_MAX_PEERS - 1;

  return (
    <div className="fixed inset-0 z-[50] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="glass glass-hairline rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 sticky top-0 bg-background/60 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" aria-hidden="true" />
            <span className="font-semibold text-sm">Peloton Room</span>
            {roomCode && (
              <span className="text-xs font-mono bg-white/10 px-2 py-0.5 rounded-md text-primary">
                {roomCode}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isConnected ? (
              <span className="flex items-center gap-1 text-xs text-green-400">
                <Wifi className="h-3 w-3" aria-hidden="true" />
                {peerCount} peer{peerCount !== 1 ? 's' : ''}
              </span>
            ) : mode !== 'idle' ? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <WifiOff className="h-3 w-3" aria-hidden="true" />
                waiting
              </span>
            ) : null}
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close peloton room">
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* STUN notice */}
          <p className="text-xs text-muted-foreground">
            No server — copy-paste signaling. Cap: {MESH_MAX_PEERS} riders.
            Symmetric NAT may require same-network testing.
          </p>

          {/* Status */}
          {status && (
            <p className="text-xs bg-white/5 rounded-lg px-3 py-2 text-muted-foreground" role="status" aria-live="polite">{status}</p>
          )}

          {/* Idle: pick mode */}
          {mode === 'idle' && (
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCreateRoom}
                disabled={isBusy}
                className="flex flex-col h-16 gap-1"
              >
                {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                <span className="text-xs">Create peloton</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMode('join')}
                disabled={isBusy}
                className="flex flex-col h-16 gap-1"
              >
                <LogIn className="h-4 w-4" />
                <span className="text-xs">Join peloton</span>
              </Button>
            </div>
          )}

          {/* HOST mode */}
          {mode === 'host' && (
            <div className="space-y-3">
              {/* Room code display */}
              {roomCode && (
                <div className="text-center py-2">
                  <p className="text-xs text-muted-foreground mb-1">Share this room code:</p>
                  <span className="text-3xl font-mono font-bold tracking-widest text-primary">
                    {roomCode}
                  </span>
                </div>
              )}

              {/* Share initial invite */}
              {hostOfferBlob && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    1. Send this room invite blob to each friend:
                  </p>
                  <div className="relative">
                    <textarea
                      readOnly
                      value={hostOfferBlob}
                      rows={2}
                      className="w-full text-xs font-mono bg-white/5 border border-white/10 rounded-lg p-2 resize-none"
                      onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                    />
                    <Button
                      variant="ghost" size="icon"
                      className="absolute top-1 right-1 h-6 w-6"
                      onClick={() => copyToClipboard(hostOfferBlob, 'invite')}
                      aria-label={copied === 'invite' ? 'Copied room invite' : 'Copy room invite'}
                    >
                      {copied === 'invite' ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </div>
                </div>
              )}

              {/* Accept join request */}
              {canAddMorePeers && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    2. Paste each friend's join request:
                  </p>
                  <textarea
                    value={joinRequestInput}
                    onChange={(e) => setJoinRequestInput(e.target.value)}
                    rows={3}
                    placeholder="Paste friend's join manifest…"
                    disabled={isBusy}
                    className="w-full text-xs font-mono bg-white/5 border border-white/10 rounded-lg p-2 resize-none focus:outline-none focus:border-primary/50 disabled:opacity-50"
                  />
                  <Button
                    onClick={handleAcceptJoinRequest}
                    disabled={!joinRequestInput.trim() || isBusy}
                    className="w-full" size="sm"
                  >
                    {isBusy ? <><Loader2 className="h-3 w-3 animate-spin mr-2" />Processing…</> : 'Generate answer'}
                  </Button>
                </div>
              )}

              {/* Answer blob to send back */}
              {answerBlobForJoiner && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    3. Send this answer back to that friend:
                  </p>
                  <div className="relative">
                    <textarea
                      readOnly
                      value={answerBlobForJoiner}
                      rows={3}
                      className="w-full text-xs font-mono bg-white/5 border border-white/10 rounded-lg p-2 resize-none"
                      onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                    />
                    <Button
                      variant="ghost" size="icon"
                      className="absolute top-1 right-1 h-6 w-6"
                      onClick={() => copyToClipboard(answerBlobForJoiner, 'answer')}
                      aria-label={copied === 'answer' ? 'Copied answer' : 'Copy answer to send back'}
                    >
                      {copied === 'answer' ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Repeat steps 2–3 for each additional friend.</p>
                </div>
              )}

              {/* Peer list */}
              {peers.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Connected riders:</p>
                  <ul className="space-y-1">
                    {peers.map((p) => (
                      <li key={p.peerId} className="flex items-center gap-2 text-xs text-green-400">
                        <Wifi className="h-3 w-3" aria-hidden="true" />
                        {p.peerId.slice(0, 12)}…
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <Button variant="outline" size="sm" onClick={handleDisconnect} className="w-full">
                Close room
              </Button>
            </div>
          )}

          {/* JOINER mode */}
          {mode === 'join' && (
            <div className="space-y-3">
              {!joinManifestBlob ? (
                <>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">
                      Enter the room code your friend shared:
                    </p>
                    <input
                      type="text"
                      value={roomCodeInput}
                      onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase().trim())}
                      maxLength={6}
                      placeholder="A7K3FX"
                      className="w-full text-sm font-mono text-center tracking-widest bg-white/5 border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:border-primary/50 uppercase"
                    />
                  </div>
                  <Button
                    onClick={handleGenerateJoinManifest}
                    disabled={roomCodeInput.length < 4 || isBusy}
                    className="w-full" size="sm"
                  >
                    {isBusy ? <><Loader2 className="h-3 w-3 animate-spin mr-2" />Generating…</> : 'Generate join request'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setMode('idle')} className="w-full text-xs">
                    Back
                  </Button>
                </>
              ) : (
                <>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">
                      1. Send this join request to the host:
                    </p>
                    <div className="relative">
                      <textarea
                        readOnly
                        value={joinManifestBlob}
                        rows={3}
                        className="w-full text-xs font-mono bg-white/5 border border-white/10 rounded-lg p-2 resize-none"
                        onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                      />
                      <Button
                        variant="ghost" size="icon"
                        className="absolute top-1 right-1 h-6 w-6"
                        onClick={() => copyToClipboard(joinManifestBlob, 'joinManifest')}
                        aria-label={copied === 'joinManifest' ? 'Copied join request' : 'Copy join request'}
                      >
                        {copied === 'joinManifest' ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">
                      2. Paste the host's answer:
                    </p>
                    <textarea
                      value={hostAnswerInput}
                      onChange={(e) => setHostAnswerInput(e.target.value)}
                      rows={3}
                      placeholder="Paste the host's answer blob…"
                      disabled={isBusy}
                      className="w-full text-xs font-mono bg-white/5 border border-white/10 rounded-lg p-2 resize-none focus:outline-none focus:border-primary/50 disabled:opacity-50"
                    />
                    <Button
                      onClick={handleCompleteJoin}
                      disabled={!hostAnswerInput.trim() || isBusy}
                      className="w-full" size="sm"
                    >
                      {isBusy ? <><Loader2 className="h-3 w-3 animate-spin mr-2" />Connecting…</> : 'Connect'}
                    </Button>
                  </div>

                  {/* Peer list once connected */}
                  {peers.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Connected:</p>
                      <ul className="space-y-1">
                        {peers.map((p) => (
                          <li key={p.peerId} className="flex items-center gap-2 text-xs text-green-400">
                            <Wifi className="h-3 w-3" aria-hidden="true" />
                            {p.peerId.slice(0, 12)}…
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <Button variant="outline" size="sm" onClick={handleDisconnect} className="w-full">
                    Disconnect
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
