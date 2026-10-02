import React, { useMemo } from 'react';
import { Player } from '../../types';
import { BallBurst, PlayerAvatar } from '../ui';

const STAT_PICKS = ['elo', 'wins', 'currentStreak', 'peakElo'] as const;
const STAT_LABELS: Record<(typeof STAT_PICKS)[number], string> = {
  elo: 'Current rating',
  wins: 'Total wins',
  currentStreak: 'Current streak',
  peakElo: 'Peak rating',
};
const ENTRANCES = ['wa-slam', 'wa-zoom', 'wa-blur', 'wa-tilt'];

export const StatSpotlightScene: React.FC<{ player?: Player }> = ({ player }) => {
  const stat = useMemo(() => STAT_PICKS[Math.floor(Math.random() * STAT_PICKS.length)], []);
  const entrance = useMemo(() => ENTRANCES[Math.floor(Math.random() * ENTRANCES.length)], []);
  if (!player) return null;

  const value = stat === 'currentStreak'
    ? `${player.currentStreak > 0 ? '+' : ''}${player.currentStreak}`
    : String(player[stat]);

  return (
    <div className="relative grid w-full flex-1 place-items-center">
      <BallBurst />
      <div className="wa-in relative grid justify-items-center gap-3" style={{ ['--wa' as string]: entrance }}>
        <PlayerAvatar player={player} size={140} />
        <h2 className="font-display text-4xl font-extrabold uppercase">{player.name.split(' ')[0]}</h2>
        <p className="text-sm font-semibold uppercase tracking-[0.1em] text-white/55">{STAT_LABELS[stat]}</p>
        <p className="text-6xl font-black tabular-nums">{value}</p>
      </div>
    </div>
  );
};
