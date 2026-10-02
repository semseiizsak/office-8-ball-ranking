import React, { useState } from 'react';
import { Tv } from 'lucide-react';
import { Challenge, Player } from '../types';
import { playerBall } from '../utils/balls';
import { Ball, CallSplit, PlayerAvatar, Sheet } from './ui';

const ghost = (id: string, name: string) => ({ id, name, avatarUrl: '' });

const splitFor = (challenge: Challenge, byId: Map<string, Player>) => {
  const challenger = byId.get(challenge.challengerId) ?? ghost(challenge.challengerId, challenge.challengerName);
  const opponent = byId.get(challenge.opponentId) ?? ghost(challenge.opponentId, challenge.opponentName);
  const forChallenger = challenge.predictions.filter((p) => p.predictedWinnerId === challenge.challengerId).length;
  const forOpponent = challenge.predictions.length - forChallenger;
  return { challenger, opponent, forChallenger, forOpponent };
};

/**
 * One challenge, teased on the ladder screen — whichever is closest to being
 * played, so there is always something to tap into rather than an empty gap
 * where the crown used to sit.
 */
export const ActiveChallengeTeaser: React.FC<{
  challenge: Challenge;
  players: Player[];
  onOpen: () => void;
}> = ({ challenge, players, onOpen }) => {
  const byId = new Map(players.map((player) => [player.id, player]));
  const { challenger, opponent, forChallenger, forOpponent } = splitFor(challenge, byId);
  const startable = challenge.status === 'accepted';
  return (
    <button
      type="button"
      onClick={onOpen}
      className="press card-drop group relative grid w-full gap-3.5 overflow-hidden rounded-[20px] bg-card p-[18px] pt-[104px] text-left shadow-[inset_0_0_0_2px_rgba(255,255,255,0.08)]"
    >
      <Ball n={playerBall(challenger)} size={128} className="absolute -left-[34px] -top-10 transition-transform duration-500 ease-[var(--ease)] group-hover:rotate-12" />
      <Ball n={playerBall(opponent)} size={128} className="absolute -right-[34px] -top-10 transition-transform duration-500 ease-[var(--ease)] group-hover:-rotate-12" />
      <div className="relative grid grid-cols-[1fr_auto_1fr] items-end gap-2.5">
        <span className="min-w-0 font-display text-2xl font-extrabold uppercase leading-[1.05] tracking-[-0.02em] [overflow-wrap:anywhere]">
          {challenger.name.split(' ')[0]}
        </span>
        <span className="font-display text-base font-extrabold leading-[1.4] text-white/55">VS</span>
        <span className="min-w-0 text-right font-display text-2xl font-extrabold uppercase leading-[1.05] tracking-[-0.02em] [overflow-wrap:anywhere]">
          {opponent.name.split(' ')[0]}
        </span>
      </div>
      <div className="relative">
        <CallSplit left={{ player: challenger, count: forChallenger }} right={{ player: opponent, count: forOpponent }} />
      </div>
      <div className="relative flex items-center justify-between gap-2">
        <span className="flex h-11 items-center gap-2 rounded-full bg-white px-4 text-xs font-extrabold uppercase tracking-[0.06em] text-bg">
          <Tv className="h-[18px] w-[18px]" strokeWidth={2.25} />
          See all
        </span>
        <span className="flex h-[26px] items-center rounded-full bg-surface-alt px-2.5 text-[11px] font-extrabold uppercase tracking-[0.1em] text-white">
          {startable ? 'Agreed — ready' : 'Waiting on an answer'}
        </span>
      </div>
    </button>
  );
};

/**
 * Every challenge not yet on the table, so the kiosk can put one there —
 * someone already agreed to it on their phone, the table's just free now.
 */
export const KioskChallengesSheet: React.FC<{
  challenges: Challenge[];
  players: Player[];
  onStart: (challenge: Challenge) => Promise<void>;
  onClose: () => void;
}> = ({ challenges, players, onStart, onClose }) => {
  const byId = new Map(players.map((player) => [player.id, player]));
  const [startingId, setStartingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const sorted = [...challenges].sort((left, right) => {
    if (left.status !== right.status) return left.status === 'accepted' ? -1 : 1;
    return right.createdAt - left.createdAt;
  });

  const start = async (challenge: Challenge) => {
    if (startingId) return;
    setStartingId(challenge.id);
    setError('');
    try {
      await onStart(challenge);
    } catch {
      setError('Could not start that match. Try again.');
      setStartingId(null);
    }
  };

  return (
    <Sheet title="Active challenges" onClose={onClose} z={59}>
      <p className="text-sm text-white/70">Pick one to put it on the table. Only agreed challenges can start.</p>

      {sorted.length === 0 ? (
        <div className="grid justify-items-center gap-2 rounded-2xl bg-card px-4 py-7 text-center">
          <h3 className="text-lg">Nothing waiting</h3>
          <p className="text-sm text-white/70">Call someone out from a phone first, or start a game straight from here.</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {sorted.map((challenge) => {
            const { challenger, opponent, forChallenger, forOpponent } = splitFor(challenge, byId);
            const startable = challenge.status === 'accepted';
            return (
              <div key={challenge.id} className={`card-drop grid gap-2 rounded-2xl bg-card p-3.5 ${startable ? '' : 'opacity-60'}`}>
                <div className="flex items-center justify-between gap-2 px-0.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <PlayerAvatar player={challenger} size={34} />
                    <span className="truncate text-sm font-bold">{challenger.name.split(' ')[0]}</span>
                  </span>
                  <span className="flex-none text-xs font-semibold text-white/55">vs</span>
                  <span className="flex min-w-0 flex-row-reverse items-center gap-2">
                    <PlayerAvatar player={opponent} size={34} />
                    <span className="truncate text-sm font-bold">{opponent.name.split(' ')[0]}</span>
                  </span>
                </div>
                <span className="px-0.5 text-xs font-semibold text-white/55">
                  {startable ? 'Agreed' : 'Waiting on an answer'}
                </span>
                <CallSplit left={{ player: challenger, count: forChallenger }} right={{ player: opponent, count: forOpponent }} />
                {startable && (
                  <button
                    type="button"
                    disabled={startingId === challenge.id}
                    onClick={() => void start(challenge)}
                    className="press flex h-11 items-center justify-center gap-2 rounded-full bg-live text-[13px] font-extrabold uppercase tracking-[0.06em] text-white disabled:opacity-60"
                  >
                    <span className="live-dot h-[7px] w-[7px]" />
                    {startingId === challenge.id ? 'Starting' : `Start ${challenger.name.split(' ')[0]} vs ${opponent.name.split(' ')[0]}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && <p role="alert" className="rounded-xl bg-surface-alt p-3 text-sm font-semibold">{error}</p>}
    </Sheet>
  );
};
