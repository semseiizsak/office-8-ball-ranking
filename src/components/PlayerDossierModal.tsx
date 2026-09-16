import React from 'react';
import { X, ShieldCheck, Zap, Flame, Snowflake, Trophy, Swords } from 'lucide-react';
import { Player, MatchRecord } from '../types';
import { findArchNemesis } from '../utils/elo';

interface PlayerDossierModalProps {
  player: Player | null;
  rank: number;
  allPlayers: Player[];
  matches: MatchRecord[];
  onClose: () => void;
  onChallenge: (player: Player) => void;
}

export const PlayerDossierModal: React.FC<PlayerDossierModalProps> = ({
  player,
  rank,
  allPlayers,
  matches,
  onClose,
  onChallenge,
}) => {
  if (!player) return null;

  const totalMatches = player.wins + player.losses;
  const winRate = totalMatches > 0 ? ((player.wins / totalMatches) * 100).toFixed(1) : '0.0';
  const nemesis = findArchNemesis(player.id, allPlayers, matches);

  const getRankBadgeStyle = (r: number) => {
    if (r === 1) return 'bg-[#f59e0b] text-[#2a1700] font-black border-[#ffddb8]';
    if (r === 2) return 'bg-[#94a3b8] text-[#0f172a] font-black border-[#e2e8f0]';
    if (r === 3) return 'bg-[#d97706] text-[#2a1700] font-black border-[#ffedd5]';
    return 'bg-[#262a31] text-[#dfe2eb] font-bold border-[#3c4a42]';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md transition-all">
      <div
        id="player-dossier-modal"
        className="relative w-full max-w-md max-h-[92vh] flex flex-col bg-[#10141a] border-t sm:border border-[#30363d] rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-200"
      >
        {/* Top Bar */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-[#30363d]/40">
          <div className="flex items-center gap-2 text-[#4edea3] text-xs font-['JetBrains_Mono'] font-bold tracking-wider uppercase">
            <ShieldCheck className="w-4 h-4 text-[#4edea3]" />
            <span>DOSSIER: #{rank} SEED</span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#1c2026] border border-[#30363d] flex items-center justify-center text-[#86948a] hover:text-white hover:bg-[#262a31] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Main Profile Card */}
          <div className="relative rounded-xl bg-gradient-to-b from-[#1c2026] to-[#161b22] border border-[#30363d] p-4 shadow-lg overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#10b981]/5 rounded-full blur-2xl pointer-events-none"></div>

            <div className="flex items-start gap-3.5">
              <div className="relative shrink-0">
                <img
                  src={player.avatarUrl}
                  alt={player.name}
                  referrerPolicy="no-referrer"
                  className="w-16 h-16 rounded-xl object-cover border-2 border-[#30363d] shadow-md"
                />
                <span
                  className={`absolute -top-2 -left-2 px-2 py-0.5 rounded-md text-[10px] font-['JetBrains_Mono'] tracking-wide border shadow-sm ${getRankBadgeStyle(
                    rank
                  )}`}
                >
                  RANK {rank}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="font-['Chivo'] text-xl font-bold text-white tracking-tight truncate">
                    {player.name}
                  </h2>
                </div>
                <p className="text-xs text-[#86948a] font-['Space_Grotesk'] mt-0.5 truncate">
                  {player.department} •{' '}
                  <span className="text-[#bbcabf] font-medium">{player.title}</span>
                </p>

                {/* Stat quick split */}
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
              </div>
            </div>
          </div>

          {/* Tactical Intelligence Header */}
          <div className="flex items-center justify-between pt-1">
            <span className="font-['JetBrains_Mono'] text-[11px] font-extrabold tracking-widest text-[#86948a] uppercase">
              TACTICAL INTELLIGENCE & QUIRKS
            </span>
            <span className="font-['JetBrains_Mono'] text-[11px] font-semibold text-[#4edea3]">
              Season 4
            </span>
          </div>

          {/* Arch-Nemesis Identified Card */}
          <div className="rounded-xl bg-[#1c2026] border border-[#ef4444]/40 p-4 shadow-md relative overflow-hidden">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-[#ef4444]/15 border border-[#ef4444]/30 flex items-center justify-center text-lg shrink-0">
                  👹
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-['JetBrains_Mono'] text-[10px] font-extrabold tracking-wider text-[#ef4444] uppercase">
                      ARCH-NEMESIS IDENTIFIED
                    </span>
                  </div>
                  <h3 className="font-['Chivo'] text-base font-bold text-white tracking-tight mt-0.5">
                    {nemesis ? nemesis.opponentName : 'Dave Miller (Marketing)'}
                  </h3>
                </div>
              </div>

              <span className="px-2 py-0.5 rounded text-[11px] font-['JetBrains_Mono'] font-bold bg-[#ef4444]/15 text-[#ffb4ab] border border-[#ef4444]/30">
                {nemesis ? `${nemesis.lossesAgainst}-${nemesis.winsAgainst} Against` : '4-2 Against'}
              </span>
            </div>

            <p className="text-xs text-[#bbcabf] font-['Space_Grotesk'] leading-relaxed mt-2.5">
              {nemesis
                ? nemesis.quirkDescription
                : `Lost 4 of last 6 head-to-head clashes. Known to get uncharacteristically rattled by opponents' sharp rail cuts and safety leaves.`}
            </p>
          </div>

          {/* 2-Card Metrics Grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Card 1: Biggest Upset */}
            <div className="rounded-xl bg-[#161b22] border border-[#30363d] p-3.5">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-sm">🗡️</span>
                <span className="font-['JetBrains_Mono'] text-xs font-bold text-[#4edea3]">
                  +{player.biggestUpset ? player.biggestUpset.eloDelta : 28} ELO
                </span>
              </div>
              <h4 className="font-['Chivo'] text-sm font-bold text-white">Biggest Upset</h4>
              <p className="text-[11px] text-[#86948a] font-['Space_Grotesk'] leading-tight mt-1">
                {player.biggestUpset
                  ? player.biggestUpset.description
                  : 'Epic bank-shot recovery in finals decider when 8-ball was hooked.'}
              </p>
            </div>

            {/* Card 2: Streak Milestone */}
            <div className="rounded-xl bg-[#161b22] border border-[#30363d] p-3.5">
              <div className="flex items-center justify-between text-xs mb-1">
                <Zap className="w-4 h-4 text-[#ffb95f] fill-[#ffb95f]" />
                <span className="font-['JetBrains_Mono'] text-[10px] font-bold text-[#86948a] uppercase">
                  STREAK
                </span>
              </div>
              <h4 className="font-['Chivo'] text-sm font-bold text-white">
                {player.bestWinStreak} Consecutive Wins
              </h4>
              <p className="text-[11px] text-[#86948a] font-['Space_Grotesk'] leading-tight mt-1">
                Personal all-time best: {player.bestWinStreak + 2} straight matches without a table scratch.
              </p>
            </div>
          </div>

          {/* Break & Runs Card */}
          <div className="rounded-xl bg-[#161b22] border border-[#30363d] p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-black border border-[#30363d] flex items-center justify-center shrink-0">
                <div className="w-4 h-4 rounded-full bg-white flex items-center justify-center">
                  <span className="text-[9px] font-black text-black">8</span>
                </div>
              </div>
              <div>
                <h4 className="font-['Chivo'] text-sm font-bold text-white">
                  {player.breakAndRuns} Break & Runs
                </h4>
                <p className="text-[11px] text-[#86948a] font-['Space_Grotesk']">
                  Cleared the table directly from the break
                </p>
              </div>
            </div>
            <span className="px-2 py-1 rounded text-[10px] font-['JetBrains_Mono'] font-bold bg-[#10b981]/15 text-[#4edea3] border border-[#10b981]/30">
              TOP 5%
            </span>
          </div>

          {/* Lifetime Record Summary */}
          <div className="rounded-xl bg-[#161b22] border border-[#30363d] p-4">
            <div className="flex items-center justify-between text-xs font-['Space_Grotesk'] mb-2">
              <span className="font-bold text-white flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5 text-[#4edea3]" />
                Lifetime Record Summary
              </span>
              <span className="font-['JetBrains_Mono'] font-bold text-[#4edea3]">
                {player.wins}W - {player.losses}L ({winRate}%)
              </span>
            </div>

            {/* Visual ratio bar */}
            <div className="w-full h-2.5 rounded-full bg-[#30363d] overflow-hidden flex">
              <div
                className="bg-[#10b981] h-full transition-all duration-500"
                style={{ width: `${totalMatches > 0 ? (player.wins / totalMatches) * 100 : 50}%` }}
              ></div>
              <div
                className="bg-[#ef4444] h-full transition-all duration-500"
                style={{
                  width: `${totalMatches > 0 ? (player.losses / totalMatches) * 100 : 50}%`,
                }}
              ></div>
            </div>

            <div className="flex items-center justify-between text-[11px] font-['Space_Grotesk'] text-[#86948a] mt-2">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#10b981]"></span>
                {player.wins} Total Victories
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#ef4444]"></span>
                {player.losses} Defeats
              </span>
            </div>
          </div>
        </div>

        {/* Footer Action */}
        <div className="p-4 border-t border-[#30363d] bg-[#10141a]">
          <button
            onClick={() => {
              onChallenge(player);
              onClose();
            }}
            className="w-full py-3.5 px-4 rounded-xl bg-[#10b981] hover:bg-[#4edea3] text-[#002113] font-['Chivo'] text-base font-bold flex items-center justify-center gap-2 shadow-[0_0_16px_rgba(16,185,129,0.3)] transition-all active:scale-[0.98]"
          >
            <Swords className="w-5 h-5" />
            Set Up Match with {player.name.split(' ')[0]}
          </button>
        </div>
      </div>
    </div>
  );
};
