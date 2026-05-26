/**
 * MultiRiderInvite — copy-paste SDP invite modal.
 *
 * Two tabs:
 *   "Create invite"  — initiator generates an offer blob, copies to clipboard,
 *                      then pastes the responder's answer to complete the link.
 *   "Join existing"  — responder pastes the initiator's offer, gets an answer
 *                      blob to copy and send back.
 *
 * No signaling server — 100% copy-paste. Works across the room or via any
 * messaging app.
 *
 * STUN-only: symmetric NAT users may need to test on the same local network.
 */

import { useState, useCallback, useRef } from 'react';
import { X, Copy, Check, Users, Wifi, WifiOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMultiriderStore } from '@/stores/multiriderStore';
import {
  createPeerConnection,
  createOffer,
  acceptOffer,
  acceptAnswer,
  onConnectionStateChange,
  attachIceRestartHandler,
  closeConnection,
} from '@/lib/webrtc/multiriderConnection';
import {
  encodeInvite,
  decodeInvite,
} from '@/lib/webrtc/multiriderSignaling';
import { useRideStore } from '@/stores/rideStore';

type Tab = 'create' | 'join';

interface Props {
  onClose: () => void;
}

export function MultiRiderInvite({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>('create');
  const [offerBlob, setOfferBlob] = useState<string>('');
  const [answerInput, setAnswerInput] = useState<string>('');
  const [answerBlob, setAnswerBlob] = useState<string>('');  // responder's answer to copy
  const [offerInput, setOfferInput] = useState<string>('');  // responder's pasted offer
  const [copied, setCopied] = useState<'offer' | 'answer' | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string>('');
  const pcRef = useRef<RTCPeerConnection | null>(null);

  const connectionState = useMultiriderStore((s) => s.connectionState);
  const error = useMultiriderStore((s) => s.error);
  const store = useMultiriderStore.getState;
  const route = useRideStore((s) => s.route);

  // ---- Initiator: generate offer ----
  const handleCreateInvite = useCallback(async () => {
    setIsCreating(true);
    setStatusMsg('Creating offer…');
    try {
      const pc = createPeerConnection();
      pcRef.current = pc;
      store().setConnection(pc);

      // Track DataChannel open so we can store it.
      pc.addEventListener('datachannel', (ev) => {
        const ch = ev.channel;
        ch.addEventListener('open', () => {
          store().setDataChannel(ch);
          store().setConnectionState('connected');
          setStatusMsg('Connected!');
        });
      });

      // Handle initiator-side DataChannel (created inside createOffer).
      // We'll also listen for its open event after the pc resolves.

      const { sdp, sessionId } = await createOffer(pc);
      store().startAsInitiator(sessionId);

      const blob = encodeInvite({
        schemaVersion: 1,
        sessionId,
        role: 'offer',
        sdp,
        routeId: route?.id ?? null,
        createdAt: Date.now(),
      });
      setOfferBlob(blob);
      setStatusMsg('Share the invite text with your friend, then paste their response below.');

      // Attach state change observer.
      onConnectionStateChange(pc, (state) => {
        if (state === 'connected') {
          store().setConnectionState('connected');
          setStatusMsg('Connected!');
        } else if (state === 'disconnected') {
          store().setConnectionState('disconnected');
          setStatusMsg('Disconnected — attempting to reconnect…');
        } else if (state === 'failed') {
          store().setConnectionState('failed');
          setStatusMsg('Connection failed. Try creating a new invite.');
          store().setError('WebRTC connection failed.');
        }
      });

      attachIceRestartHandler(pc, () => {
        store().setConnectionState('failed');
        store().setError('Connection could not be re-established.');
      });
    } catch (err) {
      store().setError(String(err));
      setStatusMsg('Failed to create offer. Check browser WebRTC support.');
    } finally {
      setIsCreating(false);
    }
  }, [route, store]);

  // ---- Initiator: accept answer from responder ----
  const handleAcceptAnswer = useCallback(async () => {
    const pc = pcRef.current ?? useMultiriderStore.getState().connection;
    if (!pc) {
      setStatusMsg('No active connection. Create an invite first.');
      return;
    }
    const invite = decodeInvite(answerInput.trim());
    if (!invite || invite.role !== 'answer') {
      setStatusMsg('Invalid or malformed answer. Please paste the exact text your friend sent.');
      return;
    }
    try {
      await acceptAnswer(pc, invite.sdp);
      setStatusMsg('Answer accepted — waiting for ICE to complete…');
    } catch (err) {
      setStatusMsg(`Failed to accept answer: ${String(err)}`);
    }
  }, [answerInput]);

  // ---- Responder: accept offer and generate answer ----
  const handleJoinInvite = useCallback(async () => {
    const invite = decodeInvite(offerInput.trim());
    if (!invite || invite.role !== 'offer') {
      setStatusMsg('Invalid or malformed offer. Please paste the exact text your friend sent.');
      return;
    }
    setIsJoining(true);
    setStatusMsg('Generating answer…');
    try {
      const pc = createPeerConnection();
      pcRef.current = pc;
      store().setConnection(pc);
      store().joinAsResponder();
      store().setSessionId(invite.sessionId);

      // Responder receives the DataChannel via the datachannel event.
      pc.addEventListener('datachannel', (ev) => {
        const ch = ev.channel;
        ch.addEventListener('open', () => {
          store().setDataChannel(ch);
          store().setConnectionState('connected');
          setStatusMsg('Connected!');
        });
      });

      onConnectionStateChange(pc, (state) => {
        if (state === 'connected') {
          store().setConnectionState('connected');
          setStatusMsg('Connected!');
        } else if (state === 'failed') {
          store().setConnectionState('failed');
          store().setError('Connection failed.');
          setStatusMsg('Connection failed. Ask your friend to create a new invite.');
        }
      });

      attachIceRestartHandler(pc, () => {
        store().setConnectionState('failed');
        store().setError('Connection could not be re-established.');
      });

      const answerSdp = await acceptOffer(pc, invite.sdp);
      const blob = encodeInvite({
        schemaVersion: 1,
        sessionId: invite.sessionId,
        role: 'answer',
        sdp: answerSdp,
        routeId: route?.id ?? null,
        createdAt: Date.now(),
      });
      setAnswerBlob(blob);
      setStatusMsg('Copy and send the answer text back to your friend.');
    } catch (err) {
      store().setError(String(err));
      setStatusMsg(`Failed: ${String(err)}`);
    } finally {
      setIsJoining(false);
    }
  }, [offerInput, route, store]);

  // ---- Copy to clipboard ----
  const copyToClipboard = useCallback(async (text: string, which: 'offer' | 'answer') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard API not available (HTTP, older browser).
      // Fall back to selectAll so user can Ctrl+C.
    }
  }, []);

  // ---- Disconnect ----
  const handleDisconnect = useCallback(() => {
    if (pcRef.current) {
      closeConnection(pcRef.current);
      pcRef.current = null;
    }
    store().disconnect();
    setOfferBlob('');
    setAnswerBlob('');
    setAnswerInput('');
    setOfferInput('');
    setStatusMsg('');
  }, [store]);

  const isConnected = connectionState === 'connected';
  const isBusy = connectionState === 'inviting' || connectionState === 'joining' || isCreating || isJoining;

  return (
    <div className="fixed inset-0 z-[50] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="glass glass-hairline rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" aria-hidden="true" />
            <span className="font-semibold text-sm">Ride with a Friend</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Connection indicator */}
            {isConnected ? (
              <span className="flex items-center gap-1 text-xs text-green-400">
                <Wifi className="h-3 w-3" aria-hidden="true" />
                Connected
              </span>
            ) : connectionState !== 'idle' ? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <WifiOff className="h-3 w-3" aria-hidden="true" />
                {connectionState}
              </span>
            ) : null}
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close invite panel">
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        {/* STUN-only notice */}
        <div className="px-4 pt-3">
          <p className="text-xs text-muted-foreground">
            No server required. Copy-paste the invite text via any messaging app.
            Both riders must be on the same route.{' '}
            <span className="text-yellow-400">Note:</span> symmetric NAT (carrier-grade NAT) may
            require same-network testing.
          </p>
        </div>

        {/* Tabs */}
        {!isConnected && (
          <div className="flex gap-1 px-4 pt-3">
            <button
              className={`flex-1 text-xs py-1.5 px-3 rounded-lg transition-colors ${
                tab === 'create'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-white/5 hover:bg-white/10 text-muted-foreground'
              }`}
              onClick={() => setTab('create')}
              disabled={isBusy}
            >
              Create invite
            </button>
            <button
              className={`flex-1 text-xs py-1.5 px-3 rounded-lg transition-colors ${
                tab === 'join'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-white/5 hover:bg-white/10 text-muted-foreground'
              }`}
              onClick={() => setTab('join')}
              disabled={isBusy}
            >
              Join existing
            </button>
          </div>
        )}

        <div className="p-4 space-y-3">
          {/* Status message */}
          {statusMsg && (
            <p className="text-xs text-muted-foreground bg-white/5 rounded-lg px-3 py-2">
              {statusMsg}
            </p>
          )}
          {error && (
            <p className="text-xs text-red-400 bg-red-950/30 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* Connected state */}
          {isConnected ? (
            <div className="space-y-3 text-center">
              <div className="flex items-center justify-center gap-2 text-green-400">
                <Wifi className="h-5 w-5" aria-hidden="true" />
                <span className="font-semibold">Live with your friend!</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Your friend's avatar is now visible on the globe.
              </p>
              <Button variant="outline" size="sm" onClick={handleDisconnect} className="w-full">
                Disconnect
              </Button>
            </div>
          ) : tab === 'create' ? (
            /* ---- Create invite tab ---- */
            <div className="space-y-3">
              {!offerBlob ? (
                <Button
                  onClick={handleCreateInvite}
                  disabled={isCreating}
                  className="w-full"
                  size="sm"
                >
                  {isCreating ? (
                    <><Loader2 className="h-3 w-3 animate-spin mr-2" aria-hidden="true" />Generating…</>
                  ) : (
                    'Generate invite'
                  )}
                </Button>
              ) : (
                <>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">
                      1. Copy and send this to your friend:
                    </p>
                    <div className="relative">
                      <textarea
                        readOnly
                        value={offerBlob}
                        rows={3}
                        className="w-full text-xs font-mono bg-white/5 border border-white/10 rounded-lg p-2 resize-none focus:outline-none"
                        onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                        aria-label="Offer invite text"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-1 right-1 h-6 w-6"
                        onClick={() => copyToClipboard(offerBlob, 'offer')}
                        aria-label="Copy offer invite"
                      >
                        {copied === 'offer' ? (
                          <Check className="h-3 w-3 text-green-400" aria-hidden="true" />
                        ) : (
                          <Copy className="h-3 w-3" aria-hidden="true" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">
                      2. Paste their response here:
                    </p>
                    <textarea
                      value={answerInput}
                      onChange={(e) => setAnswerInput(e.target.value)}
                      rows={3}
                      placeholder="Paste your friend's answer text…"
                      className="w-full text-xs font-mono bg-white/5 border border-white/10 rounded-lg p-2 resize-none focus:outline-none focus:border-primary/50"
                      aria-label="Paste friend's answer"
                    />
                    <Button
                      onClick={handleAcceptAnswer}
                      disabled={!answerInput.trim()}
                      className="w-full"
                      size="sm"
                    >
                      Connect
                    </Button>
                  </div>
                </>
              )}
            </div>
          ) : (
            /* ---- Join existing tab ---- */
            <div className="space-y-3">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  1. Paste your friend's invite text:
                </p>
                <textarea
                  value={offerInput}
                  onChange={(e) => setOfferInput(e.target.value)}
                  rows={3}
                  placeholder="Paste the invite text your friend sent…"
                  disabled={isJoining}
                  className="w-full text-xs font-mono bg-white/5 border border-white/10 rounded-lg p-2 resize-none focus:outline-none focus:border-primary/50 disabled:opacity-50"
                  aria-label="Paste friend's invite offer"
                />
                <Button
                  onClick={handleJoinInvite}
                  disabled={!offerInput.trim() || isJoining}
                  className="w-full"
                  size="sm"
                >
                  {isJoining ? (
                    <><Loader2 className="h-3 w-3 animate-spin mr-2" aria-hidden="true" />Generating answer…</>
                  ) : (
                    'Generate answer'
                  )}
                </Button>
              </div>

              {answerBlob && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    2. Copy and send this back to your friend:
                  </p>
                  <div className="relative">
                    <textarea
                      readOnly
                      value={answerBlob}
                      rows={3}
                      className="w-full text-xs font-mono bg-white/5 border border-white/10 rounded-lg p-2 resize-none focus:outline-none"
                      onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                      aria-label="Answer invite text"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-1 right-1 h-6 w-6"
                      onClick={() => copyToClipboard(answerBlob, 'answer')}
                      aria-label="Copy answer invite"
                    >
                      {copied === 'answer' ? (
                        <Check className="h-3 w-3 text-green-400" aria-hidden="true" />
                      ) : (
                        <Copy className="h-3 w-3" aria-hidden="true" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    3. Wait — your friend will connect once they paste your answer.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
