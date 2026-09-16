import React from 'react';
import { Trophy, Users } from 'lucide-react';
import { TabType } from '../types';

interface NavigationProps {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
}

export const Navigation: React.FC<NavigationProps> = ({ activeTab, onSelectTab }) => {
  return (
    <nav
      id="bottom-navigation-bar"
      className="fixed bottom-0 left-0 right-0 z-40 w-full bg-[#10141a]/95 backdrop-blur-lg border-t border-[#30363d]/80 pb-[env(safe-area-inset-bottom,12px)] pt-2"
    >
      <div className="max-w-md mx-auto px-6 flex items-center justify-around">
        {/* Tab 1: Leaderboard */}
        <button
          id="nav-tab-leaderboard"
          onClick={() => onSelectTab('leaderboard')}
          className={`flex flex-col items-center justify-center py-1 px-4 rounded-xl transition-all duration-200 group relative ${
            activeTab === 'leaderboard' ? 'text-[#4edea3]' : 'text-[#86948a] hover:text-[#dfe2eb]'
          }`}
        >
          {activeTab === 'leaderboard' && (
            <span className="absolute -top-2 w-8 h-1 rounded-full bg-[#4edea3] shadow-[0_0_8px_#10b981]"></span>
          )}
          <div className="relative p-1">
            <Trophy
              className={`w-6 h-6 transition-transform duration-200 ${
                activeTab === 'leaderboard' ? 'scale-110 stroke-[2.5]' : 'group-hover:scale-105'
              }`}
            />
          </div>
          <span
            className={`text-xs font-['Space_Grotesk'] font-medium tracking-tight mt-0.5 whitespace-nowrap ${
              activeTab === 'leaderboard' ? 'font-bold text-[#4edea3]' : ''
            }`}
          >
            Leaderboard
          </span>
        </button>

        {/* Tab 2: Log Match (Center Focal Point) */}
        <button
          id="nav-tab-log"
          onClick={() => onSelectTab('log')}
          className={`flex flex-col items-center justify-center py-1 px-4 rounded-xl transition-all duration-200 group relative ${
            activeTab === 'log' ? 'text-[#4edea3]' : 'text-[#86948a] hover:text-[#dfe2eb]'
          }`}
        >
          {activeTab === 'log' && (
            <span className="absolute -top-2 w-8 h-1 rounded-full bg-[#4edea3] shadow-[0_0_8px_#10b981]"></span>
          )}
          <div className="relative p-1">
            {/* Custom 8-Ball mini icon */}
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center transition-transform duration-200 ${
                activeTab === 'log'
                  ? 'scale-110 ring-2 ring-[#4edea3]/80 shadow-[0_0_12px_rgba(16,185,129,0.35)]'
                  : 'group-hover:scale-105 opacity-80'
              }`}
              style={{
                background: 'radial-gradient(circle at 35% 35%, #1f2937 0%, #030712 100%)',
              }}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-white flex items-center justify-center">
                <span className="text-[7px] font-black text-black leading-none">8</span>
              </div>
            </div>
          </div>
          <span
            className={`text-xs font-['Space_Grotesk'] font-medium tracking-tight mt-0.5 whitespace-nowrap ${
              activeTab === 'log' ? 'font-bold text-[#4edea3]' : ''
            }`}
          >
            Log Match
          </span>
        </button>

        {/* Tab 3: Players */}
        <button
          id="nav-tab-players"
          onClick={() => onSelectTab('players')}
          className={`flex flex-col items-center justify-center py-1 px-4 rounded-xl transition-all duration-200 group relative ${
            activeTab === 'players' ? 'text-[#4edea3]' : 'text-[#86948a] hover:text-[#dfe2eb]'
          }`}
        >
          {activeTab === 'players' && (
            <span className="absolute -top-2 w-8 h-1 rounded-full bg-[#4edea3] shadow-[0_0_8px_#10b981]"></span>
          )}
          <div className="relative p-1">
            <Users
              className={`w-6 h-6 transition-transform duration-200 ${
                activeTab === 'players' ? 'scale-110 stroke-[2.5]' : 'group-hover:scale-105'
              }`}
            />
          </div>
          <span
            className={`text-xs font-['Space_Grotesk'] font-medium tracking-tight mt-0.5 whitespace-nowrap ${
              activeTab === 'players' ? 'font-bold text-[#4edea3]' : ''
            }`}
          >
            Players
          </span>
        </button>
      </div>
    </nav>
  );
};
