import React, { useState } from 'react';
import { ChevronRight, Moon, Search } from 'lucide-react';
import { Player, MatchRecord } from '../types';
import { LeagueInsights, DORMANT_AFTER_DAYS } from '../utils/league';
import { CrownBanner } from './CrownBanner';
import { TitleBadges } from './TitleBadges';

interface LeaderboardViewProps {
  players: Player[];
  matches: MatchRecord[];
  league: LeagueInsights;
  currentPlayer: Player | null;
  onSelectPlayer: (player: Player) => void;
  onChallenge: (player: Player) => void;
}

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({
  players,
  matches,
  league,
  currentPlayer,
  onSelectPlayer,
  onChallenge,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const sortedPlayers = [...players].sort((a, b) => b.elo - a.elo);

  // Dormant players keep their rating but drop out of the live ladder, so the
  // ranking answers "who is good now" rather than "who played a lot in March".
  const active = sortedPlayers.filter((player) => !league.insights.get(player.id)?.isDormant);
  const dormant = sortedPlayers.filter((player) => league.insights.get(player.id)?.isDormant);

  let worstStreakPlayerId: string | null = null;
  let worstStreak = 0;
  active.forEach((player) => {
    if (player.currentStreak < 0 && player.currentStreak < worstStreak) {
      worstStreak = player.currentStreak;
      worstStreakPlayerId = player.id;
    }
  });

  const matchesQuery = (player: Player) =>
    player.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (player.department ?? '').toLowerCase().includes(searchQuery.toLowerCase());

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

  const renderRow = (player: Player, rank: number, isDormantRow: boolean) => {
    const insight = league.insights.get(player.id);
    const titles = league.titlesByPlayer.get(player.id) ?? [];
    const isFireStreak = player.currentStreak >= 3;
    const isColdStreak = player.id === worstStreakPlayerId && worstStreak < 0;
    const totalGames = player.wins + player.losses;
    const winRate = totalGames > 0 ? Math.round((player.wins / totalGames) * 100) : 0;

    return (
      <div
        key={player.id}
        id={`player-row-${player.id}`}
        onClick={() => onSelectPlayer(player)}
        className={`group relative flex items-center justify-between p-3.5 rounded-xl bg-[#161b22] hover:bg-[#1c2026] border border-[#30363d] transition-all duration-150 cursor-pointer active:scale-[0.99] ${
          isDormantRow ? 'opacity-55' : getRankBorder(rank - 1)
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-6 text-center shrink-0">
            <span
              className={`font-['JetBrains_Mono'] text-base font-black ${
                isDormantRow ? 'text-[#86948a]' : getRankNumberColor(rank - 1)
              }`}
            >
              {isDormantRow ? '–' : rank}
            </span>
          </div>

          <div className="shrink-0">
            {player.avatarUrl ? (
              <img
                src={player.avatarUrl}
                alt={player.name}
                referrerPolicy="no-referrer"
                className="w-11 h-11 rounded-full object-cover border border-[#30363d]"
              />
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[#30363d] bg-[#262a31] font-['Chivo'] text-sm font-bold text-[#4edea3]">
                {player.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          <div className="min-w-0 pr-1">
            <div className="flex items-center gap-1.5">
              <h3 className="font-['Chivo'] text-sm font-bold text-white truncate group-hover:text-[#4edea3] transition-colors">
                {player.name}
              </h3>
              <TitleBadges titles={titles} />

              {!isDormantRow && isFireStreak && (
                <span
                  title={`Active win streak: ${player.currentStreak} matches`}
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-['JetBrains_Mono'] font-extrabold bg-[#ffb95f]/20 text-[#ffb95f] border border-[#ffb95f]/30 shrink-0"
                >
                  🔥 {player.currentStreak}W
                </span>
              )}

              {!isDormantRow && isColdStreak && (
                <span
                  title={`Longest active losing streak: ${Math.abs(player.currentStreak)} matches`}
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-['JetBrains_Mono'] font-extrabold bg-[#38bdf8]/15 text-[#38bdf8] border border-[#38bdf8]/30 shrink-0"
                >
                  🥶 L{Math.abs(player.currentStreak)}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[#86948a] font-['Space_Grotesk']">
              {isDormantRow ? (
                <span>
                  {insight?.daysSincePlayed === null
                    ? 'Never played'
                    : `Idle ${insight?.daysSincePlayed} days`}
                </span>
              ) : (
                <>
                  <span>
                    {player.wins}W - {player.losses}L
                  </span>
                  <span>•</span>
                  <span className="text-[#bbcabf] font-medium">{winRate}% Win</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 text-right">
          <div>
            <div
              className={`font-['JetBrains_Mono'] text-lg font-black tracking-tight ${
                isDormantRow ? 'text-[#86948a]' : 'text-[#4edea3]'
              }`}
            >
              {player.elo}
            </div>
            <div className="flex items-center justify-end gap-1 mt-1">
              {player.recentForm.slice(0, 4).map((res, index) => (
                <span
                  key={index}
                  className={`w-1.5 h-1.5 rounded-full ${res === 'W' ? 'bg-[#10b981]' : 'bg-[#ef4444]'}`}
                  title={res === 'W' ? 'Win' : 'Loss'}
                />
              ))}
            </div>
          </div>

          <ChevronRight className="w-4 h-4 text-[#86948a] group-hover:text-white group-hover:translate-x-0.5 transition-all" />
        </div>
      </div>
    );
  };

  const visibleActive = active.filter(matchesQuery);
  const visibleDormant = dormant.filter(matchesQuery);

  return (
    <div id="leaderboard-view" className="space-y-4 pb-24 pt-1">
      <div className="px-1">
        <h2 className="font-['Chivo'] text-2xl font-black text-white tracking-tight">
          Office Pool Power Rankings
        </h2>
        <p className="text-xs text-[#86948a] font-['Space_Grotesk'] mt-0.5">
          Realtime Elo ratings • Season 1 Championship
        </p>
      </div>

      <div className="px-1">
        <CrownBanner
          crown={league.crown}
          players={players}
          currentPlayer={currentPlayer}
          onChallenge={onChallenge}
        />
      </div>

      {league.titles.length > 0 && (
        <div className="px-1">
          <div className="rounded-2xl border border-[#30363d] bg-[#161b22] p-3">
            <span className="font-['JetBrains_Mono'] text-[10px] font-extrabold uppercase tracking-widest text-[#86948a]">
              Titles held
            </span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {league.titles.map((title) => (
                <span
                  key={title.key}
                  title={`${title.blurb} (${title.valueLabel})`}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#3c4a42] bg-[#1c2026] px-2 py-1 font-['Space_Grotesk'] text-[11px] text-[#bbcabf]"
                >
                  <span>{title.emoji}</span>
                  <span className="font-bold text-white">{title.label}</span>
                  <span className="text-[#86948a]">{title.holderName.split(' ')[0]}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 px-1">
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-2.5 text-center">
          <span className="block text-[10px] font-['JetBrains_Mono'] uppercase tracking-wider text-[#86948a]">
            Active
          </span>
          <span className="font-['JetBrains_Mono'] text-lg font-black text-white">{active.length}</span>
        </div>
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-2.5 text-center">
          <span className="block text-[10px] font-['JetBrains_Mono'] uppercase tracking-wider text-[#86948a]">
            Top Rating
          </span>
          <span className="font-['JetBrains_Mono'] text-lg font-black text-[#4edea3]">
            {active[0]?.elo ?? sortedPlayers[0]?.elo ?? 1000}
          </span>
        </div>
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-2.5 text-center">
          <span className="block text-[10px] font-['JetBrains_Mono'] uppercase tracking-wider text-[#86948a]">
            Total Clashes
          </span>
          <span className="font-['JetBrains_Mono'] text-lg font-black text-[#ffb95f]">{matches.length}</span>
        </div>
      </div>

      <div className="relative px-1">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86948a]" />
        <input
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
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

      <div className="space-y-2.5 px-1">
        {visibleActive.map((player) => renderRow(player, active.indexOf(player) + 1, false))}

        {visibleActive.length === 0 && visibleDormant.length === 0 && (
          <div className="text-center py-10 rounded-xl bg-[#161b22] border border-[#30363d] p-6">
            <p className="text-sm text-[#86948a] font-['Space_Grotesk']">
              {searchQuery ? `No contenders found matching "${searchQuery}"` : 'No matches logged yet.'}
            </p>
          </div>
        )}
      </div>

      {visibleDormant.length > 0 && (
        <div className="space-y-2.5 px-1">
          <span className="flex items-center gap-1.5 font-['JetBrains_Mono'] text-[11px] font-extrabold uppercase tracking-widest text-[#86948a]">
            <Moon className="h-3.5 w-3.5" />
            Dormant · no match in {DORMANT_AFTER_DAYS} days
          </span>
          {visibleDormant.map((player) => renderRow(player, 0, true))}
        </div>
      )}
    </div>
  );
};
