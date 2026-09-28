import React from 'react';
import { MatchRecord, Player } from '../types';
import { calculateProjectedStakes } from '../utils/elo';
import { CrownState } from '../utils/league';
import { ballColor, playerBall } from '../utils/balls';
import { PlayerAvatar } from './ui';

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

interface MatchupCardsProps {
  playerA: Player | null;
  playerB: Player | null;
  players: Player[];
  /** This season's matches, for each player's recent rating line. */
  matches: MatchRecord[];
  crown: CrownState;
  /** When set, the cards are buttons that pick the winner. */
  winnerId?: string | null;
  onPickWinner?: (playerId: string) => void;
  /** When set, each card offers to swap its player. */
  onChange?: (side: 'A' | 'B') => void;
  disabled?: boolean;
  /** Label on each card's own line, e.g. "You". */
  labelFor?: (player: Player) => string | undefined;
}

/**
 * The two players side by side, each saying what the match does to them: the
 * rating a win and a loss are worth, where each leaves them on the ladder,
 * and a small chart of both branches. Used wherever a match is set up, so
 * logging a result and calling someone out read the same way.
 */
export const MatchupCards: React.FC<MatchupCardsProps> = ({
  playerA,
  playerB,
  players,
  matches,
  crown,
  winnerId = null,
  onPickWinner,
  onChange,
  disabled,
  labelFor,
}) => {
  // Beating the crown holder also collects their reign bounty, so the numbers
  // have to include it or they are a lie.
  const bountyOnA = playerA && crown.holderId === playerA.id ? crown.bounty : 0;
  const bountyOnB = playerB && crown.holderId === playerB.id ? crown.bounty : 0;
  const stakes = calculateProjectedStakes(playerA ? playerA.elo : 1000, playerB ? playerB.elo : 1000, bountyOnA, bountyOnB);

  // The ladder as it stands: everyone who has played, best rating first.
  const ladder = players.filter((p) => p.wins + p.losses > 0 || p.id === playerA?.id || p.id === playerB?.id);
  const rankWith = (id: string, elos: Record<string, number>) =>
    ladder.filter((p) => p.id !== id && (elos[p.id] ?? p.elo) > elos[id]).length + 1;
  const both = playerA && playerB;
  const current = both ? { [playerA.id]: playerA.elo, [playerB.id]: playerB.elo } : {};
  const ifAWins = both ? { [playerA.id]: stakes.playerAWinNewA, [playerB.id]: stakes.playerAWinNewB } : {};
  const ifBWins = both ? { [playerA.id]: stakes.playerBWinNewA, [playerB.id]: stakes.playerBWinNewB } : {};

  const historyOf = (player: Player) =>
    matches
      .filter((match) => match.playerAId === player.id || match.playerBId === player.id)
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((match) => (match.playerAId === player.id ? match.playerAEloBefore : match.playerBEloBefore));

  const card = (player: Player | null, side: 'A' | 'B') => {
    if (!player || !playerA || !playerB) {
      return (
        <button
          type="button"
          onClick={() => onChange?.(side)}
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
    const lossElo = isA ? stakes.playerBWinNewA : stakes.playerAWinNewB;
    const loss: Outcome = { elo: lossElo, delta: player.elo - lossElo, rank: rankWith(player.id, isA ? ifBWins : ifAWins) };
    const rankNow = rankWith(player.id, current);
    const upset = isA ? stakes.isAUpset : stakes.isBUpset;
    const on = winnerId === player.id;
    const off = winnerId !== null && !on;
    const rankMove = (to: number) => (to === rankNow ? `stays #${rankNow}` : `#${rankNow} to #${to}`);
    const label = labelFor?.(player);

    const head = (
      <>
        <PlayerAvatar player={player} size={56} />
        <span className="max-w-full truncate text-sm font-bold">{label ?? player.name.split(' ')[0]}</span>
        <span className={`text-xs font-semibold tabular-nums ${on ? 'text-white' : 'text-white/55'}`}>
          {player.elo} now, #{rankNow}
        </span>
      </>
    );

    return (
      <div className={`grid min-w-0 content-start gap-2.5 rounded-2xl p-3 transition-colors duration-300 ease-[var(--ease)] ${on ? 'bg-felt' : 'bg-surface'}`}>
        {onPickWinner ? (
          <button
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onPickWinner(player.id)}
            className={`press grid justify-items-center gap-1.5 text-center transition-opacity duration-300 ${off ? 'opacity-60' : ''}`}
          >
            {head}
          </button>
        ) : (
          <div className="grid justify-items-center gap-1.5 text-center">{head}</div>
        )}

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

        {onChange && (
          <button type="button" onClick={() => onChange(side)} className="press h-9 rounded-full text-[11px] font-extrabold uppercase tracking-[0.08em] text-white/70 hover:text-white">
            Change
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-2 gap-2">
        {card(playerA, 'A')}
        {card(playerB, 'B')}
      </div>
      {both && bountyOnA + bountyOnB > 0 && (
        <span className="justify-self-center rounded-full bg-crown px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.1em] text-bg">
          👑 {bountyOnA + bountyOnB} bounty on the crown
        </span>
      )}
    </div>
  );
};
