import React, { useEffect } from 'react';

interface DuckChallengeOverlayProps {
  onComplete: () => void;
}

export const DuckChallengeOverlay: React.FC<DuckChallengeOverlayProps> = ({ onComplete }) => {
  useEffect(() => {
    const timer = window.setTimeout(onComplete, 2000);
    return () => window.clearTimeout(timer);
  }, [onComplete]);
  return (
    <div role="status" aria-live="polite" onClick={onComplete} className="anim-fade fixed inset-0 z-[60] grid place-items-center bg-black p-6 text-center">
      <div className="grid justify-items-center gap-3.5">
        <span aria-hidden="true" className="duck-waddle text-[110px] leading-none">🦆</span>
        <h1 className="anim-rise text-[64px] leading-[.92] tracking-[-0.03em] [animation-delay:200ms]">Ducked</h1>
        <p className="anim-rise max-w-[28ch] font-semibold text-white/70 [animation-delay:280ms]">The Duck title keeps count. Everyone saw that.</p>
      </div>
    </div>
  );
};
