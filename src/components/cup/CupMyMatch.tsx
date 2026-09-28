import React from 'react';
import { Player } from '../../types';
import { CupGame, CupState, allGames } from '../../utils/tournament';
import { RoadStep, bracketModel, cupIn, hm, weekday } from '../../utils/cupView';
import { Ball, PlayerAvatar } from '../ui';
import { Check, Cross } from './icons';

/**
 * The current player's week as a strip: each round they can reach and the
 * cup, joined by a line that turns green behind every round they got through.
 */
export const CupRoad: React.FC<{ steps: RoadStep[]; champion: boolean; delay: number }> = ({ steps, champion, delay }) => {
  const all = [...steps.map((step) => ({ label: step.short, status: step.status as RoadStep['status'] | 'cup' })), { label: 'Cup', status: 'cup' as const }];
  const count = all.length;
  const segment = (index: number) => {
    const from = all[index].status;
    const to = all[index + 1].status;
    if (from !== 'won') return '#3A3A3A';
    if (to === 'cup') return champion ? '#0B7A3E' : '#3A3A3A';
    if (to === 'won') return '#0B7A3E';
    if (to === 'play' || to === 'waiting' || to === 'lost') return '#FFFFFF';
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
          status === 'won' ? 'bg-felt'
          : status === 'play' ? 'bg-white'
          : status === 'waiting' ? 'bg-surface-alt shadow-[inset_0_0_0_2px_#fff]'
          : status === 'lost' ? 'bg-loss'
          : status === 'cup' ? (champion ? 'bg-crown' : 'bg-surface')
          : 'bg-surface shadow-[inset_0_0_0_1.5px_#3A3A3A]';
        const dim = status === 'out' || status === 'ahead' || (status === 'cup' && !champion);
        const spoken =
          status === 'cup' ? (champion ? 'Champion' : 'The cup')
          : status === 'play' ? `${step.label} to play`
          : status === 'waiting' ? `${step.label}, opponent to come`
          : status === 'ahead' ? `${step.label} ahead`
          : `${step.label} ${status}`;
        return (
          <div key={`${step.label}-${index}`} role="listitem" aria-label={spoken} className="relative grid justify-items-center gap-1.5">
            <span className="cup-in relative grid h-[30px] w-[30px] place-items-center rounded-full" style={cupIn('anim-pop', delay + index * 90, 280)}>
              <span className={`absolute inset-0 rounded-full ${disc}`} />
              {status === 'play' && <span aria-hidden="true" className="cup-live absolute -inset-1 rounded-full border-[1.5px] border-white" style={{ animationDelay: `${delay + 700}ms` }} />}
              <span className="relative grid place-items-center">
                {status === 'won' && <Check size={14} />}
                {status === 'play' && <Ball n={8} size={14} bare />}
                {status === 'lost' && <Cross size={12} />}
                {status === 'cup' && <span className="text-base leading-none">🏆</span>}
              </span>
            </span>
            <span className={`max-w-full truncate text-[10px] font-extrabold uppercase tracking-[0.1em] ${dim ? 'text-white/40' : 'text-white'}`}>{step.label}</span>
          </div>
        );
      })}
    </div>
  );
};

const Side: React.FC<{ player: Player | null; id: string; name: string; seed: number | null; mirrored?: boolean }> = ({ player, id, name, seed, mirrored }) => (
  <span className={`grid w-full min-w-0 gap-1 ${mirrored ? 'justify-items-end text-right' : 'justify-items-start'}`}>
    <PlayerAvatar player={player ?? { id, name: '?', avatarUrl: '' }} size={56} />
    <b className="w-full truncate font-display text-lg font-extrabold uppercase leading-tight">{name}</b>
    {seed !== null && <span className="text-xs font-semibold tabular-nums text-white/55">Seed {seed}</span>}
  </span>
);

/**
 * The current player's game: who and a button to play it, or who they are
 * waiting for, or how it went. A walkover and a seed advance each explain
 * themselves. Their week runs underneath.
 */
export const CupMyMatch: React.FC<{
  state: CupState;
  steps: RoadStep[];
  me: Player;
  byId: Map<string, Player>;
  names: Map<string, string>;
  delay: number;
  onPlay: (opponentId: string) => void;
  /** Says the player is ready for this game; if the opponent never plays, they go through. */
  onClaimWalkover?: (gameKey: string) => Promise<void>;
}> = ({ state, steps, me, byId, names, delay, onPlay, onClaimWalkover }) => {
  const [claiming, setClaiming] = React.useState(false);
  // The step that matters now: the game to play or wait for, the one lost, or the final won.
  const open = steps.findIndex((entry) => entry.status === 'play' || entry.status === 'waiting' || entry.status === 'lost');
  const current = open === -1 ? steps.length - 1 : open;
  const step = steps[current];
  const before = current > 0 ? steps[current - 1] : null;
  const nameOf = (id: string | null) => (id ? names.get(id) ?? 'Former player' : '');
  const round = step.label.toLowerCase();
  const out = step.status === 'lost';
  const champion = state.champion === me.id;
  const title = out || champion ? 'Your week' : `Your ${round}`;
  const opponentId = step.opponentId;
  const deadline = step.game?.deadline ?? null;
  const when = (at: number | null) => (at ? `${weekday(at)} ${hm(at)}` : 'the deadline');

  // How the last game went, when it was not a plain win.
  const through = (game: CupGame | null, opponent: string | null) =>
    !game ? ''
    : game.walkover ? `${nameOf(opponent)} could not make it, so you went through on a walkover.`
    : game.auto ? `Nobody played by ${when(game.deadline)}, so you went through as the higher seed.`
    : `You beat ${nameOf(opponent)}.`;

  // Who the player meets next: the game that fills the other seat.
  const feeder = (() => {
    if (step.status !== 'waiting' || !step.game) return null;
    const seat: 0 | 1 = step.game.a === me.id ? 1 : 0;
    const feed = bracketModel(state).feeds.find((entry) => entry.to === step.game!.key && entry.seat === seat);
    return feed ? allGames(state).find((game) => game.key === feed.from) ?? null : null;
  })();

  let line = '';
  if (champion) line = `You won the cup. ${through(step.game, step.opponentId)}`;
  else if (out && step.game?.walkover) line = `${nameOf(opponentId)} was ready and you were not, so they went through on a walkover.`;
  else if (out && step.game?.auto) line = `Not played by ${when(step.game.deadline)}. ${nameOf(opponentId)} went through as the higher seed.`;
  else if (out) line = `${nameOf(opponentId)} beat you in the ${round}. Out this week.`;
  else if (step.status === 'waiting') {
    const next = feeder && feeder.a && feeder.b ? `You play the winner of ${nameOf(feeder.a)} and ${nameOf(feeder.b)}.` : 'Your opponent is still to be decided.';
    line = `${before ? through(before.game, before.opponentId) : `Your seed takes you straight into the ${round}.`} ${next}`;
  }

  const play = step.status === 'play' && opponentId;
  return (
    <section
      className={`cup-in relative grid gap-4 rounded-3xl bg-card p-4 ${play ? 'shadow-[inset_0_0_0_1.5px_#C8102E]' : ''}`}
      style={cupIn('rise-in', delay, 420)}
    >
      {play && <span aria-hidden="true" className="cup-live pointer-events-none absolute inset-0 rounded-3xl border-[1.5px] border-live" style={{ animationDelay: `${delay + 1800}ms` }} />}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
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
          {before?.game && (before.game.walkover || before.game.auto) && (
            <p className="text-[13px] font-semibold text-white/70">{through(before.game, before.opponentId)}</p>
          )}
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
            <span className="cup-in block min-w-0" style={cupIn('cup-pill-l', delay + 120, 420)}>
              <Side player={me} id={me.id} name={nameOf(me.id) || me.name.split(' ')[0]} seed={state.seeds.get(me.id) ?? null} />
            </span>
            <span className="cup-in grid h-11 w-11 place-items-center rounded-full bg-bg font-display text-base font-extrabold shadow-[0_0_0_2px_#fff]" style={cupIn('anim-pop', delay + 320, 280)}>VS</span>
            <span className="cup-in block min-w-0" style={cupIn('cup-pill-r', delay + 120, 420)}>
              <Side player={byId.get(opponentId) ?? null} id={opponentId} name={nameOf(opponentId)} seed={state.seeds.get(opponentId) ?? null} mirrored />
            </span>
          </div>
          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => onPlay(opponentId)}
              className="cup-in press h-12 rounded-full bg-white text-[13px] font-extrabold uppercase tracking-[0.06em] text-bg"
              style={cupIn('rise-in', delay + 380, 340)}
            >
              Play your {step.label === 'Final' ? 'final' : 'match'} now
            </button>
            {deadline && <span className="text-center text-xs font-semibold text-white/55">Counts until {when(deadline)}</span>}
          </div>
          {(() => {
            const ready = step.game?.ready ?? [];
            const iAmReady = ready.includes(me.id);
            const theyAreReady = ready.includes(opponentId);
            const higher = (state.seeds.get(me.id) ?? 99) < (state.seeds.get(opponentId) ?? 99);
            if (iAmReady && theyAreReady) {
              return (
                <p className="text-center text-xs font-semibold text-white/70">
                  You both said you are ready. Find a slot before {when(deadline)}, or {higher ? 'you go through as the higher seed' : `${nameOf(opponentId)} goes through as the higher seed`}.
                </p>
              );
            }
            if (iAmReady) {
              return (
                <p className="cup-in rounded-2xl bg-surface p-3 text-center text-xs font-semibold text-white/70" style={cupIn('anim-pop', 0, 280)}>
                  ✋ You are ready. If {nameOf(opponentId)} does not play you by {when(deadline)}, you go through on a walkover. No Elo either way.
                </p>
              );
            }
            return (
              <div className="grid gap-1.5">
                {theyAreReady && (
                  <p className="rounded-2xl bg-surface p-3 text-center text-xs font-semibold text-white">
                    ✋ {nameOf(opponentId)} is ready to play. If you do not play by {when(deadline)}, they go through.
                  </p>
                )}
                {onClaimWalkover && step.game && (
                  <button
                    type="button"
                    disabled={claiming}
                    onClick={async () => {
                      setClaiming(true);
                      try {
                        await onClaimWalkover(step.game!.key);
                      } finally {
                        setClaiming(false);
                      }
                    }}
                    className="press h-10 rounded-full bg-surface-alt text-[11px] font-extrabold uppercase tracking-[0.08em] disabled:opacity-50"
                  >
                    {theyAreReady ? "I'm ready too" : "I'm ready, they can't make it"}
                  </button>
                )}
                {!theyAreReady && (
                  <span className="text-center text-[11px] font-semibold text-white/55">
                    Nobody ready by then? {higher ? 'You go through as the higher seed.' : `${nameOf(opponentId)} goes through as the higher seed.`}
                  </span>
                )}
              </div>
            );
          })()}
        </>
      ) : (
        <div className="flex items-center gap-3">
          <PlayerAvatar player={me} size={44} />
          <p className="min-w-0 flex-1 text-[13px] font-semibold text-white/70">{line}</p>
        </div>
      )}

      <CupRoad steps={steps} champion={champion} delay={delay + 60} />
    </section>
  );
};
