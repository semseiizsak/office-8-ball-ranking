import React, { useEffect } from 'react';
import { describeUnlock } from '../utils/achievements';

/**
 * A new badge or achievement tier, as a white card that slides up from the
 * bottom, spins its emoji in, and leaves on its own or on a tap.
 */
export const BadgePop: React.FC<{ unlockKey: string; onDone: () => void }> = ({ unlockKey, onDone }) => {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 3800);
    return () => window.clearTimeout(timer);
  }, [onDone]);
  const unlock = describeUnlock(unlockKey);
  if (!unlock) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--safe-bottom)+84px)] z-[70] flex justify-center px-4">
      <button
        type="button"
        onClick={onDone}
        role="status"
        aria-live="polite"
        className="pop-up pointer-events-auto grid w-full max-w-[360px] grid-cols-[auto_1fr] items-center gap-3.5 rounded-[20px] bg-white px-4 py-3.5 text-left text-bg"
      >
        <span
          aria-hidden="true"
          className="emo-spin grid h-16 w-16 place-items-center rounded-full text-[32px] leading-none"
          style={
            unlock.tier
              ? { background: unlock.tier.c, boxShadow: unlock.tier.k === 'eight' ? '0 0 0 2px #0A0A0A' : 'inset 0 0 0 3px rgba(0,0,0,.12)' }
              : { fontSize: 48 }
          }
        >
          {unlock.e}
        </span>
        <span className="grid min-w-0 gap-0.5">
          <span className="text-[10px] font-extrabold uppercase tracking-[0.14em]">{unlock.label} unlocked</span>
          <b className="font-display text-lg font-extrabold uppercase leading-[1.05]">{unlock.name}</b>
          <span className="text-xs leading-snug">{unlock.desc}</span>
        </span>
      </button>
    </div>
  );
};
