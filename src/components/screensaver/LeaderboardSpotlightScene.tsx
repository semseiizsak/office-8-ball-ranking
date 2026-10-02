import React from 'react';
import { Player } from '../../types';
import { LeagueInsights } from '../../utils/league';
import { PlayerAvatar } from '../ui';

/** A calmer beat between the goofy ones: the current top 3, medal colors lifted straight from the real ladder. */
export const LeaderboardSpotlightScene: React.FC<{ players: Player[]; league: LeagueInsights }> = ({ players, league }) => {
  const top3 = [...players]
    .filter((player) => !league.insights.get(player.id)?.isDormant)
    .sort((a, b) => b.elo - a.elo)
    .slice(0, 3);

  if (top3.length === 0) return null;

  return (
    <div className="relative grid w-full flex-1 content-center gap-6 px-8">
      <h2 className="wa-in text-center font-display text-3xl font-extrabold uppercase" style={{ ['--wa' as string]: 'wa-rise' }}>
        Top of the ladder
      </h2>
      <div className="grid gap-3">
        {top3.map((player, index) => (
          <div
            key={player.id}
            className="wa-in flex items-center gap-3 rounded-2xl bg-card p-4"
            style={{ ['--wa' as string]: 'wa-rise', animationDelay: `${index * 150}ms` }}
          >
            <span className={`grid h-9 w-9 flex-none place-items-center rounded-full text-sm font-black tabular-nums ${
              index === 0 ? 'bg-bg text-crown' : index === 1 ? 'bg-silver text-bg' : 'bg-bronze text-white'
            }`}>
              {index + 1}
            </span>
            <PlayerAvatar player={player} size={44} />
            <span className="flex-1 truncate text-lg font-bold">{player.name.split(' ')[0]}</span>
            <span className="text-xl font-black tabular-nums">{player.elo}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
