import React, { useEffect, useState } from 'react';
import { ImagePlus, RotateCw, Save, X } from 'lucide-react';
import { BallPreference, Player } from '../types';
import { hardRefresh } from '../utils/refresh';
import { readImage } from '../utils/image';

interface ProfileModalProps {
  player: Player | null;
  onClose: () => void;
  onSwitchPlayer: () => void;
  onSave: (updates: Pick<Player, 'name' | 'department' | 'title' | 'avatarUrl' | 'ballPreference'>) => Promise<void>;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ player, onClose, onSwitchPlayer, onSave }) => {
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  const [title, setTitle] = useState('');
  const [ballPreference, setBallPreference] = useState<BallPreference>('solids');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!player) return;
    setName(player.name);
    setDepartment(player.department ?? '');
    setTitle(player.title ?? '');
    setBallPreference(player.ballPreference);
    setAvatarUrl(player.avatarUrl);
    setError('');
  }, [player]);

  if (!player) return null;

  const handleImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setAvatarUrl(await readImage(file));
      setError('');
    } catch {
      setError('That image could not be loaded.');
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      setIsSaving(true);
      setError('');
      await onSave({ name, department, title, avatarUrl, ballPreference });
      onClose();
    } catch {
      setError('Could not save your profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4 rounded-t-2xl border border-white/10 bg-[#0A0A0A] p-5 shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl font-black text-white">Your profile</h2>
            <p className="text-xs text-white/55">Changes are shared with the league.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-white/55 hover:bg-[#171717] hover:text-white" aria-label="Close profile">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            {avatarUrl ? <img src={avatarUrl} alt="" className="h-20 w-20 rounded-2xl object-cover border border-white/10" /> : <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#222222] font-display text-2xl font-bold text-white">{name.charAt(0).toUpperCase()}</div>}
            <label className="absolute -bottom-2 -right-2 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-[#0A0A0A] bg-white text-[#0A0A0A]" title="Choose profile picture">
              <ImagePlus className="h-4 w-4" />
              <input type="file" accept="image/*" onChange={handleImage} className="sr-only" />
            </label>
          </div>
          <div className="text-xs text-white/55">Choose a picture from your device. It is resized before being stored with your player profile.</div>
        </div>

        <div className="grid gap-3">
          <label className="text-xs font-medium text-white/55">Name<input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-[#111111] px-3 py-2.5 text-sm text-white outline-none focus:border-white" /></label>
          <label className="text-xs font-medium text-white/55">Department<input value={department} onChange={(event) => setDepartment(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-[#111111] px-3 py-2.5 text-sm text-white outline-none focus:border-white" /></label>
          <label className="text-xs font-medium text-white/55">Title<input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-[#111111] px-3 py-2.5 text-sm text-white outline-none focus:border-white" /></label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {(['solids', 'stripes'] as const).map((preference) => (
            <button key={preference} type="button" onClick={() => setBallPreference(preference)} className={`rounded-xl border px-3 py-2 text-xs font-bold capitalize ${ballPreference === preference ? 'border-white bg-white/15 text-white' : 'border-white/10 bg-[#111111] text-white/55'}`}>
              {preference}
            </button>
          ))}
        </div>
        {error && <p className="text-xs text-[#FF6B7D]">{error}</p>}
        <button type="submit" disabled={isSaving || !name.trim()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 font-display text-sm font-bold text-[#0A0A0A] disabled:opacity-50">
          <Save className="h-4 w-4" /> {isSaving ? 'Saving...' : 'Save profile'}
        </button>
        <button type="button" onClick={onSwitchPlayer} disabled={isSaving} className="w-full py-2 text-xs font-medium text-white/55 hover:text-white disabled:opacity-50">
          Switch player / Log out
        </button>

        <div className="border-t border-white/14 pt-2 text-center">
          <button
            type="button"
            onClick={() => hardRefresh()}
            className="inline-flex items-center gap-1.5 py-1 text-[11px] font-sans text-white/55 transition-colors hover:text-white"
          >
            <RotateCw className="h-3 w-3" />
            Hard refresh & check for updates
          </button>
        </div>
      </form>
    </div>
  );
};
