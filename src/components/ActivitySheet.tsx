import React from 'react';
import { ArrowUpRight, BellOff, Crown, Eye, Swords, Trophy, X } from 'lucide-react';
import { LeagueNotification, LeagueNotificationType } from '../services/notifications';
import { Challenge } from '../types';

interface ActivitySheetProps {
  items: LeagueNotification[];
  /** A callout waiting on the reader's answer sits pinned above the feed. */
  pendingChallenge: Challenge | null;
  now: number;
  onOpenChallenge: () => void;
  onSelect: (item: LeagueNotification) => void;
  onClose: () => void;
}

const ICONS: Record<LeagueNotificationType, { icon: React.ElementType; colour: string }> = {
  challenge: { icon: Swords, colour: 'text-[#ffb95f]' },
  challenge_answered: { icon: Swords, colour: 'text-[#4edea3]' },
  match_live: { icon: Eye, colour: 'text-[#ff6b6b]' },
  match_result: { icon: Trophy, colour: 'text-[#bbcabf]' },
  rank_change: { icon: ArrowUpRight, colour: 'text-[#ffb4ab]' },
  prediction_result: { icon: Eye, colour: 'text-[#4edea3]' },
  crown_taken: { icon: Crown, colour: 'text-[#f59e0b]' },
};

export const describeAgo = (createdAt: number, now: number): string => {
  const minutes = Math.max(0, Math.round((now - createdAt) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
};

/**
 * The bell's other half. A push you dismissed on the lock screen used to be
 * gone; now the same message waits here, and a callout that still needs an
 * answer is the first thing on the pile.
 */
export const ActivitySheet: React.FC<ActivitySheetProps> = ({
  items,
  pendingChallenge,
  now,
  onOpenChallenge,
  onSelect,
  onClose,
}) => (
  <div className="anim-fade fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center" onClick={onClose}>
    <div
      className="anim-sheet flex max-h-[85vh] w-full max-w-md flex-col rounded-t-2xl border border-[#30363d] bg-[#10141a] pb-[var(--safe-bottom)] shadow-2xl sm:rounded-2xl"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-[#30363d]/60 px-4 py-3">
        <h2 className="font-['Chivo'] text-sm font-black uppercase tracking-wider text-white">Activity</h2>
        <button onClick={onClose} className="rounded-full p-1.5 text-[#86948a] hover:text-white" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="overflow-y-auto">
        {pendingChallenge && (
          <button
            onClick={onOpenChallenge}
            className="flex w-full items-center gap-3 border-b border-[#ffb95f]/30 bg-[#ffb95f]/10 px-4 py-3 text-left"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#ffb95f]/40 bg-[#ffb95f]/20 text-[#ffb95f]">
              <Swords className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-['Chivo'] text-sm font-bold text-white">
                {pendingChallenge.challengerName.split(' ')[0]} called you out
              </span>
              <span className="block font-['Space_Grotesk'] text-xs text-[#ffb95f]">Waiting on your answer · tap to respond</span>
            </span>
          </button>
        )}

        {items.length === 0 && !pendingChallenge && (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <BellOff className="h-6 w-6 text-[#3c4a42]" />
            <p className="font-['Space_Grotesk'] text-sm text-[#86948a]">
              Nothing yet. You hear about it here when you lose, get passed, get called out, or a call of yours settles.
            </p>
          </div>
        )}

        <ul className="divide-y divide-[#30363d]/50">
          {items.map((item) => {
            const { icon: Icon, colour } = ICONS[item.type] ?? ICONS.match_result;
            return (
              <li key={item.id}>
                <button
                  onClick={() => onSelect(item)}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[#161b22] ${item.read ? '' : 'bg-[#161b22]/70'}`}
                >
                  <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#30363d] bg-[#1c2026] ${colour}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`truncate font-['Chivo'] text-sm ${item.read ? 'font-semibold text-[#bbcabf]' : 'font-bold text-white'}`}>
                        {item.title}
                      </span>
                      <span className="shrink-0 font-['JetBrains_Mono'] text-[10px] text-[#86948a]">{describeAgo(item.createdAt, now)}</span>
                    </span>
                    {item.body && (
                      <span className="mt-0.5 block font-['Space_Grotesk'] text-xs leading-snug text-[#86948a]">{item.body}</span>
                    )}
                  </span>
                  {!item.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#4edea3]" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  </div>
);

/** The in-app landing for a message that arrives while the app is open. */
export const ActivityToast: React.FC<{ item: LeagueNotification; onOpen: () => void; onDismiss: () => void }> = ({
  item,
  onOpen,
  onDismiss,
}) => {
  const { icon: Icon, colour } = ICONS[item.type] ?? ICONS.match_result;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(var(--safe-top)+4.5rem)] z-[60] flex justify-center px-4">
      <button
        onClick={onOpen}
        className="anim-pop pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-[#30363d] bg-[#1c2026]/95 p-3 text-left shadow-2xl backdrop-blur-md"
      >
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#30363d] bg-[#10141a] ${colour}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-['Chivo'] text-sm font-bold text-white">{item.title}</span>
          {item.body && <span className="block font-['Space_Grotesk'] text-xs text-[#bbcabf]">{item.body}</span>}
        </span>
        <span
          role="button"
          aria-label="Dismiss"
          onClick={(event) => {
            event.stopPropagation();
            onDismiss();
          }}
          className="p-1 text-[#86948a] hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </span>
      </button>
    </div>
  );
};
