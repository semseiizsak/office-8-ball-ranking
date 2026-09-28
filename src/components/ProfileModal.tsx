import React, { useEffect, useState } from 'react';
import { ImagePlus, Repeat, RotateCw } from 'lucide-react';
import { Player } from '../types';
import { hardRefresh } from '../utils/refresh';
import { readImage } from '../utils/image';
import { playerBall } from '../utils/balls';
import { BallPicker, PlayerAvatar, Sheet, fieldClass, labelClass } from './ui';

interface ProfileModalProps {
  player: Player | null;
  onClose: () => void;
  onSwitchPlayer: () => void;
  onSave: (updates: Pick<Player, 'name' | 'department' | 'title' | 'avatarUrl' | 'ballPreference' | 'ball'>) => Promise<void>;
}

/** Editing your own profile: photo, name, team, title and the ball you play under. */
export const ProfileModal: React.FC<ProfileModalProps> = ({ player, onClose, onSwitchPlayer, onSave }) => {
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  const [title, setTitle] = useState('');
  const [ball, setBall] = useState(1);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!player) return;
    setName(player.name);
    setDepartment(player.department ?? '');
    setTitle(player.title ?? '');
    setBall(playerBall(player));
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

  const save = async () => {
    if (!name.trim()) return;
    try {
      setIsSaving(true);
      setError('');
      await onSave({ name, department, title, avatarUrl, ball, ballPreference: ball > 8 ? 'stripes' : 'solids' });
      onClose();
    } catch {
      setError('Could not save your profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const button = 'press flex h-12 w-full items-center justify-center gap-2 rounded-full text-[13px] font-extrabold uppercase tracking-[0.06em] disabled:opacity-50';

  return (
    <Sheet
      title="Your profile"
      onClose={onClose}
      closeDisabled={isSaving}
      footer={
        <button type="button" onClick={save} disabled={isSaving || !name.trim()} className={`${button} bg-white text-bg`}>
          {isSaving ? 'Saving' : 'Save profile'}
        </button>
      }
    >
      <div className="flex items-center gap-4">
        <label className="relative cursor-pointer" aria-label="Choose a profile picture">
          <PlayerAvatar player={{ id: player.id, name: name || player.name, avatarUrl, ball }} size={84} />
          <span className="absolute -bottom-1 -left-1 grid h-9 w-9 place-items-center rounded-full bg-white text-bg">
            <ImagePlus className="h-4 w-4" strokeWidth={2.5} />
          </span>
          <input type="file" accept="image/*" onChange={handleImage} className="sr-only" />
        </label>
        <p className="text-sm text-white/70">Tap the photo to pick a new one. Everyone in the office sees your changes.</p>
      </div>
      <label className={labelClass}>Name<input value={name} onChange={(event) => setName(event.target.value)} className={fieldClass} /></label>
      <label className={labelClass}>Team<input value={department} onChange={(event) => setDepartment(event.target.value)} className={fieldClass} /></label>
      <label className={labelClass}>Title<input value={title} onChange={(event) => setTitle(event.target.value)} className={fieldClass} /></label>
      <div className={labelClass}>
        Your ball
        <BallPicker value={ball} onChange={setBall} />
      </div>
      {error && <p role="alert" className="rounded-xl bg-surface-alt p-3 text-sm font-semibold normal-case tracking-normal text-white">{error}</p>}
      <button type="button" onClick={onSwitchPlayer} disabled={isSaving} className={`${button} bg-surface-alt`}>
        <Repeat className="h-[18px] w-[18px]" strokeWidth={2.25} />
        Switch player
      </button>
      <button type="button" onClick={() => hardRefresh()} className="press flex items-center justify-center gap-1.5 py-1 text-xs font-semibold text-white/55 hover:text-white">
        <RotateCw className="h-3.5 w-3.5" />
        Check for updates
      </button>
    </Sheet>
  );
};
