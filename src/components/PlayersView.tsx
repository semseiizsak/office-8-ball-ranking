import React, { useState } from 'react';
import { UserPlus, Search, ChevronRight, Flame, Moon, Snowflake, Sparkles, Swords } from 'lucide-react';
import { Player, BallPreference, MatchRecord } from '../types';
import { formatStreak } from '../utils/elo';
import { LeagueInsights, findTopRival } from '../utils/league';
import { TitleBadges } from './TitleBadges';

interface PlayersViewProps {
  players: Player[];
  matches: MatchRecord[];
  league: LeagueInsights;
  onAddPlayer: (params: {
    name: string;
    department?: string;
    title?: string;
    ballPreference: BallPreference;
  }) => Promise<void>;
  onSelectPlayer: (player: Player) => void;
  onChallengePlayer: (player: Player) => void;
}

export const PlayersView: React.FC<PlayersViewProps> = ({
  players,
  matches,
  league,
  onAddPlayer,
  onSelectPlayer,
  onChallengePlayer,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  const [ballPreference, setBallPreference] = useState<BallPreference>('solids');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sortedPlayers = [...players].sort((a, b) => b.elo - a.elo);

  const filteredPlayers = sortedPlayers.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.department && p.department.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      setIsSubmitting(true);
      await onAddPlayer({
        name: name.trim(),
        department: department.trim() || undefined,
        ballPreference,
      });
      setName('');
      setDepartment('');
      setShowAddForm(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div id="players-management-view" className="space-y-4 pb-20 pt-1">
      {/* View Header */}
      <div className="flex items-center justify-between px-1">
        <div>
          <h2 className="font-['Chivo'] text-2xl font-black text-white tracking-tight">
            League Roster
          </h2>
          <p className="text-xs text-[#86948a] font-['Space_Grotesk'] mt-0.5">
            {players.length} Registered Contenders • Base 1000 ELO
          </p>
        </div>

        <button
          id="btn-toggle-add-player"
          onClick={() => setShowAddForm(!showAddForm)}
          className={`px-3 py-2 rounded-xl text-xs font-['Chivo'] font-bold flex items-center gap-1.5 transition-all shadow-sm ${
            showAddForm
              ? 'bg-[#1c2026] text-white border border-[#30363d]'
              : 'bg-[#10b981] text-[#002113] hover:bg-[#4edea3] shadow-[0_0_12px_rgba(16,185,129,0.3)]'
          }`}
        >
          <UserPlus className="w-4 h-4" />
          <span>{showAddForm ? 'Cancel' : 'New Player'}</span>
        </button>
      </div>

      {/* Add Player Expandable Card */}
      {showAddForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl bg-[#161b22] border border-[#10b981]/50 p-4 space-y-3 shadow-lg animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="flex items-center justify-between pb-2 border-b border-[#30363d]">
            <span className="font-['Chivo'] text-sm font-bold text-white flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-[#4edea3]" />
              Enroll Contender
            </span>
            <span className="font-['JetBrains_Mono'] text-[10px] text-[#4edea3] font-bold">
              Base Rating: 1000 ELO
            </span>
          </div>

          <div className="space-y-2">
            <div>
              <label className="block text-[11px] font-['Space_Grotesk'] font-medium text-[#86948a] mb-1">
                Player Full Name *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Roland Varga"
                className="w-full px-3 py-2.5 rounded-xl bg-[#1c2026] border border-[#30363d] text-white text-xs placeholder:text-[#86948a] focus:outline-none focus:border-[#10b981] font-['Space_Grotesk']"
              />
            </div>

            <div>
              <label className="block text-[11px] font-['Space_Grotesk'] font-medium text-[#86948a] mb-1">
                Department / Role (Optional)
              </label>
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g. Product Engineering"
                className="w-full px-3 py-2.5 rounded-xl bg-[#1c2026] border border-[#30363d] text-white text-xs placeholder:text-[#86948a] focus:outline-none focus:border-[#10b981] font-['Space_Grotesk']"
              />
            </div>

            <div>
              <label className="block text-[11px] font-['Space_Grotesk'] font-medium text-[#86948a] mb-1">
                Ball Preference
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setBallPreference('solids')}
                  className={`py-2 px-3 rounded-xl border text-xs font-['Chivo'] font-bold flex items-center justify-center gap-2 transition-all ${
                    ballPreference === 'solids'
                      ? 'bg-[#10b981]/20 border-[#10b981] text-[#4edea3]'
                      : 'bg-[#1c2026] border-[#30363d] text-[#86948a]'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-[#d97706]"></span>
                  <span>Solids</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBallPreference('stripes')}
                  className={`py-2 px-3 rounded-xl border text-xs font-['Chivo'] font-bold flex items-center justify-center gap-2 transition-all ${
                    ballPreference === 'stripes'
                      ? 'bg-[#ffb95f]/20 border-[#ffb95f] text-[#ffb95f]'
                      : 'bg-[#1c2026] border-[#30363d] text-[#86948a]'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-[#38bdf8]"></span>
                  <span>Stripes</span>
                </button>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !name.trim()}
            className="w-full py-2.5 px-4 rounded-xl bg-[#10b981] hover:bg-[#4edea3] text-[#002113] font-['Chivo'] font-bold text-xs tracking-wider transition-all disabled:opacity-50"
          >
            {isSubmitting ? 'Adding...' : 'Add Contender (1000 ELO)'}
          </button>
        </form>
      )}

      {/* Search Filter */}
      <div className="relative px-1">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86948a]" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search roster by name or squad..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#161b22] border border-[#30363d] text-white text-xs placeholder:text-[#86948a] focus:outline-none focus:border-[#10b981] font-['Space_Grotesk']"
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

      {/* Player Roster Cards with Fun Stats Preview */}
      <div className="space-y-3 px-1">
        {filteredPlayers.map((player) => {
          const rank = sortedPlayers.findIndex((p) => p.id === player.id) + 1;
          const rival = findTopRival(player.id, players, matches);
          const insight = league.insights.get(player.id);
          const titles = league.titlesByPlayer.get(player.id) ?? [];
          const streakLabel = formatStreak(player.currentStreak);

          return (
            <div
              key={player.id}
              onClick={() => onSelectPlayer(player)}
              className="group p-4 rounded-2xl bg-[#161b22] hover:bg-[#1c2026] border border-[#30363d] transition-all cursor-pointer shadow-sm active:scale-[0.99]"
            >
              {/* Top Row: Avatar, Identity, Rating */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    {player.avatarUrl ? (
                      <img
                        src={player.avatarUrl}
                        alt={player.name}
                        referrerPolicy="no-referrer"
                        className="w-12 h-12 rounded-xl object-cover border border-[#30363d]"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#30363d] bg-[#262a31] font-['Chivo'] text-lg font-bold text-[#4edea3]">
                        {player.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="absolute -top-1.5 -left-1.5 px-1.5 py-0.2 rounded text-[9px] font-['JetBrains_Mono'] font-extrabold bg-[#262a31] text-[#dfe2eb] border border-[#3c4a42]">
                      #{rank}
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-['Chivo'] text-base font-bold text-white group-hover:text-[#4edea3] transition-colors">
                        {player.name}
                      </h3>
                      <TitleBadges titles={titles} />
                    </div>
                    <p className="text-xs text-[#86948a] font-['Space_Grotesk']">
                      {player.department}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-['JetBrains_Mono'] text-lg font-black text-[#4edea3]">
                    {player.elo}
                  </div>
                  <div className="text-[10px] text-[#86948a] font-['JetBrains_Mono']">
                    {player.wins}W - {player.losses}L
                  </div>
                </div>
              </div>

              {/* Real head-to-head ledger plus current form. */}
              <div className="mt-3 pt-3 border-t border-[#30363d]/60 grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded-lg bg-[#1c2026] border border-[#30363d]/80">
                  <span className="block text-[9px] font-['JetBrains_Mono'] font-bold text-[#ffb95f] uppercase tracking-wider flex items-center gap-1">
                    <Swords className="w-3 h-3" /> Biggest Rivalry
                  </span>
                  <span className="font-['Space_Grotesk'] font-bold text-white text-xs truncate block mt-0.5">
                    {rival ? rival.opponentName.split(' ')[0] : 'None yet'}
                  </span>
                  <span className="text-[10px] text-[#86948a] block font-['JetBrains_Mono']">
                    {rival ? `${rival.wins}–${rival.losses} in ${rival.meetings}` : 'No matches'}
                  </span>
                </div>

                {/* Current Streak */}
                <div className="p-2 rounded-lg bg-[#1c2026] border border-[#30363d]/80">
                  <span className="block text-[9px] font-['JetBrains_Mono'] font-bold text-[#86948a] uppercase tracking-wider flex items-center gap-1">
                    {player.currentStreak >= 0 ? (
                      <Flame className="w-3 h-3 text-[#ffb95f]" />
                    ) : (
                      <Snowflake className="w-3 h-3 text-[#38bdf8]" />
                    )}
                    Current Streak
                  </span>
                  <span
                    className={`font-['JetBrains_Mono'] font-bold text-sm block mt-0.5 ${
                      player.currentStreak > 0
                        ? 'text-[#4edea3]'
                        : player.currentStreak < 0
                        ? 'text-[#ffb4ab]'
                        : 'text-white'
                    }`}
                  >
                    {streakLabel}
                  </span>
                  <span className="text-[10px] text-[#86948a] block font-['Space_Grotesk']">
                    {player.currentStreak >= 3
                      ? '🔥 On Fire'
                      : player.currentStreak <= -3
                      ? '🥶 Slump'
                      : 'Active'}
                  </span>
                </div>
              </div>

              {insight?.isDormant && (
                <p className="mt-2.5 flex items-center gap-1.5 rounded-lg border border-[#30363d] bg-[#1c2026] px-2 py-1.5 font-['Space_Grotesk'] text-[10px] text-[#86948a]">
                  <Moon className="h-3 w-3 shrink-0" />
                  {insight.daysSincePlayed === null
                    ? 'Has never played — off the active ladder.'
                    : `Idle ${insight.daysSincePlayed} days — off the active ladder.`}
                </p>
              )}

              <div className="mt-2.5 flex items-center justify-between gap-2 pt-1">
                <span className="flex items-center gap-1 font-['Space_Grotesk'] text-[11px] text-[#86948a] group-hover:text-[#bbcabf] transition-colors">
                  <span>View dossier</span>
                  <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onChallengePlayer(player);
                  }}
                  className="flex shrink-0 items-center gap-1 rounded-lg border border-[#30363d] bg-[#1c2026] px-2.5 py-1.5 font-['Chivo'] text-[11px] font-bold text-[#4edea3] transition-all hover:border-[#10b981] active:scale-95"
                >
                  <Swords className="h-3.5 w-3.5" />
                  Challenge
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
