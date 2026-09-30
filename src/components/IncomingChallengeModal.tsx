import React, { useState } from 'react';
import { Challenge, Player } from '../types';
import { PlayerAvatar, Sheet, StakeTiles } from './ui';

interface IncomingChallengeModalProps {
  challenge: Challenge;
  players: Player[];
  variant?: 'incoming' | 'outgoing';
  onAccept?: (challenge: Challenge) => Promise<void>;
  onDecline?: (challenge: Challenge) => Promise<void>;
  onCancel?: (challenge: Challenge) => Promise<void>;
  onDismiss: (challenge: Challenge) => void;
}

/**
 * What the challenged player actually sees.
 *
 * A push notification only lands if they granted permission and the tab is
 * open, so the app cannot rely on it to deliver a callout. Anyone opening the
 * app to a standing challenge gets told, with the stakes, and can answer on the
 * spot.
 */
export const IncomingChallengeModal: React.FC<IncomingChallengeModalProps> = ({
  challenge,
  players,
  variant = 'incoming',
  onAccept,
  onDecline,
  onCancel,
  onDismiss,
}) => {
  const [busy, setBusy] = useState(false);
  const challenger = players.find((player) => player.id === challenge.challengerId);
  const hoursLeft = Math.max(0, Math.round((challenge.expiresAt - Date.now()) / 3_600_000));

  const isOutgoing = variant === 'outgoing';

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  const opponent = players.find((player) => player.id === challenge.opponentId);
  const them = isOutgoing ? opponent : challenger;
  const themName = isOutgoing ? challenge.opponentName : challenge.challengerName;
  const button = 'press h-12 rounded-full text-[13px] font-extrabold uppercase tracking-[0.06em] disabled:opacity-50';

  return (
    <Sheet
      z={59}
      title={isOutgoing ? `Waiting on ${themName.split(' ')[0]}` : `${themName.split(' ')[0]} called you out`}
      onClose={() => onDismiss(challenge)}
      closeDisabled={busy}
      footer={
        <div className="grid gap-2">
          {isOutgoing ? (
            <button type="button" disabled={busy || !onCancel} onClick={() => run(() => onCancel!(challenge))} className={`${button} bg-white text-bg`}>
              Withdraw callout
            </button>
          ) : (
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <button type="button" disabled={busy || !onAccept} onClick={() => run(() => onAccept!(challenge))} className={`${button} bg-white text-bg`}>
                Accept
              </button>
              <button type="button" disabled={busy || !onDecline} onClick={() => run(() => onDecline!(challenge))} className={`${button} bg-surface-alt px-5`}>
                Duck it
              </button>
            </div>
          )}
          <button type="button" disabled={busy} onClick={() => onDismiss(challenge)} className={`${button} bg-surface-alt`}>
            {isOutgoing ? 'Close' : 'Decide later'}
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="duel-in-left grid min-w-0 justify-items-center gap-1.5 text-center">
          <PlayerAvatar player={them ?? { id: isOutgoing ? challenge.opponentId : challenge.challengerId, name: themName, avatarUrl: '' }} size={56} />
          <span className="max-w-full truncate text-sm font-bold">{themName.split(' ')[0]}</span>
          {them?.department && <span className="max-w-full truncate text-xs font-semibold text-white/55">{them.department}</span>}
        </div>
        <span className="font-display text-xl font-extrabold text-white/55">VS</span>
        <div className="duel-in-right grid min-w-0 justify-items-center gap-1.5 text-center">
          <PlayerAvatar player={(isOutgoing ? challenger : opponent) ?? { id: 'me', name: 'You', avatarUrl: '' }} size={56} />
          <span className="text-sm font-bold">You</span>
        </div>
      </div>
      <StakeTiles
        win={isOutgoing ? challenge.stakes.challengerWinDelta : challenge.stakes.opponentWinDelta}
        lose={isOutgoing ? challenge.stakes.opponentWinDelta : challenge.stakes.challengerWinDelta}
        winNote={!isOutgoing && challenge.stakes.crownBounty > 0 ? `incl. 👑 ${challenge.stakes.crownBounty} bounty` : undefined}
      />
      <p className="text-sm text-white/70">
        {hoursLeft > 0 ? `${hoursLeft} hours to answer.` : 'Expiring shortly.'}
        {isOutgoing ? ' The office can already call it.' : ' Ducking it counts as a duck, and the Duck title keeps count.'}
      </p>
    </Sheet>
  );
};
