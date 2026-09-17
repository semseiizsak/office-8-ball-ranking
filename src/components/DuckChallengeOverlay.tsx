import React, { useEffect } from 'react';
import { Bird } from 'lucide-react';

interface DuckChallengeOverlayProps {
  onComplete: () => void;
}

export const DuckChallengeOverlay: React.FC<DuckChallengeOverlayProps> = ({ onComplete }) => {
  useEffect(() => {
    const timer = window.setTimeout(onComplete, 1300);
    return () => window.clearTimeout(timer);
  }, [onComplete]);

  return (
    <div role="status" aria-live="polite" className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-[#05070a]/95 p-6 text-center backdrop-blur-md">
      <div className="duck-waddle text-[#ffb95f]"><Bird className="h-24 w-24" /></div>
      <span className="mt-6 font-['JetBrains_Mono'] text-[11px] font-extrabold uppercase tracking-[0.3em] text-[#ffb95f]">Challenge ducked</span>
      <p className="mt-2 font-['Space_Grotesk'] text-xs text-[#86948a]">The invitation has been declined and removed from the Arena.</p>
    </div>
  );
};
