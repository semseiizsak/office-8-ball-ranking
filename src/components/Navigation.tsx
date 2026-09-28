import React from 'react';
import { History, Swords, Trophy } from 'lucide-react';
import { TabType } from '../types';

interface NavigationProps {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
  /** Open challenges waiting on this player, shown as a dot on the Arena tab. */
  arenaBadge?: number;
}

const TABS: Array<{ tab: TabType; label: string; Icon: typeof Trophy }> = [
  { tab: 'leaderboard', label: 'Ranks', Icon: Trophy },
  { tab: 'arena', label: 'Arena', Icon: Swords },
  { tab: 'history', label: 'History', Icon: History },
];

/**
 * A floating pill at the bottom of the screen. The active tab is a white pill
 * with its label; the others are just icons.
 */
export const Navigation: React.FC<NavigationProps> = ({ activeTab, onSelectTab, arenaBadge = 0 }) => (
  <nav
    id="bottom-navigation-bar"
    className="anim-rise fixed bottom-[calc(var(--safe-bottom)+16px)] left-1/2 z-40 flex -translate-x-1/2 gap-1 rounded-full border border-white/14 bg-surface p-1.5"
  >
    {TABS.map(({ tab, label, Icon }) => {
      const active = activeTab === tab;
      const dot = tab === 'arena' && arenaBadge > 0 && !active;
      return (
        <button
          key={tab}
          id={`nav-tab-${tab}`}
          type="button"
          onClick={() => onSelectTab(tab)}
          aria-current={active ? 'page' : undefined}
          aria-label={dot ? `${label}, something new` : label}
          className={`press relative flex h-[46px] min-w-[50px] items-center justify-center gap-1.5 overflow-hidden rounded-full px-4 text-[11px] font-extrabold uppercase tracking-[0.08em] transition-[background-color,color,padding] duration-300 ease-[var(--ease)] ${
            active ? 'bg-white px-[18px] text-bg' : 'text-white/55 hover:text-white'
          }`}
        >
          <Icon key={active ? 'on' : 'off'} className={`h-5 w-5 flex-none ${active ? 'anim-pop' : ''}`} strokeWidth={2.25} />
          {active && <span className="anim-fade">{label}</span>}
          {dot && <span className="absolute right-3 top-2.5 h-2 w-2 rounded-full bg-live" />}
        </button>
      );
    })}
  </nav>
);
