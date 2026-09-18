import React from 'react';
import { X } from 'lucide-react';
import { MatchModifier, MatchRecord, Player } from '../types';
import { CrownState } from '../utils/league';
import { LogMatchView } from './LogMatchView';

interface MatchLoggerSheetProps {
  players: Player[];
  recentMatches: MatchRecord[];
  crown: CrownState;
  playerAId?: string;
  playerBId?: string;
  isSubmitting: boolean;
  onChangePlayers: (playerAId: string, playerBId: string) => void;
  onRecordMatch: (
    playerAId: string,
    playerBId: string,
    winnerId: string,
    modifiers: MatchModifier
  ) => void;
  onClose: () => void;
}

/**
 * Recording a result, as a sheet over whatever you were looking at.
 *
 * Logging used to be a tab, which made a one-off task sit permanently beside
 * the places you actually browse — and meant the form could be left half set up
 * and wandered away from. It opens, takes the result, and closes.
 */
export const MatchLoggerSheet: React.FC<MatchLoggerSheetProps> = ({
  players,
  recentMatches,
  crown,
  playerAId,
  playerBId,
  isSubmitting,
  onChangePlayers,
  onRecordMatch,
  onClose,
}) => (
  <div
    role="dialog"
    aria-label="Log a match"
    className="fixed inset-0 z-50 flex flex-col bg-[#10141a]"
  >
    <div className="flex shrink-0 items-center justify-between border-b border-[#30363d] px-4 pb-3 pt-[calc(var(--safe-top)+0.75rem)]">
      <h2 className="font-['Chivo'] text-base font-bold text-white">Log a match</h2>
      <button
        type="button"
        onClick={onClose}
        disabled={isSubmitting}
        className="rounded-full p-1.5 text-[#86948a] transition-colors hover:bg-[#1c2026] hover:text-white disabled:opacity-40"
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>
    </div>

    <div className="anim-sheet flex-1 overflow-y-auto px-4 pt-3 pb-[calc(var(--safe-bottom)+1.5rem)]">
      <LogMatchView
        players={players}
        recentMatches={recentMatches}
        crown={crown}
        playerAId={playerAId}
        playerBId={playerBId}
        onChangePlayers={onChangePlayers}
        isSubmitting={isSubmitting}
        onRecordMatch={onRecordMatch}
      />
    </div>
  </div>
);
