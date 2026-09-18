import React, { useEffect } from 'react';
import { Swords } from 'lucide-react';
import { Player } from '../types';

interface CalloutSentOverlayProps {
  opponent: Player;
  /** What the challenger stands to gain, so the moment carries the stake. */
  winDelta: number;
  crownBounty: number;
  onComplete: () => void;
}

/**
 * Throwing down the gauntlet.
 *
 * Issuing a challenge used to close a sheet and drop you back on the board with
 * nothing to mark it, which is a strange way to treat the most confrontational
 * thing the app lets you do.
 */
export const CalloutSentOverlay: React.FC<CalloutSentOverlayProps> = ({
  opponent,
  winDelta,
  crownBounty,
  onComplete,
}) => {
  useEffect(() => {
    const timer = window.setTimeout(onComplete, 1400);
    return () => window.clearTimeout(timer);
  }, [onComplete]);

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={onComplete}
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-[#05070a]/95 p-6 text-center backdrop-blur-md"
    >
      <div className="relative flex h-32 w-32 items-center justify-center">
        <span className="callout-dust absolute bottom-1 h-1.5 w-24 rounded-full bg-[#4edea3]/50 blur-[2px]" />
        <Swords className="callout-throw h-20 w-20 text-[#4edea3] drop-shadow-[0_0_18px_rgba(78,222,163,0.7)]" />
      </div>

      <span className="callout-name mt-4 font-['JetBrains_Mono'] text-[11px] font-extrabold uppercase tracking-[0.3em] text-[#4edea3]">
        Callout sent
      </span>
      <h2 className="callout-name mt-1 font-['Chivo'] text-2xl font-black tracking-tight text-white">
        {opponent.name}
      </h2>

      <div className="callout-name mt-4 flex items-center gap-2">
        <span className="rounded-full border border-[#10b981]/40 bg-[#10b981]/15 px-3 py-1 font-['JetBrains_Mono'] text-xs font-bold text-[#4edea3]">
          +{winDelta} if you win
        </span>
        {crownBounty > 0 && (
          <span className="rounded-full border border-[#f59e0b]/40 bg-[#f59e0b]/15 px-3 py-1 font-['JetBrains_Mono'] text-xs font-bold text-[#f59e0b]">
            👑 {crownBounty}
          </span>
        )}
      </div>

      <p className="callout-name mt-5 font-['Space_Grotesk'] text-xs text-[#86948a]">
        The office can start calling it.
      </p>
    </div>
  );
};
