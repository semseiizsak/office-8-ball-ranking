import React from 'react';
import { Crown, Swords, TrendingUp } from 'lucide-react';
import { Player } from '../types';
import { CrownState, BOUNTY_PER_DAY } from '../utils/league';

interface CrownBannerProps {
  crown: CrownState;
  players: Player[];
  currentPlayer: Player | null;
  onChallenge: (player: Player) => void;
}

/**
 * The crown and the pot riding on it.
 *
 * The bounty exists so the top spot cannot be protected by refusing to play:
 * every undefended day makes the holder a richer target.
 */
export const CrownBanner: React.FC<CrownBannerProps> = ({ crown, players, currentPlayer, onChallenge }) => {
  const holder = players.find((player) => player.id === crown.holderId) ?? null;
  if (!holder) return null;

  const isMine = currentPlayer?.id === holder.id;
  const idleDays = crown.idleDays ?? 0;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#f59e0b]/40 bg-gradient-to-br from-[#241a07] to-[#161b22] p-4 shadow-lg">
      <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-[#f59e0b]/10 blur-2xl" />

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {holder.avatarUrl ? (
            <img
              src={holder.avatarUrl}
              alt={holder.name}
              referrerPolicy="no-referrer"
              className="h-12 w-12 shrink-0 rounded-full border-2 border-[#f59e0b]/70 object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-[#f59e0b]/70 bg-[#262a31] font-['Chivo'] text-lg font-bold text-[#f59e0b]">
              {holder.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <span className="flex items-center gap-1.5 font-['JetBrains_Mono'] text-[10px] font-extrabold uppercase tracking-widest text-[#f59e0b]">
              <Crown className="h-3.5 w-3.5 fill-[#f59e0b]" />
              The Crown
            </span>
            <h3 className="truncate font-['Chivo'] text-base font-bold text-white">{holder.name}</h3>
            <p className="font-['Space_Grotesk'] text-[11px] text-[#bbcabf]">
              Held {crown.heldDays} {crown.heldDays === 1 ? 'day' : 'days'}
              {crown.defences > 0 && ` · ${crown.defences} defended`}
            </p>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <span className="block font-['JetBrains_Mono'] text-[10px] font-bold uppercase tracking-wider text-[#86948a]">
            Bounty
          </span>
          <span className="font-['JetBrains_Mono'] text-2xl font-black text-[#f59e0b] tabular-nums">
            {crown.bounty}
          </span>
        </div>
      </div>

      <p className="mt-3 border-t border-[#f59e0b]/20 pt-3 font-['Space_Grotesk'] text-xs leading-relaxed text-[#dfe2eb]">
        {crown.bounty > 0 ? (
          <>
            Beat {holder.name.split(' ')[0]} and you take <span className="font-bold text-[#f59e0b]">{crown.bounty}</span> extra
            rating straight off them
            {idleDays > 0 && <> — they haven't played in {idleDays} {idleDays === 1 ? 'day' : 'days'}</>}.
          </>
        ) : (
          <>
            The crown is clean today. It starts paying out {BOUNTY_PER_DAY} rating a day the moment it goes undefended.
          </>
        )}
      </p>

      {isMine ? (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-[#f59e0b]/30 bg-[#f59e0b]/10 px-3 py-2">
          <TrendingUp className="h-4 w-4 shrink-0 text-[#f59e0b]" />
          <span className="font-['Space_Grotesk'] text-xs text-[#ffddb8]">
            You're wearing it. Every day you don't play makes you worth more.
          </span>
        </div>
      ) : (
        currentPlayer && (
          <button
            type="button"
            onClick={() => onChallenge(holder)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#f59e0b] px-4 py-2.5 font-['Chivo'] text-sm font-bold text-[#2a1700] transition-all active:scale-[0.98] hover:bg-[#fbbf24]"
          >
            <Swords className="h-4 w-4" />
            Go for the crown
          </button>
        )
      )}
    </div>
  );
};
