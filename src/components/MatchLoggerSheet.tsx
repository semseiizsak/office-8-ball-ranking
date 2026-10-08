import React from 'react';
import { X } from 'lucide-react';
import { MatchModifier, MatchRecord, Player, Pocket } from '../types';
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
    modifiers: MatchModifier,
    winnerBall?: 'solids' | 'stripes',
    lastPocket?: Pocket
  ) => void;
  onClose: () => void;
}

/**
 * Recording a result, as a sheet over whatever you were looking at. It opens,
 * takes the result, and closes.
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
  <div role="dialog" aria-modal="true" aria-label="Log a match" className="fixed inset-0 z-[58] flex items-end justify-center">
    <button type="button" aria-label="Close" onClick={onClose} disabled={isSubmitting} className="anim-fade absolute inset-0 bg-black/60" />
    <div className="anim-sheet relative flex max-h-[92vh] w-full max-w-md flex-col rounded-t-3xl bg-elev">
      <div className="flex shrink-0 flex-col gap-2.5 px-4 pt-2.5">
        <span className="mx-auto h-1 w-10 rounded-full bg-white/25" />
        <div className="flex items-center justify-between">
          <h2 className="text-[22px]">Log match</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close"
            className="press grid h-11 w-11 place-items-center rounded-full bg-surface-alt disabled:opacity-40"
          >
            <X className="h-5 w-5" strokeWidth={2.25} />
          </button>
        </div>
      </div>
      <div className="no-scrollbar flex-1 overflow-y-auto px-4 pb-[calc(var(--safe-bottom)+1.5rem)] pt-3">
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
  </div>
);
