import React, { useEffect } from 'react';
import { Swords } from 'lucide-react';
import { Challenge, Player } from '../types';

interface DuelAcceptedOverlayProps {
  challenge: Challenge;
  players: Player[];
  /** Fired once the hand-off finishes, to open the match. */
  onComplete: () => void;
}

const HOLD_MS = 1500;

const Fighter: React.FC<{ player?: Player; name: string; side: 'left' | 'right' }> = ({
  player,
  name,
  side,
}) => {
  const tone = side === 'left' ? '#10b981' : '#ffb95f';
  return (
    <div
      className={`flex min-w-0 flex-1 flex-col items-center gap-2 ${
        side === 'left' ? 'duel-in-left' : 'duel-in-right'
      }`}
    >
      {player?.avatarUrl ? (
        <img
          src={player.avatarUrl}
          alt={name}
          referrerPolicy="no-referrer"
          className="h-20 w-20 rounded-full border-2 object-cover shadow-lg"
          style={{ borderColor: tone, boxShadow: `0 0 28px ${tone}55` }}
        />
      ) : (
        <div
          className="flex h-20 w-20 items-center justify-center rounded-full border-2 bg-[#262a31] font-['Chivo'] text-2xl font-bold shadow-lg"
          style={{ borderColor: tone, color: tone, boxShadow: `0 0 28px ${tone}55` }}
        >
          {name.charAt(0).toUpperCase()}
        </div>
      )}
      <span className="w-full truncate text-center font-['Chivo'] text-sm font-bold text-white">
        {name}
      </span>
    </div>
  );
};

/**
 * The moment a challenge turns into a match.
 *
 * Accepting used to change a status and leave you to find the log screen
 * yourself. This carries you there, and gives the accept the beat it deserves.
 */
export const DuelAcceptedOverlay: React.FC<DuelAcceptedOverlayProps> = ({
  challenge,
  players,
  onComplete,
}) => {
  useEffect(() => {
    const timer = window.setTimeout(onComplete, HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [onComplete]);

  const challenger = players.find((player) => player.id === challenge.challengerId);
  const opponent = players.find((player) => player.id === challenge.opponentId);

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={onComplete}
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-[#05070a]/95 p-6 backdrop-blur-md"
    >
      <span className="anim-fade font-['JetBrains_Mono'] text-[11px] font-extrabold uppercase tracking-[0.3em] text-[#4edea3]">
        Challenge accepted
      </span>

      <div className="duel-shake relative mt-6 flex w-full max-w-sm items-start justify-between gap-3">
        <Fighter player={challenger} name={challenge.challengerName} side="left" />

        {/* The clash lands between them, on the beat the two sides meet. */}
        <div className="relative flex h-20 w-16 shrink-0 items-center justify-center">
          <span className="duel-shock absolute h-16 w-16 rounded-full bg-[#4edea3]/40" />
          <Swords className="duel-clash relative h-10 w-10 text-white drop-shadow-[0_0_12px_rgba(78,222,163,0.9)]" />
        </div>

        <Fighter player={opponent} name={challenge.opponentName} side="right" />
      </div>

      {challenge.stakes.crownBounty > 0 && (
        <span className="anim-fade mt-5 rounded-full border border-[#f59e0b]/40 bg-[#f59e0b]/15 px-3 py-1 font-['JetBrains_Mono'] text-[11px] font-bold text-[#f59e0b]">
          {challenge.stakes.crownBounty} crown bounty on the table
        </span>
      )}

      <p className="anim-fade mt-6 font-['Space_Grotesk'] text-xs text-[#86948a]">
        Opening the match...
      </p>
    </div>
  );
};
