import React, { useEffect } from 'react';
import { Handshake } from 'lucide-react';
import { Challenge, Player } from '../types';

interface ChallengeAcceptedOverlayProps {
  challenge: Challenge;
  players: Player[];
  onComplete: () => void;
}

const Side: React.FC<{ player?: Player; name: string; side: 'left' | 'right' }> = ({
  player,
  name,
  side,
}) => {
  const tone = side === 'left' ? '#10b981' : '#ffb95f';
  return (
    <div className={side === 'left' ? 'accept-close-left' : 'accept-close-right'}>
      {player?.avatarUrl ? (
        <img
          src={player.avatarUrl}
          alt={name}
          referrerPolicy="no-referrer"
          className="h-16 w-16 rounded-full border-2 object-cover"
          style={{ borderColor: tone, boxShadow: `0 0 24px ${tone}55` }}
        />
      ) : (
        <div
          className="flex h-16 w-16 items-center justify-center rounded-full border-2 bg-[#262a31] font-['Chivo'] text-xl font-bold"
          style={{ borderColor: tone, color: tone, boxShadow: `0 0 24px ${tone}55` }}
        >
          {name.charAt(0).toUpperCase()}
        </div>
      )}
    </div>
  );
};

/**
 * Answering a callout.
 *
 * Deliberately a quieter beat than the clash that plays when the match is
 * called on: this is the handshake, not the break. Accepting had no moment at
 * all once the clash moved to the start of play.
 */
export const ChallengeAcceptedOverlay: React.FC<ChallengeAcceptedOverlayProps> = ({
  challenge,
  players,
  onComplete,
}) => {
  useEffect(() => {
    const timer = window.setTimeout(onComplete, 1500);
    return () => window.clearTimeout(timer);
  }, [onComplete]);

  const challenger = players.find((player) => player.id === challenge.challengerId);
  const opponent = players.find((player) => player.id === challenge.opponentId);

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={onComplete}
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-[#05070a]/95 p-6 text-center backdrop-blur-md"
    >
      <div className="flex items-center gap-3">
        <Side player={challenger} name={challenge.challengerName} side="left" />

        <div className="relative flex h-16 w-16 items-center justify-center">
          <span className="accept-ring absolute h-14 w-14 rounded-full border-2 border-[#4edea3]" />
          <Handshake className="accept-stamp h-9 w-9 text-white drop-shadow-[0_0_14px_rgba(78,222,163,0.9)]" />
        </div>

        <Side player={opponent} name={challenge.opponentName} side="right" />
      </div>

      <span className="callout-name mt-6 font-['JetBrains_Mono'] text-[11px] font-extrabold uppercase tracking-[0.3em] text-[#4edea3]">
        It's on
      </span>
      <h2 className="callout-name mt-1 font-['Chivo'] text-xl font-black tracking-tight text-white">
        {challenge.challengerName.split(' ')[0]} vs {challenge.opponentName.split(' ')[0]}
      </h2>
      <p className="callout-name mt-4 font-['Space_Grotesk'] text-xs text-[#86948a]">
        Calls stay open until one of you starts the match.
      </p>
    </div>
  );
};
