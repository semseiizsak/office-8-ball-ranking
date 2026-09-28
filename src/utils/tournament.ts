import { MatchRecord } from '../types';
import { dayKeyOf } from './daily';

/**
 * The weekly cup: straight knockout. Sign-ups open Monday morning and close at
 * noon; everyone who signed up plays. The bracket is the next power of two
 * (4, 8 or 16) and whoever has no opponent in the first round gets a bye:
 * through without a match, so no Elo either way. The bracket moves as matches are
 * logged: the first match between a pair after the draw decides who goes on.
 * Everything counts for Elo as usual; the champion takes a trophy and chips.
 */

export const CUP_OPENS_HOUR = 8;
export const CUP_CLOSES_HOUR = 12;
export const CUP_DEADLINE_HOUR = 17;
export const CHAMPION_CHIPS = 300;
export const FINALIST_CHIPS = 100;

export const CUP_MIN_PLAYERS = 3;
export const CUP_MAX_PLAYERS = 16;

/** Weeks whose sign-ups close later than usual: week key to closing hour. */
export const CUP_CLOSE_OVERRIDES: Record<string, number> = { '2026-09-28': 16 };

/**
 * Weeks whose draw is thrown away and redone once: week key to the moment
 * the old draw stopped counting. 2026-09-28 was drawn under the old
 * first-4-or-8 rule, which left people out.
 */
export const CUP_REDRAWS: Record<string, number> = { '2026-09-28': 1790605500000 };

/**
 * Applies a later closing hour to a week's cup. A cup already drawn before the
 * new close is treated as undrawn, so sign-ups reopen and it is drawn again.
 */
export function withCloseOverride(tournament: Tournament): Tournament {
  const hour = CUP_CLOSE_OVERRIDES[tournament.week];
  if (hour === undefined) return tournament;
  const closes = new Date(tournament.opensAt);
  closes.setHours(hour, 0, 0, 0);
  const closesAt = closes.getTime();
  const early = tournament.drawnAt !== null && tournament.drawnAt < closesAt;
  return { ...tournament, closesAt, ...(early ? { bracket: null, drawnAt: null } : {}) };
}

/** Throws away a draw made before the week's redraw moment, so the next open draws again. */
export function withRedraw(tournament: Tournament): Tournament {
  const redrawAt = CUP_REDRAWS[tournament.week];
  if (redrawAt === undefined || tournament.drawnAt === null || tournament.drawnAt >= redrawAt) return tournament;
  return { ...tournament, bracket: null, drawnAt: null };
}

export interface Tournament {
  /** The Monday of the week, YYYY-MM-DD. */
  week: string;
  opensAt: number;
  closesAt: number;
  /** Friday afternoon: the last moment a cup match counts. */
  deadline: number;
  entrants: Array<{ id: string; at: number }>;
  /** Player ids in draw order, 4, 8 or 16 slots with '' for a bye; null until drawn, empty if too few signed up. */
  bracket: string[] | null;
  drawnAt: number | null;
}

/** The Monday midnight of the week `at` falls in. */
export function mondayOf(at: number): Date {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  const shift = (date.getDay() + 6) % 7; // Monday = 0
  date.setDate(date.getDate() - shift);
  return date;
}

export function weekTournament(at: number): Tournament {
  const monday = mondayOf(at);
  const hour = (days: number, h: number) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + days);
    d.setHours(h, 0, 0, 0);
    return d.getTime();
  };
  return withCloseOverride({
    week: dayKeyOf(monday.getTime()),
    opensAt: hour(0, CUP_OPENS_HOUR),
    closesAt: hour(0, CUP_CLOSES_HOUR),
    deadline: hour(4, CUP_DEADLINE_HOUR),
    entrants: [],
    bracket: null,
    drawnAt: null,
  });
}

const seeded = (seed: string) => {
  let h = 2166136261;
  for (const char of seed) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
};

/** Slots for a field of `n`: the next power of two, at least 4. */
export const bracketSize = (n: number) => {
  let size = 4;
  while (size < n) size *= 2;
  return size;
};

/**
 * Everyone who signed up (up to 16), shuffled with a seed on the week, in a
 * bracket of the next power of two. Byes ('') are always paired with a real
 * player, never with each other, and spread through the draw at random.
 */
export function drawBracket(tournament: Tournament): string[] {
  const inOrder = [...tournament.entrants].sort((a, b) => a.at - b.at).map((entry) => entry.id);
  if (inOrder.length < CUP_MIN_PLAYERS) return [];
  const field = inOrder.slice(0, CUP_MAX_PLAYERS);
  const random = seeded(`cup-${tournament.week}`);
  const shuffle = <T,>(items: T[]) => {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  };
  shuffle(field);
  const size = bracketSize(field.length);
  const byes = size - field.length;
  const pairs: Array<[string, string]> = [];
  let next = 0;
  for (let i = 0; i < size / 2; i++) {
    if (i < byes) pairs.push([field[next++], '']);
    else pairs.push([field[next++], field[next++]]);
  }
  return shuffle(pairs).flatMap(([a, b]) => (random() < 0.5 ? [a, b] : [b, a]));
}

export interface CupMatch {
  round: number;
  a: string | null;
  b: string | null;
  winnerId: string | null;
  matchId: string | null;
  /** One side had nobody: the other goes through without a match or Elo. */
  bye: boolean;
}

export interface CupState {
  rounds: CupMatch[][];
  champion: string | null;
  runnerUp: string | null;
  /** Past the deadline with the final unplayed. */
  unfinished: boolean;
}

export const roundName = (round: number, rounds: number) =>
  round === rounds - 1 ? 'Final' : round === rounds - 2 ? 'Semi-finals' : round === rounds - 3 ? 'Quarter-finals' : 'Round of 16';

/** Walks the bracket forward through the matches logged since the draw. */
export function resolveCup(tournament: Tournament, matches: MatchRecord[], now: number): CupState | null {
  if (!tournament.bracket || tournament.bracket.length < 4) return null;
  const draw = tournament.bracket.map((id) => id || null);
  const byeSlot = (i: number) => tournament.bracket![i] === '';
  const since = tournament.drawnAt ?? tournament.closesAt;
  const window = matches
    .filter((match) => match.timestamp >= since && match.timestamp <= tournament.deadline)
    .sort((a, b) => a.timestamp - b.timestamp);
  const used = new Set<string>();
  const settle = (a: string | null, b: string | null): { winnerId: string | null; matchId: string | null } => {
    if (!a || !b) return { winnerId: null, matchId: null };
    const match = window.find((entry) => !used.has(entry.id) && [entry.playerAId, entry.playerBId].includes(a) && [entry.playerAId, entry.playerBId].includes(b));
    if (!match) return { winnerId: null, matchId: null };
    used.add(match.id);
    return { winnerId: match.winnerId, matchId: match.id };
  };

  const rounds: CupMatch[][] = [];
  let field: Array<string | null> = draw;
  let round = 0;
  while (field.length >= 2) {
    const games: CupMatch[] = [];
    for (let i = 0; i < field.length; i += 2) {
      const a = field[i];
      const b = field[i + 1];
      const bye = round === 0 && (byeSlot(i) || byeSlot(i + 1));
      games.push(bye ? { round, a, b, winnerId: a ?? b, matchId: null, bye } : { round, a, b, bye: false, ...settle(a, b) });
    }
    rounds.push(games);
    field = games.map((game) => game.winnerId);
    round++;
  }
  const final = rounds[rounds.length - 1][0];
  const champion = final.winnerId;
  const runnerUp = champion ? (final.a === champion ? final.b : final.a) : null;
  return { rounds, champion, runnerUp, unfinished: !champion && now > tournament.deadline };
}

export interface CupRecord {
  entered: number;
  titles: number;
  finals: number;
  matchWins: number;
  bonus: number;
}

export function deriveCups(tournaments: Tournament[], matches: MatchRecord[], now: number): Map<string, CupRecord> {
  const records = new Map<string, CupRecord>();
  const get = (id: string) => {
    const existing = records.get(id);
    if (existing) return existing;
    const fresh: CupRecord = { entered: 0, titles: 0, finals: 0, matchWins: 0, bonus: 0 };
    records.set(id, fresh);
    return fresh;
  };
  for (const tournament of tournaments) {
    const state = resolveCup(tournament, matches, now);
    if (!state || !tournament.bracket) continue;
    for (const id of tournament.bracket) if (id) get(id).entered++;
    // A bye is not a win.
    for (const game of state.rounds.flat()) if (game.winnerId && !game.bye) get(game.winnerId).matchWins++;
    if (state.champion) {
      const champ = get(state.champion);
      champ.titles++;
      champ.finals++;
      champ.bonus += CHAMPION_CHIPS;
    }
    if (state.runnerUp) {
      const second = get(state.runnerUp);
      second.finals++;
      second.bonus += FINALIST_CHIPS;
    }
  }
  return records;
}
