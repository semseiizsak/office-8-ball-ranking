import { MatchRecord } from '../types';
import { dayKeyOf } from './daily';

/**
 * The weekly cup: a straight knockout that works for whoever turns up.
 *
 * Sign-ups open Monday morning and close at noon; everyone who signed up
 * plays. At the close the field is seeded by Elo, best first. The main
 * bracket is the biggest power of two that fits (2, 4, 8 or 16) and is seeded
 * the classic way (1 v 8, 4 v 5, 2 v 7, 3 v 6), so the two best can only meet
 * in the final. Whoever does not fit plays a play-in first: the lowest seeds,
 * in pairs (with 9 players, seeds 8 and 9 play for the last spot).
 *
 * Each round has a deadline, counting back from the final on Friday 17:00. A
 * game can be played as soon as both players are known. If it is not played
 * by its deadline, a player who said they were ready takes it as a walkover;
 * if nobody (or both) did, the higher seed goes through. Either way the
 * bracket keeps moving, and no match means no Elo.
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
 * the old draw stopped counting. 2026-09-28 was drawn as a Swiss cup before
 * the cup became a seeded knockout.
 */
export const CUP_REDRAWS: Record<string, number> = { '2026-09-28': 1790609400000 };

export interface Tournament {
  /** The Monday of the week, YYYY-MM-DD. */
  week: string;
  opensAt: number;
  closesAt: number;
  /** Friday afternoon: the final's deadline. */
  deadline: number;
  entrants: Array<{ id: string; at: number }>;
  /** Everyone playing, best seed first; null until drawn, empty if too few signed up. */
  field: string[] | null;
  drawnAt: number | null;
  /** Players who said they were ready to play a game, by game key. */
  claims: Array<{ game: string; id: string; at: number }>;
}

const undrawn = { field: null, drawnAt: null, claims: [] as Tournament['claims'] };

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

/**
 * The field at the close: everyone who signed up (the first 16 if more),
 * best Elo first; equal ratings go to whoever signed up first.
 */
export function seedField(tournament: Tournament, elo: Record<string, number>): string[] {
  const inOrder = [...tournament.entrants].sort((a, b) => a.at - b.at).slice(0, CUP_MAX_PLAYERS);
  if (inOrder.length < CUP_MIN_PLAYERS) return [];
  return inOrder
    .map((entry, index) => ({ id: entry.id, index, elo: elo[entry.id] ?? 1000 }))
    .sort((a, b) => b.elo - a.elo || a.index - b.index)
    .map((entry) => entry.id);
}

/** The main bracket: the biggest power of two that fits the field. */
export const mainSize = (n: number) => {
  let size = 1;
  while (size * 2 <= n) size *= 2;
  return size;
};

/** Seed numbers in bracket order, so 1 and 2 can only meet in the final: 8 gives 1 8 4 5 2 7 3 6. */
export function slotOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const next = order.length * 2;
    order = order.flatMap((seed) => [seed, next + 1 - seed]);
  }
  return order;
}

/** The shape of a cup of `n`: how many main rounds and whether there is a play-in. */
export function bracketShape(n: number) {
  const size = mainSize(n);
  const rounds = Math.round(Math.log2(size));
  const playIns = n - size;
  return { size, rounds, playIns };
}

export const roundName = (round: number, rounds: number) =>
  round === rounds - 1 ? 'Final' : round === rounds - 2 ? 'Semi-final' : round === rounds - 3 ? 'Quarter-final' : 'Round of 16';

/**
 * Deadlines count back from Friday 17:00: the final on Friday, the round
 * before on Thursday and so on; the play-in closes the day before the first
 * main round.
 */
export function gameDeadline(tournament: Tournament, key: string): number {
  const n = tournament.field?.length ?? 0;
  const { rounds } = bracketShape(Math.max(n, 2));
  const monday = mondayOf(tournament.opensAt);
  const round = key.startsWith('p') ? -1 : Number(key.slice(1).split('-')[0]);
  const day = 4 - (rounds - 1 - round);
  return hourOf(monday, Math.max(day, 1), CUP_DEADLINE_HOUR);
}

export interface CupGame {
  /** Stable id: `p<seed>` for a play-in, `r<round>-<index>` in the main bracket. */
  key: string;
  stage: 'playin' | 'main';
  /** Main round index, 0 first; -1 for the play-in. */
  round: number;
  label: string;
  a: string | null;
  b: string | null;
  seedA: number | null;
  seedB: number | null;
  winnerId: string | null;
  matchId: string | null;
  /** Not played: the only player who said they were ready went through. */
  walkover: boolean;
  /** Not played and nobody (or both) ready: the higher seed went through. */
  auto: boolean;
  /** Who of the two has said they are ready to play. */
  ready: string[];
  deadline: number;
  /** When it was decided: the match, or the deadline for a walkover. */
  decidedAt: number | null;
}

export interface CupState {
  /** Seed number per player, 1 is the best. */
  seeds: Map<string, number>;
  playIn: CupGame[];
  /** The main bracket, first round first; the last round is the final. */
  rounds: CupGame[][];
  final: CupGame;
  champion: string | null;
  runnerUp: string | null;
  /** The label of the round being played now, for headers. */
  current: string;
  unfinished: boolean;
}

/** Walks the bracket forward through the matches logged since the draw. */
export function resolveCup(tournament: Tournament, matches: MatchRecord[], now: number): CupState | null {
  const field = tournament.field;
  if (!field || field.length < CUP_MIN_PLAYERS || tournament.drawnAt === null) return null;
  const drawnAt = tournament.drawnAt;
  const { size, rounds: roundCount, playIns } = bracketShape(field.length);
  const seeds = new Map(field.map((id, index) => [id, index + 1]));
  const idOf = (seed: number) => field[seed - 1] ?? null;
  const sorted = [...matches].sort((a, b) => a.timestamp - b.timestamp);
  const used = new Set<string>();

  const settle = (key: string, stage: CupGame['stage'], round: number, label: string, a: string | null, b: string | null, since: number | null): CupGame => {
    const deadline = gameDeadline(tournament, key);
    const ready = [...new Set(tournament.claims.filter((claim) => claim.game === key && claim.at <= deadline && (claim.id === a || claim.id === b)).map((claim) => claim.id))];
    const base = { key, stage, round, label, a, b, seedA: a ? seeds.get(a)! : null, seedB: b ? seeds.get(b)! : null, ready, deadline };
    const open = { ...base, winnerId: null, matchId: null, walkover: false, auto: false, decidedAt: null };
    if (!a || !b || since === null) return open;
    const match = sorted.find(
      (entry) =>
        !used.has(entry.id) &&
        entry.timestamp >= since &&
        entry.timestamp <= deadline &&
        [entry.playerAId, entry.playerBId].includes(a) &&
        [entry.playerAId, entry.playerBId].includes(b)
    );
    if (match) {
      used.add(match.id);
      return { ...base, winnerId: match.winnerId, matchId: match.id, walkover: false, auto: false, decidedAt: match.timestamp };
    }
    if (now <= deadline) return open;
    if (ready.length === 1) return { ...base, winnerId: ready[0], matchId: null, walkover: true, auto: false, decidedAt: deadline };
    const higher = seeds.get(a)! < seeds.get(b)! ? a : b;
    return { ...base, winnerId: higher, matchId: null, walkover: false, auto: true, decidedAt: deadline };
  };

  // The play-in: seed k against seed 2*size+1-k, for the lowest seeds that do not fit.
  const playIn: CupGame[] = [];
  const intoSlot = new Map<number, CupGame>();
  for (let k = size - playIns + 1; k <= size; k++) {
    const game = settle(`p${k}`, 'playin', -1, 'Play-in', idOf(k), idOf(2 * size + 1 - k), drawnAt);
    playIn.push(game);
    intoSlot.set(k, game);
  }

  // The main bracket in seeding order; a play-in seat is filled by its winner.
  type Entry = { id: string | null; ready: number | null };
  let entries: Entry[] = slotOrder(size).map((seed) => {
    const feeder = intoSlot.get(seed);
    return feeder ? { id: feeder.winnerId, ready: feeder.decidedAt } : { id: idOf(seed), ready: drawnAt };
  });
  const rounds: CupGame[][] = [];
  for (let round = 0; round < roundCount; round++) {
    const games: CupGame[] = [];
    for (let i = 0; i < entries.length; i += 2) {
      const [x, y] = [entries[i], entries[i + 1]];
      const since = x.ready !== null && y.ready !== null ? Math.max(x.ready, y.ready) : null;
      games.push(settle(`r${round}-${i / 2}`, 'main', round, roundName(round, roundCount), x.id, y.id, since));
    }
    rounds.push(games);
    entries = games.map((game) => ({ id: game.winnerId, ready: game.decidedAt }));
  }
  const final = rounds[rounds.length - 1][0];
  const champion = final.winnerId;
  const runnerUp = champion ? (final.a === champion ? final.b : final.a) : null;
  const all = [...playIn, ...rounds.flat()];
  const live = all.find((game) => !game.winnerId && game.a && game.b) ?? all.find((game) => !game.winnerId);
  return { seeds, playIn, rounds, final, champion, runnerUp, current: live?.label ?? 'Final', unfinished: !champion && now > tournament.deadline };
}

/** Every game of the cup, play-in first. */
export const allGames = (state: CupState) => [...state.playIn, ...state.rounds.flat()];

/** A player's cup games this week, in order. */
export const gamesOf = (state: CupState, id: string) => allGames(state).filter((game) => game.a === id || game.b === id);

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
    // Only a played match is a win; walkovers and seed advances are not.
    for (const game of allGames(state)) if (game.winnerId && game.matchId) get(game.winnerId).matchWins++;
    if (state.champion) {
      const champ = get(state.champion);
      champ.titles++;
      champ.finals++;
      champ.bonus += CHAMPION_CHIPS;
    }
    if (state.runnerUp) {
      const second = get(state.runnerUp);
      second.finals++;
      // A final that never happened pays the runner-up nothing.
      if (state.final.matchId) second.bonus += FINALIST_CHIPS;
    }
  }
  return records;
}
