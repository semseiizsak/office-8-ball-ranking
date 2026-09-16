import React from 'react';
import { Check, Clock, Crown, Swords, Target, Trophy, X } from 'lucide-react';
import { Challenge, Player } from '../types';
import { ORACLE_MIN_PREDICTIONS } from '../utils/league';

interface ArenaViewProps {
  players: Player[];
  challenges: Challenge[];
  currentPlayer: Player;
  onIssueChallenge: () => void;
  onRespond: (challenge: Challenge, status: 'accepted' | 'declined') => Promise<void>;
  onCancel: (challenge: Challenge) => Promise<void>;
  onPredict: (challenge: Challenge, predictedWinnerId: string) => Promise<void>;
  onPlayChallenge: (challenge: Challenge) => void;
}

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
}) => {
  const now = Date.now();
  const byId = new Map(players.map((player) => [player.id, player]));

  const open = challenges.filter(
    (challenge) => challenge.status === 'pending' || challenge.status === 'accepted'
  );
  const incoming = open.filter(
    (challenge) => challenge.opponentId === currentPlayer.id && challenge.status === 'pending'
  );
  const settled = challenges.filter((challenge) => challenge.status === 'played').slice(0, 5);

  // Prediction standings: the second ladder, open to everyone who never wins the first.
  const oracles = [...players]
    .filter((player) => player.predictionsTotal > 0)
    .map((player) => ({
      player,
      accuracy: Math.round((player.predictionsCorrect / player.predictionsTotal) * 100),
    }))
    .sort(
      (left, right) =>
        right.accuracy - left.accuracy ||
        right.player.predictionsTotal - left.player.predictionsTotal
    )
    .slice(0, 5);

  const renderChallenge = (challenge: Challenge) => {
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

    return (
      <div key={challenge.id} className="rounded-2xl border border-[#30363d] bg-[#161b22] p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 font-['JetBrains_Mono'] text-[10px] font-bold uppercase tracking-wider text-[#86948a]">
            <Clock className="h-3 w-3" />
            {challenge.status === 'accepted' ? 'On' : timeLeft(challenge.expiresAt, now)}
          </span>
          {challenge.stakes.crownBounty > 0 && (
            <span className="inline-flex items-center gap-1 rounded border border-[#f59e0b]/40 bg-[#f59e0b]/15 px-1.5 py-0.5 font-['JetBrains_Mono'] text-[10px] font-bold text-[#f59e0b]">
              <Crown className="h-3 w-3" />
              {challenge.stakes.crownBounty} bounty
            </span>
          )}
        </div>

        <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
            <Avatar player={challenger} name={challenge.challengerName} ring="border-[#10b981]/60" />
            <span className="w-full truncate font-['Chivo'] text-xs font-bold text-white">
              {challenge.challengerName}
            </span>
            <span className="font-['JetBrains_Mono'] text-[10px] text-[#4edea3]">
              +{challenge.stakes.challengerWinDelta}
            </span>
          </div>
          <span className="font-['JetBrains_Mono'] text-xs font-black text-[#86948a]">VS</span>
          <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
            <Avatar player={opponent} name={challenge.opponentName} ring="border-[#ffb95f]/60" />
            <span className="w-full truncate font-['Chivo'] text-xs font-bold text-white">
              {challenge.opponentName}
            </span>
            <span className="font-['JetBrains_Mono'] text-[10px] text-[#ffb95f]">
              +{challenge.stakes.opponentWinDelta}
            </span>
          </div>
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
        </div>

        {isPlayer ? (
          <p className="mt-3 rounded-lg border border-[#30363d] bg-[#1c2026] px-3 py-2 text-center font-['Space_Grotesk'] text-[11px] text-[#86948a]">
            You're in this one. The room calls it, not you.
          </p>
        ) : (
          <div className="mt-3">
            <span className="font-['JetBrains_Mono'] text-[10px] font-bold uppercase tracking-wider text-[#86948a]">
              Call it
            </span>
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
                    onClick={() => onPredict(challenge, side.id)}
                    style={picked ? { borderColor: side.tone, color: side.tone } : undefined}
                    className={`truncate rounded-xl border px-3 py-2 font-['Chivo'] text-xs font-bold transition-all active:scale-[0.98] ${
                      picked ? 'bg-[#1c2026]' : 'border-[#30363d] bg-[#1c2026] text-[#bbcabf] hover:border-[#4edea3]'
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

        {challenge.status === 'pending' && challenge.challengerId === currentPlayer.id && (
          <button
            type="button"
            onClick={() => onCancel(challenge)}
            className="mt-3 w-full rounded-xl border border-[#30363d] px-3 py-2 font-['Space_Grotesk'] text-[11px] text-[#86948a] hover:text-white"
          >
            Withdraw challenge
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

      {incoming.length > 0 && (
        <div className="space-y-2 px-1">
          <span className="font-['JetBrains_Mono'] text-[11px] font-extrabold uppercase tracking-widest text-[#ffb95f]">
            Waiting on you
          </span>
          {incoming.map(renderChallenge)}
        </div>
      )}

      <div className="space-y-2 px-1">
        <span className="font-['JetBrains_Mono'] text-[11px] font-extrabold uppercase tracking-widest text-[#86948a]">
          On the board
        </span>
        {open.filter((challenge) => !incoming.includes(challenge)).length === 0 && incoming.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#30363d] bg-[#161b22] px-5 py-10 text-center">
            <Target className="mx-auto mb-2 h-6 w-6 text-[#86948a]" />
            <p className="font-['Chivo'] text-sm font-bold text-white">Nothing on the board</p>
            <p className="mt-1 font-['Space_Grotesk'] text-xs text-[#86948a]">
              Challenge someone and the office can start calling it.
            </p>
          </div>
        ) : (
          open.filter((challenge) => !incoming.includes(challenge)).map(renderChallenge)
        )}
      </div>

      <div className="space-y-2 px-1">
        <span className="font-['JetBrains_Mono'] text-[11px] font-extrabold uppercase tracking-widest text-[#86948a]">
          Prediction standings
        </span>
        {oracles.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[#30363d] bg-[#161b22] px-4 py-6 text-center font-['Space_Grotesk'] text-xs text-[#86948a]">
            Nobody has called a match yet. {ORACLE_MIN_PREDICTIONS} calls earns you a shot at 🔮 The Oracle.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[#30363d] bg-[#161b22]">
            {oracles.map((entry, index) => (
              <div
                key={entry.player.id}
                className="flex items-center gap-3 border-b border-[#30363d]/60 px-4 py-2.5 last:border-b-0"
              >
                <span className="w-4 shrink-0 font-['JetBrains_Mono'] text-xs font-black text-[#86948a]">
                  {index + 1}
                </span>
                <Avatar player={entry.player} name={entry.player.name} size="h-8 w-8" />
                <span className="min-w-0 flex-1 truncate font-['Chivo'] text-sm font-bold text-white">
                  {entry.player.name}
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-['JetBrains_Mono'] text-sm font-black text-[#4edea3]">
                    {entry.accuracy}%
                  </span>
                  <span className="font-['JetBrains_Mono'] text-[10px] text-[#86948a]">
                    {entry.player.predictionsCorrect}/{entry.player.predictionsTotal}
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
