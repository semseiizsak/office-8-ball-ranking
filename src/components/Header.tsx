import React from 'react';
import { Bell, Dices, RotateCw } from 'lucide-react';
import { TabType, Player } from '../types';
import { hardRefresh } from '../utils/refresh';
import { PlayerAvatar } from './ui';

interface HeaderProps {
  activeTab: TabType;
  currentUser: Player | null;
  matchesCount: number;
  onOpenProfile: () => void;
  onQuickMatch: () => void;
  /** Unread messages plus callouts still waiting on an answer. */
  activityBadge?: number;
  onOpenActivity: () => void;
}

const TITLES: Record<TabType, string> = {
  leaderboard: 'Ranks',
  arena: 'Arena',
  cup: 'Cup',
  collection: 'Cards',
  history: 'History',
};

/**
 * Page title on the left, the three things you reach for from anywhere on the
 * right: activity, a quick match and your own profile with your rating on it.
 */
export const Header: React.FC<HeaderProps> = ({
  activeTab,
  currentUser,
  onOpenProfile,
  onQuickMatch,
  activityBadge = 0,
  onOpenActivity,
}) => {
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await hardRefresh();
  };

  const iconButton =
    'press relative flex h-11 w-11 items-center justify-center rounded-full bg-surface-alt text-white transition-colors hover:bg-[#2C2C2C]';

  return (
    <header className="sticky top-0 z-40 w-full bg-bg px-4 pb-3 pt-[calc(var(--safe-top)+0.9rem)]">
      <div className="flex items-center justify-between gap-2">
        <h1 key={activeTab} className="anim-rise min-w-0 truncate font-display text-[28px] font-extrabold uppercase leading-none tracking-[-0.02em] text-white min-[440px]:text-[32px]">
          {TITLES[activeTab]}
        </h1>

        <div className="flex flex-none items-center gap-1.5">
          <button type="button" onClick={handleRefresh} disabled={isRefreshing} aria-label="Refresh" title="Refresh" className={iconButton}>
            <RotateCw className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : ''}`} strokeWidth={2.25} />
          </button>
          <button type="button" onClick={onQuickMatch} aria-label="Quick match" className={iconButton}>
            <Dices className="h-5 w-5" strokeWidth={2.25} />
          </button>
          <button
            type="button"
            onClick={onOpenActivity}
            aria-label={activityBadge > 0 ? `Activity, ${activityBadge} new` : 'Activity'}
            className={iconButton}
          >
            <Bell className="h-5 w-5" strokeWidth={2.25} />
            {activityBadge > 0 && (
              <span className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-white px-1 text-[10px] font-black tabular-nums text-bg">
                {activityBadge > 9 ? '9+' : activityBadge}
              </span>
            )}
          </button>
          {currentUser && (
            <button
              type="button"
              onClick={onOpenProfile}
              aria-label={`Your profile, ${currentUser.elo} Elo`}
              className="press flex h-11 min-w-11 items-center justify-center gap-2 rounded-full bg-surface-alt px-1.5 text-sm font-black tabular-nums text-white transition-colors hover:bg-[#2C2C2C] min-[440px]:pr-3.5"
            >
              <PlayerAvatar player={currentUser} size={32} />
              <span className="hidden min-[440px]:inline">{currentUser.elo}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
