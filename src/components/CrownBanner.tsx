import React from 'react';
import { Swords } from 'lucide-react';
import { Player } from '../types';
import { CrownState, BOUNTY_PER_DAY } from '../utils/league';
import { Ball } from './ui';

interface CrownBannerProps {
  crown: CrownState;
  players: Player[];
  currentPlayer: Player | null;
  onChallenge: (player: Player) => void;
}

/**
 * The crown and the pot riding on it, as a solid yellow card with the 1 ball
 * hanging off the corner.
 *
 * The bounty exists so the top spot cannot be protected by refusing to play:
 * every undefended day makes the holder a richer target.
 */
export const CrownBanner: React.FC<CrownBannerProps> = ({ crown, players, currentPlayer, onChallenge }) => {
  const holder = players.find((player) => player.id === crown.holderId) ?? null;

  if (!holder) {
    return (
      <div className="relative overflow-hidden rounded-[20px] bg-crown p-[18px] text-bg">
        <Ball n={1} size={150} className="absolute -right-10 -top-10" />
        <div className="relative grid max-w-[65%] gap-1.5">
          <h2 className="text-2xl">The crown is empty</h2>
          <p className="text-sm text-bg">Nobody has played yet. The first winner takes the top.</p>
        </div>
      </div>
    );
  }

  const first = holder.name.split(' ')[0];
  const isMine = currentPlayer?.id === holder.id;
  const idleDays = crown.idleDays ?? 0;
  const text =
    crown.bounty > 0
      ? isMine
        ? `${idleDays > 0 ? `${idleDays} ${idleDays === 1 ? 'day' : 'days'} undefended. ` : ''}Every day adds ${BOUNTY_PER_DAY} to the price on your head.`
        : `${idleDays > 0 ? `${idleDays} ${idleDays === 1 ? 'day' : 'days'} undefended. ` : ''}Beat ${first} and it's yours.`
      : isMine
        ? 'Taken today. Hold it past midnight and the bounty starts growing.'
        : `Clean today. It gains ${BOUNTY_PER_DAY} every morning it goes undefended.`;

  return (
    <div className="relative overflow-hidden rounded-[20px] bg-crown p-[18px] text-bg">
      <Ball n={1} size={150} className="stagger-ball absolute -right-10 -top-10" />
      <div className="relative grid gap-3.5">
        <div className="grid gap-1.5">
          <h2 className="max-w-[11ch] text-2xl">{isMine ? 'You hold the crown' : `${first} holds the crown`}</h2>
          <p className="max-w-[30ch] text-sm text-bg">
            {text}
            {crown.defences > 0 && ` Defended ${crown.defences} ${crown.defences === 1 ? 'time' : 'times'}.`}
          </p>
        </div>
        <div className="flex items-center justify-between">
          <span className="font-display text-[40px] font-extrabold leading-none tracking-[-0.02em] tabular-nums" aria-label={`Bounty ${crown.bounty}`}>
            +{crown.bounty}
          </span>
          {isMine ? (
            <span className="rounded-full bg-bg px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.1em] text-white">👑 Yours</span>
          ) : (
            currentPlayer && (
              <button
                type="button"
                onClick={() => onChallenge(holder)}
                className="press flex h-11 items-center gap-2 rounded-full bg-bg px-4 text-xs font-extrabold uppercase tracking-[0.06em] text-white"
              >
                <Swords className="h-[18px] w-[18px]" strokeWidth={2.25} />
                Take it
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
};
