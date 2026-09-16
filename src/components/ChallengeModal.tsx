import React, { useState } from 'react';
import { Crown, Swords, X } from 'lucide-react';
import { ChallengeStakes, Player } from '../types';
import { CrownState } from '../utils/league';
import { previewStakes } from '../utils/stakes';

interface ChallengeModalProps {
  currentPlayer: Player;
  players: Player[];
  crown: CrownState;
  preselectedOpponentId?: string;
  onSend: (opponent: Player, stakes: ChallengeStakes) => Promise<void>;
  onClose: () => void;
}

/**
 * Issuing a challenge is where the app gets to matter before anyone picks up a
 * cue: you see the position you stand to gain or lose before you commit.
 */
export const ChallengeModal: React.FC<ChallengeModalProps> = ({
  currentPlayer,
  players,
  crown,
  preselectedOpponentId,
  onSend,
  onClose,
}) => {
  const opponents = [...players]
    .filter((player) => player.id !== currentPlayer.id)
    .sort((left, right) => right.elo - left.elo);

  const [opponentId, setOpponentId] = useState<string>(
    preselectedOpponentId && opponents.some((player) => player.id === preselectedOpponentId)
      ? preselectedOpponentId
      : opponents[0]?.id ?? ''
  );
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');

  const opponent = opponents.find((player) => player.id === opponentId) ?? null;
  const bountyOnOpponent = opponent && crown.holderId === opponent.id ? crown.bounty : 0;
  const bountyOnMe = crown.holderId === currentPlayer.id ? crown.bounty : 0;

  const stakes = opponent
    ? previewStakes(currentPlayer, opponent, players, bountyOnOpponent, bountyOnMe)
    : null;

  const handleSend = async () => {
    if (!opponent || !stakes) return;
    const theirSide = previewStakes(opponent, currentPlayer, players, bountyOnMe, bountyOnOpponent);
    try {
      setIsSending(true);
      setError('');
      await onSend(opponent, {
        challengerElo: currentPlayer.elo,
        opponentElo: opponent.elo,
        challengerRank: stakes.currentRank,
        opponentRank: theirSide.currentRank,
        challengerWinDelta: stakes.winDelta,
        opponentWinDelta: theirSide.winDelta,
        challengerIsUnderdog: stakes.isUnderdog,
        crownBounty: bountyOnOpponent,
      });
    } catch {
      setError('Could not send that challenge. Try again.');
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-t-2xl border border-[#30363d] bg-[#10141a] shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-[#30363d] px-5 py-4">
          <h3 className="flex items-center gap-2 font-['Chivo'] text-base font-bold text-white">
            <Swords className="h-4 w-4 text-[#4edea3]" />
            Call someone out
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-[#86948a] hover:bg-[#1c2026] hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <span className="font-['JetBrains_Mono'] text-[10px] font-bold uppercase tracking-wider text-[#86948a]">
            Opponent
          </span>
          <div className="mt-2 space-y-1.5">
            {opponents.map((player) => {
              const selected = player.id === opponentId;
              const wearsCrown = crown.holderId === player.id;
              return (
                <button
                  key={player.id}
                  type="button"
                  onClick={() => setOpponentId(player.id)}
                  className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left transition-all ${
                    selected
                      ? 'border-[#10b981] bg-[#10b981]/15'
                      : 'border-[#30363d] bg-[#1c2026] hover:border-[#4edea3]/50'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-['Chivo'] text-sm font-bold text-white">
                      {player.name}
                    </span>
                    {wearsCrown && <Crown className="h-3.5 w-3.5 shrink-0 fill-[#f59e0b] text-[#f59e0b]" />}
                  </span>
                  <span className="shrink-0 font-['JetBrains_Mono'] text-sm font-bold text-[#4edea3]">
                    {player.elo}
                  </span>
                </button>
              );
            })}
            {opponents.length === 0 && (
              <p className="rounded-xl border border-dashed border-[#30363d] px-4 py-6 text-center font-['Space_Grotesk'] text-xs text-[#86948a]">
                Nobody else on the roster yet.
              </p>
            )}
          </div>

          {stakes && (
            <div className="mt-4 rounded-xl border border-[#30363d] bg-[#161b22] p-4">
              <span className="font-['JetBrains_Mono'] text-[10px] font-bold uppercase tracking-widest text-[#86948a]">
                What this is worth
              </span>
              <p className="mt-2 font-['Space_Grotesk'] text-sm leading-relaxed text-white">
                {stakes.headline}
              </p>
              <div className="mt-3 flex items-center justify-between border-t border-[#30363d] pt-3 font-['JetBrains_Mono'] text-sm font-bold">
                <span className="text-[#4edea3]">+{stakes.winDelta} if you win</span>
                <span className="text-[#ffb4ab]">-{stakes.loseDelta} if you lose</span>
              </div>
              {stakes.bounty > 0 && (
                <p className="mt-2 flex items-center gap-1.5 font-['Space_Grotesk'] text-[11px] text-[#f59e0b]">
                  <Crown className="h-3.5 w-3.5" />
                  Includes {stakes.bounty} crown bounty.
                </p>
              )}
              {stakes.isUnderdog && (
                <p className="mt-2 font-['Space_Grotesk'] text-[11px] text-[#bbcabf]">
                  You're the underdog, which is exactly why it pays more.
                </p>
              )}
            </div>
          )}

          {error && (
            <p className="mt-3 rounded-xl border border-[#ef4444]/40 bg-[#ef4444]/10 p-3 text-xs text-[#ffb4ab]">
              {error}
            </p>
          )}
        </div>

        <div className="border-t border-[#30363d] p-4">
          <button
            type="button"
            disabled={!opponent || isSending}
            onClick={handleSend}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#10b981] px-4 py-3 font-['Chivo'] text-sm font-bold text-[#002113] shadow-[0_0_16px_rgba(16,185,129,0.3)] transition-all active:scale-[0.98] disabled:opacity-50"
          >
            <Swords className="h-4 w-4" />
            {isSending ? 'Sending...' : `Challenge ${opponent?.name.split(' ')[0] ?? ''}`}
          </button>
          <p className="mt-2 text-center font-['Space_Grotesk'] text-[11px] text-[#86948a]">
            The office can call the winner until you log the result.
          </p>
        </div>
      </div>
    </div>
  );
};
