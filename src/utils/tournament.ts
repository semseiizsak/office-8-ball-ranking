import { MatchRecord } from '../types';
import { dayKeyOf } from './daily';

/**
 * The weekly cup, Swiss style, so it works for whoever turns up that week.
 *
 * Sign-ups open Monday morning and close at noon; everyone who signed up
 * plays. Two Swiss rounds: the first is paired at random, the second pairs
 * players on the same points without rematches. With an odd number, one
 * player sits each round out and takes the point (a bye: no match, no Elo).
 * The top two of the standings then play the final. Nobody plays more than
 * three cup matches in a week.
 *
 * A round's pairings are stored once, by whichever phone first sees the
 * previous round finished (every game played, or its deadline passed), so a
 * corrected result later cannot reshuffle games already played. Results are
 * read off the matches: the first match between the pair inside the round's
 * window decides it; a game not played by its deadline scores nothing.
 */

export const CUP_OPENS_HOUR = 8;
export const CUP_CLOSES_HOUR = 12;
export const CUP_DEADLINE_HOUR = 17;
export const CHAMPION_CHIPS = 300;
export const FINALIST_CHIPS = 100;

export const CUP_MIN_PLAYERS = 3;
export const CUP_MAX_PLAYERS = 16;
/** Swiss rounds before the final. */
export const SWISS_ROUNDS = 2;
/** Round index of the final. */
export const FINAL_ROUND = SWISS_ROUNDS;
/** When each round closes, as [days after Monday, hour]: Tuesday 17:00, Thursday 12:00, Friday 17:00. */
const ROUND_CLOSES: Array<[number, number]> = [[1, 17], [3, 12], [4, CUP_DEADLINE_HOUR]];

/** Weeks whose sign-ups close later than usual: week key to closing hour. */
export const CUP_CLOSE_OVERRIDES: Record<string, number> = { '2026-09-28': 16 };

/**
 * Weeks whose draw is thrown away and redone once: week key to the moment
 * the old draw stopped counting. 2026-09-28 was drawn as a knockout before
 * the cup went Swiss.
 */
export const CUP_REDRAWS: Record<string, number> = { '2026-09-28': 1790606100000 };

export interface Pairing {
  round: number;
  a: string;
  /** '' when `a` has the bye. */
  b: string;
  /** When the pairing was made; the round's matches count from here. */
  at: number;
}

export interface Tournament {
  /** The Monday of the week, YYYY-MM-DD. */
  week: string;
  opensAt: number;
  closesAt: number;
  /** Friday afternoon: the last moment a cup match counts. */
  deadline: number;
  entrants: Array<{ id: string; at: number }>;
  /** Everyone playing, in draw order; null until drawn, empty if too few signed up. */
  field: string[] | null;
  drawnAt: number | null;
  pairings: Pairing[];
}

const undrawn = { field: null, drawnAt: null, pairings: [] as Pairing[] };

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
  return { ...tournament, closesAt, ...(early ? undrawn : {}) };
}

/** Throws away a draw made before the week's redraw moment, so the next open draws again. */
export function withRedraw(tournament: Tournament): Tournament {
  const redrawAt = CUP_REDRAWS[tournament.week];
  if (redrawAt === undefined || tournament.drawnAt === null || tournament.drawnAt >= redrawAt) return tournament;
  return { ...tournament, ...undrawn };
}

/** The Monday midnight of the week `at` falls in. */
export function mondayOf(at: number): Date {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  const shift = (date.getDay() + 6) % 7; // Monday = 0
  date.setDate(date.getDate() - shift);
  return date;
}

const hourOf = (monday: Date, days: number, h: number) => {
  const d = new Date(monday);
  d.setDate(d.getDate() + days);
  d.setHours(h, 0, 0, 0);
  return d.getTime();
};

export function weekTournament(at: number): Tournament {
  const monday = mondayOf(at);
  return withCloseOverride({
    week: dayKeyOf(monday.getTime()),
    opensAt: hourOf(monday, 0, CUP_OPENS_HOUR),
    closesAt: hourOf(monday, 0, CUP_CLOSES_HOUR),
    deadline: hourOf(monday, 4, CUP_DEADLINE_HOUR),
    entrants: [],
    ...undrawn,
  });
}

/** The last moment a round's matches count. */
export const roundDeadline = (tournament: Tournament, round: number) => {
  const [days, hour] = ROUND_CLOSES[Math.min(round, ROUND_CLOSES.length - 1)];
  return hourOf(mondayOf(tournament.opensAt), days, hour);
};

export const roundName = (round: number) => (round >= FINAL_ROUND ? 'Final' : `Round ${round + 1}`);

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

/**
 * Everyone who signed up (the first 16 if more), shuffled with a seed on the
 * week. Fewer than three is no cup.
 */
export function drawField(tournament: Tournament): string[] {
  const inOrder = [...tournament.entrants].sort((a, b) => a.at - b.at).map((entry) => entry.id);
  if (inOrder.length < CUP_MIN_PLAYERS) return [];
  const field = inOrder.slice(0, CUP_MAX_PLAYERS);
  const random = seeded(`cup-${tournament.week}`);
  for (let i = field.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [field[i], field[j]] = [field[j], field[i]];
  }
  return field;
}

/** Round one straight off the shuffled field; the odd one out sits it out. */
export function firstRound(field: string[], at: number): Pairing[] {
  const pairings: Pairing[] = [];
  for (let i = 0; i + 1 < field.length; i += 2) pairings.push({ round: 0, a: field[i], b: field[i + 1], at });
  if (field.length % 2) pairings.push({ round: 0, a: field[field.length - 1], b: '', at });
  return pairings;
}

export interface CupGame {
  round: number;
  a: string;
  /** Null for a bye. */
  b: string | null;
  winnerId: string | null;
  matchId: string | null;
  bye: boolean;
  /** When this game stops counting. */
  deadline: number;
}

export interface Standing {
  id: string;
  points: number;
  /** Sum of the opponents' points: who you beat matters when points tie. */
  buchholz: number;
  played: number;
  wins: number;
  byes: number;
  rank: number;
}

export interface CupState {
  /** The Swiss rounds paired so far, round one first. */
  rounds: CupGame[][];
  final: CupGame | null;
  /** After the Swiss rounds, best first; the top two are the finalists. */
  standings: Standing[];
  /** The round being played now: 0 and 1 are Swiss, 2 is the final. */
  current: number;
  champion: string | null;
  runnerUp: string | null;
  /** Past the deadline with the final unplayed. */
  unfinished: boolean;
  /** Pairings due to be stored: the round just finished and the next is not paired yet. */
  next: Pairing[] | null;
}

/**
 * Pairs the standings for the next Swiss round: the lowest-ranked player
 * without a bye yet sits out if the number is odd, then everyone is paired
 * top down with the nearest player they have not met. A search finds a full
 * set without rematches when one exists.
 */
function swissPairs(order: string[], met: Set<string>, hadBye: Set<string>): Array<[string, string]> {
  const key = (a: string, b: string) => [a, b].sort().join('|');
  let pool = [...order];
  const out: Array<[string, string]> = [];
  if (pool.length % 2) {
    const sitter = [...pool].reverse().find((id) => !hadBye.has(id)) ?? pool[pool.length - 1];
    pool = pool.filter((id) => id !== sitter);
    out.push([sitter, '']);
  }
  const search = (left: string[]): Array<[string, string]> | null => {
    if (left.length === 0) return [];
    const [a, ...rest] = left;
    for (const b of rest) {
      if (met.has(key(a, b))) continue;
      const tail = search(rest.filter((id) => id !== b));
      if (tail) return [[a, b], ...tail];
    }
    return null;
  };
  const clean = search(pool);
  if (clean) return [...clean, ...out];
  // Everyone has met everyone: pair in order and accept the rematch.
  for (let i = 0; i + 1 < pool.length; i += 2) out.unshift([pool[i], pool[i + 1]]);
  return out;
}

/** Where the cup stands: every game, the table, the final and what to pair next. */
export function resolveCup(tournament: Tournament, matches: MatchRecord[], now: number): CupState | null {
  if (!tournament.field || tournament.field.length < CUP_MIN_PLAYERS || tournament.pairings.length === 0) return null;
  const sorted = [...matches].sort((a, b) => a.timestamp - b.timestamp);
  const used = new Set<string>();
  const game = (pairing: Pairing): CupGame => {
    const deadline = roundDeadline(tournament, pairing.round);
    if (!pairing.b) return { round: pairing.round, a: pairing.a, b: null, winnerId: pairing.a, matchId: null, bye: true, deadline };
    const match = sorted.find(
      (entry) =>
        !used.has(entry.id) &&
        entry.timestamp >= pairing.at &&
        entry.timestamp <= deadline &&
        [entry.playerAId, entry.playerBId].includes(pairing.a) &&
        [entry.playerAId, entry.playerBId].includes(pairing.b)
    );
    if (match) used.add(match.id);
    return { round: pairing.round, a: pairing.a, b: pairing.b, winnerId: match?.winnerId ?? null, matchId: match?.id ?? null, bye: false, deadline };
  };

  const rounds: CupGame[][] = [];
  for (let round = 0; round < SWISS_ROUNDS; round++) {
    const games = tournament.pairings.filter((pairing) => pairing.round === round).map(game);
    if (games.length === 0) break;
    rounds.push(games);
  }
  const finalPairing = tournament.pairings.find((pairing) => pairing.round === FINAL_ROUND);
  const final = finalPairing ? game(finalPairing) : null;

  // The table from the Swiss rounds.
  const points = new Map(tournament.field.map((id) => [id, 0]));
  const stats = new Map(tournament.field.map((id) => [id, { played: 0, wins: 0, byes: 0, opponents: [] as string[] }]));
  for (const g of rounds.flat()) {
    if (g.bye) {
      points.set(g.a, (points.get(g.a) ?? 0) + 1);
      stats.get(g.a)!.byes++;
      continue;
    }
    stats.get(g.a)?.opponents.push(g.b!);
    stats.get(g.b!)?.opponents.push(g.a);
    if (!g.winnerId) continue;
    points.set(g.winnerId, (points.get(g.winnerId) ?? 0) + 1);
    stats.get(g.a)!.played++;
    stats.get(g.b!)!.played++;
    stats.get(g.winnerId)!.wins++;
  }
  const coin = seeded(`cup-table-${tournament.week}`);
  const tiebreak = new Map(tournament.field.map((id) => [id, coin()]));
  const standings: Standing[] = tournament.field
    .map((id) => {
      const s = stats.get(id)!;
      return { id, points: points.get(id) ?? 0, buchholz: s.opponents.reduce((sum, o) => sum + (points.get(o) ?? 0), 0), played: s.played, wins: s.wins, byes: s.byes, rank: 0 };
    })
    .sort((x, y) => y.points - x.points || y.buchholz - x.buchholz || y.wins - x.wins || tiebreak.get(y.id)! - tiebreak.get(x.id)!)
    .map((standing, index) => ({ ...standing, rank: index + 1 }));

  // A round is over once every game has a result or its deadline has passed.
  const done = (games: CupGame[]) => games.length > 0 && (games.every((g) => g.winnerId) || now > games[0].deadline);
  const current = final ? FINAL_ROUND : rounds.length === 0 ? 0 : done(rounds[rounds.length - 1]) ? rounds.length : rounds.length - 1;

  let next: Pairing[] | null = null;
  const last = rounds[rounds.length - 1];
  if (!final && last && done(last) && now <= tournament.deadline) {
    if (rounds.length < SWISS_ROUNDS) {
      const met = new Set(rounds.flat().filter((g) => g.b).map((g) => [g.a, g.b!].sort().join('|')));
      const hadBye = new Set(rounds.flat().filter((g) => g.bye).map((g) => g.a));
      next = swissPairs(standings.map((s) => s.id), met, hadBye).map(([a, b]) => ({ round: rounds.length, a, b, at: now }));
    } else if (standings.length >= 2) {
      next = [{ round: FINAL_ROUND, a: standings[0].id, b: standings[1].id, at: now }];
    }
  }

  const champion = final?.winnerId ?? null;
  const runnerUp = champion && final ? (final.a === champion ? final.b : final.a) : null;
  return { rounds, final, standings, current, champion, runnerUp, unfinished: !champion && now > tournament.deadline, next };
}

/** A player's cup games this week, in order. */
export const gamesOf = (state: CupState, id: string) =>
  [...state.rounds.flat(), ...(state.final ? [state.final] : [])].filter((g) => g.a === id || g.b === id);

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
    if (!state || !tournament.field) continue;
    for (const id of tournament.field) get(id).entered++;
    // A bye is not a win.
    for (const g of [...state.rounds.flat(), ...(state.final ? [state.final] : [])]) if (g.winnerId && !g.bye) get(g.winnerId).matchWins++;
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
