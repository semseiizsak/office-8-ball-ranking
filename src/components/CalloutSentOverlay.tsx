import React, { useEffect } from 'react';
import { Player } from '../types';
import { playerBall } from '../utils/balls';
import { Ball, PlayerAvatar } from './ui';

interface CalloutSentOverlayProps {
  opponent: Player;
  /** What the challenger stands to gain, so the moment carries the stake. */
  winDelta: number;
  crownBounty: number;
  onComplete: () => void;
}

/**
 * Throwing down the gauntlet: the opponent's ball arcs in spinning, lands,
 * a puff of chalk and a ring go out, then the words. Ease-in-out, no bounce.
 */
export const CalloutSentOverlay: React.FC<CalloutSentOverlayProps> = ({ opponent, winDelta, crownBounty, onComplete }) => {
  useEffect(() => {
    const timer = window.setTimeout(onComplete, 2600);
    return () => window.clearTimeout(timer);
  }, [onComplete]);

  return (
    <div role="status" aria-live="polite" onClick={onComplete} className="anim-fade fixed inset-0 z-[60] grid place-items-center overflow-hidden bg-black p-6 text-center">
      <div className="grid justify-items-center gap-3.5">
        <div className="relative grid h-[150px] w-[180px] place-items-end justify-center">
          <span className="callout-dust absolute -bottom-1.5 left-1/2 -ml-[95px] h-[18px] w-[190px] rounded-full bg-[radial-gradient(closest-side,rgba(255,255,255,.4),rgba(255,255,255,0))] opacity-0" />
          <span className="accept-ring absolute bottom-0 left-1/2 -ml-[52px] h-[104px] w-[104px] rounded-full shadow-[0_0_0_2px_#fff]" style={{ animationDuration: '1300ms' }} />
          <Ball n={playerBall(opponent)} size={104} className="callout-throw relative z-10" />
        </div>
        <h1 className="after-1 text-[64px] leading-[.92] tracking-[-0.03em]">Callout sent</h1>
        <span className="after-2 inline-flex h-11 items-center gap-2 rounded-full bg-surface-alt pl-1.5 pr-4 text-sm font-extrabold">
          <PlayerAvatar player={opponent} size={32} />
          {opponent.name.split(' ')[0]}
        </span>
        <p className="after-2 max-w-[30ch] font-semibold text-white/70">
          +{winDelta} if you win{crownBounty > 0 ? `, with a 👑 ${crownBounty} bounty` : ''}. 24 hours to answer, and the office can start calling it.
        </p>
      </div>
    </div>
  );
};
