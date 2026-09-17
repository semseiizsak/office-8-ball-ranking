import React from 'react';
import { Trophy, ArrowUpRight, ArrowDownRight, Crown, Flame } from 'lucide-react';
import { MatchRecord } from '../types';

interface MatchSuccessModalProps {
  result: {
    match: MatchRecord;
    winnerName: string;
    loserName: string;
    eloDelta: number;
    bountyCollected: number;
    winnerNewElo: number;
    loserNewElo: number;
    isUpset: boolean;
    crownChangedHands: boolean;
  } | null;
  onClose: () => void;
  onViewLeaderboard: () => void;
}

export const MatchSuccessModal: React.FC<MatchSuccessModalProps> = ({
  result,
  onClose,
  onViewLeaderboard,
}) => {
  if (!result) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md anim-fade">
      <div className="relative w-full max-w-sm bg-gradient-to-b from-[#1c2026] to-[#10141a] border border-[#10b981]/50 rounded-2xl p-6 text-center shadow-[0_0_32px_rgba(16,185,129,0.25)]">
        {/* Glow effect */}
        <div className="w-16 h-16 rounded-full bg-[#10b981]/20 border border-[#10b981] flex items-center justify-center mx-auto mb-3 text-[#4edea3] shadow-[0_0_20px_#10b981]/40 animate-bounce">
          <Trophy className="w-8 h-8" />
        </div>

        <div className="mb-2 flex flex-wrap items-center justify-center gap-1.5">
          {result.isUpset && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-['JetBrains_Mono'] font-bold bg-[#ffb95f]/20 text-[#ffb95f] border border-[#ffb95f]/40">
              <Flame className="w-3.5 h-3.5 fill-[#ffb95f]" />
              UPSET
            </span>
          )}
          {result.bountyCollected > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-['JetBrains_Mono'] font-bold bg-[#f59e0b]/20 text-[#f59e0b] border border-[#f59e0b]/40">
              <Crown className="w-3.5 h-3.5 fill-[#f59e0b]" />
              +{result.bountyCollected} BOUNTY
            </span>
          )}
          {result.crownChangedHands && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-['JetBrains_Mono'] font-bold bg-[#10b981]/20 text-[#4edea3] border border-[#10b981]/40">
              NEW #1
            </span>
          )}
        </div>

        <h2 className="font-['Chivo'] text-2xl font-black text-white tracking-tight">
          Match Recorded!
        </h2>
        <p className="text-sm text-[#bbcabf] font-['Space_Grotesk'] mt-1">
          <span className="font-bold text-white">{result.winnerName}</span> defeated{' '}
          <span className="text-[#86948a]">{result.loserName}</span>
        </p>

        {/* Elo Transfer Box */}
        <div className="my-5 p-4 rounded-xl bg-[#161b22] border border-[#30363d] space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-left">
              <span className="block text-xs font-['Space_Grotesk'] font-medium text-white truncate max-w-[120px]">
                {result.winnerName}
              </span>
              <span className="text-[10px] text-[#86948a] font-['JetBrains_Mono']">Victor</span>
            </div>
            <div className="flex items-center gap-1.5 text-[#4edea3]">
              <ArrowUpRight className="w-4 h-4 stroke-[3]" />
              <span className="font-['JetBrains_Mono'] text-base font-black">
                +{result.eloDelta}
              </span>
              <span className="text-xs text-[#bbcabf] font-['JetBrains_Mono']">
                ({result.winnerNewElo})
              </span>
            </div>
          </div>

          <div className="border-t border-[#30363d]/60"></div>

          <div className="flex items-center justify-between">
            <div className="text-left">
              <span className="block text-xs font-['Space_Grotesk'] font-medium text-[#86948a] truncate max-w-[120px]">
                {result.loserName}
              </span>
              <span className="text-[10px] text-[#86948a] font-['JetBrains_Mono']">Runner-up</span>
            </div>
            <div className="flex items-center gap-1.5 text-[#ffb4ab]">
              <ArrowDownRight className="w-4 h-4 stroke-[3]" />
              <span className="font-['JetBrains_Mono'] text-base font-black">
                -{result.eloDelta}
              </span>
              <span className="text-xs text-[#86948a] font-['JetBrains_Mono']">
                ({result.loserNewElo})
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2 pt-1">
          <button
            onClick={onClose}
            className="w-full py-3 px-4 rounded-xl bg-[#10b981] hover:bg-[#4edea3] text-[#002113] font-['Chivo'] font-bold text-sm tracking-wide transition-all shadow-[0_0_12px_rgba(16,185,129,0.3)] active:scale-[0.98]"
          >
            Log Another Match
          </button>
          <button
            onClick={() => {
              onClose();
              onViewLeaderboard();
            }}
            className="w-full py-2.5 px-4 rounded-xl bg-[#161b22] hover:bg-[#21262d] text-white border border-[#30363d] font-['Chivo'] font-semibold text-xs tracking-wide transition-all"
          >
            View Power Rankings
          </button>
        </div>
      </div>
    </div>
  );
};
