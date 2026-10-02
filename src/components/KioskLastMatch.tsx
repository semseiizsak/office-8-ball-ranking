import React from 'react';
import { MatchRecord, Player } from '../types';
import { PlayerAvatar } from './ui';

/** One line: who just played, who won, what it was worth. */
export const KioskLastMatch: React.FC<{ match: MatchRecord; players: Player[] }> = ({ match, players }) => {
  const byId = new Map(players.map((player) => [player.id, player]));
  const winnerIsA = match.winnerId === match.playerAId;
  const winnerName = winnerIsA ? match.playerAName : match.playerBName;
  const loserName = winnerIsA ? match.playerBName : match.playerAName;
  const winner = byId.get(match.winnerId) ?? { id: match.winnerId, name: winnerName, avatarUrl: '' };
  const loser = byId.get(match.loserId) ?? { id: match.loserId, name: loserName, avatarUrl: '' };
  const gain = match.eloDelta + match.bountyCollected;
  const extras = [
    match.isUpset && '😱',
    match.bountyCollected > 0 && '👑',
    match.modifiers.tableRun && '🏃',
    match.modifiers.eightOnBreak && '💥',
    match.modifiers.scratchOnEight && '❌',
  ].filter(Boolean) as string[];

  return (
    <div className="card-drop mt-3 flex items-center gap-2.5 rounded-2xl bg-card p-3">
      <span className="flex-none text-[10px] font-extrabold uppercase tracking-[0.1em] text-white/55">Last match</span>
      <div className="ml-auto flex min-w-0 items-center gap-1.5">
        <PlayerAvatar player={winner} size={30} />
        <span className="truncate text-sm font-bold">{winnerName.split(' ')[0]}</span>
        <span className="flex-none rounded-full bg-felt px-2 py-0.5 text-[10px] font-extrabold uppercase text-white">+{gain}</span>
        <span className="flex-none text-xs font-semibold text-white/55">vs</span>
        <span className="truncate text-sm font-bold text-white/55">{loserName.split(' ')[0]}</span>
        <PlayerAvatar player={loser} size={30} />
      </div>
      {extras.length > 0 && <span className="flex-none text-sm">{extras.join(' ')}</span>}
    </div>
  );
};
