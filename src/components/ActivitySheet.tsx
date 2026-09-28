import React from 'react';
import { X } from 'lucide-react';
import { LeagueNotification } from '../services/notifications';
import { Challenge } from '../types';
import { Ball, Sheet } from './ui';

interface ActivitySheetProps {
  items: LeagueNotification[];
  /** A callout waiting on the reader's answer sits pinned above the feed. */
  pendingChallenge: Challenge | null;
  now: number;
  onOpenChallenge: () => void;
  onSelect: (item: LeagueNotification) => void;
  onClose: () => void;
}

const EMOJI: Record<string, string> = {
  challenge: '⚔️',
  challenge_answered: '🤝',
  match_live: '📺',
  match_result: '🎱',
  rank_change: '📈',
  prediction_result: '🔮',
  crown_taken: '👑',
};

export const describeAgo = (createdAt: number, now: number): string => {
  const minutes = Math.max(0, Math.round((now - createdAt) / 60_000));
  if (minutes < 1) return 'now';
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
  <Sheet title="Activity" onClose={onClose}>
    {pendingChallenge && (
      <button
        type="button"
        onClick={onOpenChallenge}
        className="press flex items-center justify-between gap-3 rounded-2xl bg-card p-3.5 text-left shadow-[inset_0_0_0_1.5px_#fff]"
      >
        <span className="grid min-w-0 gap-0.5">
          <b className="truncate text-sm">{pendingChallenge.challengerName.split(' ')[0]} called you out</b>
          <span className="text-xs font-semibold text-white/55">Waiting on your answer</span>
        </span>
        <span className="flex h-9 flex-none items-center rounded-full bg-white px-3.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-bg">Answer</span>
      </button>
    )}

    {items.length === 0 && !pendingChallenge ? (
      <div className="grid justify-items-center gap-2 rounded-2xl bg-card px-4 py-7 text-center">
        <Ball n={8} size={64} className="mb-1" />
        <h3 className="text-lg">All quiet</h3>
        <p className="text-sm text-white/70">You hear about it here when you lose, get passed, get called out, or a call of yours settles.</p>
      </div>
    ) : (
      <div className="stagger-rows grid gap-0.5">
        {items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item)}
            style={{ ['--j' as string]: Math.min(index, 12) }}
            className={`press relative grid grid-cols-[auto_1fr_auto] items-start gap-3 rounded-xl p-3 text-left ${item.read ? 'bg-card' : 'bg-surface-alt'}`}
          >
            {!item.read && <span className="absolute left-1 top-1/2 h-[5px] w-[5px] -translate-y-1/2 rounded-full bg-white" />}
            <span aria-hidden="true" className="text-[28px] leading-none">{EMOJI[item.type] ?? '🎱'}</span>
            <span className="grid min-w-0 gap-0.5 [overflow-wrap:anywhere]">
              <b className="text-sm">{item.title}</b>
              {item.body && <span className="text-[13px] text-white/70">{item.body}</span>}
            </span>
            <span className="text-xs font-semibold tabular-nums text-white/55">{describeAgo(item.createdAt, now)}</span>
          </button>
        ))}
      </div>
    )}
  </Sheet>
);

/** The in-app landing for a message that arrives while the app is open. */
export const ActivityToast: React.FC<{ item: LeagueNotification; onOpen: () => void; onDismiss: () => void }> = ({
  item,
  onOpen,
  onDismiss,
}) => (
  <div className="pointer-events-none fixed inset-x-0 top-[calc(var(--safe-top)+1rem)] z-[60] flex justify-center px-4">
    <div role="status" aria-live="polite" className="anim-pop pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-[20px] bg-white p-3 pl-4 text-bg">
      <span aria-hidden="true" className="text-2xl leading-none">{EMOJI[item.type] ?? '🎱'}</span>
      <button type="button" onClick={onOpen} className="grid min-w-0 flex-1 text-left">
        <b className="truncate text-sm">{item.title}</b>
        {item.body && <span className="truncate text-xs">{item.body}</span>}
      </button>
      <button type="button" aria-label="Dismiss" onClick={onDismiss} className="grid h-9 w-9 flex-none place-items-center rounded-full bg-bg text-white">
        <X className="h-4 w-4" strokeWidth={2.5} />
      </button>
    </div>
  </div>
);
