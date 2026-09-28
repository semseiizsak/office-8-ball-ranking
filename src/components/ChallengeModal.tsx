import React, { useRef, useState } from 'react';
import { Swords } from 'lucide-react';
import { ChallengeStakes, MatchRecord, Player } from '../types';
import { CrownState } from '../utils/league';
import { previewStakes } from '../utils/stakes';
import { PlayerAvatar, Sheet } from './ui';
import { MatchupCards } from './MatchupCards';

interface ChallengeModalProps {
  currentPlayer: Player;
  players: Player[];
  crown: CrownState;
  preselectedOpponentId?: string;
  /**
   * `challenge` sends a callout to answer later. `instant` puts the match on
   * the table now, for the game that was agreed in a sentence at the machine.
   */
  mode?: 'challenge' | 'instant';
  onSend: (opponent: Player, stakes: ChallengeStakes) => Promise<void>;
  onClose: () => void;
  /** This season's matches, for the rating lines on the cards. */
  matches?: MatchRecord[];
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
  mode = 'challenge',
  onSend,
  onClose,
  matches = [],
}) => {
  const instant = mode === 'instant';
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
  // State alone cannot stop taps that land in the same frame: they all read the
  // pre-update value and each one sends a challenge.
  const sendingRef = useRef(false);

  const opponent = opponents.find((player) => player.id === opponentId) ?? null;
  const bountyOnOpponent = opponent && crown.holderId === opponent.id ? crown.bounty : 0;
  const bountyOnMe = crown.holderId === currentPlayer.id ? crown.bounty : 0;

  const stakes = opponent
    ? previewStakes(currentPlayer, opponent, players, bountyOnOpponent, bountyOnMe)
    : null;

  const handleSend = async () => {
    if (!opponent || !stakes || sendingRef.current) return;
    sendingRef.current = true;
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
      sendingRef.current = false;
      setError(instant ? 'Could not start the match. Try again.' : 'Could not send that challenge. Try again.');
      setIsSending(false);
    }
  };

  const first = (name: string) => name.split(' ')[0];

  return (
    <Sheet
      title={instant ? "We're on the table" : 'Call out'}
      onClose={onClose}
      closeDisabled={isSending}
      footer={
        <button
          type="button"
          disabled={!opponent || isSending}
          onClick={handleSend}
          className={`press flex h-12 w-full items-center justify-center gap-2 rounded-full text-[13px] font-extrabold uppercase tracking-[0.06em] disabled:opacity-40 ${
            instant ? 'bg-live text-white' : 'bg-white text-bg'
          }`}
        >
          {instant ? <span className="live-dot" /> : <Swords className="h-[18px] w-[18px]" strokeWidth={2.25} />}
          {isSending
            ? instant ? 'Starting' : 'Sending'
            : opponent
              ? instant ? `Start vs ${first(opponent.name)}` : `Call ${first(opponent.name)} out`
              : 'Pick someone'}
        </button>
      }
    >
      <p className="text-sm text-white/70">{instant ? 'Who are you playing?' : 'Pick who you want to play. The stakes show before you send.'}</p>
      {opponents.length === 0 ? (
        <div className="grid justify-items-center gap-2 rounded-2xl bg-card px-4 py-7 text-center">
          <h3 className="text-lg">Nobody to play</h3>
          <p className="text-sm text-white/70">Enrol someone else first.</p>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-1.5">
          {opponents.map((player) => {
            const selected = player.id === opponentId;
            return (
              <button
                key={player.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setOpponentId(player.id)}
                className={`press grid min-w-0 justify-items-center gap-1.5 rounded-xl px-0.5 py-2.5 transition-colors ${
                  selected ? 'bg-surface-alt shadow-[inset_0_0_0_1.5px_#fff]' : 'hover:bg-surface'
                }`}
              >
                <PlayerAvatar player={player} size={44} />
                <span className="max-w-full truncate text-xs font-bold">{crown.holderId === player.id ? '👑 ' : ''}{first(player.name)}</span>
                <span className="text-[11px] font-semibold tabular-nums text-white/55">{player.elo}</span>
              </button>
            );
          })}
        </div>
      )}

      {stakes && (
        <>
          <MatchupCards
            playerA={currentPlayer}
            playerB={opponent}
            players={players}
            matches={matches}
            crown={crown}
            labelFor={(player) => (player.id === currentPlayer.id ? 'You' : undefined)}
          />
          <p className="text-sm text-white/70">
            {stakes.headline}
            {stakes.isUnderdog ? " You're the underdog, which is exactly why it pays more." : ''}
          </p>
          <p className="text-xs font-semibold text-white/55">
            {instant
              ? 'The office gets pinged and has four minutes to call it. Log the result from the same screen.'
              : `${opponent ? first(opponent.name) : 'They'} gets 24 hours to answer. The office can call it right away.`}
          </p>
        </>
      )}

      {error && <p role="alert" className="rounded-xl bg-surface-alt p-3 text-sm font-semibold">{error}</p>}
    </Sheet>
  );
};
