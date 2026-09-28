import React, { useEffect, useState } from 'react';
import { Player } from '../../types';
import { CUP_MIN_PLAYERS, Tournament } from '../../utils/tournament';
import { cupIn, cupNames, hm } from '../../utils/cupView';
import { BallBurst, PlayerAvatar } from '../ui';
import { Check } from './icons';

/** How far the field is from a cup, and what happens once it is on. */
function fieldCaption(n: number): string {
  if (n < CUP_MIN_PLAYERS) return `${CUP_MIN_PLAYERS - n} more and the cup is on`;
  return 'The cup is on. Everyone who signs up plays';
}

/**
 * The sign-up field: a seat per player in sign-up order, open seats to finish
 * the row, a bar towards the minimum field, and the one button. In the draw
 * the seats flip over and over until the pairings land.
 */
export const CupSeats: React.FC<{
  tournament: Tournament;
  players: Player[];
  currentPlayer: Player;
  mode: 'before' | 'open' | 'drawing';
  delay: number;
  onJoin: () => void;
}> = ({ tournament, players, currentPlayer, mode, delay, onJoin }) => {
  const byId = new Map(players.map((p) => [p.id, p]));
  const joined = tournament.entrants.some((entry) => entry.id === currentPlayer.id);
  // Optimistic: the seat and the green button land on tap, and give way if the join never arrives.
  const [optimistic, setOptimistic] = useState(false);
  const [burst, setBurst] = useState(false);
  useEffect(() => {
    if (!optimistic || joined) return;
    const timer = window.setTimeout(() => setOptimistic(false), 8000);
    return () => window.clearTimeout(timer);
  }, [optimistic, joined]);
  useEffect(() => {
    if (!burst) return;
    const timer = window.setTimeout(() => setBurst(false), 600);
    return () => window.clearTimeout(timer);
  }, [burst]);

  const entrants = [...tournament.entrants].sort((a, b) => a.at - b.at);
  if (optimistic && !joined) entrants.push({ id: currentPlayer.id, at: Date.now() });
  const inNow = joined || optimistic;
  const names = cupNames(entrants.map((entry) => entry.id), byId);
  const n = entrants.length;
  // Everyone gets a seat; open seats finish the row, and there is always one while sign ups run.
  const wanted = Math.max(CUP_MIN_PLAYERS, n + (mode === 'drawing' ? 0 : 1));
  const seatsShown = Math.max(4, Math.ceil(wanted / 4) * 4);
  const seated = entrants;
  const on = n >= CUP_MIN_PLAYERS;
  const big = seatsShown > 8;

  const join = () => {
    if (inNow || mode !== 'open') return;
    setOptimistic(true);
    setBurst(true);
    onJoin();
  };

  return (
    <section className="cup-in relative grid gap-3 overflow-hidden rounded-3xl bg-card p-4" style={cupIn('rise-in', delay, 360)}>
      {burst && <BallBurst />}
      <div className="relative flex items-center justify-between gap-3">
        <h2 className="text-xl">The field</h2>
        <span className="text-[13px] font-extrabold tabular-nums">{n} in</span>
      </div>

      <div className="relative grid grid-cols-4 gap-2">
        {Array.from({ length: seatsShown }, (_, index) => {
          const entry = seated[index];
          if (!entry) {
            return (
              <div
                key={`empty-${index}`}
                aria-hidden="true"
                className={`cup-in grid place-items-center rounded-2xl border-[1.5px] border-dashed border-loss ${big ? 'h-[76px]' : 'h-[88px]'}`}
                style={cupIn('cup-seat-pop', delay + 80 + index * 50, 280)}
              >
                <span className="font-display text-xl font-extrabold text-loss">{index + 1}</span>
              </div>
            );
          }
          const player = byId.get(entry.id);
          const mine = entry.id === currentPlayer.id;
          const fresh = optimistic && mine && !joined;
          return (
            <div
              key={entry.id}
              className={`cup-in relative ${mode === 'drawing' ? '[perspective:500px]' : ''}`}
              style={cupIn('cup-seat-pop', fresh ? 0 : delay + 80 + index * 50, 280)}
            >
              <div
                className={`grid content-center justify-items-center gap-1.5 rounded-2xl bg-surface px-1 ${big ? 'h-[76px]' : 'h-[88px]'} ${mine ? 'shadow-[inset_0_0_0_2px_#fff]' : ''} ${mode === 'drawing' ? 'cup-seat-shuffle' : ''}`}
                style={mode === 'drawing' ? { animationDelay: `${index * 80}ms` } : undefined}
              >
                <PlayerAvatar player={player ?? { id: entry.id, name: '?', avatarUrl: '' }} size={big ? 36 : 44} />
                <span className="w-full truncate text-center text-xs font-bold">{names.get(entry.id)}</span>
              </div>
              {on && (
                <span className="absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full bg-felt" aria-hidden="true">
                  <Check size={10} />
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="relative grid gap-2">
        <div className="relative h-1.5 rounded-full bg-surface-alt">
          <div
            className="cup-in absolute inset-y-0 left-0 origin-left rounded-full bg-felt transition-[width] duration-300 ease-[var(--ease)]"
            style={{ ...cupIn('grow-x', delay + 460, 800), width: `${(Math.min(n, CUP_MIN_PLAYERS) / CUP_MIN_PLAYERS) * 100}%` }}
          />
          {Array.from({ length: CUP_MIN_PLAYERS }, (_, index) => index + 1).map((mark) => (
            <span
              key={mark}
              aria-hidden="true"
              className="absolute top-1/2 h-2.5 w-0.5 -translate-y-1/2 bg-white"
              style={{ left: `calc(${(mark / CUP_MIN_PLAYERS) * 100}% - ${mark === CUP_MIN_PLAYERS ? 2 : 1}px)` }}
            />
          ))}
        </div>
        <span className="text-xs font-semibold text-white/55">{mode === 'drawing' ? 'Drawing the bracket' : fieldCaption(n)}</span>
      </div>

      {mode !== 'drawing' && (
        <button
          type="button"
          onClick={join}
          disabled={mode === 'before' || inNow}
          className={`cup-in press relative flex h-12 items-center justify-center gap-2 rounded-full text-[13px] font-extrabold uppercase tracking-[0.06em] ${
            mode === 'before' ? 'bg-surface-alt text-white' : inNow ? 'bg-felt text-white' : 'bg-white text-bg'
          }`}
          style={{
            ...cupIn('rise-in', delay + 560, 340),
            transition: 'background-color 280ms var(--ease), color 280ms var(--ease), transform var(--fast) var(--ease)',
          }}
        >
          {mode === 'before' ? (
            `Opens ${hm(tournament.opensAt)}`
          ) : inNow ? (
            <>
              <Check size={14} />
              You're in
            </>
          ) : (
            'Sign me up'
          )}
        </button>
      )}
    </section>
  );
};
