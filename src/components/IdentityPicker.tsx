import React, { useState } from 'react';
import { Plus, Check, UserRound } from 'lucide-react';
import { BallPreference, Player } from '../types';

interface IdentityPickerProps {
  players: Player[];
  onSelect: (player: Player) => void;
  onAdd: (params: { name: string; ballPreference: BallPreference }) => Promise<Player>;
}

export const IdentityPicker: React.FC<IdentityPickerProps> = ({ players, onSelect, onAdd }) => {
  const [showAdd, setShowAdd] = useState(players.length === 0);
  const [name, setName] = useState('');
  const [ballPreference, setBallPreference] = useState<BallPreference>('solids');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const handleAdd = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      setIsSaving(true);
      setError('');
      const player = await onAdd({ name: name.trim(), ballPreference });
      onSelect(player);
    } catch {
      setError('Could not create your player. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A0A0A] px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0A0A0A] p-5 shadow-2xl">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 text-white">
            <UserRound className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-xl font-black text-white">Who are you?</h2>
            <p className="text-xs text-white/55">Choose your league profile for this device.</p>
          </div>
        </div>

        {!showAdd && (
          <div className="space-y-2">
            {players.map((player) => (
              <button
                key={player.id}
                type="button"
                onClick={() => onSelect(player)}
                className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-[#111111] p-3 text-left transition-colors hover:border-white hover:bg-[#171717]"
              >
                {player.avatarUrl ? (
                  <img src={player.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#222222] font-display font-bold text-white">
                    {player.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="flex-1">
                  <span className="block font-display text-sm font-bold text-white">{player.name}</span>
                  <span className="block font-sans tabular-nums text-[10px] text-white/55">{player.elo} ELO</span>
                </span>
                <Check className="h-4 w-4 text-white/55" />
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/60 p-3 font-display text-sm font-bold text-white hover:bg-white/10"
            >
              <Plus className="h-4 w-4" /> Add a new player
            </button>
          </div>
        )}

        {showAdd && (
          <form onSubmit={handleAdd} className="space-y-3">
            <label className="block text-xs font-medium text-white/55">
              Your name
              <input
                autoFocus
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-[#111111] px-3 py-3 text-sm text-white outline-none focus:border-white"
                placeholder="e.g. Roland Varga"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['solids', 'stripes'] as const).map((preference) => (
                <button
                  key={preference}
                  type="button"
                  onClick={() => setBallPreference(preference)}
                  className={`rounded-xl border px-3 py-2 text-xs font-bold capitalize ${ballPreference === preference ? 'border-white bg-white/15 text-white' : 'border-white/10 bg-[#111111] text-white/55'}`}
                >
                  {preference}
                </button>
              ))}
            </div>
            {error && <p className="text-xs text-[#FF6B7D]">{error}</p>}
            <button disabled={isSaving || !name.trim()} className="w-full rounded-xl bg-white px-4 py-3 font-display text-sm font-bold text-[#0A0A0A] disabled:opacity-50">
              {isSaving ? 'Creating...' : 'Create and continue'}
            </button>
            {players.length > 0 && (
              <button type="button" onClick={() => setShowAdd(false)} className="w-full py-2 text-xs text-white/55 hover:text-white">
                Back to player list
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
};
