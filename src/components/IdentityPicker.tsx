import React, { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { BallPreference, Player } from '../types';
import { Ball, BallPicker, PlayerAvatar, fieldClass, labelClass } from './ui';

interface IdentityPickerProps {
  players: Player[];
  onSelect: (player: Player) => void;
  onAdd: (params: { name: string; ballPreference: BallPreference; ball?: number }) => Promise<Player>;
  /** Arrived via the kiosk's join QR — skip straight to "add yourself" and show the home-screen hint. */
  startInAddMode?: boolean;
}

/** The first screen on a new phone: pick yourself once. No password, the office trusts you. */
export const IdentityPicker: React.FC<IdentityPickerProps> = ({ players, onSelect, onAdd, startInAddMode = false }) => {
  const [showAdd, setShowAdd] = useState(players.length === 0 || startInAddMode);
  const [name, setName] = useState('');
  const [ball, setBall] = useState(9);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const handleAdd = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      setIsSaving(true);
      setError('');
      const player = await onAdd({ name: name.trim(), ball, ballPreference: ball > 8 ? 'stripes' : 'solids' });
      onSelect(player);
    } catch {
      setError('Could not create your player. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const sorted = [...players].sort((a, b) => b.elo - a.elo);
  const button = 'press flex h-12 w-full items-center justify-center gap-2 rounded-full text-[13px] font-extrabold uppercase tracking-[0.06em] disabled:opacity-50';

  return (
    <div className="min-h-screen bg-bg">
      <div className="mx-auto grid w-full max-w-md gap-4 px-3 pb-[calc(var(--safe-bottom)+1.5rem)] pt-[calc(var(--safe-top)+2.5rem)]">
        <div className="flex justify-center gap-1" aria-hidden="true">
          {[1, 9, 8, 3, 11].map((n, index) => (
            <Ball key={n} n={n} size={40} className="callout-throw" style={{ animationDuration: '640ms', animationDelay: `${index * 70}ms` }} />
          ))}
        </div>
        <h1 className="anim-rise text-center text-[52px] [animation-delay:260ms]">{showAdd ? "You're new" : "Who's playing?"}</h1>
        <p className="anim-rise text-center text-white/70 [animation-delay:340ms]">
          {showAdd ? 'A name and a ball. Everyone starts on 1000.' : 'Pick yourself once on this phone. No password, the office trusts you.'}
        </p>

        {!showAdd ? (
          <>
            <div className="stagger-rows grid gap-0.5">
              {sorted.map((player, index) => (
                <button
                  key={player.id}
                  type="button"
                  onClick={() => onSelect(player)}
                  style={{ ['--j' as string]: Math.min(index, 12) }}
                  className="press grid min-h-[54px] grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl bg-card px-3 py-2.5 text-left hover:bg-[#161616]"
                >
                  <PlayerAvatar player={player} size={34} />
                  <span className="grid min-w-0">
                    <span className="truncate text-sm font-bold">{player.name}</span>
                    {player.department && <span className="truncate text-xs font-semibold text-white/55">{player.department}</span>}
                  </span>
                  <span className="text-[17px] font-black tabular-nums">{player.elo}</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setShowAdd(true)} className={`${button} bg-surface-alt`}>
              <UserPlus className="h-[18px] w-[18px]" strokeWidth={2.25} />
              I'm new here
            </button>
          </>
        ) : (
          <form onSubmit={handleAdd} className="anim-rise grid gap-4">
            <label className={labelClass}>
              Your name
              <input autoFocus required value={name} onChange={(event) => setName(event.target.value)} placeholder="First name" className={fieldClass} />
            </label>
            <div className={labelClass}>
              Pick a ball
              <BallPicker value={ball} onChange={setBall} />
            </div>
            {startInAddMode && (
              <p className="rounded-xl bg-surface-alt px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-white/70">
                📲 After this, add the page to your home screen — Share → Add to Home Screen (iPhone) or the menu → Add to Home screen (Android) — so it opens like an installed app next time.
              </p>
            )}
            {error && <p role="alert" className="text-sm font-bold">{error}</p>}
            <button type="submit" disabled={isSaving || !name.trim()} className={`${button} bg-white text-bg`}>
              {isSaving ? 'Creating' : "Let's play"}
            </button>
            {players.length > 0 && (
              <button type="button" onClick={() => setShowAdd(false)} className={`${button} bg-surface-alt`}>
                Back to the list
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
};
