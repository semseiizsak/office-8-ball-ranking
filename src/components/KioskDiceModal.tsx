import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Player } from '../types';
import { Ball, PlayerAvatar } from './ui';

interface KioskDiceModalProps {
  players: Player[];
  onComplete: (a: Player, b: Player) => void;
  onClose: () => void;
}

/**
 * The real app's quick match spins a random opponent against "you". The
 * kiosk has no you, so both sides spin — same mechanic, same timing, just
 * nobody is fixed.
 */
export const KioskDiceModal: React.FC<KioskDiceModalProps> = ({ players, onComplete, onClose }) => {
  const [shuffled] = useState(() => [...players].sort(() => Math.random() - 0.5));
  const [displayedA, setDisplayedA] = useState<Player | null>(null);
  const [displayedB, setDisplayedB] = useState<Player | null>(null);
  const [isSpinning, setIsSpinning] = useState(true);

  useEffect(() => {
    if (shuffled.length < 2) {
      setIsSpinning(false);
      return;
    }

    let tick = 0;
    const interval = window.setInterval(() => {
      setDisplayedA(shuffled[tick % shuffled.length]);
      setDisplayedB(shuffled[(tick + Math.floor(shuffled.length / 2) + 1) % shuffled.length]);
      tick += 1;
    }, 95);

    const timeout = window.setTimeout(() => {
      window.clearInterval(interval);
      const a = shuffled[0];
      const b = shuffled[1];
      setDisplayedA(a);
      setDisplayedB(b);
      setIsSpinning(false);
      window.setTimeout(() => onComplete(a, b), 650);
    }, 1850);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div role="dialog" aria-modal="true" aria-label="Random match" className="anim-fade fixed inset-0 z-50 grid place-items-center overflow-hidden bg-black p-6 text-center">
      <button type="button" onClick={onClose} disabled={isSpinning} aria-label="Close" className="press absolute right-4 top-[calc(var(--safe-top)+1rem)] grid h-11 w-11 place-items-center rounded-full bg-surface-alt disabled:opacity-30">
        <X className="h-5 w-5" strokeWidth={2.25} />
      </button>
      <div className="grid justify-items-center gap-4">
        <span className={`anim-pop block ${isSpinning ? '[&>span]:animate-spin' : ''}`}>
          <Ball n={8} size={96} />
        </span>
        <h1 className="text-[44px] leading-[.92]">Random match</h1>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="grid justify-items-center gap-2">
            {displayedA ? <PlayerAvatar player={displayedA} size={64} /> : <span className="h-16 w-16 rounded-full bg-surface-alt" />}
            <span className="max-w-[120px] truncate text-sm font-bold">{displayedA?.name.split(' ')[0] ?? ''}</span>
          </div>
          <span className="font-display text-2xl font-extrabold text-white/55">VS</span>
          <div className="grid justify-items-center gap-2">
            {displayedB ? <PlayerAvatar player={displayedB} size={64} /> : <span className="h-16 w-16 rounded-full bg-surface-alt" />}
            <span className="max-w-[120px] truncate text-sm font-bold">{displayedB?.name.split(' ')[0] ?? ''}</span>
          </div>
        </div>
        <p className="font-semibold text-white/70">
          {shuffled.length < 2 ? 'Add another player before a random match.' : isSpinning ? 'Picking two players' : 'Match found. Setting it up.'}
        </p>
      </div>
    </div>
  );
};
