import React, { useRef } from 'react';
import { Player } from '../../types';
import { CupState, FINAL_ROUND } from '../../utils/tournament';
import { cupIn } from '../../utils/cupView';
import { CountUp, PlayerAvatar } from '../ui';

/**
 * The live table after the Swiss rounds: points first, Buchholz to split
 * ties, wins after that. A gold line runs under the top two, who play the
 * final. Rows count their points up as they land.
 */
export const CupStandings: React.FC<{
  state: CupState;
  byId: Map<string, Player>;
  names: Map<string, string>;
  meId: string;
  base: number;
  motion: boolean;
  onSelectPlayer: (player: Player) => void;
}> = ({ state, byId, names, meId, base, motion, onSelectPlayer }) => {
  // A row whose rank moves while the tab is open slides into its new place.
  const ranks = useRef(new Map(state.standings.map((standing) => [standing.id, standing.rank])));
  const moved = new Set(state.standings.filter((standing) => (ranks.current.get(standing.id) ?? standing.rank) !== standing.rank).map((standing) => standing.id));
  ranks.current = new Map(state.standings.map((standing) => [standing.id, standing.rank]));

  const finalSet = !!state.final;
  const status = state.current === 0 ? 'Round 1 in play' : state.current === 1 ? 'After round 1' : 'After round 2';
  const rowAt = (index: number) => base + 120 + index * 50;
  const lineAt = rowAt(Math.min(2, state.standings.length)) + 120;
  const cols = 'grid-cols-[22px_28px_minmax(0,1fr)_22px_26px_34px]';

  return (
    <div className="grid gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xl">Standings</h2>
        <span className="text-xs font-bold text-white/55">{status}</span>
      </div>
      <div className="grid gap-1">
        <div aria-hidden="true" className={`grid ${cols} items-center gap-2 px-2 text-[10px] font-extrabold uppercase tracking-[0.12em] text-white/55`}>
          <span className="text-center">#</span>
          <span className="col-span-2">Player</span>
          <span className="text-center">W</span>
          <span className="text-center">BH</span>
          <span className="text-right">Pts</span>
        </div>
        {state.standings.map((standing, index) => {
          const player = byId.get(standing.id) ?? null;
          const top = index < 2;
          const mine = standing.id === meId;
          const champ = state.champion === standing.id;
          const runnerUp = state.runnerUp === standing.id;
          const sub = champ ? 'Champion' : runnerUp ? 'Runner up' : top && finalSet ? 'Finalist' : '';
          const row = (
            <div
              key={`${standing.id}-${moved.has(standing.id) ? standing.rank : 'still'}`}
             
              className={`${moved.has(standing.id) ? 'leaderboard-reordered' : 'cup-in'} relative grid h-12 ${cols} items-center gap-2 rounded-xl px-2 ${mine ? 'bg-surface-alt shadow-[inset_0_0_0_2px_#fff]' : 'bg-surface'}`}
              style={moved.has(standing.id) ? undefined : cupIn('row-in', rowAt(index), 320)}
            >
              <span className={`grid h-[22px] w-[22px] place-items-center rounded-full font-display text-xs font-extrabold tabular-nums ${top ? 'bg-crown text-bg' : 'text-white'}`}>
                {standing.rank}
              </span>
              <span className="contents" aria-hidden="true">
                <PlayerAvatar player={player ?? { id: standing.id, name: '?', avatarUrl: '' }} size={28} />
                <span className="grid min-w-0">
                  <span className="truncate text-[13px] font-bold">
                    {names.get(standing.id) ?? 'Former player'}
                    {champ ? ' 🏆' : ''}
                  </span>
                  {sub && <span className={`text-[10px] font-extrabold uppercase tracking-[0.1em] ${champ || top ? 'text-crown' : 'text-white/55'}`}>{sub}</span>}
                </span>
              </span>
              <span className="text-center text-[13px] font-semibold tabular-nums text-white/70">{standing.wins}</span>
              <span className="text-center text-[13px] font-semibold tabular-nums text-white/70">{standing.buchholz}</span>
              <b className="text-right font-display text-base font-extrabold tabular-nums">
                {motion ? <CountUp to={standing.points} delay={rowAt(index) + 120} /> : standing.points}
              </b>
            </div>
          );
          return (
            <React.Fragment key={standing.id}>
              {player ? (
                <button type="button" onClick={() => onSelectPlayer(player)} aria-label={`${standing.rank}. ${names.get(standing.id)}, ${standing.points} points, Buchholz ${standing.buchholz}, ${standing.wins} wins`} className="press block text-left">
                  {row}
                </button>
              ) : (
                row
              )}
              {index === 1 && state.standings.length > 2 && (
                <div className="grid gap-1 py-1" aria-hidden="true">
                  <span className="cup-in h-0.5 origin-left rounded-full bg-crown" style={cupIn('cup-grow-x', lineAt, 600)} />
                  <span className="cup-in text-right text-[10px] font-extrabold uppercase tracking-[0.12em] text-crown" style={cupIn('anim-fade', lineAt + 300, 280)}>
                    {state.current >= FINAL_ROUND ? 'Top 2 play the final' : 'Top 2 after round 2 play the final'}
                  </span>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
      <p className="text-xs font-semibold text-white/55">A win or a bye is a point. Ties go to Buchholz: the points of everyone you played.</p>
    </div>
  );
};
