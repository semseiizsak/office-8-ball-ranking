import React, { useEffect, useState } from 'react';
import { Player } from '../../types';
import { CupGame, CupState, SWISS_ROUNDS, roundName } from '../../utils/tournament';
import { cupIn, gameKey, hm, weekday } from '../../utils/cupView';
import { PlayerAvatar } from '../ui';

const anim = (name: string, delay: number, duration: number) => `${name} ${duration}ms var(--ease) ${Math.round(delay)}ms both`;

/** One side of a fixture: face and first name, dimmed once beaten. */
const FixtureSide: React.FC<{
  id: string;
  player: Player | null;
  name: string;
  mirrored: boolean;
  lost: boolean;
  won: boolean;
  reveal?: number;
  onSelect: (player: Player) => void;
}> = ({ id, player, name, mirrored, lost, won, reveal, onSelect }) => {
  const dimAnim = lost && reveal !== undefined;
  const body = (
    <>
      <span className={`flex-none ${lost ? 'opacity-40 grayscale' : ''}`} style={dimAnim ? { animation: anim('cup-dim', reveal!, 320) } : undefined}>
        <PlayerAvatar player={player ?? { id, name: '?', avatarUrl: '' }} size={28} />
      </span>
      <span
        className={`min-w-0 flex-1 truncate text-[13px] ${lost ? 'font-semibold text-white/40' : won ? 'font-extrabold text-white' : 'font-bold text-white'}`}
        style={dimAnim ? { animation: anim('cup-dim-text', reveal!, 320) } : undefined}
      >
        {name}
      </span>
    </>
  );
  const cls = `flex min-w-0 items-center gap-2 ${mirrored ? 'flex-row-reverse text-right' : 'text-left'}`;
  return player ? (
    <button type="button" onClick={() => onSelect(player)} className={`${cls} h-full`}>
      {body}
    </button>
  ) : (
    <span className={cls}>{body}</span>
  );
};

/** The middle of a fixture: VS until it is played, then a two cell score with the winner's cell in felt. */
const ScoreTile: React.FC<{ game: CupGame; missed: boolean; reveal?: number }> = ({ game, missed, reveal }) => {
  if (game.bye) {
    return <span className="grid h-8 w-16 place-items-center rounded-lg bg-felt text-[13px] font-extrabold text-white">+1</span>;
  }
  if (game.walkover) {
    const cellW = (side: 'a' | 'b') => (
      <span className={`grid h-8 place-items-center rounded-lg text-[11px] font-extrabold ${game.winnerId === game[side] ? 'bg-felt text-white' : 'bg-surface-alt text-white/40'}`}>
        {game.winnerId === game[side] ? 'W/O' : 'NS'}
      </span>
    );
    return <span className="grid w-16 grid-cols-2 gap-1">{cellW('a')}{cellW('b')}</span>;
  }
  const decided = !!game.winnerId || missed;
  const cell = (side: 'a' | 'b') => {
    const win = game.winnerId === game[side];
    return (
      <span className={`grid h-8 place-items-center rounded-lg font-display text-[15px] font-extrabold tabular-nums ${win ? 'bg-felt text-white' : 'bg-surface-alt text-white/40'}`}>
        {win ? 1 : 0}
      </span>
    );
  };
  const vs = <span className="grid h-8 w-16 place-items-center rounded-lg bg-surface-alt font-display text-[13px] font-extrabold text-white">VS</span>;
  const score = <span className="grid w-16 grid-cols-2 gap-1">{cell('a')}{cell('b')}</span>;
  if (!decided) return vs;
  if (reveal === undefined) return score;
  // A fresh result: the VS turns over into the score.
  return (
    <span className="relative grid h-8 w-16">
      <span className="absolute inset-0" style={{ animation: anim('cup-pill-flip', reveal, 360) }}>{score}</span>
      <span className="absolute inset-0" style={{ animation: anim('cup-fade-out', reveal, 180) }}>{vs}</span>
    </span>
  );
};

/**
 * The Swiss rounds as fixtures, a tab per round: pairs of players either side
 * of VS or the score, the bye as its own row. Results the viewer has not seen
 * yet turn over one by one.
 */
export const CupFixtures: React.FC<{
  state: CupState;
  byId: Map<string, Player>;
  names: Map<string, string>;
  meId: string;
  now: number;
  seen: Set<string>;
  force: boolean;
  flip: boolean;
  motion: boolean;
  base: number;
  hold: boolean;
  onSelectPlayer: (player: Player) => void;
  onSeen?: (keys: string[]) => void;
}> = ({ state, byId, names, meId, now, seen, force, flip, motion, base, hold, onSelectPlayer, onSeen }) => {
  const [tab, setTab] = useState(() => Math.min(state.current, state.rounds.length - 1, SWISS_ROUNDS - 1));
  const [switched, setSwitched] = useState(false);
  // Results already in when the tab opened; anything after arrives on its own, straight away.
  const [known] = useState(() => new Set(state.rounds.flat().filter((game) => game.winnerId).map(gameKey)));
  const games = state.rounds[tab] ?? [];
  const decided = state.rounds.flat().filter((game) => game.winnerId && !game.bye).map(gameKey);
  const fresh = (game: CupGame) => motion && !!game.winnerId && !game.bye && (!known.has(gameKey(game)) || force || !seen.has(gameKey(game)));

  const start = switched ? 0 : base + 140;
  const rowAt = (index: number) => start + index * (flip && !switched ? 90 : 70);
  let order = 0;
  const reveals = new Map<string, number>();
  games.forEach((game) => {
    if (!fresh(game)) return;
    const late = !known.has(gameKey(game));
    reveals.set(gameKey(game), late ? 200 : rowAt(games.length - 1) + 420 + order++ * 140);
  });
  const lastReveal = Math.max(0, ...reveals.values());

  useEffect(() => {
    if (hold || !onSeen) return;
    const timer = window.setTimeout(() => !document.hidden && onSeen([...decided, 'drawn']), lastReveal + 700);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hold, decided.join(','), lastReveal]);

  const played = games.filter((game) => game.winnerId && !game.bye).length;
  const toPlay = games.filter((game) => !game.bye).length;
  const deadline = games[0]?.deadline ?? null;
  const closed = deadline !== null && now > deadline;
  const nameOf = (id: string | null) => (id ? names.get(id) ?? 'Former player' : '');

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl">Fixtures</h2>
        <div role="tablist" aria-label="Round" className="relative grid h-9 grid-cols-2 rounded-full bg-surface p-1">
          <span
            aria-hidden="true"
            className="absolute bottom-1 left-1 top-1 w-[calc(50%-4px)] rounded-full bg-white transition-transform duration-300 ease-[var(--ease)]"
            style={{ transform: `translateX(${tab * 100}%)` }}
          />
          {Array.from({ length: SWISS_ROUNDS }, (_, round) => (
            <button
              key={round}
              type="button"
              role="tab"
              aria-selected={tab === round}
              onClick={() => {
                setTab(round);
                setSwitched(true);
              }}
              className={`relative z-[1] px-3 text-[11px] font-extrabold uppercase tracking-[0.08em] transition-colors duration-300 ease-[var(--ease)] ${tab === round ? 'text-bg' : 'text-white'}`}
            >
              {roundName(round)}
            </button>
          ))}
        </div>
      </div>

      {games.length === 0 ? (
        <div key={`empty-${tab}`} className="cup-in grid gap-1.5 rounded-2xl border-[1.5px] border-dashed border-loss p-4 text-center" style={cupIn('anim-pop', start, 320)}>
          <b className="text-sm font-extrabold">{roundName(tab)} pairs up when {roundName(tab - 1).toLowerCase()} is done</b>
          <span className="text-xs font-semibold text-white/55">Players on the same points meet. No rematches.</span>
        </div>
      ) : (
        <div key={tab} className="grid gap-2">
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between gap-3 text-xs font-semibold text-white/55">
              <span>{deadline ? `${closed ? 'Closed' : 'Play by'} ${weekday(deadline)} ${hm(deadline)}` : ''}</span>
              <span className="tabular-nums">{played} of {toPlay} played</span>
            </div>
            <div className="relative h-1 overflow-hidden rounded-full bg-surface-alt">
              <div
                className="cup-in absolute inset-y-0 left-0 origin-left rounded-full bg-felt"
                style={{ ...cupIn('grow-x', start + 80, 800), width: `${toPlay ? (played / toPlay) * 100 : 100}%` }}
              />
            </div>
          </div>

          {games.map((game, index) => {
            const key = gameKey(game);
            const mine = game.a === meId || game.b === meId;
            const missed = !game.winnerId && !game.bye && now > game.deadline;
            const live = mine && !game.winnerId && !game.bye && !missed && tab === state.current;
            const reveal = reveals.get(key);
            const at = !known.has(key) && game.winnerId ? 0 : rowAt(index);
            const spoken = game.bye
              ? `${nameOf(game.a)} has the bye`
              : game.winnerId
                ? `${nameOf(game.winnerId)} beat ${nameOf(game.winnerId === game.a ? game.b : game.a)}`
                : missed ? `${nameOf(game.a)} against ${nameOf(game.b)}, not played` : `${nameOf(game.a)} against ${nameOf(game.b)}, to play`;
            return (
              <div
                key={`${key}-${game.winnerId ?? 'open'}`}
                role="group"
                aria-label={spoken}
                className={`cup-in relative grid h-14 grid-cols-[minmax(0,1fr)_64px_minmax(0,1fr)] items-center gap-2 rounded-2xl px-2 ${mine ? 'bg-surface-alt shadow-[inset_0_0_0_2px_#fff]' : 'bg-surface'}`}
                style={cupIn(flip && !switched ? 'cup-pill-flip' : 'rise-in', at, 360)}
              >
                <span className="cup-in min-w-0" style={cupIn(flip && !switched ? 'anim-fade' : 'cup-pill-l', at + 60, 360)}>
                  <FixtureSide
                    id={game.a}
                    player={byId.get(game.a) ?? null}
                    name={nameOf(game.a)}
                    mirrored={false}
                    lost={!!game.winnerId && !game.bye && game.winnerId !== game.a}
                    won={game.winnerId === game.a && !game.bye}
                    reveal={reveal}
                    onSelect={onSelectPlayer}
                  />
                </span>
                <span className="cup-in grid place-items-center" style={cupIn('anim-pop', at + 160, 280)}>
                  <ScoreTile game={game} missed={missed} reveal={reveal} />
                </span>
                <span className="cup-in min-w-0" style={cupIn(flip && !switched ? 'anim-fade' : 'cup-pill-r', at + 60, 360)}>
                  {game.b ? (
                    <FixtureSide
                      id={game.b}
                      player={byId.get(game.b) ?? null}
                      name={nameOf(game.b)}
                      mirrored
                      lost={!!game.winnerId && game.winnerId !== game.b}
                      won={game.winnerId === game.b}
                      reveal={reveal}
                      onSelect={onSelectPlayer}
                    />
                  ) : (
                    <span className="flex items-center justify-end gap-2 text-right">
                      <span className="text-xs font-semibold text-white/55">Bye</span>
                      <span className="h-7 w-7 flex-none rounded-full border-[1.5px] border-dashed border-loss" aria-hidden="true" />
                    </span>
                  )}
                </span>
                {live && (
                  <>
                    <span aria-hidden="true" className="cup-live pointer-events-none absolute -inset-1 rounded-[20px] border-[1.5px] border-white" style={{ animationDelay: `${Math.max(2000, at + 900)}ms` }} />
                    <span aria-hidden="true" className="cup-live-static pointer-events-none absolute -inset-1 rounded-[20px]" />
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
