import React, { useState } from 'react';
import { ArrowLeftRight, History } from 'lucide-react';
import { Player, MatchRecord, MatchModifier } from '../types';
import { calculateProjectedStakes } from '../utils/elo';
import { CrownState } from '../utils/league';
import { Ball, PlayerAvatar } from './ui';

/**
 * Nothing about how a match was played is recorded beyond the winner and the
 * group they were on, so these stay at their defaults. The rating gap is the
 * only thing that scales the exchange.
 */
const NO_MODIFIERS: MatchModifier = { eightOnBreak: false, scratchOnEight: false, tableRun: false };

const describeElapsed = (sinceMs: number): string => {
  const minutes = Math.max(1, Math.round(sinceMs / 60_000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
};

interface LogMatchViewProps {
  players: Player[];
  recentMatches: MatchRecord[];
  crown: CrownState;
  /**
   * Who is playing. Owned by the app rather than this view: the view is
   * unmounted whenever you switch tabs, and local state meant the pair silently
   * reset to the top two players while the one-tap win buttons stayed put.
   */
  playerAId?: string;
  playerBId?: string;
  onChangePlayers: (playerAId: string, playerBId: string) => void;
  onRecordMatch: (
    playerAId: string,
    playerBId: string,
    winnerId: string,
    modifiers: MatchModifier,
    winnerBall?: 'solids' | 'stripes'
  ) => void;
  isSubmitting?: boolean;
}

/**
 * Tap the winner, then say which balls they were on, and it is logged. Two
 * taps for the whole thing, because it gets done standing next to the table.
 */
export const LogMatchView: React.FC<LogMatchViewProps> = ({
  players,
  recentMatches,
  crown,
  playerAId,
  playerBId,
  onChangePlayers,
  onRecordMatch,
  isSubmitting = false,
}) => {
  const sortedPlayers = [...players].sort((a, b) => b.elo - a.elo);
  const [selectingFor, setSelectingFor] = useState<'A' | 'B' | null>(null);
  const [winnerId, setWinnerId] = useState<string | null>(null);

  // No silent fallback to the top of the table. If a selection is missing the
  // view says so rather than quietly substituting somebody the user never picked.
  const playerA = players.find((p) => p.id === playerAId) ?? null;
  const playerB = players.find((p) => p.id === playerBId) ?? null;
  const ready = Boolean(playerA && playerB && playerA.id !== playerB.id);

  const handleSwap = () => {
    if (!playerA || !playerB) return;
    onChangePlayers(playerB.id, playerA.id);
  };

  const lastMatch = recentMatches[0];
  const showRematch = lastMatch && !(
    [lastMatch.playerAId, lastMatch.playerBId].includes(playerAId ?? '') &&
    [lastMatch.playerAId, lastMatch.playerBId].includes(playerBId ?? '')
  );

  // Beating the crown holder also collects their reign bounty, so the numbers
  // on the buttons have to include it or they are a lie.
  const bountyOnA = playerA && crown.holderId === playerA.id ? crown.bounty : 0;
  const bountyOnB = playerB && crown.holderId === playerB.id ? crown.bounty : 0;
  const stakes = calculateProjectedStakes(playerA ? playerA.elo : 1000, playerB ? playerB.elo : 1000, bountyOnA, bountyOnB);

  const winner = winnerId === playerA?.id ? playerA : winnerId === playerB?.id ? playerB : null;

  const record = (group?: 'solids' | 'stripes') => {
    if (!playerA || !playerB || !winner || isSubmitting) return;
    onRecordMatch(playerA.id, playerB.id, winner.id, NO_MODIFIERS, group);
  };

  const slot = (player: Player | null, side: 'A' | 'B') => (
    <button
      type="button"
      onClick={() => {
        setSelectingFor(side);
        setWinnerId(null);
      }}
      className="press grid min-w-0 justify-items-center gap-2 rounded-2xl bg-surface px-2 py-4 text-center"
    >
      {player ? <PlayerAvatar player={player} size={56} /> : <span className="grid h-14 w-14 place-items-center rounded-full bg-surface-alt text-2xl text-white/55">?</span>}
      <span className="max-w-full truncate text-sm font-bold">{player?.name ?? 'Pick a player'}</span>
      <span className="text-xs font-semibold tabular-nums text-white/55">{player ? player.elo : 'Tap to choose'}</span>
    </button>
  );

  return (
    <div id="log-match-view" className="stagger grid gap-4 pb-6">
      {showRematch && (
        <button
          type="button"
          onClick={() => {
            onChangePlayers(lastMatch.playerAId, lastMatch.playerBId);
            setWinnerId(null);
          }}
          className="press flex items-center justify-between gap-3 rounded-2xl bg-card p-3 text-left"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-surface-alt">
              <History className="h-5 w-5" strokeWidth={2.25} />
            </span>
            <span className="grid min-w-0">
              <span className="truncate text-sm font-bold">
                Rematch {lastMatch.playerAName.split(' ')[0]} and {lastMatch.playerBName.split(' ')[0]}
              </span>
              <span className="text-xs font-semibold text-white/55">Last played {describeElapsed(Date.now() - lastMatch.timestamp)}</span>
            </span>
          </span>
          <span className="flex h-9 flex-none items-center rounded-full bg-white px-3.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-bg">Replay</span>
        </button>
      )}

      <div className="grid gap-2">
        <span className="px-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/55">Who played</span>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          {slot(playerA, 'A')}
          <button
            type="button"
            onClick={handleSwap}
            aria-label="Swap players"
            className="press grid h-11 w-11 place-items-center rounded-full bg-surface-alt text-white transition-transform duration-300 ease-[var(--ease)] active:rotate-180"
          >
            <ArrowLeftRight className="h-4 w-4" strokeWidth={2.25} />
          </button>
          {slot(playerB, 'B')}
        </div>
      </div>

      {!ready ? (
        <p className="rounded-xl bg-surface-alt px-3 py-2.5 text-center text-sm font-semibold">Pick both players first.</p>
      ) : (
        <>
          <div className="grid gap-2">
            <span className="px-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/55">Who won</span>
            <div className="grid grid-cols-2 gap-2">
              {[
                { player: playerA!, delta: stakes.playerAWinsDelta, upset: stakes.isAUpset },
                { player: playerB!, delta: stakes.playerBWinsDelta, upset: stakes.isBUpset },
              ].map(({ player, delta, upset }) => {
                const on = winnerId === player.id;
                return (
                  <button
                    key={player.id}
                    id={player.id === playerA!.id ? 'btn-player-a-won' : 'btn-player-b-won'}
                    type="button"
                    aria-pressed={on}
                    disabled={isSubmitting}
                    onClick={() => setWinnerId(player.id)}
                    className={`press grid justify-items-center gap-2 rounded-2xl px-2 py-4 transition-colors duration-300 ease-[var(--ease)] ${
                      on ? 'bg-felt text-white' : 'bg-surface hover:bg-[#1C1C1C]'
                    }`}
                  >
                    <PlayerAvatar player={player} size={68} />
                    <span className="max-w-full truncate text-sm font-bold">{player.name.split(' ')[0]}</span>
                    <span className={`text-[13px] font-extrabold tabular-nums ${on ? 'text-white' : 'text-white/55'}`}>
                      +{delta}{upset ? ' upset' : ''}
                    </span>
                  </button>
                );
              })}
            </div>
            {bountyOnA + bountyOnB > 0 && (
              <span className="justify-self-center rounded-full bg-crown px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.1em] text-bg">
                👑 {bountyOnA + bountyOnB} bounty included
              </span>
            )}
          </div>

          {winner ? (
            <div key={winner.id} className="anim-rise grid gap-3">
              <p className="text-center font-display text-lg font-extrabold uppercase">What was {winner.name.split(' ')[0]}'s ball?</p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['solids', 1, 'Solids'],
                  ['stripes', 9, 'Stripes'],
                ] as const).map(([group, n, label], index) => (
                  <button
                    key={group}
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => record(group)}
                    className="press grid justify-items-center gap-2.5 rounded-2xl bg-surface py-[18px] text-[13px] font-extrabold uppercase tracking-[0.08em] transition-colors hover:bg-[#1C1C1C] disabled:opacity-50"
                  >
                    <Ball n={n} size={64} className="callout-throw" style={{ animationDuration: '520ms', animationDelay: `${index * 80}ms` }} />
                    {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => record()}
                className="press h-11 rounded-full text-xs font-extrabold uppercase tracking-[0.06em] text-white/55 hover:text-white disabled:opacity-50"
              >
                {isSubmitting ? 'Logging' : 'Not sure, log it anyway'}
              </button>
            </div>
          ) : (
            <p className="text-center text-sm text-white/55">Tap the winner</p>
          )}
        </>
      )}

      {selectingFor && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center" role="dialog" aria-modal="true" aria-label={`Pick player ${selectingFor}`}>
          <button type="button" aria-label="Close" onClick={() => setSelectingFor(null)} className="anim-fade absolute inset-0 bg-black/60" />
          <div className="anim-sheet relative flex max-h-[80vh] w-full max-w-md flex-col gap-3 rounded-t-3xl bg-elev px-4 pb-[calc(var(--safe-bottom)+1.5rem)] pt-2.5">
            <span className="mx-auto h-1 w-10 rounded-full bg-white/25" />
            <h2 className="text-[22px]">{selectingFor === 'A' ? 'First player' : 'Second player'}</h2>
            <div className="no-scrollbar grid grid-cols-4 gap-1.5 overflow-y-auto pb-1">
              {sortedPlayers.map((player) => {
                const isCurrent = selectingFor === 'A' ? player.id === playerAId : player.id === playerBId;
                const isOther = selectingFor === 'A' ? player.id === playerBId : player.id === playerAId;
                return (
                  <button
                    key={player.id}
                    type="button"
                    disabled={isOther}
                    aria-pressed={isCurrent}
                    onClick={() => {
                      if (selectingFor === 'A') onChangePlayers(player.id, playerBId ?? '');
                      else onChangePlayers(playerAId ?? '', player.id);
                      setSelectingFor(null);
                    }}
                    className={`press grid min-w-0 justify-items-center gap-1.5 rounded-xl px-0.5 py-2.5 ${
                      isCurrent ? 'bg-surface-alt shadow-[inset_0_0_0_1.5px_#fff]' : 'hover:bg-surface'
                    } disabled:cursor-default disabled:[&>span]:text-white/40`}
                  >
                    <PlayerAvatar player={player} size={44} />
                    <span className="max-w-full truncate text-xs font-bold">{player.name.split(' ')[0]}</span>
                    <span className="text-[11px] font-semibold tabular-nums text-white/55">{isOther ? 'Playing' : player.elo}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
