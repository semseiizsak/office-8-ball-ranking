import React from 'react';
import { Bell, Dices } from 'lucide-react';
import { EightBallIcon } from './EightBallIcon';
import { TabType, Player } from '../types';

interface HeaderProps {
  activeTab: TabType;
  currentUser: Player | null;
  matchesCount: number;
  onOpenProfile: () => void;
  onQuickMatch: () => void;
  challengeBadge?: number;
  onOpenChallengeInbox: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  currentUser,
  matchesCount,
  onOpenProfile,
  onQuickMatch,
  challengeBadge = 0,
  onOpenChallengeInbox,
}) => {
  const [showMenu, setShowMenu] = React.useState(false);

  const getSubtext = () => {
    switch (activeTab) {
      case 'leaderboard':
        return 'POWER RANKINGS';
      case 'log':
        return 'LOG MATCH';
      case 'arena':
        return 'CHALLENGES & CALLS';
      case 'events':
        return 'MATCH HISTORY';
      case 'players':
        return 'ROSTER & DOSSIERS';
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-[#10141a]/95 backdrop-blur-md border-b border-[#30363d]/60 px-4 pb-3 pt-[calc(var(--safe-top)+0.75rem)]">
      <div className="flex items-center justify-between">
        {/* Left: Brand & Section */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center">
            <EightBallIcon size={38} />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="font-['Chivo'] text-lg font-black tracking-tight text-white leading-none">
                Office 8-Ball
              </h1>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-['JetBrains_Mono'] font-bold bg-[#10b981]/15 text-[#4edea3] border border-[#10b981]/30">
                S1
              </span>
            </div>
            <p className="font-['JetBrains_Mono'] text-[10px] font-bold tracking-widest text-[#4edea3] uppercase mt-0.5 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse"></span>
              {getSubtext()}
            </p>
          </div>
        </div>

        {/* Right: Actions & User Avatar */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onQuickMatch}
            title="Quick Match"
            className="flex h-9 items-center gap-1.5 rounded-full border border-[#10b981]/40 bg-[#10b981]/10 px-3 text-[#4edea3] transition-colors hover:bg-[#10b981]/20"
          >
            <Dices className="h-4 w-4" />
            <span className="hidden font-['Chivo'] text-[10px] font-bold uppercase tracking-wide sm:inline">Quick Match</span>
          </button>
          {/* Activity / Notification Bell */}
          <div className="relative">
            <button
              onClick={onOpenChallengeInbox}
              title="Challenge invitations"
              className="w-9 h-9 rounded-full bg-[#161b22] border border-[#30363d] flex items-center justify-center text-[#86948a] hover:text-white transition-colors relative"
            >
              <Bell className="w-4 h-4" />
              {challengeBadge > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ffb95f] px-1 font-['JetBrains_Mono'] text-[9px] font-black text-[#2a1700] ring-2 ring-[#10141a]">{challengeBadge}</span>
              )}
            </button>

            {showMenu && (
              <div className="absolute right-0 mt-2 w-64 rounded-xl bg-[#1c2026] border border-[#30363d] p-3 shadow-2xl z-50 anim-pop">
                <div className="flex items-center justify-between pb-2 border-b border-[#30363d]/60 mb-2">
                  <span className="font-['Chivo'] text-xs font-bold text-white uppercase tracking-wider">
                    League Status
                  </span>
                  <span className="text-[10px] font-['JetBrains_Mono'] text-[#4edea3]">Live Elo</span>
                </div>
                <div className="space-y-2 text-xs text-[#bbcabf]">
                  <div className="flex justify-between items-center py-1">
                    <span>Matches Logged:</span>
                    <span className="font-['JetBrains_Mono'] font-bold text-white">{matchesCount}</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span>K-Factor Rating:</span>
                    <span className="font-['JetBrains_Mono'] font-bold text-[#4edea3]">32</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span>Base Rating:</span>
                    <span className="font-['JetBrains_Mono'] font-bold text-white">1000</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Current User Avatar */}
          {currentUser && (
            <button type="button" onClick={onOpenProfile} className="relative rounded-full" title="Edit your profile">
              {currentUser.avatarUrl ? (
                <img
                  src={currentUser.avatarUrl}
                  alt={currentUser.name}
                  referrerPolicy="no-referrer"
                  className="w-9 h-9 rounded-full object-cover border-2 border-[#10b981]/50 ring-2 ring-[#10141a]"
                />
              ) : (
                <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#10b981]/50 bg-[#262a31] font-['Chivo'] text-sm font-bold text-[#4edea3] ring-2 ring-[#10141a]">
                  {currentUser.name.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-[#10b981] text-[#002113] rounded-full text-[9px] font-['JetBrains_Mono'] font-extrabold flex items-center justify-center border border-[#10141a]">
                1
              </span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
