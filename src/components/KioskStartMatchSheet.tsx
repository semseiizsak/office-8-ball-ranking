import React, { useRef, useState } from 'react';
import { ChallengeStakes, Player, MatchRecord } from '../types';
import { CrownState } from '../utils/league';
import { previewStakes } from '../utils/stakes';
import { PlayerAvatar, Sheet } from './ui';
import { MatchupCards } from './MatchupCards';

interface KioskStartMatchSheetProps {
  players: Player[];
  crown: CrownState;
  matches: MatchRecord[];
  onStart: (challenger: Player, opponent: Player, stakes: ChallengeStakes) => Promise<void>;
  onClose: () => void;
}

/**
 * The kiosk has no "you" — whoever walked up picks both sides, in the order
 * they're standing at the table. Otherwise the same stakes preview and the
 * same one-tap start as calling it on from a phone.
 */
export const KioskStartMatchSheet: React.FC<KioskStartMatchSheetProps> = ({
  players,
  crown,
  matches,
  onStart,
  onClose,
}) => {
  const roster = [...players].sort((left, right) => right.elo - left.elo);
  const [picked, setPicked] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const sendingRef = useRef(false);

  const toggle = (id: string) => {
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((entry) => entry !== id);
      if (prev.length < 2) return [...prev, id];
      return [prev[1], id];
    });
    setError('');
  };

  const playerA = roster.find((player) => player.id === picked[0]) ?? null;
  const playerB = roster.find((player) => player.id === picked[1]) ?? null;

  const bountyOnA = playerA && crown.holderId === playerA.id ? crown.bounty : 0;
  const bountyOnB = playerB && crown.holderId === playerB.id ? crown.bounty : 0;
  const stakesA = playerA && playerB ? previewStakes(playerA, playerB, players, bountyOnB, bountyOnA) : null;
  const stakesB = playerA && playerB ? previewStakes(playerB, playerA, players, bountyOnA, bountyOnB) : null;

  const first = (name: string) => name.split(' ')[0];

  const handleStart = async () => {
    if (!playerA || !playerB || !stakesA || !stakesB || sendingRef.current) return;
    sendingRef.current = true;
    try {
      setIsSending(true);
      setError('');
      await onStart(playerA, playerB, {
        challengerElo: playerA.elo,
        opponentElo: playerB.elo,
        challengerRank: stakesA.currentRank,
        opponentRank: stakesB.currentRank,
        challengerWinDelta: stakesA.winDelta,
        opponentWinDelta: stakesB.winDelta,
        challengerIsUnderdog: stakesA.isUnderdog,
        crownBounty: bountyOnB,
      });
    } catch {
      sendingRef.current = false;
      setError('Could not start the match. Try again.');
      setIsSending(false);
    }
  };

  return (
    <Sheet
      title="Start a game"
      onClose={onClose}
      closeDisabled={isSending}
      z={59}
      footer={
        <button
          type="button"
          disabled={!playerA || !playerB || isSending}
          onClick={handleStart}
          className="press flex h-12 w-full items-center justify-center gap-2 rounded-full bg-live text-[13px] font-extrabold uppercase tracking-[0.06em] text-white disabled:opacity-40"
        >
          <span className="live-dot" />
          {isSending
            ? 'Starting'
            : playerA && playerB
            ? `Start ${first(playerA.name)} vs ${first(playerB.name)}`
            : 'Pick two players'}
        </button>
      }
    >
      <p className="text-sm text-white/70">Tap who's at the table — first tap, then second.</p>

      {roster.length < 2 ? (
        <div className="grid justify-items-center gap-2 rounded-2xl bg-card px-4 py-7 text-center">
          <h3 className="text-lg">Nobody to play</h3>
          <p className="text-sm text-white/70">Enrol another player first.</p>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-1.5">
          {roster.map((player) => {
            const slot = picked.indexOf(player.id);
            const selected = slot !== -1;
            return (
              <button
                key={player.id}
                type="button"
                aria-pressed={selected}
                onClick={() => toggle(player.id)}
                className={`press relative grid min-w-0 justify-items-center gap-1.5 rounded-xl px-0.5 py-2.5 transition-colors ${
                  selected ? 'bg-surface-alt shadow-[inset_0_0_0_1.5px_#fff]' : 'hover:bg-surface'
                }`}
              >
                {selected && (
                  <span className="absolute left-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-white text-[11px] font-black text-bg">
                    {slot + 1}
                  </span>
                )}
                <PlayerAvatar player={player} size={44} />
                <span className="max-w-full truncate text-xs font-bold">{crown.holderId === player.id ? '👑 ' : ''}{first(player.name)}</span>
                <span className="text-[11px] font-semibold tabular-nums text-white/55">{player.elo}</span>
              </button>
            );
          })}
        </div>
      )}

      {playerA && playerB && stakesA && (
        <>
          <MatchupCards playerA={playerA} playerB={playerB} players={players} matches={matches} crown={crown} />
          <p className="text-sm text-white/70">
            {stakesA.headline}
            {stakesA.isUnderdog ? ` ${first(playerA.name)} is the underdog, which is exactly why it pays more.` : ''}
          </p>
          <p className="text-xs font-semibold text-white/55">
            The office gets pinged and has four minutes to call it. Log the result from the same screen.
          </p>
        </>
      )}

      {error && <p role="alert" className="rounded-xl bg-surface-alt p-3 text-sm font-semibold">{error}</p>}
    </Sheet>
  );
};
