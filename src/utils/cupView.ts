import React from 'react';
import { MatchRecord, Player } from '../types';
import { CUP_MIN_PLAYERS, CupGame, CupState, FINAL_ROUND, SWISS_ROUNDS, Tournament } from './tournament';

/**
 * View helpers for the cup tab: which phase the week is in, the current
 * player's road through the rounds, labels, and the small "seen" store that
 * keeps a fresh result from being revealed more than once.
 */

export type CupPhase = 'weekend' | 'before' | 'open' | 'drawing' | 'off' | 'live' | 'champion' | 'unfinished';

export function cupPhase(tournament: Tournament | null, state: CupState | null, now: number): CupPhase {
  if (!tournament) return 'weekend';
  if (now < tournament.opensAt) return 'before';
  if (now < tournament.closesAt) return 'open';
  if (tournament.field === null) return 'drawing';
  if (tournament.field.length < CUP_MIN_PLAYERS) return 'off';
  // Drawn but round one not stored yet: still the draw as far as anyone can see.
  if (!state) return 'drawing';
  if (state.champion) return 'champion';
  if (state.unfinished) return 'unfinished';
  return 'live';
}

/** Stable per pairing, so a result is remembered as seen across visits. */
export const gameKey = (game: CupGame) => `g:${game.round}:${game.a}:${game.b ?? ''}`;

export const allGames = (state: CupState) => [...state.rounds.flat(), ...(state.final ? [state.final] : [])];

export const playedAt = (game: CupGame, matches: MatchRecord[]) =>
  game.matchId ? matches.find((match) => match.id === game.matchId)?.timestamp ?? null : null;

export type RoadStatus = 'won' | 'lost' | 'bye' | 'play' | 'missed' | 'waiting' | 'out';
export interface RoadStep {
  round: number;
  label: string;
  status: RoadStatus;
  game: CupGame | null;
  opponentId: string | null;
}

/** The current player's week: both Swiss rounds and the final, or null when they are not in the field. */
export function myRoad(state: CupState, me: string, now: number): RoadStep[] | null {
  if (!state.standings.some((standing) => standing.id === me)) return null;
  const step = (round: number, game: CupGame | null | undefined, label: string): RoadStep => {
    if (!game) return { round, label, status: 'waiting', game: null, opponentId: null };
    const opponentId = game.a === me ? game.b : game.a;
    const status: RoadStatus =
      game.bye ? 'bye'
      : game.winnerId === me ? 'won'
      : game.winnerId ? 'lost'
      : now > game.deadline ? 'missed'
      : 'play';
    return { round, label, status, game, opponentId };
  };
  const steps = Array.from({ length: SWISS_ROUNDS }, (_, round) =>
    step(round, state.rounds[round]?.find((game) => game.a === me || game.b === me), `R${round + 1}`)
  );
  const final = state.final;
  const swissDone = state.rounds.length === SWISS_ROUNDS && state.current >= FINAL_ROUND;
  const rank = state.standings.findIndex((standing) => standing.id === me);
  if (final && (final.a === me || final.b === me)) steps.push(step(FINAL_ROUND, final, 'Final'));
  else if (final || (swissDone && rank > 1)) steps.push({ round: FINAL_ROUND, label: 'Final', status: 'out', game: null, opponentId: null });
  else steps.push({ round: FINAL_ROUND, label: 'Final', status: 'waiting', game: null, opponentId: null });
  return steps;
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

