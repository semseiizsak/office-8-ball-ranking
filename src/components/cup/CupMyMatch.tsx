import React from 'react';
import { Player } from '../../types';
import { CupState, FINAL_ROUND, roundName } from '../../utils/tournament';
import { RoadStep, cupIn, hm, weekday } from '../../utils/cupView';
import { Ball, PlayerAvatar } from '../ui';
import { Check, Cross } from './icons';

const done = (status: RoadStep['status']) => status === 'won' || status === 'lost' || status === 'bye' || status === 'missed';

/**
 * The current player's week as a strip: round 1, round 2, the final and the
 * cup, joined by a line that turns green behind every round that is done.
 */
export const CupRoad: React.FC<{ steps: RoadStep[]; champion: boolean; delay: number }> = ({ steps, champion, delay }) => {
  const all = [...steps.map((step) => ({ label: step.label, status: step.status as RoadStep['status'] | 'cup' })), { label: 'Cup', status: 'cup' as const }];
  const count = all.length;
  const segment = (index: number) => {
    const from = all[index].status;
    const to = all[index + 1].status;
    if (from === 'cup' || !done(from)) return '#3A3A3A';
    if (to === 'cup') return champion ? '#0B7A3E' : '#3A3A3A';
    if (done(to)) return '#0B7A3E';
    if (to === 'play' || to === 'waiting') return '#FFFFFF';
    return '#3A3A3A';
  };
  return (
    <div role="list" aria-label="Your week" className="relative grid" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
      {all.slice(0, -1).map((_, index) => (
        <span
          key={`line-${index}`}
          aria-hidden="true"
          className="cup-in absolute top-[14px] h-0.5 origin-left"
          style={{ ...cupIn('cup-grow-x', delay + index * 90 + 140, 280), left: `${((index + 0.5) / count) * 100}%`, width: `${100 / count}%`, background: segment(index) }}
        />
      ))}
      {all.map((step, index) => {
        const { status } = step;
        const disc =
          status === 'won' || status === 'bye' ? 'bg-felt'
          : status === 'play' ? 'bg-white'
          : status === 'waiting' ? 'bg-surface-alt shadow-[inset_0_0_0_2px_#fff]'
          : status === 'lost' || status === 'missed' ? 'bg-loss'
          : status === 'cup' ? (champion ? 'bg-crown' : 'bg-surface')
          : 'bg-surface shadow-[inset_0_0_0_1.5px_#3A3A3A]';
        const dim = status === 'out' || (status === 'cup' && !champion);
        const spoken =
          status === 'cup' ? (champion ? 'Champion' : 'The cup')
          : status === 'play' ? `${step.label} to play`
          : status === 'bye' ? `${step.label} bye`
          : status === 'missed' ? `${step.label} not played`
          : `${step.label} ${status}`;
        return (
          <div key={step.label} role="listitem" aria-label={spoken} className="relative grid justify-items-center gap-1.5">
            <span className="cup-in relative grid h-[30px] w-[30px] place-items-center rounded-full" style={cupIn('anim-pop', delay + index * 90, 280)}>
              <span className={`absolute inset-0 rounded-full ${disc}`} />
              {status === 'play' && <span aria-hidden="true" className="cup-live absolute -inset-1 rounded-full border-[1.5px] border-white" style={{ animationDelay: `${delay + 700}ms` }} />}
              <span className="relative grid place-items-center">
                {status === 'won' && <Check size={14} />}
                {status === 'bye' && <span className="text-[10px] font-extrabold text-white">+1</span>}
                {status === 'play' && <Ball n={8} size={14} bare />}
                {(status === 'lost' || status === 'missed') && <Cross size={12} />}
                {status === 'cup' && <span className="text-base leading-none">🏆</span>}
              </span>
            </span>
            <span className={`text-[10px] font-extrabold uppercase tracking-[0.12em] ${dim ? 'text-white/40' : 'text-white'}`}>{step.label}</span>
          </div>
        );
      })}
    </div>
  );
};

const Side: React.FC<{ player: Player | null; id: string; name: string; mirrored?: boolean }> = ({ player, id, name, mirrored }) => (
  <span className={`grid w-full min-w-0 gap-1 ${mirrored ? 'justify-items-end text-right' : 'justify-items-start'}`}>
    <PlayerAvatar player={player ?? { id, name: '?', avatarUrl: '' }} size={56} />
    <b className="w-full truncate font-display text-lg font-extrabold uppercase leading-tight">{name}</b>
    {player && <span className="text-xs font-semibold tabular-nums text-white/55">{player.elo} Elo</span>}
  </span>
);

const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

/**
 * The current player's game this round: who and a button to play it, or the
 * bye, or how it went and what comes next. Their week runs underneath.
 */
export const CupMyMatch: React.FC<{
  state: CupState;
  steps: RoadStep[];
  me: Player;
  byId: Map<string, Player>;
  names: Map<string, string>;
  delay: number;
  onPlay: (opponentId: string) => void;
}> = ({ state, steps, me, byId, names, delay, onPlay }) => {
  const step = steps[Math.min(state.current, FINAL_ROUND)];
  const standing = state.standings.find((entry) => entry.id === me.id);
  const nameOf = (id: string | null) => (id ? names.get(id) ?? 'Former player' : '');
  const round = roundName(step.round);
  const title = step.status === 'out' ? 'Your week' : `Your ${round.toLowerCase()}`;
  const opponentId = step.opponentId;
  const deadline = step.game?.deadline ?? null;
  const next = step.round < FINAL_ROUND ? roundName(step.round + 1).toLowerCase() : '';

  let line = '';
  if (step.status === 'bye') line = `You sit ${round.toLowerCase()} out. The bye counts as a point.`;
  else if (step.status === 'won') line = `You beat ${nameOf(opponentId)}.${next ? ` ${roundName(step.round + 1)} pairs up when ${round.toLowerCase()} is done.` : ''}`;
  else if (step.status === 'lost') line = `${nameOf(opponentId)} beat you.${next ? ` ${roundName(step.round + 1)} pairs up when ${round.toLowerCase()} is done.` : ''}`;
  else if (step.status === 'missed') line = `Not played by ${deadline ? `${weekday(deadline)} ${hm(deadline)}` : 'the deadline'}. No point this round.`;
  else if (step.status === 'waiting') line = "You're in the final. Your opponent lands any moment.";
  else if (step.status === 'out') line = `You finish ${ordinal(standing?.rank ?? 0)} with ${standing?.points ?? 0} ${standing?.points === 1 ? 'point' : 'points'}. The top 2 play the final.`;

  const play = step.status === 'play' && opponentId;
  return (
    <section
      className={`cup-in relative grid gap-4 rounded-3xl bg-card p-4 ${play ? 'shadow-[inset_0_0_0_1.5px_#C8102E]' : ''}`}
      style={cupIn('rise-in', delay, 420)}
    >
      {play && <span aria-hidden="true" className="cup-live pointer-events-none absolute inset-0 rounded-3xl border-[1.5px] border-live" style={{ animationDelay: `${delay + 1800}ms` }} />}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl">{title}</h2>
        {play && (
          <span className="flex h-6 items-center gap-1.5 rounded-full bg-live px-2.5 text-[11px] font-extrabold uppercase tracking-[0.1em] text-white">
            <span className="live-dot" aria-hidden="true" />
            Live
          </span>
        )}
      </div>

      {play ? (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
            <span className="cup-in block min-w-0" style={cupIn('cup-pill-l', delay + 120, 420)}>
              <Side player={me} id={me.id} name={nameOf(me.id) || me.name.split(' ')[0]} />
            </span>
            <span className="cup-in grid h-11 w-11 place-items-center rounded-full bg-bg font-display text-base font-extrabold shadow-[0_0_0_2px_#fff]" style={cupIn('anim-pop', delay + 320, 280)}>VS</span>
            <span className="cup-in block min-w-0" style={cupIn('cup-pill-r', delay + 120, 420)}>
              <Side player={byId.get(opponentId) ?? null} id={opponentId} name={nameOf(opponentId)} mirrored />
            </span>
          </div>
          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => onPlay(opponentId)}
              className="cup-in press h-12 rounded-full bg-white text-[13px] font-extrabold uppercase tracking-[0.06em] text-bg"
              style={cupIn('rise-in', delay + 380, 340)}
            >
              Play your {step.round === FINAL_ROUND ? 'final' : 'match'} now
            </button>
            {deadline && <span className="text-center text-xs font-semibold text-white/55">Counts until {weekday(deadline)} {hm(deadline)}</span>}
          </div>
        </>
      ) : (
        <div className="flex items-center gap-3">
          <PlayerAvatar player={me} size={44} />
          <p className="min-w-0 flex-1 text-[13px] font-semibold text-white/70">{line}</p>
        </div>
      )}

      <CupRoad steps={steps} champion={state.champion === me.id} delay={delay + 60} />
    </section>
  );
};
