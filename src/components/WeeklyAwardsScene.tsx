import React, { useEffect, useMemo, useState } from 'react';
import { Player } from '../types';
import { Award, WeekAwards } from '../utils/awards';
import { ballColor, playerBall } from '../utils/balls';
import { Ball, BallBurst, CountUp, PlayerAvatar } from './ui';

const weekLabel = (from: number) => new Date(from).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const first = (player?: Player | null) => player?.name.split(' ')[0] ?? '?';

/** Seconds each page stays before moving on by itself. */
const PAGE_SECONDS = 6;

/** Each award page enters its own way; the list repeats if the week is long. */
const ENTRANCES = ['wa-slam', 'wa-slide', 'wa-drop', 'wa-flip', 'wa-spin', 'wa-blur', 'wa-zoom', 'wa-tilt'];

type Page =
  | { kind: 'intro' }
  | { kind: 'numbers' }
  | { kind: 'award'; award: Award; index: number }
  | { kind: 'podium' }
  | { kind: 'outro' };

/** Emoji falling down the screen behind a funny award. */
const Rain: React.FC<{ e: string }> = ({ e }) => {
  const drops = useMemo(
    () =>
      Array.from({ length: 14 }, (_, index) => ({
        left: `${(index / 14) * 100 + Math.random() * 5}%`,
        style: {
          ['--d' as string]: `${Math.round(Math.random() * 1400)}ms`,
          ['--t' as string]: `${(2.2 + Math.random() * 1.6).toFixed(2)}s`,
          ['--r' as string]: `${Math.round(Math.random() * 720 - 360)}deg`,
        } as React.CSSProperties,
      })),
    []
  );
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {drops.map((drop, index) => (
        <span key={index} className="wa-rain text-3xl" style={{ ...drop.style, left: drop.left }}>
          {e}
        </span>
      ))}
    </div>
  );
};

/**
 * Friday's award show, told like a story: a title card, the week in numbers,
 * one award per page with its own entrance, the podium, and a sign-off. Pages
 * move on by themselves; tap to skip ahead, the arrow goes back.
 */
export const WeeklyAwardsScene: React.FC<{ week: WeekAwards; players: Player[]; onClose: () => void }> = ({ week, players, onClose }) => {
  const byId = new Map(players.map((p) => [p.id, p]));
  const pages: Page[] = [
    { kind: 'intro' },
    { kind: 'numbers' },
    ...week.awards.map((award, index) => ({ kind: 'award' as const, award, index })),
    ...(week.podium.length > 0 ? [{ kind: 'podium' as const }] : []),
    { kind: 'outro' },
  ];
  const [page, setPage] = useState(0);
  const current = pages[page];
  const next = () => (page + 1 >= pages.length ? onClose() : setPage(page + 1));
  const back = () => setPage(Math.max(0, page - 1));

  useEffect(() => {
    if (current.kind === 'outro') return;
    const timer = window.setTimeout(next, PAGE_SECONDS * 1000);
    return () => window.clearTimeout(timer);
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight' || event.key === ' ') next();
      if (event.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const wash = (colour: string) => (
    <span
      aria-hidden="true"
      className="wa-wash pointer-events-none absolute left-1/2 top-[38%] -ml-[260px] -mt-[260px] h-[520px] w-[520px] rounded-full"
      style={{ background: `radial-gradient(circle, ${colour}66 0%, ${colour}00 68%)` }}
    />
  );

  const body = (() => {
    switch (current.kind) {
      case 'intro':
        return (
          <>
            {wash('#F2B705')}
            <span className="relative grid justify-items-center gap-4">
              <span className="wa-in wa-float text-[96px] leading-none" style={{ ['--wa' as string]: 'wa-spin' }}>🎖️</span>
              <h2 className="wa-in wa-d1 text-[48px] leading-[1.05]" style={{ ['--wa' as string]: 'wa-wipe' }}>Weekly awards</h2>
              <span className="wa-in wa-d2 text-base font-semibold text-white/70">Week of {weekLabel(week.from)}</span>
              <span className="wa-in wa-d3 flex gap-1.5">
                {[1, 9, 8, 3, 14].map((n) => <Ball key={n} n={n} size={30} />)}
              </span>
            </span>
          </>
        );
      case 'numbers': {
        const tiles: Array<[string, number]> = [
          ['Matches', week.matches],
          ['Players', week.stats.players],
          ['Calls', week.stats.calls],
          ['Coins staked', week.stats.staked],
          ['Upsets', week.stats.upsets],
          ['Awards', week.awards.length],
        ];
        return (
          <>
            {wash('#0B7A3E')}
            <span className="relative grid w-full max-w-sm gap-4">
              <h2 className="wa-in text-[36px] leading-[1.05]" style={{ ['--wa' as string]: 'wa-slide' }}>The week in numbers</h2>
              <span className="grid grid-cols-2 gap-2">
                {tiles.map(([label, value], index) => (
                  <span
                    key={label}
                    className="wa-in grid gap-1 rounded-2xl bg-surface p-4 text-left"
                    style={{ ['--wa' as string]: 'wa-rise', animationDelay: `${150 + index * 110}ms` }}
                  >
                    <b className="font-display text-[34px] font-extrabold leading-none tabular-nums">
                      <CountUp to={value} delay={250 + index * 110} />
                    </b>
                    <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-white/55">{label}</span>
                  </span>
                ))}
              </span>
            </span>
          </>
        );
      }
      case 'award': {
        const { award, index } = current;
        const winner = byId.get(award.playerId) ?? null;
        const entrance = ENTRANCES[index % ENTRANCES.length];
        const colour = winner ? ballColor(playerBall(winner)).c : '#FFFFFF';
        return (
          <>
            {wash(award.funny ? colour : '#F2B705')}
            {award.funny ? <Rain e={award.e} /> : <BallBurst />}
            <span className="relative grid justify-items-center gap-4">
              <span className="wa-in wa-d1 wa-float text-[96px] leading-none" style={{ ['--wa' as string]: entrance }}>{award.e}</span>
              <h2 className="wa-in wa-d2 text-[38px] leading-[1.05]" style={{ ['--wa' as string]: 'wa-wipe' }}>{award.title}</h2>
              <span
                className={`wa-in wa-d3 grid justify-items-center gap-3 rounded-3xl px-8 py-6 ${award.funny ? 'bg-surface' : 'bg-crown text-bg'}`}
                style={{ ['--wa' as string]: entrance }}
              >
                <PlayerAvatar player={winner} size={104} />
                <b className="font-display text-[32px] font-extrabold uppercase leading-none">{first(winner)}</b>
              </span>
              <span className="wa-in wa-d4 max-w-[300px] text-base font-semibold text-white/80" style={{ ['--wa' as string]: 'wa-rise' }}>{award.line}</span>
            </span>
          </>
        );
      }
      case 'podium': {
        // Second, first, third, like a real podium.
        const order = [1, 0, 2].map((rank) => ({ rank, spot: week.podium[rank] })).filter((entry) => entry.spot);
        const heights = ['h-40', 'h-28', 'h-20'];
        const fills = ['bg-crown text-bg', 'bg-silver text-bg', 'bg-bronze text-white'];
        return (
          <>
            {wash('#C9CCD1')}
            <span className="relative grid w-full max-w-sm gap-6">
              <h2 className="wa-in text-[40px] leading-[1.05]" style={{ ['--wa' as string]: 'wa-drop' }}>The podium</h2>
              <span className="grid grid-cols-3 items-end gap-2">
                {order.map(({ rank, spot }) => {
                  const player = byId.get(spot.playerId) ?? null;
                  const delay = 300 + (2 - rank) * 350;
                  return (
                    <span key={rank} className="grid justify-items-center gap-2">
                      <span className="wa-in grid justify-items-center gap-1" style={{ ['--wa' as string]: 'wa-drop', animationDelay: `${delay + 300}ms` }}>
                        <PlayerAvatar player={player} size={rank === 0 ? 68 : 54} />
                        <b className="max-w-full truncate text-sm">{first(player)}</b>
                        <span className="text-xs font-bold tabular-nums text-white/70">+{spot.net}</span>
                      </span>
                      <span className={`wa-podium grid w-full place-items-center rounded-t-xl font-display text-[34px] font-extrabold ${heights[rank]} ${fills[rank]}`} style={{ animationDelay: `${delay}ms` }}>
                        {rank + 1}
                      </span>
                    </span>
                  );
                })}
              </span>
              <span className="wa-in text-sm font-semibold text-white/55" style={{ ['--wa' as string]: 'wa-blur', animationDelay: '1500ms' }}>Most Elo gained this week</span>
            </span>
          </>
        );
      }
      case 'outro':
        return (
          <>
            {wash('#0B7A3E')}
            <BallBurst />
            <span className="relative grid justify-items-center gap-4">
              <span className="wa-in" style={{ ['--wa' as string]: 'wa-spin' }}><Ball n={8} size={96} /></span>
              <h2 className="wa-in wa-d1 text-[40px] leading-[1.05]" style={{ ['--wa' as string]: 'wa-zoom' }}>That's the week</h2>
              <span className="wa-in wa-d2 text-base font-semibold text-white/70">Every week is in History under Weekly awards.</span>
              <span className="wa-in wa-d3 mt-6 h-12 rounded-full bg-white px-8 text-sm font-extrabold uppercase leading-[48px] tracking-[0.06em] text-bg">Done</span>
            </span>
          </>
        );
    }
  })();

  return (
    <div role="dialog" aria-modal="true" aria-label="Weekly awards" className="anim-fade fixed inset-0 z-[70] flex flex-col overflow-hidden bg-bg">
      <div className="relative z-10 flex gap-1 px-4 pt-[calc(env(safe-area-inset-top)+12px)]">
        {pages.map((_, index) => (
          <span key={index} className="h-1 flex-1 overflow-hidden rounded-full bg-surface-alt">
            {index < page && <span className="block h-full w-full bg-white" />}
            {index === page && (
              <span
                key={page}
                className={`block h-full w-full bg-white ${current.kind === 'outro' ? '' : 'wa-fill'}`}
                style={{ animationDuration: `${PAGE_SECONDS}s` }}
              />
            )}
          </span>
        ))}
      </div>
      <div className="relative z-10 flex items-center justify-between px-4 pt-3">
        <button type="button" onClick={back} disabled={page === 0} aria-label="Previous" className="press grid h-10 w-10 place-items-center rounded-full bg-surface text-lg disabled:opacity-0">
          ‹
        </button>
        <span className="text-xs font-semibold text-white/55">
          {current.kind === 'award' ? `${current.index + 1} of ${week.awards.length}` : ''}
        </span>
        <button type="button" onClick={onClose} aria-label="Close" className="press grid h-10 w-10 place-items-center rounded-full bg-surface text-lg">
          ✕
        </button>
      </div>

      <button
        key={page}
        type="button"
        onClick={next}
        className="relative grid flex-1 place-items-center px-6 pb-[calc(env(safe-area-inset-bottom)+24px)] text-center"
      >
        {body}
      </button>
    </div>
  );
};
