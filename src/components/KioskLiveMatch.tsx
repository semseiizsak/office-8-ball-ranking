import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Challenge, ChatMessage, Player, Prediction } from '../types';
import { VOTE_WINDOW_MS } from '../utils/league';
import { CallSplit, PlayerAvatar } from './ui';
import { VoterStack } from './ArenaView';

const elapsed = (startedAt: number, now: number): string => {
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

const countdown = (ms: number): string => {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

/** How long a tap-to-arm "won" button stays armed before it needs tapping again. */
const ARM_TIMEOUT_MS = 4000;

/**
 * Whatever's happening at the table, mirrored on the wall — no identity on
 * this tablet to call it or chat as, so those stay phone-only. But logging a
 * result needs no identity at all, so the two players standing right here
 * can settle it from the kiosk itself: tap a name to arm it, tap again to
 * confirm — a stray single tap on a shared tablet shouldn't be able to
 * record a real result.
 */
export const KioskLiveMatch: React.FC<{
  challenge: Challenge;
  players: Player[];
  onSubscribeChat: (challengeId: string, onChange: (messages: ChatMessage[]) => void) => () => void;
  onLogResult: (winnerId: string) => Promise<void>;
  onClose: () => void;
}> = ({ challenge, players, onSubscribeChat, onLogResult, onClose }) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setChatMessages([]);
    return onSubscribeChat(challenge.id, setChatMessages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challenge.id]);
  useEffect(() => {
    const node = chatScrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [chatMessages]);

  const [armedWinnerId, setArmedWinnerId] = useState<string | null>(null);
  const [isLogging, setIsLogging] = useState(false);
  const [logError, setLogError] = useState('');
  const armTimerRef = useRef<number | null>(null);

  const armWinner = (id: string) => {
    setArmedWinnerId(id);
    setLogError('');
    if (armTimerRef.current) window.clearTimeout(armTimerRef.current);
    armTimerRef.current = window.setTimeout(() => setArmedWinnerId(null), ARM_TIMEOUT_MS);
  };

  const tapWinner = (id: string) => {
    if (isLogging) return;
    if (armedWinnerId === id) {
      if (armTimerRef.current) window.clearTimeout(armTimerRef.current);
      setIsLogging(true);
      onLogResult(id).catch(() => {
        setIsLogging(false);
        setArmedWinnerId(null);
        setLogError('Could not log that result. Try again.');
      });
      // No onClose here on success — the kiosk's own live subscription drops
      // this screen once the challenge flips to 'played' on its own.
      return;
    }
    armWinner(id);
  };

  useEffect(() => () => { if (armTimerRef.current) window.clearTimeout(armTimerRef.current); }, []);

  const byId = new Map(players.map((player) => [player.id, player]));
  const challenger = byId.get(challenge.challengerId);
  const opponent = byId.get(challenge.opponentId);
  const forChallenger = challenge.predictions.filter((p) => p.predictedWinnerId === challenge.challengerId).length;
  const forOpponent = challenge.predictions.length - forChallenger;

  const toVoter = (prediction: Prediction) => {
    const player = byId.get(prediction.predictorId);
    return { prediction, player, name: player?.name || prediction.predictorName, isCurrentUser: false };
  };
  const challengerVoters = challenge.predictions.filter((p) => p.predictedWinnerId === challenge.challengerId).map(toVoter);
  const opponentVoters = challenge.predictions.filter((p) => p.predictedWinnerId === challenge.opponentId).map(toVoter);

  const now = Date.now();
  const startedAt = challenge.startedAt ?? now;
  const remainingVoteMs = Math.max(0, startedAt + VOTE_WINDOW_MS - now);
  const callsClosed = remainingVoteMs <= 0;

  const sides = [
    { player: challenger, id: challenge.challengerId, name: challenge.challengerName, win: challenge.stakes.challengerWinDelta },
    { player: opponent, id: challenge.opponentId, name: challenge.opponentName, win: challenge.stakes.opponentWinDelta },
  ];

  return (
    <div role="dialog" aria-label="Match in progress" className="anim-fade fixed inset-0 z-[55] flex flex-col bg-bg">
      <div className="flex shrink-0 items-center justify-between gap-2 px-4 pb-2 pt-[calc(var(--safe-top)+0.9rem)]">
        <button type="button" onClick={onClose} aria-label="Back to ladder" className="press grid h-11 w-11 place-items-center rounded-full bg-surface-alt">
          <ChevronLeft className="h-5 w-5" strokeWidth={2.25} />
        </button>
        <span className="flex h-[26px] items-center gap-1.5 rounded-full bg-live px-2.5 text-[11px] font-extrabold uppercase tracking-[0.1em] tabular-nums text-white">
          <span className="live-dot" />
          {callsClosed ? `Live ${elapsed(startedAt, now)}` : `Calls ${countdown(remainingVoteMs)}`}
        </span>
        <span className="h-11 w-11" />
      </div>

      <div className="no-scrollbar flex-1 overflow-y-auto px-4 pb-[calc(var(--safe-bottom)+1.5rem)]">
        <div className="stagger grid gap-4">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 pt-2 text-center">
            {sides.map((side, index) => (
              <React.Fragment key={side.id}>
                {index === 1 && <span className="font-display text-[44px] font-extrabold text-white/55">VS</span>}
                <div className={`${index === 0 ? 'duel-in-left' : 'duel-in-right'} grid min-w-0 justify-items-center gap-2`}>
                  <PlayerAvatar player={side.player ?? { id: side.id, name: side.name, avatarUrl: '' }} size={72} />
                  <span className="font-display text-[clamp(16px,5.5vw,22px)] font-extrabold uppercase leading-none [overflow-wrap:anywhere]">
                    {side.name.split(' ')[0]}
                  </span>
                  <span className="rounded-full bg-surface-alt px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.1em] tabular-nums">
                    Win +{side.win}
                  </span>
                </div>
              </React.Fragment>
            ))}
          </div>

          {challenge.stakes.crownBounty > 0 && (
            <span className="justify-self-center rounded-full bg-crown px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.1em] text-bg">
              👑 {challenge.stakes.crownBounty} bounty riding
            </span>
          )}

          <div className="grid gap-2">
            <CallSplit
              left={{ player: challenger ?? { id: challenge.challengerId }, count: forChallenger }}
              right={{ player: opponent ?? { id: challenge.opponentId }, count: forOpponent }}
              onRed
            />
            <div className="flex items-center justify-between gap-2">
              <VoterStack voters={challengerVoters} align="start" />
              <VoterStack voters={opponentVoters} align="end" />
            </div>
          </div>

          <div className="grid gap-2">
            <span className="px-0.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/55">Log the result</span>
            <div className="grid grid-cols-2 gap-2">
              {sides.map((side) => {
                const armed = armedWinnerId === side.id;
                return (
                  <button
                    key={side.id}
                    type="button"
                    disabled={isLogging}
                    onClick={() => tapWinner(side.id)}
                    className={`press flex h-14 items-center justify-center rounded-2xl text-sm font-extrabold uppercase tracking-[0.06em] transition-colors disabled:opacity-60 ${
                      armed ? 'bg-felt text-white' : 'bg-white text-bg'
                    }`}
                  >
                    {isLogging && armed ? 'Logging…' : armed ? 'Tap again to confirm' : `${side.name.split(' ')[0]} won`}
                  </button>
                );
              })}
            </div>
            {logError && <p role="alert" className="text-center text-xs font-semibold text-white/70">{logError}</p>}
          </div>

          <div
            ref={chatScrollRef}
            aria-live="polite"
            className="no-scrollbar grid min-h-[160px] flex-1 content-start gap-1.5 overflow-y-auto rounded-xl bg-elev p-3 text-[13px] leading-snug"
          >
            {chatMessages.length === 0 ? (
              <p className="self-center text-center text-xs text-white/55">Nobody's said anything yet.</p>
            ) : (
              chatMessages.map((message) => (
                <p key={message.id} className="card-drop [overflow-wrap:anywhere]">
                  <b className="font-extrabold">{message.authorName.split(' ')[0]}</b> {message.text}
                </p>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
