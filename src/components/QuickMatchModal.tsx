import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Player } from '../types';
import { Ball, PlayerAvatar } from './ui';

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
    <div role="dialog" aria-modal="true" aria-label="Quick match" className="anim-fade fixed inset-0 z-50 grid place-items-center overflow-hidden bg-black p-6 text-center">
      <button type="button" onClick={onClose} disabled={isSpinning} aria-label="Close" className="press absolute right-4 top-[calc(var(--safe-top)+1rem)] grid h-11 w-11 place-items-center rounded-full bg-surface-alt disabled:opacity-30">
        <X className="h-5 w-5" strokeWidth={2.25} />
      </button>
      <div className="grid justify-items-center gap-4">
        <span className={`anim-pop block ${isSpinning ? '[&>span]:animate-spin' : ''}`}>
          <Ball n={8} size={96} />
        </span>
        <h1 className="text-[44px] leading-[.92]">Quick match</h1>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="grid justify-items-center gap-2">
            <PlayerAvatar player={player} size={64} />
            <span className="text-sm font-bold">You</span>
          </div>
          <span className="font-display text-2xl font-extrabold text-white/55">VS</span>
          <div className="grid justify-items-center gap-2">
            {displayedOpponent ? <PlayerAvatar player={displayedOpponent} size={64} /> : <span className="h-16 w-16 rounded-full bg-surface-alt" />}
            <span className="max-w-[120px] truncate text-sm font-bold">{displayedOpponent?.name.split(' ')[0] ?? ''}</span>
          </div>
        </div>
        <p className="font-semibold text-white/70">
          {opponents.length === 0 ? 'Add another player before a quick match.' : isSpinning ? 'Finding your opponent' : 'Match found. Setting it up.'}
        </p>
      </div>
    </div>
  );
};
