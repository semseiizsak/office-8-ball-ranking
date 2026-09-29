import React, { useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { Player } from '../types';
import { readImage } from '../utils/image';
import { playerBall } from '../utils/balls';
import { BallPicker, PlayerAvatar, Sheet, SponsorPicker, labelClass } from './ui';

/**
 * The first open of a new season: pick the photo, ball and sponsor for it.
 * They go on every new card this season and stay fixed until it ends. Picks
 * made last season come prefilled.
 */
export const SeasonLookSheet: React.FC<{
  player: Player;
  seasonName: string;
  onConfirm: (look: { avatarUrl: string; ball: number; sponsor: string }) => Promise<void>;
}> = ({ player, seasonName, onConfirm }) => {
  const [avatarUrl, setAvatarUrl] = useState(player.avatarUrl);
  const [ball, setBall] = useState(player.nextBall ?? playerBall(player));
  const [sponsor, setSponsor] = useState(player.nextSponsor !== undefined ? player.nextSponsor : player.sponsor ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const pickPhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setAvatarUrl(await readImage(file));
      setError('');
    } catch {
      setError('That image could not be loaded.');
    }
  };

  const confirm = async () => {
    setSaving(true);
    try {
      await onConfirm({ avatarUrl, ball, sponsor });
    } catch {
      setError('Could not save. Try again.');
      setSaving(false);
    }
  };

  return (
    <Sheet title="New season" label="Your look for the new season" onClose={() => void confirm()} closeDisabled={saving} z={65}>
      <div className="grid gap-4 pb-6">
        <p className="rounded-xl bg-surface p-3 text-sm font-semibold text-white/80">
          {seasonName} starts now. Your photo, ball and sponsor go on every new card this season, and stay fixed until it ends.
        </p>
        <div className="flex items-center gap-4">
          <label className="relative block h-[84px] w-[84px] flex-none cursor-pointer" aria-label="Choose a profile picture">
            <PlayerAvatar player={{ id: player.id, name: player.name, avatarUrl, ball }} size={84} />
            <span className="absolute -bottom-1 -left-1 grid h-9 w-9 place-items-center rounded-full bg-white text-bg">
              <ImagePlus className="h-4 w-4" strokeWidth={2.5} />
            </span>
            <input type="file" accept="image/*" onChange={pickPhoto} className="sr-only" />
          </label>
          <p className="min-w-0 text-sm text-white/70">Tap the photo for a new one, or keep this one.</p>
        </div>
        <div className={labelClass}>
          Your ball
          <BallPicker value={ball} onChange={setBall} />
        </div>
        <div className={labelClass}>
          Your sponsor
          <SponsorPicker value={sponsor} onChange={setSponsor} />
        </div>
        {error && <p role="alert" className="rounded-xl bg-surface-alt p-3 text-sm font-semibold">{error}</p>}
        <button
          type="button"
          onClick={() => void confirm()}
          disabled={saving}
          className="press h-12 rounded-full bg-white text-[13px] font-extrabold uppercase tracking-[0.06em] text-bg disabled:opacity-50"
        >
          {saving ? 'Saving' : `Lock it in for ${seasonName}`}
        </button>
      </div>
    </Sheet>
  );
};
