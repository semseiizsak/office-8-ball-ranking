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
    if (value === 1) return 'bg-[#F2B705] text-[#0A0A0A] font-black border-[#F2B705]';
    if (value === 2) return 'bg-white/55 text-[#0A0A0A] font-black border-white';
    if (value === 3) return 'bg-[#F2B705] text-[#0A0A0A] font-black border-[#F2B705]';
    return 'bg-[#222222] text-white font-bold border-white/10';
  };

  const metrics = [
    {
      icon: <Swords className="h-4 w-4 text-white" />,
      label: 'Upset wins',
      value: insight?.winsVsHigherRated ?? 0,
      note: 'Wins over someone rated above them at the time.',
    },
    {
      icon: <Crown className="h-4 w-4 text-[#F2B705]" />,
      label: 'Bounty claimed',
      value: insight?.bountyCollected ?? 0,
      note: 'Rating taken off the crown.',
    },
    {
      icon: <Shield className="h-4 w-4 text-[#7D97F0]" />,
      label: 'Rank defended',
      value: insight?.bestRankDefence ?? 0,
      note: 'Longest run of matches without dropping a place.',
    },
    {
      icon: <Flame className="h-4 w-4 text-[#F2B705]" />,
      label: 'Best streak',
      value: player.bestWinStreak,
      note: 'Longest run of consecutive wins.',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop- transition-all">
      <div
        id="player-dossier-modal"
        className="relative w-full max-w-md max-h-[92vh] flex flex-col bg-[#0A0A0A] border-t sm:border border-white/10 rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl anim-sheet"
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-white/14">
          <div className="flex items-center gap-2 text-white text-xs font-sans tabular-nums font-bold tracking-wider uppercase">
            {wearsCrown ? (
              <>
                <Crown className="w-4 h-4 fill-[#F2B705] text-[#F2B705]" />
                <span className="text-[#F2B705]">Wearing the crown</span>
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
            className="w-8 h-8 rounded-full bg-[#171717] border border-white/10 flex items-center justify-center text-white/55 hover:text-white hover:bg-[#222222] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="relative rounded-xl bg-gradient-to-b from-[#171717] to-[#111111] border border-white/10 p-4 shadow-lg overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full pointer-events-none"></div>

            <div className="flex items-start gap-3.5">
              <div className="relative shrink-0">
                {player.avatarUrl ? (
                  <img
                    src={player.avatarUrl}
                    alt={player.name}
                    referrerPolicy="no-referrer"
                    className="w-16 h-16 rounded-xl object-cover border-2 border-white/10 shadow-md"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-xl border-2 border-white/10 bg-[#222222] font-display text-2xl font-bold text-white">
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <span
                  className={`absolute -top-2 -left-2 px-2 py-0.5 rounded-md text-[10px] font-sans tabular-nums tracking-wide border shadow-sm ${getRankBadgeStyle(rank)}`}
                >
                  RANK {rank}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <h2 className="font-display text-xl font-bold text-white tracking-tight truncate">
                  {player.name}
                </h2>
                <p className="text-xs text-white/55 font-sans mt-0.5 truncate">
                  {player.department} • <span className="text-white/70 font-medium">{player.title}</span>
                </p>

                <div className="mt-3 grid grid-cols-2 gap-2 pt-2 border-t border-white/14">
                  <div>
                    <span className="block text-[10px] font-sans tabular-nums font-bold tracking-wider text-white/55 uppercase">
                      ELO RATING
                    </span>
                    <span className="font-sans tabular-nums text-2xl font-black text-white tracking-tight">
                      {player.elo}
                    </span>
                  </div>

                  <div>
                    <span className="block text-[10px] font-sans tabular-nums font-bold tracking-wider text-white/55 uppercase">
                      {player.currentStreak >= 0 ? 'HOT STREAK' : 'COLD STREAK'}
                    </span>
                    <span className="font-sans text-lg font-bold flex items-center gap-1 mt-0.5">
                      {player.currentStreak >= 3 ? (
                        <span className="text-[#F2B705] flex items-center gap-1">
                          <Flame className="w-4 h-4 fill-[#F2B705]" />
                          {player.currentStreak} Wins
                        </span>
                      ) : player.currentStreak > 0 ? (
                        <span className="text-white">W{player.currentStreak}</span>
                      ) : player.currentStreak < 0 ? (
                        <span className="text-[#FF6B7D] flex items-center gap-1">
                          <Snowflake className="w-4 h-4" />
                          {Math.abs(player.currentStreak)} Losses
                        </span>
                      ) : (
                        <span className="text-white/55">Even</span>
                      )}
                    </span>
                  </div>
                </div>

                {insight?.isDormant && (
                  <p className="mt-2 flex items-center gap-1.5 font-sans text-[11px] text-white/55">
                    <Moon className="h-3.5 w-3.5" />
                    Dormant — off the active ladder until they play again.
                  </p>
                )}
              </div>
            </div>
          </div>

          {titles.length > 0 && (
            <div>
              <span className="font-sans tabular-nums text-[11px] font-extrabold tracking-widest text-white/55 uppercase">
                Titles held
              </span>
              <div className="mt-2">
                <TitleBadges titles={titles} variant="card" />
              </div>
            </div>
          )}

          {/* The head-to-head ledger: real numbers, no invented reads on anyone's game. */}
          <div>
            <span className="font-sans tabular-nums text-[11px] font-extrabold tracking-widest text-white/55 uppercase">
              Biggest rivalry
            </span>
            {rival ? (
              <div className="mt-2 rounded-xl border border-white/10 bg-[#111111] p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="truncate font-display text-base font-bold text-white">
                    vs {rival.opponentName}
                  </h3>
                  <span className="shrink-0 font-sans tabular-nums text-sm font-black">
                    <span className="text-white">{rival.wins}</span>
                    <span className="text-white/55">–</span>
                    <span className="text-[#FF6B7D]">{rival.losses}</span>
                  </span>
                </div>

                <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-[#222222]">
                  <div
                    className="bg-white"
                    style={{ width: `${(rival.wins / Math.max(1, rival.meetings)) * 100}%` }}
                  />
                  <div
                    className="bg-[#C8102E]"
                    style={{ width: `${(rival.losses / Math.max(1, rival.meetings)) * 100}%` }}
                  />
                </div>
                <p className="mt-1.5 font-sans tabular-nums text-[10px] uppercase tracking-wider text-white/55">
                  Race to {RIVALRY_RACE_TARGET}
                </p>

                <ul className="mt-3 space-y-1 border-t border-white/10 pt-3">
                  {rival.commentary.map((line) => (
                    <li key={line} className="font-sans text-xs leading-relaxed text-white/70">
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-2 rounded-xl border border-dashed border-white/10 bg-[#111111] px-4 py-6 text-center font-sans text-xs text-white/55">
                No matches logged yet — no rivalry to speak of.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {metrics.map((metric) => (
              <div key={metric.label} className="rounded-xl bg-[#111111] border border-white/10 p-3.5">
                <div className="flex items-center justify-between">
                  {metric.icon}
                  <span className="font-sans tabular-nums text-lg font-black text-white tabular-nums">
                    {metric.value}
                  </span>
                </div>
                <h4 className="mt-1 font-display text-sm font-bold text-white">{metric.label}</h4>
                <p className="mt-0.5 text-[11px] text-white/55 font-sans leading-tight">
                  {metric.note}
                </p>
              </div>
            ))}
          </div>

          <div className="rounded-xl bg-[#111111] border border-white/10 p-4">
            <div className="flex items-center justify-between text-xs font-sans mb-2">
              <span className="font-bold text-white flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5 text-white" />
                Lifetime Record
              </span>
              <span className="font-sans tabular-nums font-bold text-white">
                {player.wins}W - {player.losses}L ({winRate}%)
              </span>
            </div>

            <div className="w-full h-2.5 rounded-full bg-[#222222] overflow-hidden flex">
              <div
                className="bg-white h-full transition-all duration-500"
                style={{ width: `${totalMatches > 0 ? (player.wins / totalMatches) * 100 : 50}%` }}
              ></div>
              <div
                className="bg-[#C8102E] h-full transition-all duration-500"
                style={{ width: `${totalMatches > 0 ? (player.losses / totalMatches) * 100 : 50}%` }}
              ></div>
            </div>

            <div className="flex items-center justify-between text-[11px] font-sans text-white/55 mt-2">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-white"></span>
                {player.wins} Victories
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#C8102E]"></span>
                {player.losses} Defeats
              </span>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-white/10 bg-[#0A0A0A]">
          <button
            onClick={() => onChallenge(player)}
            className="w-full py-3.5 px-4 rounded-xl bg-white hover:bg-white text-[#0A0A0A] font-display text-base font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          >
            <Swords className="w-5 h-5" />
            Challenge {player.name.split(' ')[0]}
          </button>
        </div>
      </div>
    </div>
  );
};
