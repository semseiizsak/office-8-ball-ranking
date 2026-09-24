import React, { useEffect, useRef, useState } from 'react';
import { Check, ClipboardCheck, Clock, Crown, Lock, PlayCircle, Send, Swords, Target, Trophy, X, Zap } from 'lucide-react';
import { Challenge, ChatMessage, Cheer, Player, Prediction } from '../types';
import { hasLockOnDay, NerveRecord, NERVE_BASE, NERVE_MIN_CALLS } from '../utils/league';

/** Quick, disposable calls-outs on a live match — nothing to say, just noise. */
const CHEER_EMOJI = ['🔥', '💪', '😱', '👏', '😂', '💀'];

/** A stable, Twitch-style username color per person, picked off their id
 * rather than stored, so it's free and never collides with a re-render. */
const CHAT_NAME_COLORS = ['#4edea3', '#ffb95f', '#60a5fa', '#f472b6', '#c4b5fd', '#fbbf24', '#f87171', '#5eead4'];
const chatNameColor = (id: string): string =>
  CHAT_NAME_COLORS[[...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % CHAT_NAME_COLORS.length];

interface ArenaViewProps {
  players: Player[];
  challenges: Challenge[];
  currentPlayer: Player;
  onIssueChallenge: () => void;
  onRespond: (challenge: Challenge, status: 'accepted' | 'declined') => Promise<void>;
  onCancel: (challenge: Challenge) => Promise<void>;
  onPredict: (challenge: Challenge, predictedWinnerId: string, isLock: boolean) => Promise<void>;
  onPlayChallenge: (challenge: Challenge) => void;
  /** Calls the match on: either player, no agreement step. */
  onStartChallenge: (challenge: Challenge) => Promise<void>;
  /** Opens the logger for a game that was never challenged. */
  onLogMatch: () => void;
  onSelectPlayer?: (player: Player) => void;
  /** Calling records, rebuilt from every settled challenge. */
  nerve: Map<string, NerveRecord>;
  /** Opens the full-screen live view — also driven from outside when a
   * match involving the current player goes live, not just from a tap. */
  onOpenLiveMatch: (challengeId: string) => void;
}

interface VoterInfo {
  prediction: Prediction;
  player?: Player;
  name: string;
  isCurrentUser: boolean;
}

const VoterAvatar: React.FC<{
  player?: Player;
  name: string;
  isCurrentUser: boolean;
  side: 'challenger' | 'opponent';
  onSelect?: () => void;
}> = ({ player, name, isCurrentUser, side, onSelect }) => {
  const accentBorder = side === 'challenger' ? 'hover:border-[#10b981]' : 'hover:border-[#ffb95f]';
  const textColor = side === 'challenger' ? 'text-[#4edea3]' : 'text-[#ffb95f]';
  const currentRing = isCurrentUser
    ? side === 'challenger'
      ? 'ring-2 ring-[#10b981] shadow-[0_0_8px_rgba(16,185,129,0.5)]'
      : 'ring-2 ring-[#ffb95f] shadow-[0_0_8px_rgba(255,185,95,0.5)]'
    : '';

  return (
    <div
      className="group relative shrink-0 cursor-pointer"
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.();
      }}
      title={`${name}${isCurrentUser ? ' (You)' : ''}`}
    >
      {player?.avatarUrl ? (
        <img
          src={player.avatarUrl}
          alt={name}
          referrerPolicy="no-referrer"
          className={`h-6 w-6 rounded-full border-2 border-[#161b22] object-cover transition-all duration-150 group-hover:scale-125 group-hover:z-30 ${accentBorder} ${currentRing}`}
        />
      ) : (
        <div
          className={`flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#161b22] bg-[#262a31] font-['Chivo'] text-[10px] font-bold ${textColor} transition-all duration-150 group-hover:scale-125 group-hover:z-30 ${accentBorder} ${currentRing}`}
        >
          {name.charAt(0).toUpperCase()}
        </div>
      )}

      {/* Floating tooltip */}
      <div
        className={`pointer-events-none absolute bottom-full mb-1.5 hidden items-center rounded-md border border-[#30363d] bg-[#10141a] px-2 py-0.5 font-['Space_Grotesk'] text-[10px] font-medium text-white shadow-xl whitespace-nowrap z-40 group-hover:flex ${
          side === 'challenger' ? 'left-0' : 'right-0'
        }`}
      >
        <span className="truncate max-w-[120px]">{name}</span>
        {isCurrentUser && (
          <span
            className="ml-1 font-bold"
            style={{ color: side === 'challenger' ? '#4edea3' : '#ffb95f' }}
          >
            (You)
          </span>
        )}
      </div>
    </div>
  );
};

const VoterAvatarStack: React.FC<{
  voters: VoterInfo[];
  side: 'challenger' | 'opponent';
  onSelectPlayer?: (player: Player) => void;
}> = ({ voters, side, onSelectPlayer }) => {
  const [expanded, setExpanded] = useState(false);

  if (voters.length === 0) {
    return null;
  }

  // Put current user first so their avatar is always prominently visible
  const sorted = [...voters].sort((a, b) => {
    if (a.isCurrentUser) return -1;
    if (b.isCurrentUser) return 1;
    return 0;
  });

  const shouldCollapse = sorted.length > 5 && !expanded;
  const visible = shouldCollapse ? sorted.slice(0, 4) : sorted;
  const hiddenCount = sorted.length - 4;

  return (
    <div
      className={
        expanded
          ? `flex flex-wrap items-center gap-1 ${side === 'challenger' ? 'justify-start' : 'justify-end'}`
          : `flex items-center -space-x-1.5 ${side === 'challenger' ? 'justify-start' : 'justify-end'}`
      }
    >
      {visible.map((voter) => (
        <VoterAvatar
          key={voter.prediction.id}
          player={voter.player}
          name={voter.name}
          isCurrentUser={voter.isCurrentUser}
          side={side}
          onSelect={() => voter.player && onSelectPlayer?.(voter.player)}
        />
      ))}

      {shouldCollapse && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(true);
          }}
          title={`${hiddenCount} more: ${sorted.slice(4).map((v) => v.name).join(', ')}`}
          className="group relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-[#161b22] bg-[#262a31] font-['JetBrains_Mono'] text-[9px] font-bold text-[#86948a] transition-all hover:bg-[#30363d] hover:text-white cursor-pointer z-10"
        >
          +{hiddenCount}
          <div
            className={`pointer-events-none absolute bottom-full mb-1.5 hidden items-center rounded-md border border-[#30363d] bg-[#10141a] px-2 py-0.5 font-['Space_Grotesk'] text-[10px] font-medium text-white shadow-xl whitespace-nowrap z-40 group-hover:flex ${
              side === 'challenger' ? 'left-0' : 'right-0'
            }`}
          >
            +{hiddenCount} more
          </div>
        </button>
      )}

      {expanded && sorted.length > 5 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(false);
          }}
          title="Show less"
          className="flex h-6 px-1.5 shrink-0 items-center justify-center rounded-full border border-[#30363d] bg-[#1c2026] font-['Space_Grotesk'] text-[9px] font-bold text-[#86948a] hover:text-white transition-colors cursor-pointer"
        >
          less
        </button>
      )}
    </div>
  );
};

const Avatar: React.FC<{ player?: Player; name: string; size?: string; ring?: string }> = ({
  player,
  name,
  size = 'h-10 w-10',
  ring = 'border-[#30363d]',
}) =>
  player?.avatarUrl ? (
    <img
      src={player.avatarUrl}
      alt={name}
      referrerPolicy="no-referrer"
      className={`${size} shrink-0 rounded-full border object-cover ${ring}`}
    />
  ) : (
    <div
      className={`${size} flex shrink-0 items-center justify-center rounded-full border bg-[#262a31] font-['Chivo'] text-sm font-bold text-[#4edea3] ${ring}`}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );

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

/**
 * How long the room keeps calling a match once it starts.
 * Calls used to stay open for the entire game, which meant a spectator could
 * watch the game finish and still get a call in — the timer gives the room a
 * real window to call it live without turning into a loophole.
 */
const VOTE_WINDOW_MS = 4 * 60_000;

/** Milliseconds left to call a live match, or Infinity if it isn't live yet. */
const voteWindowRemaining = (challenge: Challenge, now: number): number => {
  if (challenge.status !== 'live' || !challenge.startedAt) return Infinity;
  return Math.max(0, challenge.startedAt + VOTE_WINDOW_MS - now);
};

const formatCountdown = (ms: number): string => {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

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

  const challengerVoters: VoterInfo[] = challenge.predictions
    .filter((prediction) => prediction.predictedWinnerId === challenge.challengerId)
    .map((prediction) => {
      const player = byId.get(prediction.predictorId);
      return {
        prediction,
        player,
        name: player?.name || prediction.predictorName,
        isCurrentUser: prediction.predictorId === currentPlayer.id,
      };
    });

  const opponentVoters: VoterInfo[] = challenge.predictions
    .filter((prediction) => prediction.predictedWinnerId === challenge.opponentId)
    .map((prediction) => {
      const player = byId.get(prediction.predictorId);
      return {
        prediction,
        player,
        name: player?.name || prediction.predictorName,
        isCurrentUser: prediction.predictorId === currentPlayer.id,
      };
    });

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

/**
 * The board when a match is actually on the table, not just a card in a list.
 *
 * Opened either by tapping in from the board, or automatically for the two
 * players the moment their match goes live — they are about to walk to the
 * table, not stare at this screen, but the room should feel like the game is
 * happening here the instant it starts. The room keeps calling it: closing
 * calls at the start of a match locked spectators out for however long the
 * game ran, which is most of the point of calling it live rather than after
 * the fact.
 */
/** One side of the matchup, styled like the log screen's player cards so the
 * live view reads as the same app rather than a lesser cousin of it. */
const LiveMatchPlayerCard: React.FC<{
  player?: Player;
  fallbackName: string;
  rank: number;
  tone: 'challenger' | 'opponent';
  onSelect?: () => void;
}> = ({ player, fallbackName, rank, tone, onSelect }) => {
  const accent = tone === 'challenger' ? '#10b981' : '#ffb95f';
  const accentText = tone === 'challenger' ? 'text-[#4edea3]' : 'text-[#ffb95f]';
  const badgeText = tone === 'challenger' ? 'text-[#002113]' : 'text-[#2a1700]';
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-3.5 rounded-2xl border border-[#30363d] bg-[#161b22] p-4 text-left shadow-md transition-all active:scale-[0.99]"
    >
      <div className="relative shrink-0">
        <Avatar player={player} name={fallbackName} size="h-14 w-14" ring={`border-2`} />
        <span
          className={`absolute -bottom-1 -left-1 flex h-5 w-5 items-center justify-center rounded-full border border-[#10141a] font-['JetBrains_Mono'] text-[10px] font-black ${badgeText}`}
          style={{ backgroundColor: accent }}
        >
          {rank || '–'}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-['Chivo'] text-lg font-bold tracking-tight text-white">{fallbackName}</h3>
        <div className="mt-1 flex items-center gap-2">
          <span className={`font-['JetBrains_Mono'] text-sm font-black ${accentText}`}>
            {player?.elo ?? '—'} <span className="text-[10px] font-medium text-[#86948a]">ELO</span>
          </span>
          <div className="flex items-center gap-1">
            {player?.recentForm.slice(0, 5).map((form, index) => (
              <span
                key={index}
                className={`h-1.5 w-1.5 rounded-full ${form === 'W' ? 'bg-[#10b981]' : 'bg-[#ef4444]'}`}
              />
            ))}
          </div>
        </div>
      </div>
    </button>
  );
};

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
  lockUsedToday: boolean;
  onPredict: (predictedWinnerId: string, isLock: boolean) => void;
  onSelectPlayer?: (player: Player) => void;
  onPlayChallenge: () => void;
  onCancelLive: () => void;
  onCheer: (emoji: string) => void;
  onSubscribeCheers: (challengeId: string, onChange: (cheers: Cheer[]) => void) => () => void;
  onSendChatMessage: (challengeId: string, text: string) => Promise<void>;
  onSubscribeChat: (challengeId: string, onChange: (messages: ChatMessage[]) => void) => () => void;
  onClose: () => void;
}> = ({
  challenge,
  players,
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
  lockUsedToday,
  onPredict,
  onSelectPlayer,
  onPlayChallenge,
  onCancelLive,
  onCheer,
  onSubscribeCheers,
  onSendChatMessage,
  onSubscribeChat,
  onClose,
}) => {
  const [lockArmed, setLockArmed] = useState(false);
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
        setFloatingCheers((prev) => [...prev, { id: floatId, emoji: cheer.emoji, x: 10 + Math.random() * 80 }]);
        window.setTimeout(() => {
          setFloatingCheers((prev) => prev.filter((entry) => entry.id !== floatId));
        }, 2200);
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
  const urgent = remainingVoteMs <= 30_000;
  const sortedPlayers = [...players].sort((a, b) => b.elo - a.elo);
  const rankChallenger = sortedPlayers.findIndex((p) => p.id === challenger?.id) + 1;
  const rankOpponent = sortedPlayers.findIndex((p) => p.id === opponent?.id) + 1;

  return (
    <div role="dialog" aria-label="Match in progress" className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-[#05070a]">
      <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
        {floatingCheers.map((cheer) => (
          <span
            key={cheer.id}
            className="cheer-float absolute bottom-24 text-3xl"
            style={{ left: `${cheer.x}%` }}
          >
            {cheer.emoji}
          </span>
        ))}
      </div>

      <div className="flex shrink-0 items-center justify-between px-4 pb-3 pt-[calc(var(--safe-top)+0.75rem)]">
        <span className="flex items-center gap-1.5 font-['JetBrains_Mono'] text-[11px] font-extrabold uppercase tracking-[0.25em] text-[#ef4444]">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#ef4444] opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#ef4444]" />
          </span>
          On the table · {elapsed(challenge.startedAt ?? now, now)}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1.5 text-[#86948a] transition-colors hover:bg-[#1c2026] hover:text-white"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-[calc(var(--safe-bottom)+1.5rem)]">
        {challenge.stakes.crownBounty > 0 && (
          <div className="mb-3 flex justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#f59e0b]/40 bg-[#f59e0b]/15 px-3 py-1 font-['JetBrains_Mono'] text-xs font-bold text-[#f59e0b]">
              <Crown className="h-3.5 w-3.5" />
              {challenge.stakes.crownBounty} crown bounty
            </span>
          </div>
        )}

        <div className="relative space-y-2">
          <LiveMatchPlayerCard
            player={challenger}
            fallbackName={challenge.challengerName}
            rank={rankChallenger}
            tone="challenger"
            onSelect={() => challenger && onSelectPlayer?.(challenger)}
          />
          <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#10b981] bg-[#0a1210] font-['Chivo'] text-xs font-black text-[#4edea3] shadow-[0_0_14px_rgba(16,185,129,0.35)]">
              VS
            </div>
          </div>
          <LiveMatchPlayerCard
            player={opponent}
            fallbackName={challenge.opponentName}
            rank={rankOpponent}
            tone="opponent"
            onSelect={() => opponent && onSelectPlayer?.(opponent)}
          />
        </div>

        {isPlayer ? (
          <p className="mt-4 rounded-xl border border-[#30363d] bg-[#161b22] px-4 py-3 text-center font-['Space_Grotesk'] text-xs text-[#86948a]">
            You're playing this one. The room is calling it — log the result once the table's clear.
          </p>
        ) : callsClosed ? (
          <div className="mt-8 rounded-xl border border-[#ef4444]/30 bg-[#ef4444]/10 px-4 py-6 text-center">
            <p className="font-['Chivo'] text-sm font-bold text-[#ffb4ab]">Calls are closed</p>
            <p className="mt-1 font-['Space_Grotesk'] text-xs text-[#86948a]">The four-minute window is up.</p>
          </div>
        ) : (
          <div className="mt-6">
            <div className="flex items-center justify-between px-1">
              <span className="font-['JetBrains_Mono'] text-[11px] font-extrabold uppercase tracking-widest text-[#86948a]">
                {myCall ? 'Call locked in' : 'Call it — one tap'}
              </span>
              {!myCall && (
                <span
                  className={`font-['JetBrains_Mono'] text-sm font-black tabular-nums ${
                    urgent ? 'text-[#ef4444]' : 'text-[#f59e0b]'
                  }`}
                >
                  {formatCountdown(remainingVoteMs)}
                </span>
              )}
            </div>

            <div className="mt-2 space-y-2">
              {[
                { id: challenge.challengerId, name: challenge.challengerName, tone: 'challenger' as const },
                { id: challenge.opponentId, name: challenge.opponentName, tone: 'opponent' as const },
              ].map((side) => {
                const picked = myCall?.predictedWinnerId === side.id;
                const isChallengerSide = side.tone === 'challenger';
                return (
                  <button
                    key={side.id}
                    type="button"
                    disabled={Boolean(myCall)}
                    onClick={() => {
                      if (myCall) return;
                      onPredict(side.id, lockArmed && !lockUsedToday);
                      setLockArmed(false);
                    }}
                    className={`flex min-h-[64px] w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition-all disabled:pointer-events-none ${
                      picked
                        ? isChallengerSide
                          ? 'border-transparent bg-gradient-to-r from-[#10b981] to-[#4edea3] text-[#002113] shadow-[0_4px_20px_rgba(16,185,129,0.35)]'
                          : 'border-[#ffb95f] bg-[#ffb95f]/15 text-[#ffb95f]'
                        : myCall
                        ? 'border-[#30363d]/40 bg-[#161b22] text-[#86948a]/30 opacity-40'
                        : 'border-[#30363d] bg-[#161b22] text-white hover:border-[#4edea3] active:scale-[0.98]'
                    }`}
                  >
                    <span className="flex items-center gap-2 font-['Chivo'] text-lg font-black uppercase tracking-tight">
                      {picked && '✓ '}
                      {side.name.split(' ')[0]}
                    </span>
                    {picked && myCall?.isLock && (
                      <span className="flex items-center gap-0.5 font-['JetBrains_Mono'] text-xs font-bold">
                        <Zap className="h-3.5 w-3.5 fill-current" />×2
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex items-center justify-center">
              {myCall ? (
                <span className="flex items-center gap-1 font-['Space_Grotesk'] text-xs text-[#86948a]">
                  <Lock className="h-3.5 w-3.5 text-[#4edea3]" />
                  {myCall.isLock && (
                    <span className="flex items-center gap-0.5 font-['JetBrains_Mono'] font-bold text-[#f59e0b]">
                      <Zap className="h-3.5 w-3.5 fill-[#f59e0b]" />×2
                    </span>
                  )}
                  Call locked in — can't be switched
                </span>
              ) : (
                <button
                  type="button"
                  disabled={lockUsedToday}
                  onClick={() => setLockArmed((value) => !value)}
                  title={
                    lockUsedToday
                      ? 'You have already staked your lock today'
                      : 'Stake your one lock of the day: settles for double, win or lose'
                  }
                  className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 font-['JetBrains_Mono'] text-xs font-bold transition-all ${
                    lockUsedToday
                      ? 'cursor-not-allowed border-[#30363d]/50 text-[#86948a]/40'
                      : lockArmed
                      ? 'border-[#f59e0b] bg-[#f59e0b]/15 text-[#f59e0b]'
                      : 'border-[#30363d] text-[#86948a] hover:border-[#f59e0b]/60 hover:text-[#f59e0b]'
                  }`}
                >
                  <Zap className={`h-3.5 w-3.5 ${lockArmed ? 'fill-[#f59e0b]' : ''}`} />
                  {lockUsedToday ? 'Lock used' : lockArmed ? 'LOCK ARMED ×2' : 'Lock of the day'}
                </button>
              )}
            </div>
          </div>
        )}

        {total > 0 && (
          <div className="mt-8">
            <div className="flex items-center justify-between font-['JetBrains_Mono'] text-xs text-[#86948a]">
              <span>{forChallenger}</span>
              <span className="uppercase tracking-wider">
                {total} {total === 1 ? 'call' : 'calls'}
              </span>
              <span>{forOpponent}</span>
            </div>
            <div className="mt-1.5 flex h-2 w-full overflow-hidden rounded-full bg-[#1c2026]">
              <div className="bg-[#10b981] transition-all duration-300" style={{ width: `${challengerShare}%` }} />
              <div className="bg-[#ffb95f] transition-all duration-300" style={{ width: `${100 - challengerShare}%` }} />
            </div>
            <div className="mt-3 flex min-h-[28px] items-center justify-between gap-2">
              <VoterAvatarStack voters={challengerVoters} side="challenger" onSelectPlayer={onSelectPlayer} />
              <VoterAvatarStack voters={opponentVoters} side="opponent" onSelectPlayer={onSelectPlayer} />
            </div>
          </div>
        )}

        <div className="mt-6">
          <span className="px-1 font-['JetBrains_Mono'] text-[11px] font-extrabold uppercase tracking-widest text-[#86948a]">
            Send a cheer
          </span>
          <div className="mt-2 flex justify-between gap-1.5">
            {CHEER_EMOJI.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onCheer(emoji)}
                className="flex h-11 flex-1 items-center justify-center rounded-xl border border-[#30363d] bg-[#161b22] text-xl transition-all hover:border-[#4edea3]/50 active:scale-90"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <span className="px-1 font-['JetBrains_Mono'] text-[11px] font-extrabold uppercase tracking-widest text-[#86948a]">
            Live chat
          </span>
          <div
            ref={chatScrollRef}
            className="mt-2 h-44 space-y-1.5 overflow-y-auto rounded-xl border border-[#30363d] bg-[#0d1117] p-2.5"
          >
            {chatMessages.length === 0 ? (
              <p className="flex h-full items-center justify-center text-center font-['Space_Grotesk'] text-[11px] text-[#86948a]">
                Nobody's said anything yet.
              </p>
            ) : (
              chatMessages.map((message) => (
                <p key={message.id} className="break-words font-['Space_Grotesk'] text-xs leading-relaxed">
                  <span className="font-bold" style={{ color: chatNameColor(message.authorId) }}>
                    {message.authorName.split(' ')[0]}
                  </span>
                  <span className="text-[#86948a]">: </span>
                  <span className="text-[#dfe2eb]">{message.text}</span>
                </p>
              ))
            )}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5">
            <input
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && sendChat()}
              placeholder="Say something…"
              maxLength={280}
              className="min-w-0 flex-1 rounded-full border border-[#30363d] bg-[#161b22] px-3.5 py-2 text-xs text-white outline-none focus:border-[#10b981]"
            />
            <button
              type="button"
              disabled={!chatInput.trim()}
              onClick={sendChat}
              className="shrink-0 rounded-full bg-[#10b981] p-2 text-[#002113] disabled:opacity-40"
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {isPlayer && (
        <div className="shrink-0 border-t border-[#30363d] bg-[#0d1117] px-5 pb-[calc(var(--safe-bottom)+1rem)] pt-3">
          {confirmingCancel ? (
            <div className="flex items-center gap-2">
              <p className="flex-1 font-['Space_Grotesk'] text-xs text-[#86948a]">
                Back this out to agreed-but-not-started?
              </p>
              <button
                type="button"
                onClick={onCancelLive}
                className="shrink-0 rounded-lg bg-[#ef4444] px-3 py-2 font-['Chivo'] text-xs font-bold text-white"
              >
                Cancel match
              </button>
              <button
                type="button"
                onClick={() => setConfirmingCancel(false)}
                className="shrink-0 rounded-lg border border-[#30363d] px-3 py-2 font-['Chivo'] text-xs font-bold text-[#86948a]"
              >
                Never mind
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-[auto_1fr] gap-2">
              <button
                type="button"
                onClick={() => setConfirmingCancel(true)}
                className="rounded-xl border border-[#30363d] px-4 py-3 font-['Chivo'] text-sm font-bold text-[#86948a] transition-all hover:border-[#ef4444]/60 hover:text-[#ffb4ab] active:scale-[0.98]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onPlayChallenge}
                className="flex items-center justify-center gap-2 rounded-xl bg-[#10b981] px-4 py-3 font-['Chivo'] text-sm font-bold text-[#002113] transition-all active:scale-[0.98]"
              >
                <Trophy className="h-4 w-4" />
                Log the result
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

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
  onSelectPlayer,
  nerve,
  onOpenLiveMatch,
}) => {
  const now = Date.now();
  const [armedLockId, setArmedLockId] = useState<string | null>(null);
  /**
   * The call that just landed, so it can pop.
   * Held in state rather than toggled on the node: casting a call re-renders the
   * button, which wiped a class added imperatively before it ever animated.
   */
  const [poppedCall, setPoppedCall] = useState<string | null>(null);
  /**
   * Starting writes to the server before the card can move to "live", so
   * there is a gap where the start button is still showing. Tracking it
   * locally lets the card go quiet immediately instead of leaving Start and
   * Cancel both tappable while the layout is about to shift out from under
   * a second, impatient tap.
   */
  const [startingId, setStartingId] = useState<string | null>(null);
  const byId = new Map<string, Player>(players.map((player) => [player.id, player]));

  // Everything still live belongs on the board, answered or not. Showing only
  // accepted challenges meant a callout was invisible to everybody except the
  // person being called out, so the challenger saw nothing after issuing it and
  // the room could not start calling a winner until it had been accepted.
  // Three states, each meaning something different to the room: being played,
  // agreed but not started, and waiting on an answer.
  const live = challenges
    .filter((challenge) => challenge.status === 'live')
    .sort((left, right) => (right.startedAt ?? 0) - (left.startedAt ?? 0));
  const accepted = challenges
    .filter((challenge) => challenge.status === 'accepted')
    .sort((left, right) => (right.respondedAt ?? right.createdAt) - (left.respondedAt ?? left.createdAt));
  const sent = challenges
    .filter((challenge) => challenge.status === 'pending')
    .sort((left, right) => right.createdAt - left.createdAt);
  const settled = challenges.filter((challenge) => challenge.status === 'played').slice(0, 5);

  // Prediction standings: the second ladder, open to everyone who never wins the first.
  // Ranked on nerve, not on accuracy. Accuracy rewarded calling only the
  // matches nobody could get wrong; nerve pays for the calls that were worth
  // making, so the safe route no longer wins.
  const oracles = players
    .map((player) => ({ player, record: nerve.get(player.id) }))
    .filter((entry): entry is { player: Player; record: NerveRecord } =>
      entry.record !== undefined && entry.record.total > 0
    )
    .map((entry) => ({
      ...entry,
      accuracy: Math.round((entry.record.correct / entry.record.total) * 100),
    }))
    .sort(
      (left, right) =>
        right.record.nerve - left.record.nerve || right.record.total - left.record.total
    )
    .slice(0, 5);

  const lockUsedToday = hasLockOnDay(challenges, currentPlayer.id, now);

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

  const renderChallenge = (challenge: Challenge) => {
    const lockArmed = armedLockId === challenge.id;
    const isLive = challenge.status === 'live';
    const remainingVoteMs = voteWindowRemaining(challenge, now);
    const callsClosed = remainingVoteMs <= 0;
    const {
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
    } = deriveChallengeView(challenge, players, currentPlayer);

    return (
      <div
        key={challenge.id}
        onClick={isLive ? () => onOpenLiveMatch(challenge.id) : undefined}
        className={`card-drop rounded-2xl border border-[#30363d] bg-[#161b22] p-4 ${
          isLive ? 'cursor-pointer transition-colors active:scale-[0.99] hover:border-[#ef4444]/50' : ''
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 font-['JetBrains_Mono'] text-[10px] font-bold uppercase tracking-wider text-[#86948a]">
            <Clock className="h-3 w-3" />
            {challenge.status === 'live'
              ? `Playing · ${elapsed(challenge.startedAt ?? now, now)}`
              : challenge.status === 'accepted'
              ? 'Agreed · not started'
              : timeLeft(challenge.expiresAt, now)}
          </span>
          {challenge.stakes.crownBounty > 0 && (
            <span className="inline-flex items-center gap-1 rounded border border-[#f59e0b]/40 bg-[#f59e0b]/15 px-1.5 py-0.5 font-['JetBrains_Mono'] text-[10px] font-bold text-[#f59e0b]">
              <Crown className="h-3 w-3" />
              {challenge.stakes.crownBounty} bounty
            </span>
          )}
        </div>

        <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              challenger && onSelectPlayer?.(challenger);
            }}
            className="flex min-w-0 flex-col items-center gap-1.5 text-center transition-transform active:scale-95 cursor-pointer"
          >
            <Avatar player={challenger} name={challenge.challengerName} ring="border-[#10b981]/60" />
            <span className="w-full truncate font-['Chivo'] text-xs font-bold text-white">
              {challenge.challengerName}
            </span>
            <span className="font-['JetBrains_Mono'] text-[10px] text-[#4edea3]">
              +{challenge.stakes.challengerWinDelta}
            </span>
          </button>
          <span className="font-['JetBrains_Mono'] text-xs font-black text-[#86948a]">VS</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              opponent && onSelectPlayer?.(opponent);
            }}
            className="flex min-w-0 flex-col items-center gap-1.5 text-center transition-transform active:scale-95 cursor-pointer"
          >
            <Avatar player={opponent} name={challenge.opponentName} ring="border-[#ffb95f]/60" />
            <span className="w-full truncate font-['Chivo'] text-xs font-bold text-white">
              {challenge.opponentName}
            </span>
            <span className="font-['JetBrains_Mono'] text-[10px] text-[#ffb95f]">
              +{challenge.stakes.opponentWinDelta}
            </span>
          </button>
        </div>

        {/* Where the room is leaning */}
        <div className="mt-3">
          <div className="flex items-center justify-between font-['JetBrains_Mono'] text-[10px] text-[#86948a]">
            <span>{forChallenger}</span>
            <span className="uppercase tracking-wider">
              {total === 0 ? 'No calls yet' : `${total} ${total === 1 ? 'call' : 'calls'}`}
            </span>
            <span>{forOpponent}</span>
          </div>
          <div className="mt-1 flex h-2 w-full overflow-hidden rounded-full bg-[#30363d]">
            {/* An empty bar stays neutral; a 50/50 split would read as a tied vote. */}
            {total > 0 && (
              <>
                <div className="bg-[#10b981] transition-all duration-300" style={{ width: `${challengerShare}%` }} />
                <div className="bg-[#ffb95f] transition-all duration-300" style={{ width: `${100 - challengerShare}%` }} />
              </>
            )}
          </div>

          {/* Little avatars of voters under the voting bar */}
          {total > 0 && (
            <div className="mt-2 flex items-center justify-between gap-2 min-h-[24px]">
              <div className="flex min-w-0 items-center">
                <VoterAvatarStack
                  voters={challengerVoters}
                  side="challenger"
                  onSelectPlayer={onSelectPlayer}
                />
              </div>
              <div className="flex min-w-0 items-center justify-end">
                <VoterAvatarStack
                  voters={opponentVoters}
                  side="opponent"
                  onSelectPlayer={onSelectPlayer}
                />
              </div>
            </div>
          )}
        </div>

        {isPlayer ? (
          <p className="mt-3 rounded-lg border border-[#30363d] bg-[#1c2026] px-3 py-2 text-center font-['Space_Grotesk'] text-[11px] text-[#86948a]">
            {isLive ? "You're playing this one. Tap in to see the calls land live." : "You're in this one. The room calls it, not you."}
          </p>
        ) : callsClosed ? (
          <p className="mt-3 rounded-lg border border-[#ef4444]/30 bg-[#ef4444]/10 px-3 py-2 text-center font-['Space_Grotesk'] text-[11px] text-[#ffb4ab]">
            Calls are closed — the window's up.
          </p>
        ) : (
          <div className="mt-3">
            {isLive && (
              <p className="mb-1.5 text-center font-['JetBrains_Mono'] text-[10px] font-bold uppercase tracking-wider text-[#f59e0b]">
                {formatCountdown(remainingVoteMs)} left to call it
              </p>
            )}
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 font-['JetBrains_Mono'] text-[10px] font-bold uppercase tracking-wider text-[#86948a]">
                {myCall ? (
                  <>
                    <Lock className="h-3 w-3 text-[#4edea3]" />
                    <span className="text-[#4edea3]">Call locked in</span>
                  </>
                ) : (
                  'Call it'
                )}
              </span>
              {!myCall && !isPlayer && (
                <button
                  type="button"
                  disabled={lockUsedToday}
                  onClick={(e) => {
                    e.stopPropagation();
                    setArmedLockId(lockArmed ? null : challenge.id);
                  }}
                  title={
                    lockUsedToday
                      ? 'You have already staked your lock today'
                      : 'Stake your one lock of the day: settles for double, win or lose'
                  }
                  className={`flex items-center gap-1 rounded-lg border px-2 py-1 font-['JetBrains_Mono'] text-[10px] font-bold transition-all ${
                    lockUsedToday
                      ? 'cursor-not-allowed border-[#30363d]/50 text-[#86948a]/40'
                      : lockArmed
                      ? 'border-[#f59e0b] bg-[#f59e0b]/15 text-[#f59e0b]'
                      : 'border-[#30363d] text-[#86948a] hover:border-[#f59e0b]/60 hover:text-[#f59e0b]'
                  }`}
                >
                  <Zap className={`h-3 w-3 ${lockArmed ? 'fill-[#f59e0b]' : ''}`} />
                  {lockUsedToday ? 'Lock used' : lockArmed ? 'LOCK ARMED ×2' : 'Lock of the day'}
                </button>
              )}
              {myCall && (
                <span className="flex items-center gap-1 font-['Space_Grotesk'] text-[10px] text-[#86948a]">
                  {myCall.isLock && (
                    <span className="flex items-center gap-0.5 font-['JetBrains_Mono'] font-bold text-[#f59e0b]">
                      <Zap className="h-3 w-3 fill-[#f59e0b]" />×2
                    </span>
                  )}
                  Predictions can't be switched
                </span>
              )}
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {[
                { id: challenge.challengerId, name: challenge.challengerName, tone: '#10b981' },
                { id: challenge.opponentId, name: challenge.opponentName, tone: '#ffb95f' },
              ].map((side) => {
                const picked = myCall?.predictedWinnerId === side.id;
                return (
                  <button
                    key={side.id}
                    type="button"
                    disabled={Boolean(myCall)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (myCall) return;
                      setPoppedCall(`${challenge.id}:${side.id}`);
                      window.setTimeout(() => setPoppedCall(null), 360);
                      void onPredict(challenge, side.id, lockArmed && !lockUsedToday);
                      setArmedLockId(null);
                    }}
                    style={picked ? { borderColor: side.tone, color: side.tone } : undefined}
                    className={`truncate rounded-xl border px-3 py-2 font-['Chivo'] text-xs font-bold transition-all ${
                      poppedCall === `${challenge.id}:${side.id}` ? 'call-pop ' : ''
                    }${
                      picked
                        ? 'bg-[#1c2026] opacity-100 cursor-default shadow-[0_0_12px_rgba(0,0,0,0.4)]'
                        : myCall
                        ? 'border-[#30363d]/40 bg-[#161b22] text-[#86948a]/30 cursor-not-allowed opacity-40'
                        : 'border-[#30363d] bg-[#1c2026] text-[#bbcabf] hover:border-[#4edea3] active:scale-[0.98] cursor-pointer'
                    }`}
                  >
                    {picked && '✓ '}
                    {side.name.split(' ')[0]}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {challenge.status === 'pending' && challenge.opponentId === currentPlayer.id && (
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[#30363d] pt-3">
            <button
              type="button"
              onClick={() => onRespond(challenge, 'accepted')}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-[#10b981] px-3 py-2.5 font-['Chivo'] text-xs font-bold text-[#002113] transition-all active:scale-[0.98]"
            >
              <Check className="h-4 w-4" />
              Accept
            </button>
            <button
              type="button"
              onClick={() => onRespond(challenge, 'declined')}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-[#30363d] px-3 py-2.5 font-['Chivo'] text-xs font-bold text-[#86948a] transition-all hover:border-[#ef4444] hover:text-[#ffb4ab] active:scale-[0.98]"
            >
              <X className="h-4 w-4" />
              Duck it
            </button>
          </div>
        )}

        {challenge.status === 'accepted' && isPlayer && (
          <button
            type="button"
            disabled={startingId === challenge.id}
            onClick={() => void handleStart(challenge)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#ef4444] px-4 py-2.5 font-['Chivo'] text-sm font-bold text-white transition-all active:scale-[0.98] disabled:opacity-60"
          >
            <PlayCircle className="h-4 w-4" />
            {startingId === challenge.id ? 'Starting…' : 'Start the match'}
          </button>
        )}

        {(challenge.status === 'accepted' || isLive) && isPlayer && startingId !== challenge.id && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPlayChallenge(challenge);
            }}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#10b981] px-4 py-2.5 font-['Chivo'] text-sm font-bold text-[#002113] transition-all active:scale-[0.98]"
          >
            <Trophy className="h-4 w-4" />
            Log the result
          </button>
        )}

        {['pending', 'accepted'].includes(challenge.status) &&
          startingId !== challenge.id &&
          (challenge.challengerId === currentPlayer.id || challenge.opponentId === currentPlayer.id) && (
          <button
            type="button"
            onClick={() => onCancel(challenge)}
            className="mt-3 w-full rounded-xl border border-[#30363d] px-3 py-2 font-['Space_Grotesk'] text-[11px] text-[#86948a] hover:text-white"
          >
            {challenge.status === 'accepted' ? 'Cancel duel' : 'Withdraw challenge'}
          </button>
        )}

      </div>
    );
  };

  return (
    <div id="arena-view" className="space-y-4 pb-24 pt-1">
      <div className="px-1">
        <h2 className="font-['Chivo'] text-2xl font-black tracking-tight text-white">The Arena</h2>
        <p className="mt-0.5 font-['Space_Grotesk'] text-xs text-[#86948a]">
          Call someone out. Everyone else calls the winner.
        </p>
      </div>

      {/* The two things you come here to do. Logging lives here now because a
          result is the end of a match, and the matches are on this screen. */}
      <div className="grid grid-cols-2 gap-2 px-1">
        <button
          type="button"
          onClick={onLogMatch}
          className="flex items-center justify-center gap-2 rounded-xl bg-[#10b981] px-3 py-3 font-['Chivo'] text-sm font-bold text-[#002113] shadow-[0_0_14px_rgba(16,185,129,0.3)] transition-all active:scale-[0.98]"
        >
          <ClipboardCheck className="h-4 w-4" />
          Log a match
        </button>
        <button
          type="button"
          onClick={onIssueChallenge}
          className="flex items-center justify-center gap-2 rounded-xl border border-[#30363d] bg-[#1c2026] px-3 py-3 font-['Chivo'] text-sm font-bold text-[#4edea3] transition-all hover:border-[#10b981] active:scale-[0.98]"
        >
          <Swords className="h-4 w-4" />
          Challenge
        </button>
      </div>

      {live.length > 0 && (
        <div className="space-y-2 px-1">
          <span className="flex items-center gap-1.5 font-['JetBrains_Mono'] text-[11px] font-extrabold uppercase tracking-widest text-[#ef4444]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#ef4444] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#ef4444]" />
            </span>
            On the table now
          </span>
          {live.map(renderChallenge)}
        </div>
      )}

      {accepted.length > 0 && (
        <div className="space-y-2 px-1">
          <span className="font-['JetBrains_Mono'] text-[11px] font-extrabold uppercase tracking-widest text-[#4edea3]">
            Agreed
          </span>
          {accepted.map(renderChallenge)}
        </div>
      )}

      {sent.length > 0 && (
        <div className="space-y-2 px-1">
          <span className="font-['JetBrains_Mono'] text-[11px] font-extrabold uppercase tracking-widest text-[#86948a]">
            Waiting on an answer
          </span>
          {sent.map(renderChallenge)}
        </div>
      )}

      {live.length + accepted.length + sent.length === 0 && (
        <div className="mx-1 rounded-2xl border border-dashed border-[#30363d] bg-[#161b22] px-5 py-10 text-center">
          <Target className="mx-auto mb-2 h-6 w-6 text-[#86948a]" />
          <p className="font-['Chivo'] text-sm font-bold text-white">Nothing on the board</p>
          <p className="mt-1 font-['Space_Grotesk'] text-xs text-[#86948a]">
            Challenge someone and the office can start calling it.
          </p>
        </div>
      )}

      <div className="space-y-2 px-1">
        <span className="font-['JetBrains_Mono'] text-[11px] font-extrabold uppercase tracking-widest text-[#86948a]">
          Prediction standings
        </span>
        {oracles.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[#30363d] bg-[#161b22] px-4 py-6 text-center font-['Space_Grotesk'] text-xs text-[#86948a]">
            Nobody has called a match yet. Everyone starts on {NERVE_BASE} nerve — calling an
            underdog that comes in is worth far more than calling the favourite. {NERVE_MIN_CALLS} calls
            earns you a shot at 🔮 The Oracle.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[#30363d] bg-[#161b22]">
            {oracles.map((entry, index) => (
              <div
                key={entry.player.id}
                onClick={() => onSelectPlayer?.(entry.player)}
                className="flex items-center gap-3 border-b border-[#30363d]/60 px-4 py-2.5 last:border-b-0 cursor-pointer hover:bg-[#1c2026]/60 transition-colors"
              >
                <span className="w-4 shrink-0 font-['JetBrains_Mono'] text-xs font-black text-[#86948a]">
                  {index + 1}
                </span>
                <Avatar player={entry.player} name={entry.player.name} size="h-8 w-8" />
                <span className="min-w-0 flex-1 truncate font-['Chivo'] text-sm font-bold text-white">
                  {entry.player.name}
                </span>
                <span className="shrink-0 text-right">
                  <span
                    className={`block font-['JetBrains_Mono'] text-sm font-black ${
                      entry.record.nerve >= NERVE_BASE ? 'text-[#4edea3]' : 'text-[#ffb4ab]'
                    }`}
                  >
                    {entry.record.nerve}
                  </span>
                  <span className="font-['JetBrains_Mono'] text-[10px] text-[#86948a]">
                    {entry.record.correct}/{entry.record.total} · {entry.accuracy}%
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {settled.length > 0 && (
        <div className="space-y-2 px-1">
          <span className="font-['JetBrains_Mono'] text-[11px] font-extrabold uppercase tracking-widest text-[#86948a]">
            Settled
          </span>
          {settled.map((challenge) => {
            const winnerName =
              challenge.resolvedWinnerId === challenge.challengerId
                ? challenge.challengerName
                : challenge.opponentName;
            const right = challenge.predictions.filter(
              (prediction) => prediction.predictedWinnerId === challenge.resolvedWinnerId
            ).length;
            return (
              <div key={challenge.id} className="rounded-xl border border-[#30363d] bg-[#161b22] px-4 py-3">
                <p className="font-['Chivo'] text-xs font-bold text-white">
                  {winnerName} <span className="font-normal text-[#86948a]">beat</span>{' '}
                  {challenge.resolvedWinnerId === challenge.challengerId
                    ? challenge.opponentName
                    : challenge.challengerName}
                </p>
                <p className="mt-0.5 font-['Space_Grotesk'] text-[11px] text-[#86948a]">
                  {challenge.predictions.length === 0
                    ? 'Nobody called it.'
                    : `${right} of ${challenge.predictions.length} called it right.`}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
