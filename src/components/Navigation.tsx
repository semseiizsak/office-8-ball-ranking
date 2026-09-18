import React from 'react';
import { History, Swords, Trophy } from 'lucide-react';
import { TabType } from '../types';

interface NavigationProps {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
  /** Open challenges waiting on this player, shown as a dot on the Arena tab. */
  arenaBadge?: number;
}

const TABS: Array<{ tab: TabType; label: string; icon: React.FC<{ active: boolean }> }> = [
  {
    tab: 'leaderboard',
    label: 'Ranks',
    icon: ({ active }) => (
      <Trophy className={`w-6 h-6 transition-transform duration-200 ${active ? 'scale-110 stroke-[2.5]' : 'group-hover:scale-105'}`} />
    ),
  },
  {
    tab: 'arena',
    label: 'Arena',
    icon: ({ active }) => (
      <Swords className={`w-6 h-6 transition-transform duration-200 ${active ? 'scale-110 stroke-[2.5]' : 'group-hover:scale-105'}`} />
    ),
  },
  {
    tab: 'history',
    label: 'History',
    icon: ({ active }) => (
      <History className={`w-6 h-6 transition-transform duration-200 ${active ? 'scale-110 stroke-[2.5]' : 'group-hover:scale-105'}`} />
    ),
  },
];

export const Navigation: React.FC<NavigationProps> = ({ activeTab, onSelectTab, arenaBadge = 0 }) => {
  return (
    <nav
      id="bottom-navigation-bar"
      className="fixed bottom-0 left-0 right-0 z-40 w-full bg-[#10141a]/95 backdrop-blur-lg border-t border-[#30363d]/80 pb-[calc(var(--safe-bottom)+0.625rem)] pt-2"
    >
      <div className="max-w-md mx-auto px-6 flex items-center justify-around">
        {TABS.map(({ tab, label, icon: Icon }) => {
          const active = activeTab === tab;
          return (
            <button
              key={tab}
              id={`nav-tab-${tab}`}
              onClick={() => onSelectTab(tab)}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all duration-200 group relative ${
                active ? 'text-[#4edea3]' : 'text-[#86948a] hover:text-[#dfe2eb]'
              }`}
            >
              {active && (
                <span className="absolute -top-2 w-8 h-1 rounded-full bg-[#4edea3] shadow-[0_0_8px_#10b981]"></span>
              )}
              <div className="relative p-1">
                <Icon active={active} />
                {tab === 'arena' && arenaBadge > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[#ffb95f] text-[#2a1700] text-[9px] font-['JetBrains_Mono'] font-black flex items-center justify-center border border-[#10141a]">
                    {arenaBadge}
                  </span>
                )}
              </div>
              <span
                className={`text-[11px] font-['Space_Grotesk'] font-medium tracking-tight mt-0.5 whitespace-nowrap ${
                  active ? 'font-bold text-[#4edea3]' : ''
                }`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
