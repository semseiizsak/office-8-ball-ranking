import React from 'react';
import { Player } from '../types';
import { CUP_MIN_PLAYERS, CupGame, CupState, Tournament, slotOrder } from './tournament';

/**
 * View helpers for the cup tab: which phase the week is in, the bracket laid
 * out for a phone, the current player's road through it, labels, and the
 * small "seen" store that keeps a fresh result from being revealed twice.
 */

export type CupPhase = 'weekend' | 'before' | 'open' | 'drawing' | 'off' | 'live' | 'champion' | 'unfinished';

export function cupPhase(tournament: Tournament | null, state: CupState | null, now: number): CupPhase {
  if (!tournament) return 'weekend';
  if (now < tournament.opensAt) return 'before';
  if (now < tournament.closesAt) return 'open';
  if (tournament.field === null) return 'drawing';
  if (tournament.field.length < CUP_MIN_PLAYERS) return 'off';
  // Drawn but not resolvable yet: still the draw as far as anyone can see.
  if (!state) return 'drawing';
  if (state.champion) return 'champion';
  if (state.unfinished) return 'unfinished';
  return 'live';
}

/** Remembered per game and winner, so a result is revealed once per viewer. */
export const resultKey = (game: CupGame) => `r:${game.key}:${game.winnerId ?? ''}`;

/** Short round names for tags and the rounds strip. */
export const roundShort = (label: string) =>
  label === 'Quarter-final' ? 'QF' : label === 'Semi-final' ? 'SF' : label === 'Round of 16' ? 'R16' : label;

// ---------- The bracket as a grid ----------

export interface PlacedGame {
  game: CupGame;
  /** First grid column, 0 based, and how many columns the game spans. */
  col: number;
  span: number;
  /** Size of the plates: two lines in a four column row, one line otherwise. */
  compact: boolean;
}

export interface BracketRow {
  kind: 'pre' | 'round';
  games: PlacedGame[];
}

/** One line of the bracket: the winner of `from` goes into `to`, seat 0 (top or left) or 1. */
export interface Feed {
  from: string;
  to: string;
  seat: 0 | 1;
  /** An upper game in a stacked pair swings round the lower one, on this side. */
  swing: 'left' | 'right' | null;
}

export interface BracketModel {
  cols: number;
  rows: BracketRow[];
  final: CupGame;
  feeds: Feed[];
  /** The small tag on each game: "QF 2", "Play-in", "R16 5". */
  tags: Map<string, string>;
  /** Stacked pairs need a lane beside each column for the swing lines. */
  lanes: boolean;
  /** What an empty seat says: "Winner of play-in", "Winner QF 1". */
  seatLabel: (key: string, seat: 0 | 1) => string;
}

/**
 * Lays the knockout out top to bottom on a grid a phone can hold. The first
 * round that fits on one row sets the columns (four quarter-finals, two
 * semi-finals, or the two seats of the final). Whatever feeds that round, the
 * play-in or the round of 16, sits above its column; when both seats of a
 * game are fed, the two feeders stack and the upper one swings round the
 * lower one in a lane at the side. Later rounds span their feeders' columns,
 * so every line is a plain elbow.
 */
export function bracketModel(state: CupState): BracketModel {
  const size = state.rounds[0].length * 2;
  const r16 = size === 16;
  const pre = r16 ? state.rounds[0] : state.playIn;
  const main = r16 ? state.rounds.slice(1) : state.rounds;
  const base = main[0];
  const order = slotOrder(size);
  const cols = base.length === 1 ? 2 : base.length;
  const final = state.final;

  // Where each feeder goes: the base game and seat it fills.
  const target = (game: CupGame, index: number) => {
    const pos = r16 ? index : order.indexOf(Number(game.key.slice(1)));
    return { to: base[Math.floor(pos / 2)], seat: (pos % 2) as 0 | 1 };
  };
  const placed = pre.map((game, index) => ({ game, ...target(game, index) }));
  const colOf = (entry: (typeof placed)[number]) => (base.length === 1 ? entry.seat : base.indexOf(entry.to));
  const both = (col: number) => placed.filter((entry) => colOf(entry) === col).length === 2;
  const upper = placed.filter((entry) => both(colOf(entry)) && entry.seat === 0);
  const lower = placed.filter((entry) => !upper.includes(entry));
  const compactPre = cols === 4;

  const tags = new Map<string, string>();
  const byBracket = [...placed].sort((x, y) => colOf(x) - colOf(y) || x.seat - y.seat);
  byBracket.forEach((entry, index) =>
    tags.set(entry.game.key, r16 ? `R16 ${state.rounds[0].indexOf(entry.game) + 1}` : pre.length > 1 ? `Play-in ${index + 1}` : 'Play-in')
  );
  for (const round of main) round.forEach((game, index) => tags.set(game.key, round.length === 1 ? 'Final' : `${roundShort(game.label)} ${index + 1}`));

  const rows: BracketRow[] = [];
  const preRow = (entries: typeof placed): BracketRow => ({
    kind: 'pre',
    games: entries.map((entry) => ({ game: entry.game, col: colOf(entry), span: 1, compact: compactPre })).sort((x, y) => x.col - y.col),
  });
  if (upper.length) rows.push(preRow(upper));
  if (lower.length) rows.push(preRow(lower));
  for (const round of main.slice(0, -1)) {
    const span = cols / round.length;
    rows.push({ kind: 'round', games: round.map((game, index) => ({ game, col: index * span, span, compact: span === 1 && cols === 4 })) });
  }

  const feeds: Feed[] = placed.map((entry) => ({
    from: entry.game.key,
    to: entry.to.key,
    seat: entry.seat,
    swing: upper.includes(entry) ? (colOf(entry) < cols / 2 ? 'left' : 'right') : null,
  }));
  main.slice(0, -1).forEach((round, r) =>
    round.forEach((game, index) => feeds.push({ from: game.key, to: main[r + 1][Math.floor(index / 2)].key, seat: (index % 2) as 0 | 1, swing: null }))
  );

  const seatLabel = (key: string, seat: 0 | 1) => {
    const feed = feeds.find((entry) => entry.to === key && entry.seat === seat);
    const tag = feed ? tags.get(feed.from) ?? '' : '';
    return tag === 'Play-in' ? 'Winner of play-in' : `Winner ${tag}`;
  };
  return { cols, rows, final, feeds, tags, lanes: upper.length > 0, seatLabel };
}

export type RoadStatus = 'won' | 'lost' | 'play' | 'waiting' | 'ahead' | 'out';
export interface RoadStep {
  key: string;
  label: string;
  /** Short name for the strip: Play-in, R16, QF, SF, Final. */
  short: string;
  status: RoadStatus;
  game: CupGame | null;
  opponentId: string | null;
}

/**
 * The current player's week: their play-in if they have one, then every main
 * round up to the final. Null when they are not in the field.
 */
export function myRoad(state: CupState, me: string): RoadStep[] | null {
  if (!state.seeds.has(me)) return null;
  const stages: Array<{ key: string; label: string; games: CupGame[] }> = [];
  if (state.playIn.some((game) => game.a === me || game.b === me)) stages.push({ key: 'playin', label: 'Play-in', games: state.playIn });
  state.rounds.forEach((games, round) => stages.push({ key: `r${round}`, label: games[0].label, games }));
  let alive = true;
  return stages.map(({ key, label, games }) => {
    const game = games.find((entry) => entry.a === me || entry.b === me) ?? null;
    const short = roundShort(label);
    if (!game) {
      const status: RoadStatus = !alive ? 'out' : 'ahead';
      return { key, label, short, status, game: null, opponentId: null };
    }
    const opponentId = game.a === me ? game.b : game.a;
    const status: RoadStatus = game.winnerId === me ? 'won' : game.winnerId ? 'lost' : opponentId ? 'play' : 'waiting';
    if (status === 'lost') alive = false;
    return { key, label, short, status, game, opponentId };
  });
}

/**
 * First names for everyone in the cup. Two players sharing a first name both
 * get their surname initial, and ids no longer in the league read as
 * "Former player".
 */
export function cupNames(ids: string[], byId: Map<string, Player>): Map<string, string> {
  const firsts = new Map<string, number>();
  const first = (id: string) => byId.get(id)?.name.split(' ')[0] ?? '';
  for (const id of new Set(ids)) if (byId.has(id)) firsts.set(first(id), (firsts.get(first(id)) ?? 0) + 1);
  const names = new Map<string, string>();
  for (const id of ids) {
    const player = byId.get(id);
    if (!player) {
      names.set(id, 'Former player');
      continue;
    }
    const parts = player.name.trim().split(/\s+/);
    const clash = (firsts.get(parts[0]) ?? 0) > 1 && parts.length > 1;
    names.set(id, clash ? `${parts[0]} ${parts[parts.length - 1].charAt(0)}` : parts[0]);
  }
  return names;
}

/** 24 hour clock with no leading zero on the hour: "8:00", "16:00". */
export const hm = (at: number) => {
  const date = new Date(at);
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
};
export const weekday = (at: number, style: 'long' | 'short' = 'long') => new Date(at).toLocaleDateString('en-GB', { weekday: style });
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthShort = (at: number) => MONTHS[new Date(at).getMonth()];
export const dayMonth = (at: number) => `${new Date(at).getDate()} ${monthShort(at)}`;

/** Inline timing for `.cup-in`: keyframe, delay and duration from the choreography. */
export const cupIn = (keyframe: string, delay: number, duration = 360): React.CSSProperties => ({
  ['--k' as string]: keyframe,
  ['--d' as string]: `${Math.round(delay)}ms`,
  ['--dur' as string]: `${duration}ms`,
});

// ---------- Seen store ----------

const seenKey = (week: string) => `cup-seen-${week}`;

/** What this viewer has already watched for a week. Blocked storage reads as nothing seen. */
export function readSeen(week: string): Set<string> {
  try {
    const list = JSON.parse(localStorage.getItem(seenKey(week)) ?? '[]');
    return new Set(Array.isArray(list) ? list.filter((entry): entry is string => typeof entry === 'string') : []);
  } catch {
    return new Set();
  }
}

export function addSeen(week: string, keys: string[]) {
  try {
    const seen = readSeen(week);
    keys.forEach((key) => seen.add(key));
    localStorage.setItem(seenKey(week), JSON.stringify([...seen]));
  } catch {
    // Storage blocked: everything replays next visit, which is harmless.
  }
}

// ---------- Hooks ----------

const reducedQuery = '(prefers-reduced-motion: reduce)';
export const prefersReducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.(reducedQuery).matches;

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(prefersReducedMotion);
  React.useEffect(() => {
    const query = window.matchMedia?.(reducedQuery);
    if (!query) return;
    const onChange = () => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

