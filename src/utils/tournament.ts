import { MatchRecord } from '../types';
import { dayKeyOf } from './daily';

/**
 * The weekly cup: straight knockout for 4 or 8 players. Sign-ups open Monday
 * morning and close at noon; the first 8 in play (or the first 4 when fewer
 * than 8 signed up), drawn at random. The bracket moves as matches are
 * logged: the first match between a pair after the draw decides who goes on.
 * Everything counts for Elo as usual; the champion takes a trophy and chips.
 */

export const CUP_OPENS_HOUR = 8;
export const CUP_CLOSES_HOUR = 12;
export const CUP_DEADLINE_HOUR = 17;
export const CHAMPION_CHIPS = 300;
export const FINALIST_CHIPS = 100;

/** Weeks whose sign-ups close later than usual: week key to closing hour. */
export const CUP_CLOSE_OVERRIDES: Record<string, number> = { '2026-09-28': 16 };

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

export interface Tournament {
  /** The Monday of the week, YYYY-MM-DD. */
  week: string;
  opensAt: number;
  closesAt: number;
  /** Friday afternoon: the last moment a cup match counts. */
  deadline: number;
  entrants: Array<{ id: string; at: number }>;
  /** Player ids in draw order, 4 or 8 of them; null until drawn, empty if too few signed up. */
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

/** The field (first 8, else first 4, else nobody) in a random order seeded on the week. */
export function drawBracket(tournament: Tournament): string[] {
  const inOrder = [...tournament.entrants].sort((a, b) => a.at - b.at).map((entry) => entry.id);
  const size = inOrder.length >= 8 ? 8 : inOrder.length >= 4 ? 4 : 0;
  const field = inOrder.slice(0, size);
  const random = seeded(`cup-${tournament.week}`);
  for (let i = field.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [field[i], field[j]] = [field[j], field[i]];
  }
  return field;
}

export interface CupMatch {
  round: number;
  a: string | null;
  b: string | null;
  winnerId: string | null;
  matchId: string | null;
}

export interface CupState {
  rounds: CupMatch[][];
  champion: string | null;
  runnerUp: string | null;
  /** Past the deadline with the final unplayed. */
  unfinished: boolean;
}

export const roundName = (round: number, rounds: number) =>
  round === rounds - 1 ? 'Final' : round === rounds - 2 ? 'Semi-finals' : 'Quarter-finals';

/** Walks the bracket forward through the matches logged since the draw. */
export function resolveCup(tournament: Tournament, matches: MatchRecord[], now: number): CupState | null {
  if (!tournament.bracket || tournament.bracket.length < 4) return null;
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
  let field: Array<string | null> = [...tournament.bracket];
  let round = 0;
  while (field.length >= 2) {
    const games: CupMatch[] = [];
    for (let i = 0; i < field.length; i += 2) {
      const a = field[i];
      const b = field[i + 1];
      games.push({ round, a, b, ...settle(a, b) });
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
    for (const id of tournament.bracket) get(id).entered++;
    for (const game of state.rounds.flat()) if (game.winnerId) get(game.winnerId).matchWins++;
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
