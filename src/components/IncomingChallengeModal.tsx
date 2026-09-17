import React, { useState } from 'react';
import { Check, Clock, Crown, Swords, X } from 'lucide-react';
import { Challenge, Player } from '../types';

interface IncomingChallengeModalProps {
  challenge: Challenge;
  players: Player[];
  onAccept: (challenge: Challenge) => Promise<void>;
  onDecline: (challenge: Challenge) => Promise<void>;
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
  onAccept,
  onDecline,
  onDismiss,
}) => {
  const [busy, setBusy] = useState(false);
  const challenger = players.find((player) => player.id === challenge.challengerId);
  const hoursLeft = Math.max(0, Math.round((challenge.expiresAt - Date.now()) / 3_600_000));

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
      <div className="anim-pop w-full max-w-sm rounded-2xl border border-[#10b981]/50 bg-gradient-to-b from-[#1c2026] to-[#10141a] p-6 text-center shadow-[0_0_32px_rgba(16,185,129,0.25)]">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full border border-[#10b981] bg-[#10b981]/15 text-[#4edea3]">
          <Swords className="h-7 w-7" />
        </div>

        <span className="font-['JetBrains_Mono'] text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#4edea3]">
          You've been called out
        </span>

        <h2 className="mt-1 font-['Chivo'] text-2xl font-black tracking-tight text-white">
          {challenge.challengerName}
        </h2>
        {challenger?.department && (
          <p className="font-['Space_Grotesk'] text-xs text-[#86948a]">{challenger.department}</p>
        )}

        <div className="my-5 space-y-2 rounded-xl border border-[#30363d] bg-[#161b22] p-4">
          <div className="flex items-center justify-between font-['JetBrains_Mono'] text-sm font-bold">
            <span className="text-[#4edea3]">+{challenge.stakes.opponentWinDelta} if you win</span>
            <span className="text-[#ffb4ab]">-{challenge.stakes.challengerWinDelta} if you lose</span>
          </div>
          {challenge.stakes.crownBounty > 0 && (
            <p className="flex items-center justify-center gap-1.5 border-t border-[#30363d] pt-2 font-['Space_Grotesk'] text-[11px] text-[#f59e0b]">
              <Crown className="h-3.5 w-3.5" />
              {challenge.stakes.crownBounty} crown bounty on the table
            </p>
          )}
          <p className="flex items-center justify-center gap-1.5 font-['Space_Grotesk'] text-[11px] text-[#86948a]">
            <Clock className="h-3.5 w-3.5" />
            {hoursLeft > 0 ? `${hoursLeft}h to answer` : 'Expiring shortly'}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => onAccept(challenge))}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-[#10b981] px-3 py-3 font-['Chivo'] text-sm font-bold text-[#002113] transition-all active:scale-[0.98] disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            Accept
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => onDecline(challenge))}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-[#30363d] px-3 py-3 font-['Chivo'] text-sm font-bold text-[#86948a] transition-all hover:border-[#ef4444] hover:text-[#ffb4ab] active:scale-[0.98] disabled:opacity-50"
          >
            <X className="h-4 w-4" />
            Duck it
          </button>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => onDismiss(challenge)}
          className="mt-3 w-full font-['Space_Grotesk'] text-[11px] text-[#86948a] hover:text-white disabled:opacity-50"
        >
          Decide later
        </button>
      </div>
    </div>
  );
};
