import React, { useEffect, useState } from 'react';
import { Dices, Sparkles, X } from 'lucide-react';
import { Player } from '../types';

interface QuickMatchModalProps {
  player: Player;
  opponents: Player[];
  onComplete: (opponent: Player) => void;
  onClose: () => void;
}

export const QuickMatchModal: React.FC<QuickMatchModalProps> = ({ player, opponents, onComplete, onClose }) => {
  const [displayedOpponent, setDisplayedOpponent] = useState<Player | null>(null);
  const [isSpinning, setIsSpinning] = useState(true);

  useEffect(() => {
    if (opponents.length === 0) {
      setIsSpinning(false);
      return;
    }

    let tick = 0;
    const interval = window.setInterval(() => {
      setDisplayedOpponent(opponents[tick % opponents.length]);
      tick += 1;
    }, 95);

    const timeout = window.setTimeout(() => {
      window.clearInterval(interval);
      const opponent = opponents[Math.floor(Math.random() * opponents.length)];
      setDisplayedOpponent(opponent);
      setIsSpinning(false);
      window.setTimeout(() => onComplete(opponent), 650);
    }, 1850);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [onComplete, opponents]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-[#10b981]/50 bg-[#10141a] p-6 text-center shadow-[0_0_40px_rgba(16,185,129,0.2)]">
        <button type="button" onClick={onClose} disabled={isSpinning} className="absolute right-3 top-3 rounded-full p-2 text-[#86948a] hover:bg-[#1c2026] hover:text-white disabled:opacity-40" aria-label="Close quick match">
          <X className="h-4 w-4" />
        </button>
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full border border-[#10b981] bg-[#10b981]/15 text-[#4edea3]">
          <Dices className={`h-7 w-7 ${isSpinning ? 'animate-spin' : ''}`} />
        </div>
        <p className="font-['JetBrains_Mono'] text-[10px] font-bold uppercase tracking-[0.2em] text-[#4edea3]">
          {isSpinning ? 'Finding your opponent' : 'Match found'}
        </p>
        <h2 className="mt-1 font-['Chivo'] text-2xl font-black text-white">Quick Match</h2>
        <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="rounded-xl border border-[#10b981]/40 bg-[#10b981]/10 p-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#262a31] font-['Chivo'] text-xl font-bold text-[#4edea3]">
              {player.name.charAt(0).toUpperCase()}
            </div>
            <p className="mt-2 truncate font-['Chivo'] text-xs font-bold text-white">{player.name}</p>
            <p className="font-['JetBrains_Mono'] text-[10px] text-[#86948a]">YOU</p>
          </div>
          <span className="font-['JetBrains_Mono'] text-xs font-black text-[#86948a]">VS</span>
          <div className={`rounded-xl border p-3 transition-all ${isSpinning ? 'border-[#ffb95f]/60 bg-[#ffb95f]/10' : 'border-[#10b981]/40 bg-[#10b981]/10'}`}>
            {displayedOpponent ? (
              <>
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#262a31] font-['Chivo'] text-xl font-bold text-[#ffb95f]">
                  {displayedOpponent.name.charAt(0).toUpperCase()}
                </div>
                <p className="mt-2 truncate font-['Chivo'] text-xs font-bold text-white">{displayedOpponent.name}</p>
                <p className="font-['JetBrains_Mono'] text-[10px] text-[#86948a]">{isSpinning ? 'ROLLING...' : 'OPPONENT'}</p>
              </>
            ) : (
              <div className="flex h-[76px] items-center justify-center text-[#86948a]"><Sparkles className="h-6 w-6 animate-pulse" /></div>
            )}
          </div>
        </div>
        {!isSpinning && <p className="mt-5 text-xs text-[#bbcabf]">Setting up your match...</p>}
        {opponents.length === 0 && <p className="mt-5 text-xs text-[#ffb4ab]">Add another player before starting a Quick Match.</p>}
      </div>
    </div>
  );
};
