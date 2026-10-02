import React from 'react';
import { MatchRecord, Player } from '../../types';
import { LeagueInsights } from '../../utils/league';

export const FunFactScene: React.FC<{ players: Player[]; matches: MatchRecord[]; league: LeagueInsights }> = ({
  players,
  matches,
  league,
}) => {
  const crownHolder = players.find((player) => player.id === league.crown.holderId);

  return (
    <div className="relative grid w-full flex-1 place-items-center gap-4 px-8 text-center">
      <span className="wa-in text-6xl" style={{ ['--wa' as string]: 'wa-zoom' }}>🎱</span>
      <p className="wa-in text-2xl font-bold" style={{ ['--wa' as string]: 'wa-rise', animationDelay: '150ms' }}>
        {matches.length} matches played this season
      </p>
      {crownHolder && (
        <p className="wa-in text-base font-semibold text-white/70" style={{ ['--wa' as string]: 'wa-rise', animationDelay: '300ms' }}>
          👑 {crownHolder.name.split(' ')[0]} holds the crown{league.crown.bounty > 0 ? ` — ${league.crown.bounty} bounty riding` : ''}
        </p>
      )}
    </div>
  );
};
