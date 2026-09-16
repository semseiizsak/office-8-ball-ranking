import React from 'react';
import { Bell, RotateCcw, Sparkles } from 'lucide-react';
import { EightBallIcon } from './EightBallIcon';
import { TabType, Player } from '../types';

interface HeaderProps {
  activeTab: TabType;
  currentUser: Player | null;
  onResetData: () => void;
  matchesCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  currentUser,
  onResetData,
  matchesCount,
}) => {
  const [showMenu, setShowMenu] = React.useState(false);

  const getSubtext = () => {
    switch (activeTab) {
      case 'leaderboard':
        return 'POWER RANKINGS';
      case 'log':
        return 'LOG MATCH';
      case 'players':
        return 'ROSTER & DOSSIERS';
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-[#10141a]/95 backdrop-blur-md border-b border-[#30363d]/60 px-4 py-3">
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
                S4
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
          {/* Quick reset button for easy demo reset */}
          <button
            onClick={() => {
              if (window.confirm('Reset all ratings and match history back to default sample state?')) {
                onResetData();
              }
            }}
            title="Reset to default league data"
            className="w-9 h-9 rounded-full bg-[#161b22] border border-[#30363d] flex items-center justify-center text-[#86948a] hover:text-[#4edea3] hover:border-[#10b981]/40 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Activity / Notification Bell */}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="w-9 h-9 rounded-full bg-[#161b22] border border-[#30363d] flex items-center justify-center text-[#86948a] hover:text-white transition-colors relative"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#10b981] ring-2 ring-[#10141a]"></span>
            </button>

            {showMenu && (
              <div className="absolute right-0 mt-2 w-64 rounded-xl bg-[#1c2026] border border-[#30363d] p-3 shadow-2xl z-50 animate-in fade-in zoom-in-95">
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
            <div className="relative">
              <img
                src={currentUser.avatarUrl}
                alt={currentUser.name}
                referrerPolicy="no-referrer"
                className="w-9 h-9 rounded-full object-cover border-2 border-[#10b981]/50 ring-2 ring-[#10141a]"
              />
              <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-[#10b981] text-[#002113] rounded-full text-[9px] font-['JetBrains_Mono'] font-extrabold flex items-center justify-center border border-[#10141a]">
                1
              </span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
