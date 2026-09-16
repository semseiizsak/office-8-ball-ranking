import React, { useState } from 'react';
import { Search, Flame, Snowflake, Trophy, TrendingUp, Sparkles, ChevronRight } from 'lucide-react';
import { Player, MatchRecord } from '../types';
import { formatStreak } from '../utils/elo';

interface LeaderboardViewProps {
  players: Player[];
  matches: MatchRecord[];
  onSelectPlayer: (player: Player) => void;
  onNavigateToLog: (playerA?: Player, playerB?: Player) => void;
}

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({
  players,
  matches,
  onSelectPlayer,
  onNavigateToLog,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  // Sort players by Elo rating descending
  const sortedPlayers = [...players].sort((a, b) => b.elo - a.elo);

  // Determine the player with the current longest losing streak
  // (currentStreak < 0, minimal value, e.g. -4 is worse than -2)
  let worstStreakPlayerId: string | null = null;
  let worstStreak = 0; // tracking negative numbers
  sortedPlayers.forEach((p) => {
    if (p.currentStreak < 0 && p.currentStreak < worstStreak) {
      worstStreak = p.currentStreak;
      worstStreakPlayerId = p.id;
    }
  });

  const filteredPlayers = sortedPlayers.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.department && p.department.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const getRankBorder = (index: number) => {
    if (index === 0) return 'border-l-4 border-l-[#f59e0b] shadow-[inset_4px_0_12px_rgba(245,158,11,0.15)]';
    if (index === 1) return 'border-l-4 border-l-[#94a3b8] shadow-[inset_4px_0_12px_rgba(148,163,184,0.1)]';
    if (index === 2) return 'border-l-4 border-l-[#d97706] shadow-[inset_4px_0_12px_rgba(217,119,6,0.15)]';
    return 'border-l-2 border-l-[#30363d]';
  };

  const getRankNumberColor = (index: number) => {
    if (index === 0) return 'text-[#f59e0b] drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]';
    if (index === 1) return 'text-[#94a3b8]';
    if (index === 2) return 'text-[#d97706]';
    return 'text-[#86948a]';
  };

  return (
    <div id="leaderboard-view" className="space-y-4 pb-20 pt-1">
      {/* View Header */}
      <div className="px-1 flex items-end justify-between">
        <div>
          <h2 className="font-['Chivo'] text-2xl font-black text-white tracking-tight">
            Office Pool Power Rankings
          </h2>
          <p className="text-xs text-[#86948a] font-['Space_Grotesk'] mt-0.5">
            Realtime Elo ratings • Season 4 Championship
          </p>
        </div>

        <button
          onClick={() => onNavigateToLog()}
          className="px-3 py-1.5 rounded-lg bg-[#10b981]/15 text-[#4edea3] hover:bg-[#10b981]/25 border border-[#10b981]/30 text-xs font-['Chivo'] font-bold flex items-center gap-1.5 transition-all active:scale-95 shrink-0"
        >
          <span>Quick Match</span>
          <span className="text-sm">⚡</span>
        </button>
      </div>

      {/* Roster Quick Stats Banner */}
      <div className="grid grid-cols-3 gap-2 px-1">
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-2.5 text-center">
          <span className="block text-[10px] font-['JetBrains_Mono'] uppercase tracking-wider text-[#86948a]">
            Contenders
          </span>
          <span className="font-['JetBrains_Mono'] text-lg font-black text-white">
            {players.length}
          </span>
        </div>
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-2.5 text-center">
          <span className="block text-[10px] font-['JetBrains_Mono'] uppercase tracking-wider text-[#86948a]">
            Top Rating
          </span>
          <span className="font-['JetBrains_Mono'] text-lg font-black text-[#4edea3]">
            {sortedPlayers[0]?.elo || 1000}
          </span>
        </div>
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-2.5 text-center">
          <span className="block text-[10px] font-['JetBrains_Mono'] uppercase tracking-wider text-[#86948a]">
            Total Clashes
          </span>
          <span className="font-['JetBrains_Mono'] text-lg font-black text-[#ffb95f]">
            {matches.length}
          </span>
        </div>
      </div>

      {/* Search Filter */}
      <div className="relative px-1">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86948a]" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter contenders by name or role..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#161b22] border border-[#30363d] text-white text-xs placeholder:text-[#86948a] focus:outline-none focus:border-[#10b981] focus:ring-1 focus:ring-[#10b981] font-['Space_Grotesk'] transition-all"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[#86948a] hover:text-white"
          >
            Clear
          </button>
        )}
      </div>

      {/* Leaderboard Player List */}
      <div className="space-y-2.5 px-1">
        {filteredPlayers.map((player) => {
          const rank = sortedPlayers.findIndex((p) => p.id === player.id) + 1;
          const isFireStreak = player.currentStreak >= 3;
          const isColdStreak = player.id === worstStreakPlayerId && worstStreak < 0;
          const totalGames = player.wins + player.losses;
          const winRate = totalGames > 0 ? Math.round((player.wins / totalGames) * 100) : 0;

          return (
            <div
              key={player.id}
              id={`player-row-${player.id}`}
              onClick={() => onSelectPlayer(player)}
              className={`group relative flex items-center justify-between p-3.5 rounded-xl bg-[#161b22] hover:bg-[#1c2026] border border-[#30363d] transition-all duration-150 cursor-pointer active:scale-[0.99] ${getRankBorder(
                rank - 1
              )}`}
            >
              {/* Left Column: Rank + Avatar + Name Details */}
              <div className="flex items-center gap-3 min-w-0">
                {/* Rank Number */}
                <div className="w-6 text-center shrink-0">
                  <span
                    className={`font-['JetBrains_Mono'] text-base font-black ${getRankNumberColor(
                      rank - 1
                    )}`}
                  >
                    {rank}
                  </span>
                </div>

                {/* Avatar with Ball Badge */}
                <div className="relative shrink-0">
                  <img
                    src={player.avatarUrl}
                    alt={player.name}
                    referrerPolicy="no-referrer"
                    className="w-11 h-11 rounded-full object-cover border border-[#30363d]"
                  />
                  {/* Ball Type Icon Pip */}
                  <span
                    title={player.ballPreference === 'solids' ? 'Prefers Solids' : 'Prefers Stripes'}
                    className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center border border-[#10141a] text-[8px] font-bold ${
                      player.ballPreference === 'solids'
                        ? 'bg-[#d97706] text-black font-black'
                        : 'bg-[#38bdf8] text-black font-black'
                    }`}
                  >
                    {player.ballPreference === 'solids' ? '●' : '◫'}
                  </span>
                </div>

                {/* Player Name and Badges */}
                <div className="min-w-0 pr-1">
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-['Chivo'] text-sm font-bold text-white truncate group-hover:text-[#4edea3] transition-colors">
                      {player.name}
                    </h3>

                    {/* Streak Badges */}
                    {isFireStreak && (
                      <span
                        title={`Active Win Streak: ${player.currentStreak} matches!`}
                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-['JetBrains_Mono'] font-extrabold bg-[#ffb95f]/20 text-[#ffb95f] border border-[#ffb95f]/30 shrink-0"
                      >
                        🔥 {player.currentStreak}W
                      </span>
                    )}

                    {isColdStreak && (
                      <span
                        title={`Longest Active Losing Streak: ${Math.abs(player.currentStreak)} matches`}
                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-['JetBrains_Mono'] font-extrabold bg-[#38bdf8]/15 text-[#38bdf8] border border-[#38bdf8]/30 shrink-0"
                      >
                        🥶 L{Math.abs(player.currentStreak)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[#86948a] font-['Space_Grotesk']">
                    <span>
                      {player.wins}W - {player.losses}L
                    </span>
                    <span>•</span>
                    <span className="text-[#bbcabf] font-medium">{winRate}% Win</span>
                  </div>
                </div>
              </div>

              {/* Right Column: Elo Rating & Form */}
              <div className="flex items-center gap-3 shrink-0 text-right">
                <div>
                  <div className="font-['JetBrains_Mono'] text-lg font-black text-[#4edea3] tracking-tight">
                    {player.elo}
                  </div>
                  {/* Recent Form Dots */}
                  <div className="flex items-center justify-end gap-1 mt-1">
                    {player.recentForm.slice(0, 4).map((res, i) => (
                      <span
                        key={i}
                        className={`w-1.5 h-1.5 rounded-full ${
                          res === 'W' ? 'bg-[#10b981]' : 'bg-[#ef4444]'
                        }`}
                        title={res === 'W' ? 'Win' : 'Loss'}
                      />
                    ))}
                  </div>
                </div>

                <ChevronRight className="w-4 h-4 text-[#86948a] group-hover:text-white group-hover:translate-x-0.5 transition-all" />
              </div>
            </div>
          );
        })}

        {filteredPlayers.length === 0 && (
          <div className="text-center py-10 rounded-xl bg-[#161b22] border border-[#30363d] p-6">
            <p className="text-sm text-[#86948a] font-['Space_Grotesk']">
              No contenders found matching "{searchQuery}"
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
