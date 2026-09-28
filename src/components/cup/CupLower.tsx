import React from 'react';
import { Player } from '../../types';
import { CHAMPION_CHIPS, CUP_MAX_PLAYERS, CUP_MIN_PLAYERS, CupRecord, CupState, FINALIST_CHIPS, Tournament, weekTournament } from '../../utils/tournament';
import { hm, monthShort, weekday } from '../../utils/cupView';
import { cupIn } from '../../utils/cupView';
import { Ball, CountUp, PlayerAvatar } from '../ui';

const first = (name: string) => name.split(' ')[0];

/** The rules, each marked with a pool ball. */
export const CupHowItWorks: React.FC<{ now: number; delay: number }> = ({ now, delay }) => {
  const week = weekTournament(now);
  const items: Array<[string, string]> = [
    ['Monday morning', ` sign ups open at ${hm(week.opensAt)} and close at ${hm(week.closesAt)}. Everyone who signs up plays, ${CUP_MIN_PLAYERS} to ${CUP_MAX_PLAYERS} of you.`],
    ['At the close', ' the field is seeded by Elo. The best seed meets the lowest, so 1 and 2 can only meet in the final.'],
    ['The play-in', ' comes first when the field does not fill the bracket. The lowest seeds play for the last places.'],
    ['Every round', ` has a deadline, a day at a time. The final is ${weekday(week.deadline)} ${hm(week.deadline)}.`],
    ['Not played?', " Say you're ready. If your opponent does not play you in time, you go through on a walkover. If nobody said so, the higher seed goes through. No match, no Elo."],
    ['The champion', ` gets 🏆 and ${CHAMPION_CHIPS} chips, the runner up ${FINALIST_CHIPS}. Every match counts for Elo as usual.`],
  ];
  return (
    <section className="cup-in grid gap-3 rounded-3xl bg-card p-4" style={cupIn('rise-in', delay, 340)}>
      <h2 className="text-xl">How it works</h2>
      <ol className="stagger-rows grid gap-3">
        {items.map(([lead, rest], index) => (
          <li key={lead} className="grid grid-cols-[24px_1fr] items-start gap-3" style={{ ['--j' as string]: index } as React.CSSProperties}>
            <Ball n={index + 1} size={24} />
            <span className="text-sm text-white/70">
              <b className="text-white">{lead}</b>
              {rest}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
};

const RANK_STYLE = ['bg-crown text-bg', 'bg-silver text-bg', 'bg-bronze text-white'];

/** Everyone who has won or reached a final, gold, silver and bronze on top. */
export const CupCabinet: React.FC<{
  cabinet: Array<[string, CupRecord]>;
  byId: Map<string, Player>;
  delay: number;
  onSelectPlayer: (player: Player) => void;
}> = ({ cabinet, byId, delay, onSelectPlayer }) => (
  <section className="cup-in grid gap-2" style={cupIn('rise-in', delay, 340)}>
    <h2 className="px-1 text-xl">Trophy cabinet</h2>
    <div className="stagger-rows grid gap-1">
      {cabinet.map(([id, record], index) => {
        const player = byId.get(id)!;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelectPlayer(player)}
            className={`press grid h-14 grid-cols-[24px_32px_1fr_auto] items-center gap-3 rounded-2xl px-3 text-left ${RANK_STYLE[index] ?? 'bg-surface text-white'}`}
            style={{ ['--j' as string]: index } as React.CSSProperties}
          >
            <span className="font-display text-base font-extrabold tabular-nums">{index + 1}</span>
            <PlayerAvatar player={player} size={32} />
            <span className="grid min-w-0">
              <span className="truncate text-sm font-extrabold">{first(player.name)}</span>
              <span className="text-[11px] font-bold">
                {record.finals} final{record.finals === 1 ? '' : 's'}
              </span>
            </span>
            <span className="text-sm font-extrabold tabular-nums">
              {record.titles > 5 ? (
                <>
                  🏆 <CountUp to={record.titles} delay={delay + 200} />
                </>
              ) : (
                '🏆'.repeat(record.titles)
              )}
            </span>
          </button>
        );
      })}
    </div>
  </section>
);

/** Every earlier week: the date, who won it and who they beat. Tap one for its bracket. */
export const CupPastCups: React.FC<{
  past: Array<{ cup: Tournament; state: CupState }>;
  byId: Map<string, Player>;
  delay: number;
  onOpen: (week: string) => void;
}> = ({ past, byId, delay, onOpen }) => (
  <section className="cup-in grid gap-2" style={cupIn('rise-in', delay, 340)}>
    <h2 className="px-1 text-xl">Past cups</h2>
    <div className="stagger-rows grid gap-2">
      {past.map(({ cup, state }, index) => {
        const opens = new Date(cup.opensAt);
        const champion = state.champion ? byId.get(state.champion) ?? null : null;
        const runnerUp = state.runnerUp ? byId.get(state.runnerUp) : null;
        const field = cup.field?.length ?? 0;
        return (
          <button
            key={cup.week}
            type="button"
            onClick={() => onOpen(cup.week)}
            aria-label={`Week of ${opens.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}`}
            className="press grid grid-cols-[48px_1fr_auto] items-center gap-3 rounded-2xl bg-card px-3 py-3 text-left"
            style={{ ['--j' as string]: index } as React.CSSProperties}
          >
            <span className="grid h-12 w-12 content-center justify-items-center rounded-xl bg-surface">
              <b className="font-display text-lg font-extrabold leading-none">{opens.getDate()}</b>
              <span className="mt-0.5 text-[10px] font-extrabold uppercase text-white/55">{monthShort(cup.opensAt)}</span>
            </span>
            <span className="grid min-w-0 gap-0.5">
              <b className="truncate text-sm font-extrabold">{state.champion ? (champion ? first(champion.name) : 'Former player') : 'No winner'}</b>
              <span className="truncate text-xs font-semibold text-white/55">
                {state.champion
                  ? runnerUp ? `Beat ${first(runnerUp.name)} in the final` : `${field} players`
                  : state.unfinished ? 'Final never played' : `${field} players`}
              </span>
            </span>
            <span className="relative flex-none">
              <PlayerAvatar player={champion ?? { id: state.champion ?? cup.week, name: '?', avatarUrl: '' }} size={36} />
              <span className={`absolute -bottom-1 -left-1 grid h-4 w-4 place-items-center rounded-full ${state.champion ? 'bg-crown' : 'bg-silver'}`}>
                {state.champion && <span className="text-[10px] leading-none">🏆</span>}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  </section>
);
