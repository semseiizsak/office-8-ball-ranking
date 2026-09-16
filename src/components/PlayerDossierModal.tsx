import React from 'react';
import { Crown, Flame, Moon, Shield, Snowflake, Swords, Trophy, X } from 'lucide-react';
import { Player, MatchRecord } from '../types';
import { LeagueInsights, findTopRival, RIVALRY_RACE_TARGET } from '../utils/league';
import { TitleBadges } from './TitleBadges';

interface PlayerDossierModalProps {
  player: Player | null;
  rank: number;
  allPlayers: Player[];
  matches: MatchRecord[];
  league: LeagueInsights;
  onClose: () => void;
  onChallenge: (player: Player) => void;
}

export const PlayerDossierModal: React.FC<PlayerDossierModalProps> = ({
  player,
  rank,
  allPlayers,
  matches,
  league,
  onClose,
  onChallenge,
}) => {
  if (!player) return null;

  const totalMatches = player.wins + player.losses;
  const winRate = totalMatches > 0 ? ((player.wins / totalMatches) * 100).toFixed(1) : '0.0';
  const rival = findTopRival(player.id, allPlayers, matches);
  const insight = league.insights.get(player.id);
  const titles = league.titlesByPlayer.get(player.id) ?? [];
  const wearsCrown = league.crown.holderId === player.id;

  const getRankBadgeStyle = (value: number) => {
    if (value === 1) return 'bg-[#f59e0b] text-[#2a1700] font-black border-[#ffddb8]';
    if (value === 2) return 'bg-[#94a3b8] text-[#0f172a] font-black border-[#e2e8f0]';
    if (value === 3) return 'bg-[#d97706] text-[#2a1700] font-black border-[#ffedd5]';
    return 'bg-[#262a31] text-[#dfe2eb] font-bold border-[#3c4a42]';
  };

  const metrics = [
    {
      icon: <Swords className="h-4 w-4 text-[#4edea3]" />,
      label: 'Upset wins',
      value: insight?.winsVsHigherRated ?? 0,
      note: 'Wins over someone rated above them at the time.',
    },
    {
      icon: <Crown className="h-4 w-4 text-[#f59e0b]" />,
      label: 'Bounty claimed',
      value: insight?.bountyCollected ?? 0,
      note: 'Rating taken off the crown.',
    },
    {
      icon: <Shield className="h-4 w-4 text-[#38bdf8]" />,
      label: 'Rank defended',
      value: insight?.bestRankDefence ?? 0,
      note: 'Longest run of matches without dropping a place.',
    },
    {
      icon: <Flame className="h-4 w-4 text-[#ffb95f]" />,
      label: 'Best streak',
      value: player.bestWinStreak,
      note: 'Longest run of consecutive wins.',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md transition-all">
      <div
        id="player-dossier-modal"
        className="relative w-full max-w-md max-h-[92vh] flex flex-col bg-[#10141a] border-t sm:border border-[#30363d] rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-200"
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-[#30363d]/40">
          <div className="flex items-center gap-2 text-[#4edea3] text-xs font-['JetBrains_Mono'] font-bold tracking-wider uppercase">
            {wearsCrown ? (
              <>
                <Crown className="w-4 h-4 fill-[#f59e0b] text-[#f59e0b]" />
                <span className="text-[#f59e0b]">Wearing the crown</span>
              </>
            ) : (
              <>
                <Trophy className="w-4 h-4" />
                <span>Dossier: #{rank}</span>
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#1c2026] border border-[#30363d] flex items-center justify-center text-[#86948a] hover:text-white hover:bg-[#262a31] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="relative rounded-xl bg-gradient-to-b from-[#1c2026] to-[#161b22] border border-[#30363d] p-4 shadow-lg overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#10b981]/5 rounded-full blur-2xl pointer-events-none"></div>

            <div className="flex items-start gap-3.5">
              <div className="relative shrink-0">
                {player.avatarUrl ? (
                  <img
                    src={player.avatarUrl}
                    alt={player.name}
                    referrerPolicy="no-referrer"
                    className="w-16 h-16 rounded-xl object-cover border-2 border-[#30363d] shadow-md"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-xl border-2 border-[#30363d] bg-[#262a31] font-['Chivo'] text-2xl font-bold text-[#4edea3]">
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <span
                  className={`absolute -top-2 -left-2 px-2 py-0.5 rounded-md text-[10px] font-['JetBrains_Mono'] tracking-wide border shadow-sm ${getRankBadgeStyle(rank)}`}
                >
                  RANK {rank}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <h2 className="font-['Chivo'] text-xl font-bold text-white tracking-tight truncate">
                  {player.name}
                </h2>
                <p className="text-xs text-[#86948a] font-['Space_Grotesk'] mt-0.5 truncate">
                  {player.department} • <span className="text-[#bbcabf] font-medium">{player.title}</span>
                </p>

                <div className="mt-3 grid grid-cols-2 gap-2 pt-2 border-t border-[#30363d]/60">
                  <div>
                    <span className="block text-[10px] font-['JetBrains_Mono'] font-bold tracking-wider text-[#86948a] uppercase">
                      ELO RATING
                    </span>
                    <span className="font-['JetBrains_Mono'] text-2xl font-black text-[#4edea3] tracking-tight">
                      {player.elo}
                    </span>
                  </div>

                  <div>
                    <span className="block text-[10px] font-['JetBrains_Mono'] font-bold tracking-wider text-[#86948a] uppercase">
                      {player.currentStreak >= 0 ? 'HOT STREAK' : 'COLD STREAK'}
                    </span>
                    <span className="font-['Space_Grotesk'] text-lg font-bold flex items-center gap-1 mt-0.5">
                      {player.currentStreak >= 3 ? (
                        <span className="text-[#ffb95f] flex items-center gap-1">
                          <Flame className="w-4 h-4 fill-[#ffb95f]" />
                          {player.currentStreak} Wins
                        </span>
                      ) : player.currentStreak > 0 ? (
                        <span className="text-[#4edea3]">W{player.currentStreak}</span>
                      ) : player.currentStreak < 0 ? (
                        <span className="text-[#ffb4ab] flex items-center gap-1">
                          <Snowflake className="w-4 h-4" />
                          {Math.abs(player.currentStreak)} Losses
                        </span>
                      ) : (
                        <span className="text-[#86948a]">Even</span>
                      )}
                    </span>
                  </div>
                </div>

                {insight?.isDormant && (
                  <p className="mt-2 flex items-center gap-1.5 font-['Space_Grotesk'] text-[11px] text-[#86948a]">
                    <Moon className="h-3.5 w-3.5" />
                    Dormant — off the active ladder until they play again.
                  </p>
                )}
              </div>
            </div>
          </div>

          {titles.length > 0 && (
            <div>
              <span className="font-['JetBrains_Mono'] text-[11px] font-extrabold tracking-widest text-[#86948a] uppercase">
                Titles held
              </span>
              <div className="mt-2">
                <TitleBadges titles={titles} variant="card" />
              </div>
            </div>
          )}

          {/* The head-to-head ledger: real numbers, no invented reads on anyone's game. */}
          <div>
            <span className="font-['JetBrains_Mono'] text-[11px] font-extrabold tracking-widest text-[#86948a] uppercase">
              Biggest rivalry
            </span>
            {rival ? (
              <div className="mt-2 rounded-xl border border-[#30363d] bg-[#161b22] p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="truncate font-['Chivo'] text-base font-bold text-white">
                    vs {rival.opponentName}
                  </h3>
                  <span className="shrink-0 font-['JetBrains_Mono'] text-sm font-black">
                    <span className="text-[#4edea3]">{rival.wins}</span>
                    <span className="text-[#86948a]">–</span>
                    <span className="text-[#ffb4ab]">{rival.losses}</span>
                  </span>
                </div>

                <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-[#30363d]">
                  <div
                    className="bg-[#10b981]"
                    style={{ width: `${(rival.wins / Math.max(1, rival.meetings)) * 100}%` }}
                  />
                  <div
                    className="bg-[#ef4444]"
                    style={{ width: `${(rival.losses / Math.max(1, rival.meetings)) * 100}%` }}
                  />
                </div>
                <p className="mt-1.5 font-['JetBrains_Mono'] text-[10px] uppercase tracking-wider text-[#86948a]">
                  Race to {RIVALRY_RACE_TARGET}
                </p>

                <ul className="mt-3 space-y-1 border-t border-[#30363d] pt-3">
                  {rival.commentary.map((line) => (
                    <li key={line} className="font-['Space_Grotesk'] text-xs leading-relaxed text-[#bbcabf]">
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-2 rounded-xl border border-dashed border-[#30363d] bg-[#161b22] px-4 py-6 text-center font-['Space_Grotesk'] text-xs text-[#86948a]">
                No matches logged yet — no rivalry to speak of.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {metrics.map((metric) => (
              <div key={metric.label} className="rounded-xl bg-[#161b22] border border-[#30363d] p-3.5">
                <div className="flex items-center justify-between">
                  {metric.icon}
                  <span className="font-['JetBrains_Mono'] text-lg font-black text-white tabular-nums">
                    {metric.value}
                  </span>
                </div>
                <h4 className="mt-1 font-['Chivo'] text-sm font-bold text-white">{metric.label}</h4>
                <p className="mt-0.5 text-[11px] text-[#86948a] font-['Space_Grotesk'] leading-tight">
                  {metric.note}
                </p>
              </div>
            ))}
          </div>

          <div className="rounded-xl bg-[#161b22] border border-[#30363d] p-4">
            <div className="flex items-center justify-between text-xs font-['Space_Grotesk'] mb-2">
              <span className="font-bold text-white flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5 text-[#4edea3]" />
                Lifetime Record
              </span>
              <span className="font-['JetBrains_Mono'] font-bold text-[#4edea3]">
                {player.wins}W - {player.losses}L ({winRate}%)
              </span>
            </div>

            <div className="w-full h-2.5 rounded-full bg-[#30363d] overflow-hidden flex">
              <div
                className="bg-[#10b981] h-full transition-all duration-500"
                style={{ width: `${totalMatches > 0 ? (player.wins / totalMatches) * 100 : 50}%` }}
              ></div>
              <div
                className="bg-[#ef4444] h-full transition-all duration-500"
                style={{ width: `${totalMatches > 0 ? (player.losses / totalMatches) * 100 : 50}%` }}
              ></div>
            </div>

            <div className="flex items-center justify-between text-[11px] font-['Space_Grotesk'] text-[#86948a] mt-2">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#10b981]"></span>
                {player.wins} Victories
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#ef4444]"></span>
                {player.losses} Defeats
              </span>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-[#30363d] bg-[#10141a]">
          <button
            onClick={() => onChallenge(player)}
            className="w-full py-3.5 px-4 rounded-xl bg-[#10b981] hover:bg-[#4edea3] text-[#002113] font-['Chivo'] text-base font-bold flex items-center justify-center gap-2 shadow-[0_0_16px_rgba(16,185,129,0.3)] transition-all active:scale-[0.98]"
          >
            <Swords className="w-5 h-5" />
            Challenge {player.name.split(' ')[0]}
          </button>
        </div>
      </div>
    </div>
  );
};
