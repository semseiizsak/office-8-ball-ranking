import React, { useState } from 'react';
import { Tv } from 'lucide-react';
import { Challenge, Player } from '../types';
import { CallSplit, Sheet } from './ui';

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
  return (
    <button type="button" onClick={onOpen} className="press card-drop grid gap-2 rounded-2xl bg-card p-3.5 text-left">
      <div className="flex items-center justify-between px-0.5">
        <span className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-[0.1em] text-white/55">
          <Tv className="h-3.5 w-3.5" strokeWidth={2.5} />
          {challenge.status === 'accepted' ? 'Agreed — ready to start' : 'Waiting on an answer'}
        </span>
        <span className="text-xs font-semibold text-white/55">See all →</span>
      </div>
      <p className="px-0.5 text-sm font-bold">
        {challenger.name.split(' ')[0]} <span className="font-normal text-white/55">vs</span> {opponent.name.split(' ')[0]}
      </p>
      <CallSplit left={{ player: challenger, count: forChallenger }} right={{ player: opponent, count: forOpponent }} />
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
                <div className="flex items-center justify-between px-0.5">
                  <p className="text-sm font-bold">
                    {challenger.name.split(' ')[0]} <span className="font-normal text-white/55">vs</span> {opponent.name.split(' ')[0]}
                  </p>
                  <span className="text-xs font-semibold text-white/55">
                    {startable ? 'Agreed' : 'Waiting on an answer'}
                  </span>
                </div>
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
