import React, { useState } from 'react';
import {
  ArrowLeftRight,
  Sparkles,
  ShieldCheck,
  Flame,
  Trophy,
  Award,
  History,
  Check,
  UserCheck,
  Zap,
} from 'lucide-react';
import { Player, MatchRecord, MatchModifier, BallPreference } from '../types';
import { calculateProjectedStakes } from '../utils/elo';

interface LogMatchViewProps {
  players: Player[];
  recentMatches: MatchRecord[];
  initialPlayerAId?: string;
  initialPlayerBId?: string;
  onRecordMatch: (
    playerAId: string,
    playerBId: string,
    winnerId: string,
    modifiers: MatchModifier
  ) => void;
  isSubmitting?: boolean;
}

export const LogMatchView: React.FC<LogMatchViewProps> = ({
  players,
  recentMatches,
  initialPlayerAId,
  initialPlayerBId,
  onRecordMatch,
  isSubmitting = false,
}) => {
  // Sort players by rating to get proper ranking indices
  const sortedPlayers = [...players].sort((a, b) => b.elo - a.elo);

  // Default Player A and B
  const [playerAId, setPlayerAId] = useState<string>(() => {
    if (initialPlayerAId && players.some((p) => p.id === initialPlayerAId)) {
      return initialPlayerAId;
    }
    return sortedPlayers[0]?.id || '';
  });

  const [playerBId, setPlayerBId] = useState<string>(() => {
    if (initialPlayerBId && players.some((p) => p.id === initialPlayerBId)) {
      return initialPlayerBId;
    }
    // Pick rank 4 or second player
    const second = sortedPlayers.find((p) => p.id !== playerAId);
    return second?.id || '';
  });

  // Modal selectors for picking player
  const [selectingFor, setSelectingFor] = useState<'A' | 'B' | null>(null);

  // Modifiers
  const [modifiers, setModifiers] = useState<MatchModifier>({
    eightOnBreak: false,
    scratchOnEight: false,
    tableRun: false,
  });

  // Custom ball override for the match
  const [ballTypeA, setBallTypeA] = useState<BallPreference>('solids');
  const [ballTypeB, setBallTypeB] = useState<BallPreference>('stripes');

  const playerA = players.find((p) => p.id === playerAId) || sortedPlayers[0];
  const playerB =
    players.find((p) => p.id === playerBId) ||
    players.find((p) => p.id !== playerA?.id) ||
    sortedPlayers[1];

  const rankA = sortedPlayers.findIndex((p) => p.id === playerA?.id) + 1;
  const rankB = sortedPlayers.findIndex((p) => p.id === playerB?.id) + 1;

  // Swap players
  const handleSwap = () => {
    const tempId = playerAId;
    setPlayerAId(playerBId);
    setPlayerBId(tempId);

    const tempBall = ballTypeA;
    setBallTypeA(ballTypeB);
    setBallTypeB(tempBall);
  };

  // Recent match rematch check
  const lastMatch = recentMatches[0];
  const lastMatchTimeAgo = lastMatch
    ? Math.max(1, Math.round((Date.now() - lastMatch.timestamp) / 60000))
    : 14;

  const handleRematchClick = () => {
    if (lastMatch) {
      setPlayerAId(lastMatch.playerAId);
      setPlayerBId(lastMatch.playerBId);
    }
  };

  // Calculate realtime projected stakes
  const stakes = calculateProjectedStakes(playerA ? playerA.elo : 1000, playerB ? playerB.elo : 1000);

  const isAFavorite = (playerA?.elo || 1000) >= (playerB?.elo || 1000);

  return (
    <div id="log-match-view" className="space-y-4 pb-20 pt-1">
      {/* Rematch Banner matching Stitch design */}
      {lastMatch && (
        <div className="flex items-center justify-between p-3 rounded-2xl bg-[#161b22] border border-[#30363d] shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#10b981]/15 border border-[#10b981]/30 flex items-center justify-center text-[#4edea3]">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-['Chivo'] text-xs font-bold text-white tracking-tight">
                Rematch {lastMatch.playerAName.split(' ')[0]} vs {lastMatch.playerBName.split(' ')[0]}?
              </h4>
              <p className="text-[10px] text-[#86948a] font-['Space_Grotesk']">
                Last played {lastMatchTimeAgo} mins ago
              </p>
            </div>
          </div>

          <button
            onClick={handleRematchClick}
            className="px-3 py-1.5 rounded-xl bg-[#1c2026] hover:bg-[#262a31] border border-[#30363d] text-xs font-['Chivo'] font-bold text-[#4edea3] flex items-center gap-1 transition-all active:scale-95"
          >
            <span>Replay</span>
            <Zap className="w-3.5 h-3.5 fill-[#4edea3]" />
          </button>
        </div>
      )}

      {/* Matchup Arena Cards */}
      <div className="relative space-y-2">
        {/* Player A Card */}
        <div
          id="player-a-card"
          className="relative p-4 rounded-2xl bg-[#161b22] border border-[#30363d] shadow-md flex items-center justify-between transition-all"
        >
          <div
            className="flex items-center gap-3.5 flex-1 cursor-pointer"
            onClick={() => setSelectingFor('A')}
          >
            {/* Avatar with Rank Badge */}
            <div className="relative shrink-0">
              <img
                src={playerA?.avatarUrl}
                alt={playerA?.name}
                referrerPolicy="no-referrer"
                className="w-14 h-14 rounded-full object-cover border-2 border-[#10b981]/60 shadow-md"
              />
              <span className="absolute -bottom-1 -left-1 w-5 h-5 rounded-full bg-[#10b981] text-[#002113] text-[10px] font-['JetBrains_Mono'] font-black flex items-center justify-center border border-[#10141a]">
                {rankA}
              </span>
            </div>

            {/* Info */}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-['Chivo'] text-lg font-bold text-white tracking-tight truncate">
                  {playerA?.name}
                </h3>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setBallTypeA(ballTypeA === 'solids' ? 'stripes' : 'solids');
                  }}
                  className={`px-2 py-0.5 rounded text-[10px] font-['JetBrains_Mono'] font-extrabold uppercase tracking-wider ${
                    ballTypeA === 'solids'
                      ? 'bg-[#10b981]/20 text-[#4edea3] border border-[#10b981]/30'
                      : 'bg-[#ffb95f]/20 text-[#ffb95f] border border-[#ffb95f]/30'
                  }`}
                >
                  {ballTypeA}
                </button>
              </div>

              <div className="flex items-center gap-2 mt-1">
                <span className="font-['JetBrains_Mono'] text-sm font-black text-[#4edea3]">
                  {playerA?.elo} <span className="text-[10px] font-medium text-[#86948a]">ELO</span>
                </span>
                {/* Form dots */}
                <div className="flex items-center gap-1">
                  {playerA?.recentForm.slice(0, 5).map((f, i) => (
                    <span
                      key={i}
                      className={`w-1.5 h-1.5 rounded-full ${
                        f === 'W' ? 'bg-[#10b981]' : 'bg-[#ef4444]'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Change Player button */}
          <button
            onClick={() => setSelectingFor('A')}
            title="Switch Player A"
            className="w-10 h-10 rounded-xl bg-[#21262d] border border-[#30363d] flex items-center justify-center text-[#bbcabf] hover:text-white hover:border-[#10b981] transition-colors"
          >
            <ArrowLeftRight className="w-4 h-4" />
          </button>
        </div>

        {/* Central VS Badge */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
          <button
            onClick={handleSwap}
            title="Swap Player A and B"
            className="w-10 h-10 rounded-full bg-[#0a1210] border-2 border-[#10b981] text-[#4edea3] font-['Chivo'] font-black text-xs flex items-center justify-center shadow-[0_0_14px_rgba(16,185,129,0.35)] hover:scale-110 active:rotate-180 transition-all duration-200"
          >
            VS
          </button>
        </div>

        {/* Player B Card */}
        <div
          id="player-b-card"
          className="relative p-4 rounded-2xl bg-[#161b22] border border-[#30363d] shadow-md flex items-center justify-between transition-all"
        >
          <div
            className="flex items-center gap-3.5 flex-1 cursor-pointer"
            onClick={() => setSelectingFor('B')}
          >
            {/* Avatar with Rank Badge */}
            <div className="relative shrink-0">
              <img
                src={playerB?.avatarUrl}
                alt={playerB?.name}
                referrerPolicy="no-referrer"
                className="w-14 h-14 rounded-full object-cover border-2 border-[#ffb95f]/60 shadow-md"
              />
              <span className="absolute -bottom-1 -left-1 w-5 h-5 rounded-full bg-[#ffb95f] text-[#2a1700] text-[10px] font-['JetBrains_Mono'] font-black flex items-center justify-center border border-[#10141a]">
                {rankB}
              </span>
            </div>

            {/* Info */}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-['Chivo'] text-lg font-bold text-white tracking-tight truncate">
                  {playerB?.name}
                </h3>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setBallTypeB(ballTypeB === 'stripes' ? 'solids' : 'stripes');
                  }}
                  className={`px-2 py-0.5 rounded text-[10px] font-['JetBrains_Mono'] font-extrabold uppercase tracking-wider ${
                    ballTypeB === 'stripes'
                      ? 'bg-[#ffb95f]/20 text-[#ffb95f] border border-[#ffb95f]/30'
                      : 'bg-[#10b981]/20 text-[#4edea3] border border-[#10b981]/30'
                  }`}
                >
                  {ballTypeB}
                </button>
              </div>

              <div className="flex items-center gap-2 mt-1">
                <span className="font-['JetBrains_Mono'] text-sm font-black text-[#ffb95f]">
                  {playerB?.elo} <span className="text-[10px] font-medium text-[#86948a]">ELO</span>
                </span>
                {/* Form dots */}
                <div className="flex items-center gap-1">
                  {playerB?.recentForm.slice(0, 5).map((f, i) => (
                    <span
                      key={i}
                      className={`w-1.5 h-1.5 rounded-full ${
                        f === 'W' ? 'bg-[#10b981]' : 'bg-[#ef4444]'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Change Player button */}
          <button
            onClick={() => setSelectingFor('B')}
            title="Switch Player B"
            className="w-10 h-10 rounded-xl bg-[#21262d] border border-[#30363d] flex items-center justify-center text-[#bbcabf] hover:text-white hover:border-[#ffb95f] transition-colors"
          >
            <ArrowLeftRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* PROJECTED STAKES Card (Matching Stitch spec) */}
      <div className="rounded-2xl bg-[#161b22] border border-[#30363d] p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between pb-1 border-b border-[#30363d]/50">
          <span className="font-['JetBrains_Mono'] text-[11px] font-extrabold tracking-widest text-[#86948a] uppercase">
            PROJECTED STAKES
          </span>
          <span className="text-xs font-['JetBrains_Mono'] text-[#4edea3] flex items-center gap-1 font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            Realtime Elo Model
          </span>
        </div>

        {/* Stake Line 1: If Player A Wins */}
        <div className="flex items-center justify-between py-1 text-xs">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#4edea3]" />
            <span className="font-['Space_Grotesk'] text-white">
              If {playerA?.name.split(' ')[0]} wins
            </span>
            {stakes.isAUpset && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-['JetBrains_Mono'] font-bold bg-[#ffb95f]/20 text-[#ffb95f] border border-[#ffb95f]/30">
                UPSET!
              </span>
            )}
          </div>
          <div className="font-['JetBrains_Mono'] font-bold text-right">
            <span className="text-[#4edea3]">
              +{stakes.playerAWinsDelta}{' '}
              <span className="text-[#86948a] font-normal">({stakes.playerAWinNewA})</span>
            </span>
            <span className="text-[#86948a] mx-1.5">/</span>
            <span className="text-[#ffb4ab]">
              -{stakes.playerAWinsDelta}{' '}
              <span className="text-[#86948a] font-normal">({stakes.playerAWinNewB})</span>
            </span>
          </div>
        </div>

        {/* Stake Line 2: If Player B Wins */}
        <div className="flex items-center justify-between py-1 text-xs border-t border-[#30363d]/40">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-[#ffb95f]" />
            <span className="font-['Space_Grotesk'] text-white">
              If {playerB?.name.split(' ')[0]} wins
            </span>
            {stakes.isBUpset && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-['JetBrains_Mono'] font-bold bg-[#ffb95f]/20 text-[#ffb95f] border border-[#ffb95f]/30">
                UPSET!
              </span>
            )}
          </div>
          <div className="font-['JetBrains_Mono'] font-bold text-right">
            <span className="text-[#ffb95f]">
              +{stakes.playerBWinsDelta}{' '}
              <span className="text-[#86948a] font-normal">({stakes.playerBWinNewB})</span>
            </span>
            <span className="text-[#86948a] mx-1.5">/</span>
            <span className="text-[#ffb4ab]">
              -{stakes.playerBWinsDelta}{' '}
              <span className="text-[#86948a] font-normal">({stakes.playerBWinNewA})</span>
            </span>
          </div>
        </div>
      </div>

      {/* DECLARE WINNER (1-TAP) Massive Satisfying Action Buttons */}
      <div className="space-y-2 pt-2">
        <span className="font-['JetBrains_Mono'] text-[11px] font-extrabold tracking-widest text-[#86948a] uppercase px-1">
          DECLARE WINNER (1-TAP)
        </span>

        {/* Massive Button 1: Player A Won */}
        <button
          id="btn-player-a-won"
          disabled={isSubmitting || !playerA || !playerB || playerA.id === playerB.id}
          onClick={() => {
            if (playerA && playerB) {
              onRecordMatch(playerA.id, playerB.id, playerA.id, modifiers);
            }
          }}
          className="w-full min-h-[72px] p-4 rounded-2xl bg-gradient-to-r from-[#10b981] to-[#4edea3] hover:brightness-105 active:scale-[0.98] text-[#002113] shadow-[0_4px_20px_rgba(16,185,129,0.35)] transition-all flex items-center justify-between group disabled:opacity-50 disabled:pointer-events-none"
        >
          <div className="flex items-center gap-3.5 text-left">
            <div className="w-12 h-12 rounded-xl bg-[#002113]/15 flex items-center justify-center text-[#002113]">
              <Trophy className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <div className="font-['Chivo'] text-lg sm:text-xl font-black tracking-tight uppercase leading-tight">
                {playerA?.name} WON
              </div>
              <div className="font-['JetBrains_Mono'] text-[10px] font-extrabold tracking-wider opacity-80 uppercase mt-0.5">
                {isAFavorite ? 'RANKED FAVORITE' : 'UPSET GLORY'}
              </div>
            </div>
          </div>

          <div className="font-['JetBrains_Mono'] text-xl font-black flex items-center gap-1 shrink-0">
            <span>+{stakes.playerAWinsDelta}</span>
            <span className="text-sm">↑</span>
          </div>
        </button>

        {/* Massive Button 2: Player B Won */}
        <button
          id="btn-player-b-won"
          disabled={isSubmitting || !playerA || !playerB || playerA.id === playerB.id}
          onClick={() => {
            if (playerA && playerB) {
              onRecordMatch(playerA.id, playerB.id, playerB.id, modifiers);
            }
          }}
          className="w-full min-h-[72px] p-4 rounded-2xl bg-[#1c2026] hover:bg-[#262a31] border border-[#30363d] active:scale-[0.98] text-white shadow-md transition-all flex items-center justify-between group disabled:opacity-50 disabled:pointer-events-none"
        >
          <div className="flex items-center gap-3.5 text-left">
            <div className="w-12 h-12 rounded-xl bg-[#ffb95f]/15 border border-[#ffb95f]/30 flex items-center justify-center text-[#ffb95f]">
              <Award className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <div className="font-['Chivo'] text-lg sm:text-xl font-black tracking-tight uppercase leading-tight">
                {playerB?.name} WON
              </div>
              <div className="font-['JetBrains_Mono'] text-[10px] font-extrabold tracking-wider text-[#ffb95f] uppercase mt-0.5">
                {!isAFavorite ? 'RANKED FAVORITE' : 'UPSET GLORY'}
              </div>
            </div>
          </div>

          <div className="font-['JetBrains_Mono'] text-xl font-black text-[#ffb95f] flex items-center gap-1 shrink-0">
            <span>+{stakes.playerBWinsDelta}</span>
            <span className="text-sm">↑</span>
          </div>
        </button>
      </div>

      {/* Contender Selection Drawer/Modal */}
      {selectingFor && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4">
          <div className="w-full max-w-md bg-[#161b22] border border-[#30363d] rounded-t-2xl sm:rounded-2xl max-h-[75vh] flex flex-col p-4 shadow-2xl animate-in slide-in-from-bottom">
            <div className="flex items-center justify-between pb-3 border-b border-[#30363d]">
              <h3 className="font-['Chivo'] text-base font-bold text-white">
                Select {selectingFor === 'A' ? 'Player A' : 'Player B'}
              </h3>
              <button
                onClick={() => setSelectingFor(null)}
                className="text-xs text-[#86948a] hover:text-white px-2 py-1"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 py-3">
              {sortedPlayers.map((player) => {
                const isCurrent =
                  selectingFor === 'A' ? player.id === playerAId : player.id === playerBId;
                const isOther =
                  selectingFor === 'A' ? player.id === playerBId : player.id === playerAId;

                return (
                  <button
                    key={player.id}
                    disabled={isOther}
                    onClick={() => {
                      if (selectingFor === 'A') {
                        setPlayerAId(player.id);
                      } else {
                        setPlayerBId(player.id);
                      }
                      setSelectingFor(null);
                    }}
                    className={`w-full p-3 rounded-xl flex items-center justify-between transition-all text-left ${
                      isCurrent
                        ? 'bg-[#10b981]/15 border border-[#10b981] text-white'
                        : isOther
                        ? 'opacity-40 cursor-not-allowed bg-[#10141a]'
                        : 'bg-[#1c2026] hover:bg-[#262a31] border border-[#30363d] text-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={player.avatarUrl}
                        alt={player.name}
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-full object-cover border border-[#30363d]"
                      />
                      <div>
                        <div className="font-['Chivo'] font-bold text-sm">{player.name}</div>
                        <div className="text-[11px] text-[#86948a]">
                          {player.department} • {player.ballPreference}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-['JetBrains_Mono'] font-bold text-sm text-[#4edea3]">
                        {player.elo}
                      </div>
                      {isCurrent && (
                        <div className="text-[10px] text-[#4edea3] font-['Space_Grotesk'] font-bold">
                          Selected
                        </div>
                      )}
                      {isOther && (
                        <div className="text-[10px] text-[#86948a] font-['Space_Grotesk']">
                          Opponent
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
