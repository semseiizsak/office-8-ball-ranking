import React, { useState } from 'react';
import { ArrowLeftRight, History } from 'lucide-react';
import { Player, MatchRecord, MatchModifier } from '../types';
import { calculateProjectedStakes } from '../utils/elo';
import { CrownState } from '../utils/league';
import { ballColor, playerBall } from '../utils/balls';
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

interface Outcome {
  elo: number;
  delta: number;
  rank: number;
}

/**
 * The player's recent rating, then two dashed branches: where a win and where
 * a loss would leave them. The branch for the picked result is drawn solid.
 */
const EloForecast: React.FC<{
  player: Player;
  history: number[];
  win: Outcome;
  loss: Outcome;
  picked: 'win' | 'loss' | null;
}> = ({ player, history, win, loss, picked }) => {
  const W = 150, H = 76, L = 2, R = 34, T = 8, B = 8;
  const points = [...history.slice(-7), player.elo];
  const lo = Math.min(...points, loss.elo) - 6;
  const hi = Math.max(...points, win.elo) + 6;
  const span = points.length; // the branches take one more step
  const x = (i: number) => L + (i * (W - L - R)) / span;
  const y = (v: number) => T + ((hi - v) * (H - T - B)) / (hi - lo);
  const line = points.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const last = points.length - 1;
  const branch = (to: number, on: boolean, colour: string) => (
    <path
      d={`M${x(last).toFixed(1)} ${y(player.elo).toFixed(1)} L${x(span).toFixed(1)} ${y(to).toFixed(1)}`}
      stroke={colour}
      strokeWidth={on ? 3 : 2}
      strokeDasharray={on ? undefined : '3 3'}
      strokeLinecap="round"
      opacity={picked && !on ? 0.35 : 1}
      className="transition-opacity duration-300"
    />
  );
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full overflow-visible" role="img" aria-label={`${player.name}: ${win.elo} with a win, ${loss.elo} with a loss`}>
      <path d={line} fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" pathLength={1} className="draw-line" />
      {branch(win.elo, picked === 'win', picked === 'win' ? '#FFFFFF' : '#5FCB8C')}
      {branch(loss.elo, picked === 'loss', 'rgba(255,255,255,.55)')}
      <circle cx={x(last)} cy={y(player.elo)} r="4" fill={ballColor(playerBall(player)).c} stroke="#fff" strokeWidth="1.5" />
      <text x={x(span) + 5} y={y(win.elo) + 3.5} fill="#fff" fontSize="10" fontWeight="800">{win.elo}</text>
      <text x={x(span) + 5} y={y(loss.elo) + 3.5} fill="rgba(255,255,255,.55)" fontSize="10" fontWeight="800">{loss.elo}</text>
    </svg>
  );
};

/**
 * Pick the winner by tapping their card, then say which balls they were on,
 * and it is logged. Each card says exactly what a win and a loss would do.
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

  const lastMatch = recentMatches[0];
  const showRematch = lastMatch && !(
    [lastMatch.playerAId, lastMatch.playerBId].includes(playerAId ?? '') &&
    [lastMatch.playerAId, lastMatch.playerBId].includes(playerBId ?? '')
  );

  // Beating the crown holder also collects their reign bounty, so the numbers
  // on the cards have to include it or they are a lie.
  const bountyOnA = playerA && crown.holderId === playerA.id ? crown.bounty : 0;
  const bountyOnB = playerB && crown.holderId === playerB.id ? crown.bounty : 0;
  const stakes = calculateProjectedStakes(playerA ? playerA.elo : 1000, playerB ? playerB.elo : 1000, bountyOnA, bountyOnB);

  // The ladder as it stands: everyone who has played, best rating first.
  const ladder = players.filter((p) => p.wins + p.losses > 0 || p.id === playerAId || p.id === playerBId);
  const rankWith = (id: string, elos: Record<string, number>) => {
    const mine = elos[id];
    return ladder.filter((p) => p.id !== id && (elos[p.id] ?? p.elo) > mine).length + 1;
  };
  const current = playerA && playerB ? { [playerA.id]: playerA.elo, [playerB.id]: playerB.elo } : {};
  const ifAWins = playerA && playerB ? { [playerA.id]: stakes.playerAWinNewA, [playerB.id]: stakes.playerAWinNewB } : {};
  const ifBWins = playerA && playerB ? { [playerA.id]: stakes.playerBWinNewA, [playerB.id]: stakes.playerBWinNewB } : {};

  const historyOf = (player: Player) =>
    recentMatches
      .filter((match) => match.playerAId === player.id || match.playerBId === player.id)
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((match) => (match.playerAId === player.id ? match.playerAEloBefore : match.playerBEloBefore));

  const winner = winnerId === playerA?.id ? playerA : winnerId === playerB?.id ? playerB : null;

  const record = (group?: 'solids' | 'stripes') => {
    if (!playerA || !playerB || !winner || isSubmitting) return;
    onRecordMatch(playerA.id, playerB.id, winner.id, NO_MODIFIERS, group);
  };

  const card = (player: Player | null, side: 'A' | 'B') => {
    if (!player || !playerA || !playerB) {
      return (
        <button
          type="button"
          onClick={() => setSelectingFor(side)}
          className="press grid min-w-0 content-center justify-items-center gap-2 rounded-2xl bg-surface px-2 py-6 text-center"
        >
          <span className="grid h-14 w-14 place-items-center rounded-full bg-surface-alt text-2xl text-white/55">?</span>
          <span className="text-sm font-bold">Pick a player</span>
        </button>
      );
    }
    const isA = side === 'A';
    const win: Outcome = {
      elo: isA ? stakes.playerAWinNewA : stakes.playerBWinNewB,
      delta: isA ? stakes.playerAWinsDelta : stakes.playerBWinsDelta,
      rank: rankWith(player.id, isA ? ifAWins : ifBWins),
    };
    const loss: Outcome = {
      elo: isA ? stakes.playerBWinNewA : stakes.playerAWinNewB,
      delta: player.elo - (isA ? stakes.playerBWinNewA : stakes.playerAWinNewB),
      rank: rankWith(player.id, isA ? ifBWins : ifAWins),
    };
    const rankNow = rankWith(player.id, current);
    const upset = isA ? stakes.isAUpset : stakes.isBUpset;
    const on = winnerId === player.id;
    const off = winnerId !== null && !on;
    const rankMove = (to: number) => (to === rankNow ? `stays #${rankNow}` : `#${rankNow} to #${to}`);

    return (
      <div className={`grid min-w-0 content-start gap-2.5 rounded-2xl p-3 transition-colors duration-300 ease-[var(--ease)] ${on ? 'bg-felt' : 'bg-surface'}`}>
        <button
          type="button"
          aria-pressed={on}
          disabled={isSubmitting}
          onClick={() => setWinnerId(player.id)}
          className={`press grid justify-items-center gap-1.5 text-center transition-opacity duration-300 ${off ? 'opacity-60' : ''}`}
        >
          <PlayerAvatar player={player} size={56} />
          <span className="max-w-full truncate text-sm font-bold">{player.name.split(' ')[0]}</span>
          <span className={`text-xs font-semibold tabular-nums ${on ? 'text-white' : 'text-white/55'}`}>
            {player.elo} now, #{rankNow}
          </span>
        </button>

        <div className="grid gap-1 text-xs font-semibold">
          <div className={`flex items-baseline justify-between gap-1 rounded-lg px-2 py-1.5 ${on ? 'bg-white text-bg' : 'bg-bg/40'}`}>
            <span className="font-extrabold uppercase tracking-[0.08em]">Win</span>
            <span className="text-right tabular-nums">
              <b className="text-sm font-black">+{win.delta}</b> {rankMove(win.rank)}
            </span>
          </div>
          <div className={`flex items-baseline justify-between gap-1 rounded-lg px-2 py-1.5 ${off ? 'bg-white text-bg' : 'bg-bg/40'}`}>
            <span className="font-extrabold uppercase tracking-[0.08em]">Loss</span>
            <span className="text-right tabular-nums">
              <b className="text-sm font-black">−{loss.delta}</b> {rankMove(loss.rank)}
            </span>
          </div>
          {upset && <span className="text-center text-[11px] font-bold">Winning would be an upset</span>}
        </div>

        <EloForecast player={player} history={historyOf(player)} win={win} loss={loss} picked={on ? 'win' : off ? 'loss' : null} />

        <button
          type="button"
          onClick={() => {
            setSelectingFor(side);
            setWinnerId(null);
          }}
          className="press h-9 rounded-full text-[11px] font-extrabold uppercase tracking-[0.08em] text-white/70 hover:text-white"
        >
          Change
        </button>
      </div>
    );
  };

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
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/55">{ready ? 'Tap the winner' : 'Who played'}</span>
          {ready && (
            <button type="button" onClick={() => { if (playerA && playerB) onChangePlayers(playerB.id, playerA.id); setWinnerId(null); }} aria-label="Swap sides" className="press grid h-9 w-9 place-items-center rounded-full bg-surface-alt">
              <ArrowLeftRight className="h-4 w-4" strokeWidth={2.25} />
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {card(playerA, 'A')}
          {card(playerB, 'B')}
        </div>
        {ready && bountyOnA + bountyOnB > 0 && (
          <span className="justify-self-center rounded-full bg-crown px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.1em] text-bg">
            👑 {bountyOnA + bountyOnB} bounty on the crown
          </span>
        )}
        {!ready && (playerA || playerB) && <p className="text-center text-sm text-white/55">Pick the other player.</p>}
      </div>

      {winner && (
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
