import React, { useState } from 'react';
import { Check, Clock, Crown, Lock, Swords, Target, Trophy, X, Zap } from 'lucide-react';
import { Challenge, Player, Prediction } from '../types';
import { hasLockOnDay, NerveRecord, NERVE_BASE, NERVE_MIN_CALLS } from '../utils/league';

interface ArenaViewProps {
  players: Player[];
  challenges: Challenge[];
  currentPlayer: Player;
  onIssueChallenge: () => void;
  onRespond: (challenge: Challenge, status: 'accepted' | 'declined') => Promise<void>;
  onCancel: (challenge: Challenge) => Promise<void>;
  onPredict: (challenge: Challenge, predictedWinnerId: string, isLock: boolean) => Promise<void>;
  onPlayChallenge: (challenge: Challenge) => void;
  onSelectPlayer?: (player: Player) => void;
  /** Calling records, rebuilt from every settled challenge. */
  nerve: Map<string, NerveRecord>;
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
      onClick={onSelect}
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
          onClick={() => setExpanded(true)}
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
          onClick={() => setExpanded(false)}
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

const timeLeft = (expiresAt: number, now: number): string => {
  const minutes = Math.round((expiresAt - now) / 60_000);
  if (minutes <= 0) return 'expired';
  if (minutes < 60) return `${minutes}m left`;
  return `${Math.round(minutes / 60)}h left`;
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
  onSelectPlayer,
  nerve,
}) => {
  const now = Date.now();
  const [armedLockId, setArmedLockId] = useState<string | null>(null);
  const byId = new Map<string, Player>(players.map((player) => [player.id, player]));

  // Everything still live belongs on the board, answered or not. Showing only
  // accepted challenges meant a callout was invisible to everybody except the
  // person being called out, so the challenger saw nothing after issuing it and
  // the room could not start calling a winner until it had been accepted.
  const open = challenges
    .filter((challenge) => challenge.status === 'accepted' || challenge.status === 'pending')
    .sort((left, right) => {
      if (left.status !== right.status) return left.status === 'accepted' ? -1 : 1;
      return right.createdAt - left.createdAt;
    });
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

  const renderChallenge = (challenge: Challenge) => {
    const lockArmed = armedLockId === challenge.id;
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

    return (
      <div key={challenge.id} className="rounded-2xl border border-[#30363d] bg-[#161b22] p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 font-['JetBrains_Mono'] text-[10px] font-bold uppercase tracking-wider text-[#86948a]">
            <Clock className="h-3 w-3" />
            {challenge.status === 'accepted' ? 'Accepted · awaiting result' : timeLeft(challenge.expiresAt, now)}
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
            onClick={() => challenger && onSelectPlayer?.(challenger)}
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
            onClick={() => opponent && onSelectPlayer?.(opponent)}
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
            You're in this one. The room calls it, not you.
          </p>
        ) : (
          <div className="mt-3">
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
                  onClick={() => setArmedLockId(lockArmed ? null : challenge.id)}
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
                    onClick={() => {
                      if (myCall) return;
                      void onPredict(challenge, side.id, lockArmed && !lockUsedToday);
                      setArmedLockId(null);
                    }}
                    style={picked ? { borderColor: side.tone, color: side.tone } : undefined}
                    className={`truncate rounded-xl border px-3 py-2 font-['Chivo'] text-xs font-bold transition-all ${
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

        {['pending', 'accepted'].includes(challenge.status) &&
          (challenge.challengerId === currentPlayer.id || challenge.opponentId === currentPlayer.id) && (
          <button
            type="button"
            onClick={() => onCancel(challenge)}
            className="mt-3 w-full rounded-xl border border-[#30363d] px-3 py-2 font-['Space_Grotesk'] text-[11px] text-[#86948a] hover:text-white"
          >
            {challenge.status === 'accepted' ? 'Cancel duel' : 'Withdraw challenge'}
          </button>
        )}

        {challenge.status === 'accepted' && isPlayer && (
          <button
            type="button"
            onClick={() => onPlayChallenge(challenge)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#10b981] px-4 py-2.5 font-['Chivo'] text-sm font-bold text-[#002113] transition-all active:scale-[0.98]"
          >
            <Trophy className="h-4 w-4" />
            Log the result
          </button>
        )}
      </div>
    );
  };

  return (
    <div id="arena-view" className="space-y-4 pb-24 pt-1">
      <div className="flex items-end justify-between px-1">
        <div>
          <h2 className="font-['Chivo'] text-2xl font-black tracking-tight text-white">The Arena</h2>
          <p className="mt-0.5 font-['Space_Grotesk'] text-xs text-[#86948a]">
            Call someone out. Everyone else calls the winner.
          </p>
        </div>
        <button
          type="button"
          onClick={onIssueChallenge}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-[#10b981] px-3 py-2 font-['Chivo'] text-xs font-bold text-[#002113] shadow-[0_0_12px_rgba(16,185,129,0.3)] transition-all active:scale-95"
        >
          <Swords className="h-4 w-4" />
          Challenge
        </button>
      </div>

      <div className="space-y-2 px-1">
        <span className="font-['JetBrains_Mono'] text-[11px] font-extrabold uppercase tracking-widest text-[#86948a]">
          On the board
        </span>
        {open.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#30363d] bg-[#161b22] px-5 py-10 text-center">
            <Target className="mx-auto mb-2 h-6 w-6 text-[#86948a]" />
            <p className="font-['Chivo'] text-sm font-bold text-white">Nothing on the board</p>
            <p className="mt-1 font-['Space_Grotesk'] text-xs text-[#86948a]">
              Challenge someone and the office can start calling it.
            </p>
          </div>
        ) : (
          open.map(renderChallenge)
        )}
      </div>

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
