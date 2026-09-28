import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Player } from '../../types';
import { CupGame, CupState } from '../../utils/tournament';
import { BracketModel, Feed, bracketModel, hm, resultKey, roundShort, weekday } from '../../utils/cupView';
import { playerBall } from '../../utils/balls';
import { Ball, BallBurst, PlayerAvatar } from '../ui';
import { CupConfetti } from './CupChampionHero';

const GOLD = '#F2B705';
const FELT = '#0B7A3E';
const GREY = '#3A3A3A';

// The choreography, in ms: rounds enter one after another, their lines draw
// on the way down, then every result the viewer has not seen yet travels.
const ROW_STEP = 150;
const LINE_AT = 300;
const LINE_DUR = 420;
const TRAVEL = 760;
const TRAVEL_STAGGER = 120;
/** A result that lands while the tab is open travels straight away. */
const LIVE_TRAVEL = 200;

const anim = (name: string, delay: number, duration: number, fill = 'backwards') => `${name} ${duration}ms var(--ease) ${Math.round(delay)}ms ${fill}`;

type Tone = 'open' | 'done' | 'mine' | 'me' | 'gold';
const TONE: Record<Tone, { stroke: string; width: number; rank: number }> = {
  open: { stroke: GREY, width: 1.5, rank: 0 },
  done: { stroke: '#FFFFFF', width: 1.5, rank: 1 },
  mine: { stroke: FELT, width: 1.75, rank: 2 },
  me: { stroke: FELT, width: 2.5, rank: 3 },
  gold: { stroke: GOLD, width: 2.5, rank: 4 },
};

/** A trophy with a sheen passing over it; it glows once the cup has a winner. */
const Trophy: React.FC<{ lit: boolean; silver: boolean; litAt?: number }> = ({ lit, silver, litAt }) => {
  const id = React.useId().replace(/:/g, '');
  const c = silver ? '#C9CCD1' : GOLD;
  const cup = 'M18 6h28v16a14 14 0 0 1-28 0z';
  return (
    <span className="relative grid h-[64px] w-[56px] place-items-center">
      {lit && (
        <span
          aria-hidden="true"
          className="cup-glow pointer-events-none absolute -inset-10 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(242,183,5,.34) 0%, rgba(242,183,5,0) 62%)', ...(litAt !== undefined ? { animation: `${anim('anim-fade', litAt, 600, 'both')}, cup-glow 3.6s var(--ease) ${litAt + 600}ms infinite` } : {}) }}
        />
      )}
      <svg viewBox="0 0 64 72" width="56" height="63" aria-hidden="true" className="relative block" style={litAt !== undefined ? { animation: anim('cup-trophy-lift', litAt, 520) } : undefined}>
        <defs>
          <clipPath id={`${id}-t`}>
            <path d={cup} />
            <rect x="29" y="35" width="6" height="14" />
            <rect x="19" y="49" width="26" height="9" rx="2" />
          </clipPath>
          <linearGradient id={`${id}-s`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#fff" stopOpacity="0" />
            <stop offset="50%" stopColor="#fff" stopOpacity=".6" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={cup} fill={c} />
        <path d="M18 10h-8a9 9 0 0 0 9 12M46 10h8a9 9 0 0 1-9 12" stroke={c} strokeWidth="3.5" fill="none" strokeLinecap="round" />
        <rect x="29" y="35" width="6" height="14" fill={c} />
        <rect x="19" y="49" width="26" height="9" rx="2" fill={c} />
        <circle cx="32" cy="18" r="6" fill="#0A0A0A" />
        <circle cx="32" cy="18" r="2.8" fill="#F4F1E8" />
        <g clipPath={`url(#${id}-t)`}>
          <rect x="-40" y="0" width="26" height="72" fill={`url(#${id}-s)`} className="cup-shine" style={lit ? { animationDuration: '3.2s' } : undefined} />
        </g>
      </svg>
    </span>
  );
};

/** Two chevrons pointing on down the bracket: went through as the higher seed. */
const SeedMark: React.FC<{ size: number }> = ({ size }) => (
  <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 3.5 8 7.5l4-4M4 8.5l4 4 4-4" />
  </svg>
);

type Size = 'compact' | 'full' | 'final';
const SIZES: Record<Size, { h: number; sq: number; slant: number; gap: number }> = {
  compact: { h: 38, sq: 19, slant: 6, gap: 3 },
  full: { h: 30, sq: 26, slant: 7, gap: 3 },
  final: { h: 92, sq: 30, slant: 12, gap: 4 },
};

interface SeatView {
  id: string | null;
  player: Player | null;
  name: string;
  seed: number | null;
  /** Empty seat: "Winner", "QF 1". */
  empty: [string, string];
  result: 'open' | 'won' | 'lost';
  score: string | 'auto';
  gold: boolean;
  mine: boolean;
  /** When the player lands in the seat, for a fresh result upstream. */
  arriveAt?: number;
  /** When this game's result shows, for a fresh result. */
  revealAt?: number;
  /** When a champion's earlier win turns from white to gold. */
  goldAt?: number;
}

/**
 * One slanted name plate and its score square. Plates are silver while the
 * game is open, white for the winner, gold on the champion's road, and sink
 * to grey for the loser. A fresh result replays: the seat fills when the
 * ball arrives, then the square and the loser change when it is played.
 */
const Plate: React.FC<{ seat: SeatView; size: Size; mirrored?: boolean; onSelect: (player: Player) => void }> = ({ seat, size, mirrored, onSelect }) => {
  const s = SIZES[size];
  const { id, player, result, arriveAt, revealAt, goldAt } = seat;
  const bg = !id ? '#222222' : result === 'lost' ? GREY : seat.gold ? GOLD : result === 'won' ? '#FFFFFF' : '#C9CCD1';
  const fg = !id || result === 'lost' ? 'rgba(255,255,255,.55)' : '#0A0A0A';
  const plateAnims = [
    ...(goldAt !== undefined ? [anim('cup-plate-white', goldAt, 420)] : []),
    ...(revealAt !== undefined ? [anim('cup-plate-open', revealAt, 320)] : []),
    ...(arriveAt !== undefined ? [anim('cup-plate-empty', arriveAt, 280)] : []),
  ];
  const clip = mirrored
    ? `polygon(${s.slant}px 0, 100% 0, 100% 100%, 0 100%)`
    : `polygon(0 0, 100% 0, calc(100% - ${s.slant}px) 100%, 0 100%)`;
  const sqClip = mirrored
    ? `polygon(0 0, 100% 0, calc(100% - ${s.slant}px) 100%, 0 100%)`
    : `polygon(${s.slant}px 0, 100% 0, 100% 100%, 0 100%)`;
  const won = result === 'won';
  const sqBg = !id ? '#222222' : won ? FELT : GREY;
  const scoreText = seat.score === 'auto' ? '' : seat.score;
  const fontSq = size === 'final' ? 'text-[22px]' : size === 'full' ? 'text-[13px]' : 'text-[11px]';
  const woSize = size === 'final' ? 'text-[12px]' : size === 'full' ? 'text-[10px]' : 'text-[8px]';
  const inAt = arriveAt !== undefined ? { animation: anim('anim-fade', arriveAt, 280) } : undefined;
  const dim = result === 'lost';

  const avatar = (px: number) => (
    <span className={`flex-none ${dim ? 'opacity-40 grayscale' : ''}`} style={dim && revealAt !== undefined ? { animation: anim('cup-dim', revealAt, 320) } : undefined}>
      <PlayerAvatar player={player ?? { id: id ?? 'gone', name: seat.name, avatarUrl: '' }} size={px} />
    </span>
  );
  const seedText = seat.seed !== null && <span className="font-display font-extrabold tabular-nums opacity-60">{seat.seed}</span>;
  const nameCls = 'block min-w-0 truncate font-extrabold uppercase';

  let body: React.ReactNode;
  if (!id) {
    body = size === 'compact' ? (
      <span className="grid min-w-0 text-[9.5px] font-extrabold uppercase leading-[1.25] tracking-[0.04em]">
        <span className="truncate">{seat.empty[0]}</span>
        <span className="truncate">{seat.empty[1]}</span>
      </span>
    ) : size === 'final' ? (
      <span className={`grid min-w-0 gap-1 ${mirrored ? 'justify-items-end text-right' : ''}`}>
        <span className="h-10 w-10 rounded-full border-[1.5px] border-dashed border-loss" aria-hidden="true" />
        <span className="w-full truncate text-[11px] font-extrabold uppercase tracking-[0.04em]">{seat.empty[0]} {seat.empty[1]}</span>
      </span>
    ) : (
      <span className="truncate text-[11px] font-extrabold uppercase tracking-[0.04em]">{seat.empty[0]} {seat.empty[1]}</span>
    );
  } else if (size === 'compact') {
    body = (
      <span className="grid min-w-0 gap-[3px]" style={inAt}>
        <span className="flex items-center gap-1 text-[10px]">
          {avatar(18)}
          {seedText}
        </span>
        <span className={`${nameCls} text-[10px] leading-none tracking-[0.01em]`}>{seat.name}</span>
      </span>
    );
  } else if (size === 'full') {
    body = (
      <span className="flex min-w-0 items-center gap-1.5 text-[11px]" style={inAt}>
        <span className="w-3.5 flex-none text-center">{seedText}</span>
        {avatar(22)}
        <span className={`${nameCls} text-[12px] tracking-[0.02em]`}>{seat.name}</span>
      </span>
    );
  } else {
    body = (
      <span className={`grid min-w-0 gap-1.5 ${mirrored ? 'justify-items-end text-right' : ''}`} style={inAt}>
        {avatar(40)}
        <b className="block w-full truncate font-display text-[15px] font-extrabold uppercase leading-none">{seat.name}</b>
      </span>
    );
  }

  const plate = (
    <span
      className={`relative flex min-w-0 flex-1 items-center ${size === 'final' ? (mirrored ? 'pl-4 pr-3' : 'pl-3 pr-4') : size === 'full' ? 'pl-1 pr-2.5' : 'pl-1.5 pr-2'}`}
      style={{
        height: s.h,
        clipPath: clip,
        background: bg,
        color: fg,
        boxShadow: seat.mine ? `inset ${mirrored ? -4 : 4}px 0 0 ${FELT}` : undefined,
        animation: plateAnims.length ? plateAnims.join(', ') : undefined,
      }}
    >
      {body}
      {size === 'final' && seat.seed !== null && (
        <span className={`absolute top-2 font-display text-[11px] font-extrabold tabular-nums opacity-60 ${mirrored ? 'left-4' : 'right-4'}`}>{seat.seed}</span>
      )}
    </span>
  );
  const square = (
    <span
      className={`relative grid flex-none place-items-center font-display font-extrabold tabular-nums ${fontSq}`}
      style={{
        width: s.sq,
        height: s.h,
        clipPath: sqClip,
        background: sqBg,
        color: won ? '#FFFFFF' : 'rgba(255,255,255,.55)',
        [mirrored ? 'marginRight' : 'marginLeft']: s.gap - s.slant,
        animation: won && revealAt !== undefined ? anim('cup-sq-open', revealAt, 320) : undefined,
      }}
    >
      <span className={mirrored ? 'pr-[3px]' : 'pl-[3px]'} style={revealAt !== undefined ? { animation: anim('anim-fade', revealAt, 280) } : undefined}>
        {seat.score === 'auto' ? <SeedMark size={size === 'final' ? 16 : size === 'full' ? 12 : 10} /> : scoreText === 'W/O' ? <span className={woSize}>W/O</span> : scoreText}
      </span>
    </span>
  );
  const row = (
    <span className={`flex w-full ${mirrored ? 'flex-row-reverse' : ''}`}>
      {plate}
      {square}
    </span>
  );
  const spoken = !id ? `${seat.empty[0]} ${seat.empty[1]}` : `${seat.seed !== null ? `Seed ${seat.seed}, ` : ''}${seat.name}${result === 'won' ? ', through' : result === 'lost' ? ', out' : ''}`;
  return player ? (
    <button type="button" onClick={() => onSelect(player)} aria-label={spoken} className="press block w-full text-left">
      {row}
    </button>
  ) : (
    <span role="img" aria-label={spoken} className="block w-full">
      {row}
    </span>
  );
};

interface Geo {
  w: number;
  h: number;
  paths: Map<string, string>;
  /** From the champion's final plate into the trophy. */
  champ: string | null;
}

/** Where `node` sits inside `root`, ignoring transforms, so entrances in flight do not bend the lines. */
function offsetBox(node: HTMLElement, root: HTMLElement) {
  let x = 0;
  let y = 0;
  let at: HTMLElement | null = node;
  while (at && at !== root) {
    x += at.offsetLeft;
    y += at.offsetTop;
    at = at.offsetParent as HTMLElement | null;
  }
  return { x, y, w: node.offsetWidth, h: node.offsetHeight };
}

/** Elbow lines between measured plates: down, across, down; an upper feeder swings round its lane first. */
function measure(root: HTMLElement, model: BracketModel, champSeat: 0 | 1 | null): Geo {
  const find = (selector: string) => root.querySelector<HTMLElement>(selector);
  const boxOf = (key: string) => {
    const node = find(`[data-plates="${key}"]`);
    return node ? offsetBox(node, root) : null;
  };
  const seatBox = (seat: 0 | 1) => {
    const node = find(`[data-seat="${seat}"]`);
    return node ? offsetBox(node, root) : null;
  };
  const paths = new Map<string, string>();
  for (const feed of model.feeds) {
    const src = boxOf(feed.from);
    const dst = feed.to === model.final.key ? seatBox(feed.seat) : boxOf(feed.to);
    if (!src || !dst) continue;
    const x2 = dst.x + dst.w / 2;
    const y2 = dst.y;
    if (feed.swing) {
      const sibling = model.feeds.find((other) => other.to === feed.to && other !== feed);
      const lower = sibling ? boxOf(sibling.from) : null;
      const bottom = lower ? lower.y + lower.h : src.y + src.h;
      const left = feed.swing === 'left';
      const side = left ? src.x : src.x + src.w;
      const lane = left ? src.x - 6 : src.x + src.w + 6;
      const mid = src.y + src.h / 2;
      const ym = (bottom + y2) / 2;
      paths.set(feed.from, `M${side} ${mid} H${lane} V${ym} H${x2} V${y2}`);
      continue;
    }
    const x1 = src.x + src.w / 2;
    const y1 = src.y + src.h;
    const ym = Math.round((y1 + y2) / 2);
    paths.set(feed.from, Math.abs(x1 - x2) < 0.5 ? `M${x1} ${y1} V${y2}` : `M${x1} ${y1} V${ym} H${x2} V${y2}`);
  }
  let champ: string | null = null;
  const trophy = find('[data-trophy]');
  if (champSeat !== null && trophy) {
    const seat = seatBox(champSeat);
    const cup = offsetBox(trophy, root);
    if (seat) {
      const sx = seat.x + seat.w / 2;
      const sy = seat.y + seat.h / 2;
      const tx = cup.x + cup.w / 2;
      const ty = cup.y + cup.h / 2;
      champ = `M${sx} ${sy} Q${(sx + tx) / 2} ${sy - 56} ${tx} ${ty}`;
    }
  }
  return { w: root.offsetWidth, h: root.offsetHeight, paths, champ };
}

/**
 * The week's knockout as a poster bracket, top to bottom: the play-in (or the
 * round of 16), each round below the one before, and the final at the foot
 * with the trophy between the two finalists. Lines are measured from the
 * plates, so they stay exact at any width. Decided paths are white, open ones
 * grey, the champion's road gold and the viewer's own road felt green.
 *
 * The first time a viewer sees a result, the winner's ball rolls down the
 * line into the next plate; the champion's rolls into the trophy, which
 * lights up with a burst of balls and paper. The whole entrance waits until
 * the bracket scrolls into view.
 */
export const CupBracket: React.FC<{
  state: CupState;
  byId: Map<string, Player>;
  names: Map<string, string>;
  meId: string;
  seen: Set<string>;
  /** Replay everything, seen or not. */
  force: boolean;
  motion: boolean;
  base: number;
  /** Before Friday's deadline has passed: an unplayed final is still open. */
  silver?: boolean;
  onSelectPlayer: (player: Player) => void;
  onSeen?: (keys: string[]) => void;
}> = ({ state, byId, names, meId, seen, force, motion, base, silver, onSelectPlayer, onSeen }) => {
  const model = useMemo(() => bracketModel(state), [state]);
  const { rows, final, feeds, cols, lanes } = model;
  const champion = state.champion;
  const root = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<Geo | null>(null);
  const [live, setLive] = useState(!motion);
  const [burst, setBurst] = useState(false);

  const all = useMemo(() => [...rows.flatMap((row) => row.games.map((placed) => placed.game)), final], [rows, final]);
  const rowOf = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row, index) => row.games.forEach((placed) => map.set(placed.game.key, index)));
    map.set(final.key, rows.length);
    return map;
  }, [rows, final]);
  const feedFrom = useMemo(() => new Map(feeds.map((feed) => [feed.from, feed])), [feeds]);
  const feedInto = (key: string, seat: 0 | 1) => feeds.find((feed) => feed.to === key && feed.seat === seat) ?? null;

  // Results already in when the bracket mounted, and when each fresh one travels.
  const [plan] = useState(() => {
    const known = new Set(all.filter((game) => game.winnerId).map(resultKey));
    const start = new Map<string, number>();
    let at = base + rows.length * ROW_STEP + LINE_AT + LINE_DUR;
    const fresh = (game: CupGame) => motion && !!game.winnerId && (force || !seen.has(resultKey(game)));
    for (const games of [...rows.map((row) => row.games.map((placed) => placed.game)), [final]]) {
      const due = games.filter(fresh);
      due.forEach((game, index) => start.set(resultKey(game), at + index * TRAVEL_STAGGER));
      if (due.length) at += (due.length - 1) * TRAVEL_STAGGER + TRAVEL + TRAVEL_STAGGER;
    }
    const finalStart = final.winnerId ? start.get(resultKey(final)) : undefined;
    const goldAt = finalStart !== undefined ? finalStart + TRAVEL : undefined;
    return { known, start, goldAt, end: goldAt !== undefined ? goldAt + 1600 : at };
  });
  const travelAt = (game: CupGame): number | undefined => {
    if (!game.winnerId || !motion) return undefined;
    const key = resultKey(game);
    if (plan.start.has(key)) return plan.start.get(key);
    return plan.known.has(key) ? undefined : LIVE_TRAVEL;
  };
  const goldAt = champion && plan.goldAt !== undefined && final.winnerId === champion ? plan.goldAt : undefined;

  // The entrance waits until the bracket is on screen.
  useEffect(() => {
    if (live || !root.current) return;
    const io = new IntersectionObserver((entries) => entries.some((entry) => entry.isIntersecting) && setLive(true), { threshold: 0.12 });
    io.observe(root.current);
    return () => io.disconnect();
  }, [live]);

  const champSeat: 0 | 1 | null = champion ? (final.a === champion ? 0 : 1) : null;
  const shape = rows.map((row) => row.games.map((placed) => placed.game.key).join(',')).join('|');
  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    let frame = 0;
    const run = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setGeo(measure(node, model, champSeat)));
    };
    setGeo(measure(node, model, champSeat));
    const observer = new ResizeObserver(run);
    observer.observe(node);
    document.fonts?.ready.then(run).catch(() => {});
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape, champSeat]);

  // The champion's moment: balls burst out of the trophy as the ball lands.
  useEffect(() => {
    if (!live || goldAt === undefined) return;
    const on = window.setTimeout(() => setBurst(true), goldAt);
    const off = window.setTimeout(() => setBurst(false), goldAt + 700);
    return () => {
      window.clearTimeout(on);
      window.clearTimeout(off);
    };
  }, [live, goldAt]);

  const decided = all.filter((game) => game.winnerId).map(resultKey);
  useEffect(() => {
    if (!live || !onSeen) return;
    const later = decided.some((key) => !plan.known.has(key));
    const timer = window.setTimeout(() => !document.hidden && onSeen(decided), later ? LIVE_TRAVEL + TRAVEL + 600 : plan.end);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, decided.join(',')]);

  const nameOf = (id: string | null) => (id ? names.get(id) ?? 'Former player' : '');

  /** Everything a plate needs for one seat of a game. */
  const seatView = (game: CupGame, seat: 0 | 1): SeatView => {
    const id = seat === 0 ? game.a : game.b;
    const feed = feedInto(game.key, seat);
    const feeder = feed ? all.find((entry) => entry.key === feed.from) ?? null : null;
    const fromTravel = feeder ? travelAt(feeder) : undefined;
    const result: SeatView['result'] = !game.winnerId || !id ? 'open' : game.winnerId === id ? 'won' : 'lost';
    const won = result === 'won';
    const score = !game.winnerId || !id ? '' : game.walkover ? (won ? 'W/O' : '') : game.auto ? (won ? 'auto' : '') : won ? '1' : '0';
    const gold = !!champion && id === champion && (won || game === final);
    const tag = feed ? model.tags.get(feed.from) ?? '' : '';
    return {
      id,
      player: id ? byId.get(id) ?? null : null,
      name: nameOf(id),
      seed: id ? state.seeds.get(id) ?? null : null,
      empty: tag === 'Play-in' ? ['Winner of', 'play-in'] : ['Winner', tag],
      result,
      score,
      gold,
      mine: !!id && id === meId,
      arriveAt: id && fromTravel !== undefined ? fromTravel + TRAVEL : undefined,
      revealAt: id ? travelAt(game) : undefined,
      goldAt: gold && game !== final && goldAt !== undefined ? goldAt + (rowOf.get(game.key) ?? 0) * 90 : undefined,
    };
  };

  const tone = (game: CupGame): Tone =>
    game.winnerId
      ? game.winnerId === champion ? 'gold' : game.winnerId === meId ? 'me' : 'done'
      : game.a === meId || game.b === meId ? 'mine' : 'open';
  /** How a line looked before its result: still open. */
  const toneBefore = (game: CupGame): Tone => (game.a === meId || game.b === meId ? 'mine' : 'open');

  // Lines: each draws in with its round, looking as it did before any fresh
  // result. A fresh result paints over its line as the ball rolls, and the
  // champion's road turns gold only once the final has been revealed.
  const lines = feeds
    .map((feed) => {
      const game = all.find((entry) => entry.key === feed.from)!;
      const travel = travelAt(game);
      const after = tone(game);
      const goldLater = after === 'gold' && goldAt !== undefined;
      const paints: Array<{ key: string; tone: Tone; at: number; dur: number }> = [];
      if (travel !== undefined) paints.push({ key: `t-${resultKey(game)}`, tone: goldLater ? 'done' : after, at: travel, dur: TRAVEL });
      if (goldLater) paints.push({ key: `g-${resultKey(game)}`, tone: 'gold', at: goldAt! + (rowOf.get(feed.from) ?? 0) * 90, dur: 520 });
      const before: Tone = travel !== undefined ? toneBefore(game) : goldLater ? 'done' : after;
      return { feed, game, d: geo?.paths.get(feed.from), travel, before, paints };
    })
    .filter((line) => line.d);
  const paints = lines.flatMap((line) => line.paints.map((paint) => ({ ...paint, d: line.d! }))).sort((x, y) => TONE[x.tone].rank - TONE[y.tone].rank);
  const drawAt = (feed: Feed) => base + (rowOf.get(feed.from) ?? 0) * ROW_STEP + LINE_AT;
  const lineStyle = (delay: number, duration: number): React.CSSProperties | undefined =>
    motion ? ({ ['--d' as string]: `${Math.round(delay)}ms`, ['--dur' as string]: `${duration}ms` } as React.CSSProperties) : undefined;

  const enter = (row: number, index: number, side: 'l' | 'r'): React.CSSProperties | undefined =>
    motion ? { animation: anim(side === 'l' ? 'cup-pill-l' : 'cup-pill-r', base + row * ROW_STEP + index * 40, 420, 'both') } : undefined;

  const gridStyle: React.CSSProperties = { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, columnGap: lanes ? 12 : 8 };

  const renderGame = (placed: { game: CupGame; col: number; span: number; compact: boolean }, row: number, index: number) => {
    const { game, col, span, compact } = placed;
    const size: Size = compact ? 'compact' : 'full';
    const mineOpen = !game.winnerId && !!game.a && !!game.b && (game.a === meId || game.b === meId);
    const tag = model.tags.get(game.key) ?? '';
    const a = seatView(game, 0);
    const b = seatView(game, 1);
    const spoken = game.winnerId
      ? `${tag}. ${nameOf(game.winnerId)} ${game.walkover ? 'through on a walkover against' : game.auto ? 'through as the higher seed against' : 'beat'} ${nameOf(game.winnerId === game.a ? game.b : game.a)}`
      : `${tag}. ${game.a ? nameOf(game.a) : a.empty.join(' ')} against ${game.b ? nameOf(game.b) : b.empty.join(' ')}`;
    const side = col + span / 2 <= cols / 2 ? 'l' : 'r';
    return (
      <div key={game.key} role="group" aria-label={spoken} className="grid min-w-0 gap-1" style={{ gridColumn: `${col + 1} / span ${span}`, ...enter(row, index, side) }}>
        <span className={`truncate text-[9.5px] font-extrabold uppercase leading-none tracking-[0.12em] ${mineOpen ? 'text-white' : 'text-white/55'}`}>{tag}</span>
        <div data-plates={game.key} className="relative grid gap-[3px]">
          <Plate key={`a-${game.a}-${game.winnerId}`} seat={a} size={size} onSelect={onSelectPlayer} />
          <Plate key={`b-${game.b}-${game.winnerId}`} seat={b} size={size} onSelect={onSelectPlayer} />
          {mineOpen && (
            <>
              <span aria-hidden="true" className="cup-live pointer-events-none absolute -inset-[3px] rounded-[5px] border-[1.5px] border-live" style={{ animationDelay: `${base + row * ROW_STEP + 900}ms` }} />
              <span aria-hidden="true" className="cup-live-static pointer-events-none absolute -inset-[3px] rounded-[5px]" />
            </>
          )}
        </div>
      </div>
    );
  };

  const finalRow = rows.length;
  const finalOpen = !final.winnerId && !!final.a && !!final.b && (final.a === meId || final.b === meId);
  const seatBlock = (seat: 0 | 1) => {
    const view = seatView(final, seat);
    return (
      <div className="relative min-w-0" style={motion ? { animation: anim(seat === 0 ? 'duel-in-left' : 'duel-in-right', base + finalRow * ROW_STEP, 620, 'both') } : undefined}>
        <div data-seat={seat} className="relative">
          <Plate key={`f${seat}-${seat === 0 ? final.a : final.b}-${final.winnerId}`} seat={view} size="final" mirrored={seat === 1} onSelect={onSelectPlayer} />
          {finalOpen && view.mine && (
            <>
              <span aria-hidden="true" className="cup-live pointer-events-none absolute -inset-[3px] rounded-[6px] border-[1.5px] border-live" style={{ animationDelay: `${base + finalRow * ROW_STEP + 1000}ms` }} />
              <span aria-hidden="true" className="cup-live-static pointer-events-none absolute -inset-[3px] rounded-[6px]" />
            </>
          )}
        </div>
      </div>
    );
  };

  const champTravel = champion && geo?.champ ? travelAt(final) : undefined;
  const walkovers = all.some((game) => game.walkover);
  const autos = all.some((game) => game.auto);

  return (
    <div className="grid gap-3">
      <div
        ref={root}
        className={`relative isolate ${lanes ? 'px-3' : ''} ${live ? '' : 'cup-hold'}`}
      >
        {geo && (
          <svg aria-hidden="true" className="pointer-events-none absolute left-0 top-0 z-0 overflow-visible" width={geo.w} height={geo.h} fill="none" strokeLinecap="round" strokeLinejoin="round">
            {[...lines].sort((x, y) => TONE[x.before].rank - TONE[y.before].rank).map(({ feed, d, before }) => (
              <path
                key={`base-${feed.from}`}
                d={d}
                pathLength={1}
                stroke={TONE[before].stroke}
                strokeWidth={TONE[before].width}
                className={motion ? 'cup-line' : undefined}
                style={lineStyle(drawAt(feed), LINE_DUR)}
              />
            ))}
            {paints.map((paint) => (
              <path
                key={paint.key}
                d={paint.d}
                pathLength={1}
                stroke={TONE[paint.tone].stroke}
                strokeWidth={TONE[paint.tone].width}
                className="cup-line"
                style={lineStyle(paint.at, paint.dur)}
              />
            ))}
          </svg>
        )}

        <div className="relative z-[1] grid gap-7">
          {rows.map((row, index) => {
            const nextIsPre = rows[index + 1]?.kind === 'pre';
            return (
              <div key={index} className={`grid ${nextIsPre ? '-mb-4' : ''}`} style={gridStyle}>
                {row.games.map((placed, gameIndex) => renderGame(placed, index, gameIndex))}
              </div>
            );
          })}

          <div className="relative">
            <div className="grid grid-cols-[minmax(0,1fr)_56px_minmax(0,1fr)] items-end gap-1.5">
              {seatBlock(0)}
              <div className="relative grid justify-items-center gap-1 self-center">
                <span className="font-display text-[13px] font-extrabold uppercase leading-none tracking-[0.04em] text-white" style={motion ? { animation: anim('rise-in', base + finalRow * ROW_STEP + 200, 340, 'both') } : undefined}>
                  Final
                </span>
                <span data-trophy className="relative" style={motion ? { animation: anim('cup-trophy-rise', base + finalRow * ROW_STEP + 260, 640, 'both') } : undefined}>
                  <Trophy lit={!!champion} silver={!!silver && !champion} litAt={goldAt} />
                </span>
                {burst && (
                  <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 h-[320px] w-[380px] -translate-x-1/2 -translate-y-1/2">
                    <BallBurst />
                  </span>
                )}
              </div>
              {seatBlock(1)}
            </div>
            {champion && (
              <div
                className="relative mt-3 flex h-11 items-center justify-center gap-2 bg-crown px-4 text-bg"
                style={{
                  clipPath: 'polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)',
                  animation: goldAt !== undefined ? anim('wa-wipe', goldAt + 120, 620, 'both') : undefined,
                }}
              >
                <b className="truncate font-display text-base font-extrabold uppercase leading-none">{nameOf(champion)} wins the cup</b>
              </div>
            )}
            {goldAt !== undefined && live && (
              <span aria-hidden="true" className="pointer-events-none absolute -inset-x-4 -top-48 bottom-0">
                <CupConfetti delay={goldAt + 120} />
              </span>
            )}
          </div>
        </div>

        {geo && motion && live && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[2]">
            {lines.map(({ game, d, travel }) =>
              travel !== undefined && game.winnerId ? (
                <Ball
                  key={`ball-${resultKey(game)}`}
                  n={playerBall(byId.get(game.winnerId) ?? { id: game.winnerId })}
                  size={14}
                  bare
                  className="cup-traveller"
                  style={{ position: 'absolute', left: 0, top: 0, offsetPath: `path('${d}')`, offsetRotate: '0deg', animation: `cup-travel ${TRAVEL}ms var(--ease) ${travel}ms both` } as React.CSSProperties}
                />
              ) : null
            )}
            {champTravel !== undefined && champion && (
              <Ball
                key={`ball-final-${champion}`}
                n={playerBall(byId.get(champion) ?? { id: champion })}
                size={18}
                bare
                className="cup-traveller"
                style={{ position: 'absolute', left: 0, top: 0, offsetPath: `path('${geo.champ}')`, offsetRotate: '0deg', animation: `cup-travel ${TRAVEL}ms var(--ease) ${champTravel}ms both` } as React.CSSProperties}
              />
            )}
          </div>
        )}
      </div>

      {(walkovers || autos) && (
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-[11px] font-semibold text-white/55">
          {walkovers && (
            <span className="flex items-center gap-1.5">
              <span className="grid h-4 w-7 place-items-center bg-felt font-display text-[8px] font-extrabold text-white">W/O</span>
              Walkover
            </span>
          )}
          {autos && (
            <span className="flex items-center gap-1.5">
              <span className="grid h-4 w-7 place-items-center bg-felt"><SeedMark size={10} /></span>
              Higher seed went through
            </span>
          )}
        </div>
      )}
    </div>
  );
};

/** Every stage of the week in one strip: where the bracket is and when each round closes. */
export const CupRounds: React.FC<{ state: CupState; delay: number; motion: boolean }> = ({ state, delay, motion }) => {
  const stages = [
    ...(state.playIn.length ? [{ label: 'Play-in', games: state.playIn }] : []),
    ...state.rounds.map((games) => ({ label: games[0].label, games })),
  ];
  const done = state.champion !== null;
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}>
      {stages.map((stage, index) => {
        const over = stage.games.every((game) => game.winnerId);
        const now = !done && !over && stage.label === state.current;
        const deadline = stage.games[0].deadline;
        return (
          <span
            key={stage.label}
            className={`grid min-w-0 justify-items-center gap-1 rounded-xl px-1 py-2 ${now ? 'bg-white text-bg' : 'bg-surface'}`}
            style={motion ? { animation: anim('rise-in', delay + index * 60, 340, 'both') } : undefined}
          >
            <b className={`max-w-full truncate text-[11px] font-extrabold uppercase leading-none tracking-[0.06em] ${!now && !over ? 'text-white/55' : ''}`}>{roundShort(stage.label)}</b>
            <span className={`text-[10px] font-semibold leading-none ${now ? '' : 'text-white/55'}`}>
              {over ? 'Done' : `${weekday(deadline, 'short')} ${hm(deadline)}`}
            </span>
          </span>
        );
      })}
    </div>
  );
};
