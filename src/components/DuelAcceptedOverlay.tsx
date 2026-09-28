import React, { useEffect } from 'react';
import { Challenge, Player } from '../types';
import { Clash } from './ChallengeAcceptedOverlay';

interface DuelAcceptedOverlayProps {
  challenge: Challenge;
  players: Player[];
  /** Fired once the hand-off finishes, to open the match. */
  onComplete: () => void;
}

/**
 * The moment the cue comes off the wall: the same clash as accepting, with a
 * red LIVE stamp, because this is where the room gets its four minutes.
 */
export const DuelAcceptedOverlay: React.FC<DuelAcceptedOverlayProps> = ({ challenge, players, onComplete }) => {
  useEffect(() => {
    const timer = window.setTimeout(onComplete, 2400);
    return () => window.clearTimeout(timer);
  }, [onComplete]);
  const challenger = players.find((player) => player.id === challenge.challengerId);
  const opponent = players.find((player) => player.id === challenge.opponentId);
  return (
    <Clash
      live
      stamp="Live"
      headline="On the table"
      text={
        <>
          The office has four minutes to call it.
          {challenge.stakes.crownBounty > 0 && ` 👑 ${challenge.stakes.crownBounty} bounty riding.`}
        </>
      }
      onComplete={onComplete}
      left={{ player: challenger, id: challenge.challengerId, name: challenge.challengerName }}
      right={{ player: opponent, id: challenge.opponentId, name: challenge.opponentName }}
    />
  );
};
