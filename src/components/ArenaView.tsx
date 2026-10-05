import { createPortal } from 'react-dom';
import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ClipboardCheck, Flag, Play, Send, Swords, Tv } from 'lucide-react';
import { Challenge, ChatMessage, Cheer, Player, Prediction } from '../types';
import { NERVE_MIN_CALLS, VOTE_WINDOW_MS } from '../utils/league';
import { stakeOf, BALL_TIP_COST, ChipsState, DAILY_CHIPS, STAKES, leftToday } from '../utils/chips';
import { DAILY_PLAY_BONUS, DAILY_WIN_BONUS } from '../utils/daily';
import { shamed } from '../utils/shame';
import { ballColor, playerBall } from '../utils/balls';
import { Ball, CallSplit, Coin, PlayerAvatar, Sheet } from './ui';
import { CHALLENGE_REWARD, MATCH_COINS, STREAK_FROM, TaskProgress } from '../utils/coins';

/** Quick, disposable calls-outs on a live match — nothing to say, just noise. */
const CHEER_EMOJI = ['🔥', '🎱', '😱', '👏', '💀', '😭'];

interface ArenaViewProps {
  players: Player[];
  challenges: Challenge[];
  currentPlayer: Player;
  onIssueChallenge: () => void;
  onRespond: (challenge: Challenge, status: 'accepted' | 'declined') => Promise<void>;
  onCancel: (challenge: Challenge) => Promise<void>;
  onPredict: (challenge: Challenge, predictedWinnerId: string, stake: number, ball?: 'solids' | 'stripes') => Promise<void>;
  onPlayChallenge: (challenge: Challenge) => void;
  /** Calls the match on: either player, no agreement step. */
  onStartChallenge: (challenge: Challenge) => Promise<void>;
  /** Opens the logger for a game that was never challenged. */
  onLogMatch: () => void;
  /** Puts a match on the table right now — the way most games actually start. */
  onInstantMatch: () => void;
  onSelectPlayer?: (player: Player) => void;
  /** Office chips: wealth, pools and the jackpot. */
  chips: ChipsState;
  /** Opens the full-screen live view — also driven from outside when a
   * match involving the current player goes live, not just from a tap. */
  onOpenLiveMatch: (challengeId: string) => void;
  /** Today's match of the day for the current player, if the draw has run. */
  daily?: { bye: boolean; opponent: Player | null; played: boolean; won: boolean; streak: number } | null;
  onPlayDaily?: (opponentId: string) => void;
  /** Opens the full match history from the Settled list. */
  onShowHistory?: () => void;
  /** This week's coin challenges and how far the viewer is. */
  weekly?: TaskProgress[];
}

export interface VoterInfo {
  prediction: Prediction;
  player?: Player;
  name: string;
  isCurrentUser: boolean;
}

/** Who backed a side, as a tight stack of faces. */
export const VoterStack: React.FC<{ voters: VoterInfo[]; align: 'start' | 'end'; onSelectPlayer?: (player: Player) => void }> = ({
  voters,
  align,
  onSelectPlayer,
}) => {
  if (voters.length === 0) return <span />;
  const sorted = [...voters].sort((a, b) => Number(b.isCurrentUser) - Number(a.isCurrentUser));
  const visible = sorted.slice(0, 5);
  return (
    <span className={`flex items-center -space-x-1.5 ${align === 'end' ? 'justify-end' : ''}`}>
      {visible.map((voter) => (
        <button
          key={voter.prediction.id}
          type="button"
          title={`${voter.name}${voter.isCurrentUser ? ' (You)' : ''}`}
          onClick={(event) => {
            event.stopPropagation();
            if (voter.player) onSelectPlayer?.(voter.player);
          }}
          className="rounded-full ring-2 ring-card"
        >
          <PlayerAvatar player={voter.player ?? { id: voter.prediction.predictorId, name: voter.name, avatarUrl: '' }} size={24} />
        </button>
      ))}
      {sorted.length > 5 && (
        <span className="ml-1 grid h-6 min-w-6 place-items-center rounded-full bg-surface-alt px-1.5 text-[10px] font-bold text-white/70 ring-2 ring-card">
          +{sorted.length - 5}
        </span>
      )}
    </span>
  );
};

/** Running time since the match was called on. */
const elapsed = (startedAt: number, now: number): string => {
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

const timeLeft = (expiresAt: number, now: number): string => {
  const minutes = Math.round((expiresAt - now) / 60_000);
  if (minutes <= 0) return 'expired';
  if (minutes < 60) return `${minutes}m left`;
  return `${Math.round(minutes / 60)}h left`;
};

/** Milliseconds left to call a live match, or Infinity if it isn't live yet. */
const voteWindowRemaining = (challenge: Challenge, now: number): number => {
  if (challenge.status !== 'live' || !challenge.startedAt) return Infinity;
  return Math.max(0, challenge.startedAt + VOTE_WINDOW_MS - now);
};

const formatCountdown = (ms: number): string => {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

const first = (name: string) => name.split(' ')[0];

/** Everything derived from a challenge that both the board card and the
 * full-screen live view need, kept in one place so they cannot drift.
 * Standalone rather than a closure so the live screen can be driven from
 * outside this component — a match going live pulls both players into it,
 * whichever tab they happen to be on. */
export const deriveChallengeView = (challenge: Challenge, players: Player[], currentPlayer: Player) => {
  const byId = new Map<string, Player>(players.map((player) => [player.id, player]));
  const challenger = byId.get(challenge.challengerId);
  const opponent = byId.get(challenge.opponentId);
  const isPlayer =
    challenge.challengerId === currentPlayer.id || challenge.opponentId === currentPlayer.id;
  const myCall = challenge.predictions.find(
    (prediction) => prediction.predictorId === currentPlayer.id
  );

  const forChallenger = challenge.predictions.filter(
    (prediction) => prediction.predictedWinnerId === challenge.challengerId
  ).length;
  const forOpponent = challenge.predictions.length - forChallenger;
  const total = challenge.predictions.length;
  const challengerShare = total > 0 ? Math.round((forChallenger / total) * 100) : 50;

  const toVoter = (prediction: Prediction): VoterInfo => {
    const player = byId.get(prediction.predictorId);
    return {
      prediction,
      player,
      name: player?.name || prediction.predictorName,
      isCurrentUser: prediction.predictorId === currentPlayer.id,
    };
  };
  const challengerVoters = challenge.predictions
    .filter((prediction) => prediction.predictedWinnerId === challenge.challengerId)
    .map(toVoter);
  const opponentVoters = challenge.predictions
    .filter((prediction) => prediction.predictedWinnerId === challenge.opponentId)
    .map(toVoter);

  return {
    challenger,
    opponent,
    isPlayer,
    myCall,
    forChallenger,
    forOpponent,
    total,
    challengerShare,
    challengerVoters,
    opponentVoters,
  };
};

/** Stand-in for a player who has since left the roster, so a card never breaks. */
const ghost = (id: string, name: string) => ({ id, name, avatarUrl: '' });

/**
 * Staking a call: pick how many chips, optionally tip the winner's balls for
 * the jackpot, then tap who wins. Once cast it cannot be changed.
 */
const CallControls: React.FC<{
  challenge: Challenge;
  myCall?: Prediction;
  /** Chips still available today. */
  left: number;
  onCall: (playerId: string, stake: number, ball?: 'solids' | 'stripes') => void;
  /** The two players' balls, for the colour dot on each button. */
  balls: [number, number];
  prefix?: string;
}> = ({ challenge, myCall, left, onCall, balls, prefix = '' }) => {
  const [stake, setStake] = useState<number>(Math.min(25, left) >= 10 ? (left >= 25 ? 25 : 10) : 0);
  const [ball, setBall] = useState<'solids' | 'stripes' | null>(null);
  if (myCall) {
    const pickedName = myCall.predictedWinnerId === challenge.challengerId ? challenge.challengerName : challenge.opponentName;
    return (
      <p className="text-[13px] text-white/70">
        You put <b className="text-white">{stakeOf(myCall)} coins</b> on <b className="text-white">{first(pickedName)}</b>
        {myCall.ball ? `, on ${myCall.ball} for the jackpot` : ''}. Calls can't be switched.
      </p>
    );
  }
  const cost = stake + (ball ? BALL_TIP_COST : 0);
  const canAfford = cost <= left;
  const sides = [
    { id: challenge.challengerId, name: challenge.challengerName, ball: balls[0] },
    { id: challenge.opponentId, name: challenge.opponentName, ball: balls[1] },
  ];
  const nextTip = { none: 'solids', solids: 'stripes', stripes: null } as const;
  // Out of coins: one quiet line instead of a row of dead buttons.
  if (left < 10) return <p className="text-center text-xs font-semibold text-white/55">No coins left today. Fresh {DAILY_CHIPS} tomorrow morning.</p>;
  return (
    <div className="grid gap-2" onClick={(event) => event.stopPropagation()}>
      {/* One segmented stake bar and one ball-tip button that cycles none, solids, stripes. */}
      <div className="flex items-center gap-2">
        <div role="radiogroup" aria-label={`Stake, ${left} of ${DAILY_CHIPS} left today`} className="grid min-w-0 flex-1 grid-cols-4 rounded-full bg-bg p-[3px]">
          {STAKES.map((value) => {
            const off = value + (ball ? BALL_TIP_COST : 0) > left;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={stake === value}
                disabled={off}
                onClick={() => setStake(value)}
                className={`press flex h-9 items-center justify-center gap-1 rounded-full text-xs font-extrabold tabular-nums transition-colors ${
                  stake === value ? 'bg-white text-bg' : off ? 'text-white/25' : 'text-white'
                }`}
              >
                {stake === value && <Coin size={13} />}
                {value}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setBall(nextTip[ball ?? 'none'])}
          aria-label={ball ? `Ball tip on ${ball}, +${BALL_TIP_COST} for the jackpot. Tap to change.` : `No ball tip. Tap to tip solids or stripes for the jackpot, +${BALL_TIP_COST}.`}
          className={`press relative grid h-[42px] w-[42px] flex-none place-items-center rounded-full transition-colors ${ball ? 'bg-white' : 'bg-bg'}`}
        >
          {ball ? <Ball n={ball === 'solids' ? 1 : 9} size={20} /> : <span className="h-4 w-4 rounded-full shadow-[inset_0_0_0_2px_rgba(255,255,255,0.35)]" />}
          {ball && (
            <span className="absolute -right-1 -top-1 rounded-full bg-crown px-1.5 text-[10px] font-extrabold leading-4 text-bg">+{BALL_TIP_COST}</span>
          )}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {sides.map((side) => (
          <button
            key={side.id}
            type="button"
            disabled={!canAfford || stake === 0}
            onClick={() => onCall(side.id, stake, ball ?? undefined)}
            className="press flex h-11 min-w-0 items-center justify-center gap-2 overflow-hidden rounded-full bg-white px-3 text-xs font-extrabold uppercase tracking-[0.06em] text-bg disabled:bg-surface-alt disabled:text-white/40"
          >
            <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: ballColor(side.ball).c, boxShadow: side.ball === 8 ? 'inset 0 0 0 1px rgba(255,255,255,.45)' : undefined }} />
            <span className="truncate">{prefix}{first(side.name)}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

/**
 * The board when a match is actually on the table, not just a card in a list.
 *
 * Opened either by tapping in from the board, or automatically for the two
 * players the moment their match goes live. Black, stream-like: the two
 * players in their ball colours, the room's calls, cheers and the chat.
 */
export const LiveMatchScreen: React.FC<{
  challenge: Challenge;
  players: Player[];
  challenger?: Player;
  opponent?: Player;
  isPlayer: boolean;
  myCall?: Prediction;
  forChallenger: number;
  forOpponent: number;
  total: number;
  challengerShare: number;
  challengerVoters: VoterInfo[];
  opponentVoters: VoterInfo[];
  /** Chips still available today. */
  chipsLeft: number;
  /** Stakes riding on this match. */
  pot?: number;
  onPredict: (predictedWinnerId: string, stake: number, ball?: 'solids' | 'stripes') => void;
  onSelectPlayer?: (player: Player) => void;
  onPlayChallenge: () => void;
  onCancelLive: () => void;
  onCheer: (emoji: string) => void;
  onSubscribeCheers: (challengeId: string, onChange: (cheers: Cheer[]) => void) => () => void;
  onSendChatMessage: (challengeId: string, text: string) => Promise<void>;
  onSubscribeChat: (challengeId: string, onChange: (messages: ChatMessage[]) => void) => () => void;
  onClose: () => void;
  /** Opens the fight poster for this match. */
  onPoster?: () => void;
}> = ({
  challenge,
  players,
  challenger,
  opponent,
  isPlayer,
  myCall,
  forChallenger,
  forOpponent,
  challengerVoters,
  opponentVoters,
  chipsLeft,
  pot = 0,
  onPredict,
  onSelectPlayer,
  onPlayChallenge,
  onCancelLive,
  onCheer,
  onSubscribeCheers,
  onSendChatMessage,
  onSubscribeChat,
  onClose,
  onPoster,
}) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [floatingCheers, setFloatingCheers] = useState<{ id: string; emoji: string; x: number }[]>([]);
  const seenCheerIdsRef = useRef(new Set<string>());
  useEffect(() => {
    seenCheerIdsRef.current = new Set();
    return onSubscribeCheers(challenge.id, (cheers) => {
      for (const cheer of cheers) {
        if (seenCheerIdsRef.current.has(cheer.id)) continue;
        seenCheerIdsRef.current.add(cheer.id);
        const floatId = `${cheer.id}-${Math.random()}`;
        setFloatingCheers((prev) => [...prev, { id: floatId, emoji: cheer.emoji, x: 12 + Math.random() * 76 }]);
        window.setTimeout(() => {
          setFloatingCheers((prev) => prev.filter((entry) => entry.id !== floatId));
        }, 600);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challenge.id]);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
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

  const sendChat = () => {
    const text = chatInput.trim();
    if (!text) return;
    setChatInput('');
    void onSendChatMessage(challenge.id, text);
  };

  const now = Date.now();
  const remainingVoteMs = voteWindowRemaining(challenge, now);
  const callsClosed = remainingVoteMs <= 0;
  const byId = new Map(players.map((player) => [player.id, player]));

  const sides = [
    { player: challenger, id: challenge.challengerId, name: challenge.challengerName, win: challenge.stakes.challengerWinDelta, elo: challenger?.elo ?? challenge.stakes.challengerElo },
    { player: opponent, id: challenge.opponentId, name: challenge.opponentName, win: challenge.stakes.opponentWinDelta, elo: opponent?.elo ?? challenge.stakes.opponentElo },
  ];

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Match in progress" className="anim-fade fixed inset-0 z-[55] flex flex-col overflow-hidden bg-bg">
      <div className="mx-auto flex h-full w-full max-w-md flex-col">
        <div className="relative z-20 flex shrink-0 items-center justify-between gap-2 px-4 pb-2 pt-[calc(var(--safe-top)+0.9rem)]">
          <button type="button" onClick={onClose} aria-label="Back" className="press grid h-11 w-11 place-items-center rounded-full bg-surface-alt">
            <ChevronLeft className="h-5 w-5" strokeWidth={2.25} />
          </button>
          <span className="flex h-[26px] items-center gap-1.5 rounded-full bg-live px-2.5 text-[11px] font-extrabold uppercase tracking-[0.1em] tabular-nums text-white">
            <span className="live-dot" />
            {callsClosed ? `Live ${elapsed(challenge.startedAt ?? now, now)}` : `Calls ${formatCountdown(remainingVoteMs)}`}
          </span>
          {isPlayer ? (
            <button type="button" onClick={onPlayChallenge} aria-label="Log the result" className="press grid h-11 w-11 place-items-center rounded-full bg-surface-alt">
              <Flag className="h-5 w-5" strokeWidth={2.25} />
            </button>
          ) : (
            <span className="h-11 w-11" />
          )}
        </div>

        <div id="live-stage" className="no-scrollbar relative flex-1 overflow-y-auto px-4 pb-[calc(var(--safe-bottom)+1.5rem)]">
          <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
            {floatingCheers.map((cheer) => (
              <span key={cheer.id} className="cheer-float absolute bottom-[40%] text-3xl" style={{ left: `${cheer.x}%` }}>
                {cheer.emoji}
              </span>
            ))}
          </div>

          <div className="stagger grid gap-4">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 pt-2 text-center">
              {sides.map((side, index) => (
                <React.Fragment key={side.id}>
                  {index === 1 && <span className="font-display text-[44px] font-extrabold text-white/55">VS</span>}
                  <button
                    type="button"
                    onClick={() => side.player && onSelectPlayer?.(side.player)}
                    className={`${index === 0 ? 'duel-in-left' : 'duel-in-right'} grid min-w-0 justify-items-center gap-2`}
                  >
                    <PlayerAvatar player={side.player ?? ghost(side.id, side.name)} size={68} />
                    <span className="font-display text-[clamp(16px,5.5vw,22px)] font-extrabold uppercase leading-none [overflow-wrap:anywhere]">
                      {shamed(first(side.name), side.player)}
                    </span>
                    <span className="text-xs font-bold tabular-nums text-white/55">{side.elo}</span>
                    <span className="rounded-full bg-surface-alt px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.1em] tabular-nums">
                      Win +{side.win}
                    </span>
                  </button>
                </React.Fragment>
              ))}
            </div>

            {challenge.stakes.crownBounty > 0 && (
              <span className="justify-self-center rounded-full bg-crown px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.1em] text-bg">
                👑 {challenge.stakes.crownBounty} bounty riding
              </span>
            )}
            {pot > 0 && <span className="justify-self-center text-xs font-semibold tabular-nums text-white/70"><Coin size={14} /> {pot} coins in the pot</span>}
            {onPoster && (
              <button type="button" onClick={onPoster} className="press h-9 justify-self-center rounded-full bg-surface-alt px-4 text-[11px] font-extrabold uppercase tracking-[0.08em]">
                🥊 Fight poster
              </button>
            )}

            <div className="grid gap-2">
              <CallSplit
                left={{ player: challenger ?? ghost(challenge.challengerId, challenge.challengerName), count: forChallenger }}
                right={{ player: opponent ?? ghost(challenge.opponentId, challenge.opponentName), count: forOpponent }}
                mineId={myCall?.predictedWinnerId}
              />
              <div className="flex items-center justify-between gap-2">
                <VoterStack voters={challengerVoters} align="start" onSelectPlayer={onSelectPlayer} />
                <VoterStack voters={opponentVoters} align="end" onSelectPlayer={onSelectPlayer} />
              </div>
            </div>

            {isPlayer ? (
              <p className="text-center text-[13px] text-white/70">You're playing this one. The room calls it, not you.</p>
            ) : callsClosed && !myCall ? (
              <p className="text-center text-[13px] text-white/55">Calls are closed. The four minutes are up.</p>
            ) : (
              <CallControls
                challenge={challenge}
                myCall={myCall}
                left={chipsLeft}
                onCall={(id, stake, ball) => onPredict(id, stake, ball)}
                prefix="Call "
                balls={[playerBall(challenger ?? { id: challenge.challengerId }), playerBall(opponent ?? { id: challenge.opponentId })]}
              />
            )}

            <div className="flex flex-wrap justify-center gap-1.5">
              {CHEER_EMOJI.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onCheer(emoji)}
                  aria-label={`Cheer ${emoji}`}
                  className="grid h-12 w-12 place-items-center rounded-full bg-surface-alt text-[22px] transition-transform duration-150 ease-[var(--ease)] hover:bg-[#2C2C2C] active:scale-90"
                >
                  {emoji}
                </button>
              ))}
            </div>

            <div
              ref={chatScrollRef}
              aria-live="polite"
              className="no-scrollbar grid max-h-[200px] min-h-[120px] content-start gap-1.5 overflow-y-auto rounded-xl bg-elev p-3 text-[13px] leading-snug"
            >
              {chatMessages.length === 0 ? (
                <p className="self-center text-center text-xs text-white/55">Nobody's said anything yet.</p>
              ) : (
                chatMessages.map((message) => {
                  const author = byId.get(message.authorId) ?? { id: message.authorId };
                  const n = playerBall(author);
                  return (
                    <p key={message.id} className="card-drop flex items-baseline gap-1.5 [overflow-wrap:anywhere]">
                      <span
                        className="h-[9px] w-[9px] flex-none translate-y-px rounded-full"
                        style={{ background: ballColor(n).c, boxShadow: n === 8 ? 'inset 0 0 0 1px rgba(255,255,255,.45)' : undefined }}
                      />
                      <span>
                        <b className="font-extrabold" style={{ color: ballColor(n).t }}>{first(message.authorName)}</b>{' '}
                        {message.text}
                      </span>
                    </p>
                  );
                })
              )}
            </div>
            <div className="flex gap-2">
              <input
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && sendChat()}
                placeholder="Send a message"
                aria-label="Chat message"
                maxLength={280}
                className="h-11 min-w-0 flex-1 rounded-full bg-surface px-4 text-white outline-none placeholder:text-white/55 focus-visible:shadow-[inset_0_0_0_2px_#fff]"
              />
              <button
                type="button"
                disabled={!chatInput.trim()}
                onClick={sendChat}
                aria-label="Send"
                className="press grid h-11 w-11 flex-none place-items-center rounded-full bg-white text-bg disabled:opacity-40"
              >
                <Send className="h-5 w-5" strokeWidth={2.25} />
              </button>
            </div>

            {isPlayer &&
              (confirmingCancel ? (
                <div className="grid gap-2">
                  <p className="text-center text-[13px] text-white/70">Back this out to agreed, not started?</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setConfirmingCancel(false)} className="press h-12 rounded-full bg-surface-alt text-[13px] font-extrabold uppercase tracking-[0.06em]">
                      Keep playing
                    </button>
                    <button type="button" onClick={onCancelLive} className="press h-12 rounded-full bg-white text-[13px] font-extrabold uppercase tracking-[0.06em] text-bg">
                      Not playing
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid gap-2">
                  <button type="button" onClick={onPlayChallenge} className="press flex h-12 items-center justify-center gap-2 rounded-full bg-white text-[13px] font-extrabold uppercase tracking-[0.06em] text-bg">
                    <Flag className="h-[18px] w-[18px]" strokeWidth={2.25} />
                    Log the result
                  </button>
                  <button type="button" onClick={() => setConfirmingCancel(true)} className="press h-12 rounded-full bg-surface-alt text-[13px] font-extrabold uppercase tracking-[0.06em]">
                    Not playing after all
                  </button>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

const sectionHead = (title: string, aside?: React.ReactNode) => (
  <div className="flex items-center justify-between px-1">
    <h3 className="text-base">{title}</h3>
    {aside && <span className="text-xs font-semibold text-white/55">{aside}</span>}
  </div>
);

export const ArenaView: React.FC<ArenaViewProps> = ({
  players,
  challenges,
  currentPlayer,
  onIssueChallenge,
  onRespond,
  onCancel,
  onPredict,
  onPlayChallenge,
  onStartChallenge,
  onLogMatch,
  onInstantMatch,
  onSelectPlayer,
  chips,
  onOpenLiveMatch,
  daily,
  onPlayDaily,
  onShowHistory,
  weekly,
}) => {
  const now = Date.now();
  /**
   * Starting writes to the server before the card can move to "live", so
   * there is a gap where the start button is still showing. Tracking it
   * locally lets the card go quiet immediately.
   */
  const [startingId, setStartingId] = useState<string | null>(null);
  const [showWeekly, setShowWeekly] = useState(false);

  const live = challenges
    .filter((challenge) => challenge.status === 'live')
    .sort((left, right) => (right.startedAt ?? 0) - (left.startedAt ?? 0));
  const forMe = challenges
    .filter((challenge) => challenge.status === 'pending' && challenge.opponentId === currentPlayer.id)
    .sort((left, right) => right.createdAt - left.createdAt);
  const accepted = challenges
    .filter((challenge) => challenge.status === 'accepted')
    .sort((left, right) => (right.respondedAt ?? right.createdAt) - (left.respondedAt ?? left.createdAt));
  const sent = challenges
    .filter((challenge) => challenge.status === 'pending' && challenge.opponentId !== currentPlayer.id)
    .sort((left, right) => right.createdAt - left.createdAt);
  const settled = challenges.filter((challenge) => challenge.status === 'played').slice(0, 3);

  const chipsLeft = leftToday(challenges, currentPlayer.id, now);

  const handleStart = async (challenge: Challenge) => {
    if (startingId) return;
    setStartingId(challenge.id);
    try {
      await onStartChallenge(challenge);
    } finally {
      setStartingId(null);
    }
  };

  // A live card carries a running clock, so it ticks while one is on.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (live.length === 0) return;
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [live.length]);

  const call = (challenge: Challenge, playerId: string, stake: number, ball?: 'solids' | 'stripes') => {
    void onPredict(challenge, playerId, stake, ball);
  };

  const matchLine = (challenge: Challenge, challenger?: Player, opponent?: Player) => (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      {[
        { player: challenger, id: challenge.challengerId, name: challenge.challengerName, win: challenge.stakes.challengerWinDelta },
        { player: opponent, id: challenge.opponentId, name: challenge.opponentName, win: challenge.stakes.opponentWinDelta },
      ].map((side, index) => (
        <React.Fragment key={side.id}>
          {index === 1 && <span className="font-display text-sm font-extrabold text-white/55">VS</span>}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              if (side.player) onSelectPlayer?.(side.player);
            }}
            className={`flex min-w-0 items-center gap-2 ${index === 1 ? 'flex-row-reverse text-right' : ''}`}
          >
            <PlayerAvatar player={side.player ?? ghost(side.id, side.name)} size={34} />
            <span className="grid min-w-0">
              <span className="truncate text-sm font-bold">{shamed(first(side.name), side.player)}</span>
              <span className="text-[11px] font-semibold tabular-nums text-white/55">Win +{side.win}</span>
            </span>
          </button>
        </React.Fragment>
      ))}
    </div>
  );

  const renderCard = (challenge: Challenge) => {
    const callsClosed = voteWindowRemaining(challenge, now) <= 0;
    const view = deriveChallengeView(challenge, players, currentPlayer);
    const { challenger, opponent, isPlayer, myCall } = view;
    const mine = challenge.challengerId === currentPlayer.id;
    const other = mine ? challenge.opponentName : challenge.challengerName;

    return (
      <div key={challenge.id} className="card-drop grid gap-3 rounded-2xl bg-card p-3.5">
        {matchLine(challenge, challenger, opponent)}
        {challenge.stakes.crownBounty > 0 && (
          <span className="justify-self-start rounded-full bg-crown px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.1em] text-bg">
            👑 {challenge.stakes.crownBounty} bounty riding
          </span>
        )}
        <CallSplit
          left={{ player: challenger ?? ghost(challenge.challengerId, challenge.challengerName), count: view.forChallenger }}
          right={{ player: opponent ?? ghost(challenge.opponentId, challenge.opponentName), count: view.forOpponent }}
          mineId={myCall?.predictedWinnerId}
        />
        {view.total > 0 && (
          <div className="flex items-center justify-between">
            <VoterStack voters={view.challengerVoters} align="start" onSelectPlayer={onSelectPlayer} />
            <VoterStack voters={view.opponentVoters} align="end" onSelectPlayer={onSelectPlayer} />
          </div>
        )}

        {(chips.pools.get(challenge.id) ?? 0) > 0 && (
          <span className="text-xs font-semibold tabular-nums text-white/55"><Coin size={14} /> {chips.pools.get(challenge.id)} coins in the pot</span>
        )}

        {challenge.status === 'pending' && (
          <span className="text-xs font-semibold text-white/55">
            {mine ? `Waiting for ${first(other)}. ${timeLeft(challenge.expiresAt, now)}` : `Waiting on ${first(challenge.opponentName)}. ${timeLeft(challenge.expiresAt, now)}`}
          </span>
        )}

        {!isPlayer && !(callsClosed && !myCall) && (
          <CallControls
            challenge={challenge}
            myCall={myCall}
            left={chipsLeft}
            onCall={(id, stake, ball) => call(challenge, id, stake, ball)}
            balls={[playerBall(challenger ?? { id: challenge.challengerId }), playerBall(opponent ?? { id: challenge.opponentId })]}
          />
        )}

        {challenge.status === 'accepted' && isPlayer && (
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <button
              type="button"
              disabled={startingId === challenge.id}
              onClick={() => void handleStart(challenge)}
              className="press flex h-12 items-center justify-center gap-2 rounded-full bg-live text-[13px] font-extrabold uppercase tracking-[0.06em] text-white disabled:opacity-60"
            >
              <Play className="h-[18px] w-[18px]" strokeWidth={2.25} />
              {startingId === challenge.id ? 'Starting' : 'Start the match'}
            </button>
            <button
              type="button"
              onClick={() => onPlayChallenge(challenge)}
              aria-label="Log the result"
              className="press grid h-12 w-12 place-items-center rounded-full bg-surface-alt"
            >
              <Flag className="h-5 w-5" strokeWidth={2.25} />
            </button>
          </div>
        )}

        {['pending', 'accepted'].includes(challenge.status) && isPlayer && startingId !== challenge.id && (
          <button
            type="button"
            onClick={() => onCancel(challenge)}
            className="press h-11 rounded-full bg-surface-alt text-xs font-extrabold uppercase tracking-[0.06em] text-white/70"
          >
            {challenge.status === 'accepted' ? 'Cancel the match' : 'Withdraw callout'}
          </button>
        )}
      </div>
    );
  };

  return (
    <div id="arena-view" className="stagger grid gap-3 pb-28 pt-1">
      {/* The primary action matches how games actually start: two people at
          the table, now. Logging and calling out for later sit one step down. */}
      <button
        type="button"
        onClick={onInstantMatch}
        className="press flex h-[52px] w-full items-center justify-center gap-2.5 rounded-full bg-live text-sm font-extrabold uppercase tracking-[0.06em] text-white"
      >
        <span className="live-dot h-[9px] w-[9px]" />
        We're on the table
      </button>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onLogMatch} className="press flex h-12 min-w-0 items-center justify-center gap-2 rounded-full bg-surface-alt px-3 text-xs font-extrabold uppercase tracking-[0.06em] hover:bg-[#2C2C2C]">
          <ClipboardCheck className="h-[18px] w-[18px] flex-none" strokeWidth={2.25} />
          Log result
        </button>
        <button type="button" onClick={onIssueChallenge} className="press flex h-12 min-w-0 items-center justify-center gap-2 rounded-full bg-surface-alt px-3 text-xs font-extrabold uppercase tracking-[0.06em] hover:bg-[#2C2C2C]">
          <Swords className="h-[18px] w-[18px] flex-none" strokeWidth={2.25} />
          Call out
        </button>
      </div>

      {daily && (
        <div className={`card-drop grid gap-3 rounded-2xl p-3.5 ${daily.played ? 'bg-card' : 'bg-card shadow-[inset_0_0_0_1.5px_#fff]'}`}>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base">Match of the day</h3>
            {daily.streak > 0 && <span className="text-xs font-bold tabular-nums">🔥 {daily.streak} day{daily.streak === 1 ? '' : 's'}</span>}
          </div>
          {daily.bye ? (
            <p className="text-sm text-white/70">You drew the bye today. Odd numbers, somebody sits out. Your streak is safe.</p>
          ) : daily.opponent ? (
            <>
              <div className="flex items-center gap-3">
                <PlayerAvatar player={currentPlayer} size={44} />
                <span className="font-display text-sm font-extrabold text-white/55">VS</span>
                <PlayerAvatar player={daily.opponent} size={44} />
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <b className="truncate text-sm">You and {first(daily.opponent.name)}</b>
                  <span className="text-xs font-semibold text-white/55">
                    {daily.played
                      ? daily.won ? `Done. You won it, +${DAILY_PLAY_BONUS + DAILY_WIN_BONUS} coins.` : `Done. +${DAILY_PLAY_BONUS} coins for turning up.`
                      : `+${DAILY_PLAY_BONUS} coins each for playing, +${DAILY_WIN_BONUS} more to the winner.`}
                  </span>
                </span>
                {daily.played && <span aria-label="Done" className="grid h-9 w-9 flex-none place-items-center rounded-full bg-felt text-sm font-black">✓</span>}
              </div>
              {!daily.played && (
                <button
                  type="button"
                  onClick={() => daily.opponent && onPlayDaily?.(daily.opponent.id)}
                  className="press flex h-11 items-center justify-center gap-2 rounded-full bg-white text-xs font-extrabold uppercase tracking-[0.06em] text-bg"
                >
                  <span className="live-dot text-live" />
                  Play {first(daily.opponent.name)} now
                </button>
              )}
            </>
          ) : null}
        </div>
      )}

      {/* The jackpot and what is left of today's coins, on one strip. */}
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-card px-4 py-2.5">
        <span className="flex min-w-0 items-center gap-2.5" title="Call the winner and their balls to take it.">
          <Coin size={24} />
          <span className="grid min-w-0">
            <span className="font-display text-[22px] font-extrabold leading-none tabular-nums">{chips.jackpot}</span>
            <span className="text-[11px] font-semibold text-white/55">Jackpot, call the winner and their balls</span>
          </span>
        </span>
        <span className="flex-none text-right">
          <span className="block text-[15px] font-black leading-none tabular-nums">{chipsLeft}</span>
          <span className="text-[11px] font-semibold text-white/55">of {DAILY_CHIPS} left today</span>
        </span>
      </div>

      {weekly && weekly.length > 0 && (
        <button type="button" onClick={() => setShowWeekly(true)} className="press flex items-center justify-between gap-3 rounded-2xl bg-card px-4 py-2.5 text-left">
          <span className="grid min-w-0">
            <span className="text-sm font-extrabold">Weekly challenges</span>
            <span className="truncate text-[11px] font-semibold text-white/55">
              {weekly.filter((task) => task.done).length} of {weekly.length} done, +{CHALLENGE_REWARD} each
            </span>
          </span>
          <span className="flex flex-none items-center gap-1.5">
            {weekly.map((task) => (
              <span key={task.id} className={`h-2.5 w-2.5 rounded-full ${task.done ? 'bg-felt' : 'bg-surface-alt'}`} />
            ))}
          </span>
        </button>
      )}

      {showWeekly && weekly && (
        <Sheet title="This week" onClose={() => setShowWeekly(false)}>
          <div className="grid gap-3 pb-2">
            {weekly.map((task) => (
              <div key={task.id} className="grid gap-2 rounded-2xl bg-card p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-extrabold">{task.title}</span>
                  <span className={`flex flex-none items-center gap-1 rounded-full px-2.5 py-1 text-xs font-black tabular-nums ${task.done ? 'bg-felt text-white' : 'bg-surface-alt'}`}>
                    <Coin size={13} />
                    {task.done ? 'Paid' : `+${CHALLENGE_REWARD}`}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-alt">
                  <div className="grow-x h-full rounded-full bg-felt" style={{ width: `${(task.progress / task.target) * 100}%` }} />
                </div>
                <span className="text-xs font-semibold tabular-nums text-white/55">{task.progress} of {task.target}</span>
              </div>
            ))}
            <div className="grid gap-1.5 rounded-2xl bg-surface p-3.5 text-sm text-white/70">
              <b className="text-white">Every match pays</b>
              <span>+{MATCH_COINS.play} for playing, +{MATCH_COINS.win} more for the win.</span>
              <span>+{MATCH_COINS.upset} extra for beating someone above you.</span>
              <span>+{MATCH_COINS.streak} extra a win from your {STREAK_FROM}rd in a row.</span>
              <span>New challenges every Monday.</span>
            </div>
          </div>
        </Sheet>
      )}

      {forMe.length > 0 && (
        <section className="mt-2 grid gap-2">
          {sectionHead('For you')}
          {forMe.map((challenge) => {
            const challenger = players.find((player) => player.id === challenge.challengerId);
            return (
              <div key={challenge.id} className="card-drop grid gap-3 rounded-2xl bg-card p-3.5">
                <div className="flex items-center gap-3">
                  <PlayerAvatar player={challenger ?? ghost(challenge.challengerId, challenge.challengerName)} size={44} />
                  <h3 className="text-base">{first(challenge.challengerName)} called you out</h3>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-1.5 rounded-xl bg-surface p-3">
                    <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/55">If you win</span>
                    <span className="text-[26px] font-black leading-none tabular-nums">+{challenge.stakes.opponentWinDelta}</span>
                    {challenge.stakes.crownBounty > 0 && <span className="text-xs font-semibold text-white/55">incl. 👑 bounty</span>}
                  </div>
                  <div className="grid gap-1.5 rounded-xl bg-surface p-3">
                    <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/55">If you lose</span>
                    <span className="text-[26px] font-black leading-none tabular-nums">−{challenge.stakes.challengerWinDelta}</span>
                  </div>
                </div>
                <span className="text-xs font-semibold text-white/55">{timeLeft(challenge.expiresAt, now)} to answer. Ducking it counts.</span>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <button type="button" onClick={() => onRespond(challenge, 'accepted')} className="press h-12 rounded-full bg-white text-[13px] font-extrabold uppercase tracking-[0.06em] text-bg">
                    Accept
                  </button>
                  <button type="button" onClick={() => onRespond(challenge, 'declined')} className="press h-12 rounded-full bg-surface-alt px-5 text-[13px] font-extrabold uppercase tracking-[0.06em]">
                    Duck it
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      <section className="mt-2 grid gap-2">
        {sectionHead('On the table now')}
        {live.length > 0 ? (
          live.map((challenge) => {
            const { challenger, opponent, forChallenger, forOpponent, myCall } = deriveChallengeView(challenge, players, currentPlayer);
            const remaining = voteWindowRemaining(challenge, now);
            return (
              <div
                key={challenge.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpenLiveMatch(challenge.id)}
                onKeyDown={(event) => (event.key === 'Enter' || event.key === ' ') && onOpenLiveMatch(challenge.id)}
                aria-label={`Watch ${challenge.challengerName} against ${challenge.opponentName}`}
                className="card-drop group relative grid cursor-pointer gap-3.5 overflow-hidden rounded-[20px] bg-live p-[18px] pt-[104px] text-white"
              >
                <Ball n={playerBall(challenger ?? { id: challenge.challengerId })} size={128} className="absolute -left-[34px] -top-10 transition-transform duration-500 ease-[var(--ease)] group-hover:rotate-12" />
                <Ball n={playerBall(opponent ?? { id: challenge.opponentId })} size={128} className="absolute -right-[34px] -top-10 transition-transform duration-500 ease-[var(--ease)] group-hover:-rotate-12" />
                <div className="relative grid grid-cols-[1fr_auto_1fr] items-end gap-2.5">
                  <span className="min-w-0 font-display text-2xl font-extrabold uppercase leading-[1.05] tracking-[-0.02em] [overflow-wrap:anywhere]">{first(challenge.challengerName)}</span>
                  <span className="font-display text-base font-extrabold leading-[1.4]">VS</span>
                  <span className="min-w-0 text-right font-display text-2xl font-extrabold uppercase leading-[1.05] tracking-[-0.02em] [overflow-wrap:anywhere]">{first(challenge.opponentName)}</span>
                </div>
                <div className="relative">
                  <CallSplit
                    left={{ player: challenger ?? ghost(challenge.challengerId, challenge.challengerName), count: forChallenger }}
                    right={{ player: opponent ?? ghost(challenge.opponentId, challenge.opponentName), count: forOpponent }}
                    mineId={myCall?.predictedWinnerId}
                    onRed
                  />
                </div>
                <div className="relative flex items-center justify-between gap-2">
                  <span className="flex h-11 items-center gap-2 rounded-full bg-white px-4 text-xs font-extrabold uppercase tracking-[0.06em] text-bg">
                    <Tv className="h-[18px] w-[18px]" strokeWidth={2.25} />
                    Watch
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="flex h-[26px] items-center gap-1.5 rounded-full bg-white px-2.5 text-[11px] font-extrabold uppercase tracking-[0.1em] text-bg">
                      <span className="live-dot" />
                      Live
                    </span>
                    <span className="flex h-[26px] items-center rounded-full bg-bg px-2.5 text-[11px] font-extrabold uppercase tracking-[0.1em] tabular-nums text-white">
                      {remaining > 0 ? `Calls ${formatCountdown(remaining)}` : elapsed(challenge.startedAt ?? now, now)}
                    </span>
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="grid justify-items-center gap-2.5 rounded-2xl bg-card px-4 py-7 text-center">
            <Ball n={3} size={64} className="mb-1" />
            <h3 className="text-lg">Table's free</h3>
            <p className="text-sm text-white/70">Nobody is playing right now. Somebody should be.</p>
            <button type="button" onClick={onIssueChallenge} className="press h-11 rounded-full bg-white px-4 text-xs font-extrabold uppercase tracking-[0.06em] text-bg">
              Call someone out
            </button>
          </div>
        )}
      </section>

      {accepted.length + sent.length > 0 && (
        <section className="mt-2 grid gap-2">
          {sectionHead('Upcoming', `${accepted.length} agreed, ${sent.length} waiting`)}
          {accepted.map(renderCard)}
          {sent.map(renderCard)}
        </section>
      )}

      {settled.length > 0 && (
        <section className="mt-2 grid gap-2">
          {sectionHead('Settled', onShowHistory && (
            <button type="button" onClick={onShowHistory} className="press font-extrabold text-white">
              Show all
            </button>
          ))}
          <div className="grid gap-0.5">
            {settled.map((challenge) => {
              const winnerIsChallenger = challenge.resolvedWinnerId === challenge.challengerId;
              const right = challenge.predictions.filter((prediction) => prediction.predictedWinnerId === challenge.resolvedWinnerId).length;
              return (
                <div key={challenge.id} className="grid gap-0.5 rounded-xl bg-card px-3.5 py-3">
                  <span className="text-sm font-bold">
                    {first(winnerIsChallenger ? challenge.challengerName : challenge.opponentName)}{' '}
                    <span className="font-normal text-white/55">beat</span>{' '}
                    {first(winnerIsChallenger ? challenge.opponentName : challenge.challengerName)}
                  </span>
                  <span className="text-xs font-semibold text-white/55">
                    {challenge.predictions.length === 0 ? 'Nobody called it.' : `${right} of ${challenge.predictions.length} called it right.`}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};

/** The coin ladder: who has won the most calling matches. Lives on the Ranks tab. */
export const RichestList: React.FC<{
  players: Player[];
  chips: ChipsState;
  currentPlayer: Player;
  onSelectPlayer?: (player: Player) => void;
}> = ({ players, chips, currentPlayer, onSelectPlayer }) => {
  // Everyone who has bet, richest first.
  const richest = players
    .map((player) => ({ player, record: chips.records.get(player.id) }))
    .filter((entry): entry is { player: Player; record: NonNullable<typeof entry.record> } => !!entry.record && entry.record.bets + entry.record.jackpots > 0)
    .sort((left, right) => right.record.chips - left.record.chips || right.record.wins - left.record.wins)
    ;

  return (
      <section className="mt-2 grid gap-2">
                {richest.length === 0 ? (
          <p className="rounded-2xl bg-card px-4 py-5 text-center text-sm text-white/70">
            Nobody has won a coin yet. Everyone gets {DAILY_CHIPS} a day to put on matches. Back the underdog when nobody else does and the
            whole pot is yours. {NERVE_MIN_CALLS} bets earns you a shot at 🔮 The Oracle.
          </p>
        ) : (
          <div className="stagger-rows grid gap-0.5">
            {richest.map((entry, index) => (
              <button
                key={entry.player.id}
                type="button"
                onClick={() => onSelectPlayer?.(entry.player)}
                style={{ ['--j' as string]: index }}
                className={`press grid grid-cols-[22px_auto_1fr_auto] items-center gap-3 rounded-xl bg-card px-3 py-2.5 text-left hover:bg-[#161616] ${
                  entry.player.id === currentPlayer.id ? 'shadow-[inset_0_0_0_1.5px_rgba(255,255,255,.26)]' : ''
                }`}
              >
                <span className="text-center text-[13px] font-black tabular-nums text-white/55">{index + 1}</span>
                <PlayerAvatar player={entry.player} size={28} />
                <span className="grid min-w-0 gap-0.5">
                  <span className="truncate text-sm font-bold">{shamed(entry.player.name, entry.player)}</span>
                  <span className="text-xs font-semibold text-white/55">
                    {entry.record.wins} of {entry.record.bets} bets won{entry.record.jackpots ? `, ${entry.record.jackpots} jackpot${entry.record.jackpots === 1 ? '' : 's'}` : ''}
                  </span>
                </span>
                <span className="flex items-center gap-1.5 text-[17px] font-black tabular-nums"><Coin size={16} />{entry.record.chips}</span>
              </button>
            ))}
          </div>
        )}
      </section>
  );
};
